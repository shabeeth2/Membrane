from __future__ import annotations

import logging
import os
from typing import Any

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client

from api.core import (
    cleanup_prompt,
    content_hash,
    parse_cleanup_output,
    require_client_id,
    truncate_raw_chat,
    validate_raw_chat,
)

logger = logging.getLogger("relay")
logging.basicConfig(level=logging.INFO)
load_dotenv()


class CaptureRequest(BaseModel):
    raw_chat: str


app = FastAPI(title="Relay API")

allowed_origins = [
    origin.strip()
    for origin in os.getenv("ALLOWED_EXTENSION_ORIGINS", "").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-Relay-Client-Id"],
)

from api.mcp_server import mcp

app.mount("/mcp", mcp.streamable_http_app())


def env_health() -> dict[str, bool]:
    return {
        "supabase_configured": bool(
            os.getenv("SUPABASE_URL") and os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        ),
        "openrouter_configured": bool(os.getenv("OPENROUTER_API_KEY")),
    }


def require_env() -> dict[str, str]:
    values = {
        "SUPABASE_URL": os.getenv("SUPABASE_URL", ""),
        "SUPABASE_SERVICE_ROLE_KEY": os.getenv("SUPABASE_SERVICE_ROLE_KEY", ""),
        "OPENROUTER_API_KEY": os.getenv("OPENROUTER_API_KEY", ""),
        "OPENROUTER_MODEL": os.getenv("OPENROUTER_MODEL", "openai/gpt-4o-mini"),
    }
    missing = [key for key, value in values.items() if not value]
    if missing:
        raise HTTPException(status_code=500, detail="Server configuration missing")
    return values


def supabase_client() -> Any:
    env = require_env()
    return create_client(env["SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"])


async def cleanup_with_openrouter(raw_chat: str, truncated: bool) -> str:
    env = require_env()
    payload = {
        "model": env["OPENROUTER_MODEL"],
        "messages": [{"role": "user", "content": cleanup_prompt(raw_chat, truncated)}],
        "temperature": 0.1,
    }
    headers = {
        "Authorization": f"Bearer {env['OPENROUTER_API_KEY']}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://relay.local",
        "X-Title": "Relay",
    }

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            res = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                json=payload,
                headers=headers,
            )
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="OpenRouter timeout") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="OpenRouter cleanup failed") from exc

    if res.status_code >= 500:
        raise HTTPException(status_code=502, detail="OpenRouter cleanup failed")
    if res.status_code >= 400:
        raise HTTPException(status_code=502, detail="OpenRouter cleanup failed")

    data = res.json()
    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise HTTPException(status_code=502, detail="OpenRouter cleanup failed") from exc


@app.get("/")
def root() -> dict[str, str]:
    return {"name": "Relay API", "status": "ok", "health": "/health"}


@app.get("/health")
def health() -> dict[str, bool]:
    status = env_health()
    return {"ok": True, **status}


@app.post("/capture-context")
async def capture_context(
    request: CaptureRequest,
    x_relay_client_id: str | None = Header(default=None),
) -> dict[str, Any]:
    try:
        client_id = require_client_id(x_relay_client_id)
        raw_chat = validate_raw_chat(request.raw_chat)
    except ValueError as exc:
        status = 401 if "client id" in str(exc) else 400
        raise HTTPException(status_code=status, detail=str(exc)) from exc

    retained_chat, truncated = truncate_raw_chat(raw_chat)
    logger.info("capture requested raw_length=%s truncated=%s", len(raw_chat), truncated)
    cleaned = await cleanup_with_openrouter(retained_chat, truncated)
    title, content = parse_cleanup_output(cleaned)
    digest = content_hash(content)
    db = supabase_client()

    existing = (
        db.table("contexts")
        .select("id,title,created_at")
        .eq("client_id", client_id)
        .eq("content_hash", digest)
        .limit(1)
        .execute()
    )
    if existing.data:
        row = existing.data[0]
        logger.info("capture deduped")
        return {**row, "deduped": True, "truncated": truncated}

    inserted = (
        db.table("contexts")
        .insert(
            {
                "client_id": client_id,
                "title": title,
                "content": content,
                "content_hash": digest,
            }
        )
        .execute()
    )
    if not inserted.data:
        raise HTTPException(status_code=500, detail="Database insert failed")

    row = inserted.data[0]
    logger.info("capture inserted")
    return {**row, "deduped": False, "truncated": truncated}


@app.get("/list-contexts")
def list_contexts(
    x_relay_client_id: str | None = Header(default=None),
  ) -> list[dict[str, Any]]:
    try:
        client_id = require_client_id(x_relay_client_id)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc

    db = supabase_client()
    res = (
        db.table("contexts")
        .select("id,title,created_at")
        .eq("client_id", client_id)
        .order("created_at", desc=True)
        .limit(20)
        .execute()
    )
    return res.data or []


@app.get("/get-context/{context_id}")
def get_context(
    context_id: int,
    x_relay_client_id: str | None = Header(default=None),
  ) -> dict[str, Any]:
    try:
        client_id = require_client_id(x_relay_client_id)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc

    db = supabase_client()
    res = (
        db.table("contexts")
        .select("id,title,content")
        .eq("client_id", client_id)
        .eq("id", context_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Context not found")
    return res.data[0]
