# Relay

Chrome extension (MV3) + FastAPI backend. Captures chat context from AI chat tools, cleans it via LLM (configurable provider), stores in Supabase, and injects into other AI chats.

## Architecture

- `src/` — TypeScript for the extension (compiled to `dist/` via `tsc`)
- `api/` — Python FastAPI backend (uvicorn), routes in `api/index.py`, core logic in `api/core.py`
- `extension/` — static assets (`manifest.json`, `popup.html`, `popup.css`, `injected.css`, `assets/`) copied to `dist/` at build
- `tests/` — Python unittest tests for `api/core.py`
- `scripts/start-backend.py` — launches uvicorn on `127.0.0.1:8000`
- `scripts/copy-static.js` — copies static files + `assets/` to `dist/` after `tsc`

**Supported hosts** (10 total): `chatgpt.com`, `chat.openai.com`, `claude.ai`, `www.perplexity.ai`, `perplexity.ai`, `gemini.google.com`, `bard.google.com`, `copilot.microsoft.com`, `grok.com`, `chat.mistral.ai`

**Flow:** content script scrapes chat text → `POST /capture-context` with `X-Relay-Client-Id` header → backend sends to LLM for cleanup → stores result in Supabase (deduped by SHA-256 hash).

## Commands

| Command | What it does |
|---|---|
| `npm run build` | `tsc && node scripts/copy-static.js` |
| `npm test` | Python unittest on `tests/` |
| `npm run backend` | Starts uvicorn on `127.0.0.1:8000` |
| `npm run check:python` | `py_compile` validation of `api/core.py api/index.py` |
| `npm run generate-icons` | Generate PNG icons from `extension/assets/logo.svg` (requires `sharp`) |
| `npm run check` | Full: build → test → python check |

## Key details

- **Python in venv:** All npm scripts reference `.venv\Scripts\python.exe` (Windows path). Set up with `python -m venv .venv`
- **Dependencies:** `pip install -r requirements.txt` — FastAPI, httpx, supabase, uvicorn, python-dotenv, pydantic
- **Backend CORS:** Reads `ALLOWED_EXTENSION_ORIGINS` (comma-separated) from `.env` + allows localhost regex
- **Chat truncation:** Raw chat >60K chars → head 10K + tail 50K with a mid-truncation note
- **LLM timeout:** 12s (HTTP 502 on timeout/failures)
- **Testing:** Python `unittest` only (no pytest) — `npm test` runs `unittest discover -s tests`
- **No linter/formatter** configured — just `tsc` for TS and `py_compile` for Python
- **No dev watch** — changes require `npm run build` + manual extension reload in `chrome://extensions`
- **Supabase setup** — run `supabase_schema.sql` in Supabase SQL editor (no migration tooling)

## Env (`.env`)

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
OPENROUTER_API_KEY=
LLM_API_BASE=https://openrouter.ai/api/v1
LLM_MODEL=openai/gpt-4o-mini
ALLOWED_EXTENSION_ORIGINS=chrome-extension://<id>
```

## MCP Server

Mounted at `/mcp` on the FastAPI backend (Streamable HTTP transport). Built with FastMCP (`api/mcp_server.py`).

**Tools** (require `client_id` parameter):
- `list_contexts` — list up to 20 contexts for a client
- `get_context` — get full context content by id
- `capture_context` — save new context from raw chat text (async, uses OpenRouter cleanup)

**Resources:**
- `relay://contexts` — list latest 20 contexts
- `relay://context/{id}` — get specific context by id

**Client config** (Claude Desktop, opencode, Cursor, etc.):
```json
{
  "mcpServers": {
    "relay": {
      "url": "http://localhost:8000/mcp"
    }
  }
}
```

**Test with MCP Inspector:** `npx -y @modelcontextprotocol/inspector` then connect to `http://localhost:8000/mcp`
