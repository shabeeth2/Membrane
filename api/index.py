from __future__ import annotations

import logging
import os

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from api.core import (
    cleanup_prompt,
    content_hash,
    db_find_duplicate,
    db_get_context,
    db_insert_context,
    db_list_contexts,
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
) -> dict:
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

    existing = db_find_duplicate(client_id, digest)
    if existing:
        logger.info("capture deduped")
        return {**existing, "deduped": True, "truncated": truncated}

    row = db_insert_context(client_id, title, content, digest)
    if not row:
        raise HTTPException(status_code=500, detail="Database insert failed")

    logger.info("capture inserted")
    return {**row, "deduped": False, "truncated": truncated}


@app.get("/list-contexts")
def list_contexts(
    x_relay_client_id: str | None = Header(default=None),
) -> list[dict]:
    try:
        client_id = require_client_id(x_relay_client_id)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc

    return db_list_contexts(client_id)


@app.get("/get-context/{context_id}")
def get_context(
    context_id: int,
    x_relay_client_id: str | None = Header(default=None),
) -> dict:
    try:
        client_id = require_client_id(x_relay_client_id)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc

    row = db_get_context(client_id, context_id)
    if not row:
        raise HTTPException(status_code=404, detail="Context not found")
    return row
