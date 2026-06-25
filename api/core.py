from __future__ import annotations

import hashlib
import os
import re
from datetime import datetime, timezone

from supabase import create_client

RAW_CHAT_LIMIT = 60_000
RAW_CHAT_HEAD = 10_000
RAW_CHAT_TAIL = 50_000


def require_client_id(client_id: str | None) -> str:
    value = (client_id or "").strip()
    if not value:
        raise ValueError("missing client id")
    return value


def validate_raw_chat(raw_chat: str | None) -> str:
    value = (raw_chat or "").strip()
    if not value:
        raise ValueError("missing raw chat")
    return value


def truncate_raw_chat(raw_chat: str) -> tuple[str, bool]:
    if len(raw_chat) <= RAW_CHAT_LIMIT:
        return raw_chat, False

    head = raw_chat[:RAW_CHAT_HEAD].rstrip()
    tail = raw_chat[-RAW_CHAT_TAIL:].lstrip()
    retained = (
        f"{head}\n\n"
        "[Relay note: middle of this chat was omitted because the raw input "
        "exceeded the MVP capture limit. Preserve important context from the "
        "beginning and end.]\n\n"
        f"{tail}"
    )
    return retained, True


def cleanup_prompt(raw_chat: str, truncated: bool) -> str:
    note = ""
    if truncated:
        note = (
            "The raw chat was truncated with head+tail retention. "
            "Middle content may be omitted.\n\n"
        )

    return (
        "You convert messy AI chat logs into clean reusable project context.\n\n"
        f"{note}"
        "Return exactly:\n\n"
        "Title: <short specific title, max 8 words>\n\n"
        "Project goal:\n"
        "...\n\n"
        "Constraints:\n"
        "...\n\n"
        "Decisions made:\n"
        "...\n\n"
        "Important information:\n"
        "...\n\n"
        "Open items:\n"
        "...\n\n"
        "Preserve exact code snippets, commands, API contracts, schemas, prompts, "
        "and user-approved decisions when they are important.\n"
        "Do not invent details.\n"
        "Do not omit critical details.\n"
        "Make this context reusable for another AI system.\n\n"
        "--- RAW CHAT START ---\n"
        f"{raw_chat}\n"
        "--- RAW CHAT END ---"
    )


def parse_cleanup_output(text: str) -> tuple[str, str]:
    cleaned = (text or "").strip()
    match = re.match(r"^\s*Title:\s*(.+?)\s*(?:\r?\n){1,2}(.*)$", cleaned, re.S)
    if not match:
        return fallback_title(), cleaned

    title = re.sub(r"\s+", " ", match.group(1)).strip()
    content = match.group(2).strip()
    if not title:
        title = fallback_title()
    if not content:
        content = cleaned
    return title[:120], content


def fallback_title(now: datetime | None = None) -> str:
    current = now or datetime.now(timezone.utc)
    return f"Context - {current.strftime('%b %d')}"


def content_hash(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


# ── Database helpers ──

_supabase_client = None


def get_supabase():
    global _supabase_client
    if _supabase_client is None:
        url = os.getenv("SUPABASE_URL", "")
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
        if not url or not key:
            raise RuntimeError("Supabase not configured")
        _supabase_client = create_client(url, key)
    return _supabase_client


def db_list_contexts(client_id: str, limit: int = 20) -> list[dict]:
    db = get_supabase()
    return (
        db.table("contexts")
        .select("id,title,created_at")
        .eq("client_id", client_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
        .data
        or []
    )


def db_get_context(client_id: str, context_id: int) -> dict | None:
    db = get_supabase()
    res = (
        db.table("contexts")
        .select("id,title,content")
        .eq("client_id", client_id)
        .eq("id", context_id)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


def db_find_duplicate(client_id: str, digest: str) -> dict | None:
    db = get_supabase()
    res = (
        db.table("contexts")
        .select("id,title,created_at")
        .eq("client_id", client_id)
        .eq("content_hash", digest)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


def db_insert_context(
    client_id: str, title: str, content: str, digest: str
) -> dict | None:
    db = get_supabase()
    res = (
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
    return res.data[0] if res.data else None
