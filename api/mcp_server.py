from __future__ import annotations

import json
import logging
from typing import Any

from mcp.server.fastmcp import FastMCP

from api.core import (
    content_hash,
    parse_cleanup_output,
    require_client_id,
    truncate_raw_chat,
    validate_raw_chat,
)
from api.index import cleanup_with_openrouter, supabase_client

logger = logging.getLogger("relay.mcp")

mcp = FastMCP("Relay", json_response=True)


@mcp.tool()
def list_contexts(client_id: str) -> str:
    """List saved Relay contexts for a client. Returns id, title, and created_at for up to 20 contexts, newest first.

    Args:
        client_id: The client identifier (hex string from the Relay extension).
    """
    cid = require_client_id(client_id)
    db = supabase_client()
    res = (
        db.table("contexts")
        .select("id,title,created_at")
        .eq("client_id", cid)
        .order("created_at", desc=True)
        .limit(20)
        .execute()
    )
    return json.dumps(res.data or [])


@mcp.tool()
def get_context(client_id: str, context_id: int) -> str:
    """Get the full content of a saved Relay context by its id.

    Args:
        client_id: The client identifier (hex string from the Relay extension).
        context_id: The numeric id of the context to retrieve.
    """
    cid = require_client_id(client_id)
    db = supabase_client()
    res = (
        db.table("contexts")
        .select("id,title,content")
        .eq("client_id", cid)
        .eq("id", context_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        return json.dumps({"error": "Context not found"})
    return json.dumps(res.data[0])


@mcp.tool()
async def capture_context(client_id: str, raw_chat: str) -> str:
    """Capture a new context from raw AI chat text. The text is sent to OpenRouter for cleanup, deduped by content hash, and stored in Supabase.

    Args:
        client_id: The client identifier (hex string from the Relay extension).
        raw_chat: The raw chat text to capture and clean up.
    """
    cid = require_client_id(client_id)
    validated = validate_raw_chat(raw_chat)
    retained, truncated = truncate_raw_chat(validated)
    logger.info("mcp capture raw_length=%s truncated=%s", len(validated), truncated)
    cleaned = await cleanup_with_openrouter(retained, truncated)
    title, content = parse_cleanup_output(cleaned)
    digest = content_hash(content)
    db = supabase_client()

    existing = (
        db.table("contexts")
        .select("id,title,created_at")
        .eq("client_id", cid)
        .eq("content_hash", digest)
        .limit(1)
        .execute()
    )
    if existing.data:
        row = existing.data[0]
        logger.info("mcp capture deduped")
        return json.dumps({**row, "deduped": True, "truncated": truncated})

    inserted = (
        db.table("contexts")
        .insert(
            {
                "client_id": cid,
                "title": title,
                "content": content,
                "content_hash": digest,
            }
        )
        .execute()
    )
    if not inserted.data:
        return json.dumps({"error": "Database insert failed"})

    row = inserted.data[0]
    logger.info("mcp capture inserted")
    return json.dumps({**row, "deduped": False, "truncated": truncated})


@mcp.resource("relay://contexts")
def get_contexts_resource() -> str:
    """List all saved Relay contexts (latest 20, newest first). Uses a default client scope."""
    db = supabase_client()
    res = (
        db.table("contexts")
        .select("id,title,created_at")
        .order("created_at", desc=True)
        .limit(20)
        .execute()
    )
    return json.dumps(res.data or [])


@mcp.resource("relay://context/{context_id}")
def get_context_resource(context_id: int) -> str:
    """Get a specific Relay context by its id.

    Args:
        context_id: The numeric id of the context to retrieve.
    """
    db = supabase_client()
    res = (
        db.table("contexts")
        .select("id,title,content")
        .eq("id", context_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        return json.dumps({"error": "Context not found"})
    return json.dumps(res.data[0])
