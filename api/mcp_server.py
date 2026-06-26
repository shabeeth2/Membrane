from __future__ import annotations

import json
import logging

from mcp.server.fastmcp import FastMCP

from api.core import (
    LLMError,
    content_hash,
    db_find_duplicate,
    db_get_context,
    db_insert_context,
    db_list_contexts,
    llm_cleanup,
    parse_cleanup_output,
    require_client_id,
    truncate_raw_chat,
    validate_raw_chat,
)

logger = logging.getLogger("relay.mcp")

mcp = FastMCP("Relay", json_response=True)


@mcp.tool()
def list_contexts(client_id: str) -> str:
    """List saved Relay contexts for a client. Returns id, title, and created_at for up to 20 contexts, newest first.

    Args:
        client_id: The client identifier (hex string from the Relay extension).
    """
    cid = require_client_id(client_id)
    return json.dumps(db_list_contexts(cid))


@mcp.tool()
def get_context(client_id: str, context_id: int) -> str:
    """Get the full content of a saved Relay context by its id.

    Args:
        client_id: The client identifier (hex string from the Relay extension).
        context_id: The numeric id of the context to retrieve.
    """
    cid = require_client_id(client_id)
    row = db_get_context(cid, context_id)
    if not row:
        return json.dumps({"error": "Context not found"})
    return json.dumps(row)


@mcp.tool()
async def capture_context(client_id: str, raw_chat: str) -> str:
    """Capture a new context from raw AI chat text. The text is sent to LLM for cleanup, deduped by content hash, and stored in Supabase.

    Args:
        client_id: The client identifier (hex string from the Relay extension).
        raw_chat: The raw chat text to capture and clean up.
    """
    cid = require_client_id(client_id)
    validated = validate_raw_chat(raw_chat)
    retained, truncated = truncate_raw_chat(validated)
    logger.info("mcp capture raw_length=%s truncated=%s", len(validated), truncated)

    try:
        cleaned = await llm_cleanup(retained, truncated)
    except LLMError as exc:
        return json.dumps({"error": str(exc)})

    title, content = parse_cleanup_output(cleaned)
    digest = content_hash(content)

    existing = db_find_duplicate(cid, digest)
    if existing:
        logger.info("mcp capture deduped")
        return json.dumps({**existing, "deduped": True, "truncated": truncated})

    row = db_insert_context(cid, title, content, digest)
    if not row:
        return json.dumps({"error": "Database insert failed"})

    logger.info("mcp capture inserted")
    return json.dumps({**row, "deduped": False, "truncated": truncated})
