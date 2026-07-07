# Relay

Chrome extension (MV3) + FastAPI backend. Captures chat context from AI chat tools, cleans it via LLM, stores in Supabase, and injects into other AI chats.

**Version:** `0.1.0`

## Supported Sites

- ChatGPT (`chatgpt.com`, `chat.openai.com`)
- Claude (`claude.ai`)
- Perplexity (`www.perplexity.ai`, `perplexity.ai`)
- Gemini (`gemini.google.com`, `bard.google.com`)
- Copilot (`copilot.microsoft.com`)
- Grok (`grok.com`)
- Mistral (`chat.mistral.ai`)

## Quick Start

### Prerequisites

- Node.js and npm
- Python 3.12+
- Chrome or Chromium-based browser
- Supabase project
- OpenRouter API key

### 1. Setup Environment

Create `.env` from `.env.example`:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
OPENROUTER_API_KEY=
LLM_API_BASE=https://openrouter.ai/api/v1
LLM_MODEL=openai/gpt-4o-mini
ALLOWED_EXTENSION_ORIGINS=chrome-extension://<your-extension-id>
```

### 2. Install Dependencies

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
npm install
```

### 3. Build & Load Extension

```powershell
npm run build
```

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click "Load unpacked"
4. Select the `dist/` folder
5. Copy the extension ID
6. Add `chrome-extension://<id>` to `.env` `ALLOWED_EXTENSION_ORIGINS`
7. Restart backend after changing `.env`

### 4. Run Backend

```powershell
npm run backend
```

Backend starts at `http://127.0.0.1:8000`. Logs write to `uvicorn.log`.

## Commands

| Command | Purpose |
|---|---|
| `npm run build` | Compile TypeScript and copy static files to `dist/` |
| `npm run backend` | Start FastAPI backend on `127.0.0.1:8000` |
| `npm test` | Run Python unittest discover |
| `npm run check:python` | py_compile on `api/core.py` and `api/index.py` |
| `npm run check` | Build + test + python check |
| `npm run generate-icons` | Generate PNG icons from SVG (requires sharp) |

## Architecture

```text
api/
  core.py            # validation, truncation, prompts, parsing, hashing
  index.py           # FastAPI app, routes, OpenRouter, Supabase
  mcp_server.py      # MCP server (FastMCP) at /mcp
extension/
  manifest.json      # MV3 manifest
  popup.html         # popup shell
  popup.css          # popup styles
  injected.css       # content-script injected styles
  assets/            # icons and logo
src/
  background.ts      # service worker message router
  client.ts          # backend fetch client, per-browser client id
  config.ts          # backend URL and supported hosts
  content.ts         # page scraping, save button, import button, context injection
  popup.ts           # popup UI logic
  types.ts           # shared TypeScript interfaces
tests/
  test_core.py       # Python unittest coverage for api/core.py
scripts/
  start-backend.py   # uvicorn launcher
  copy-static.js     # copies extension files into dist/
  generate-icons.js  # generates PNG icons from SVG
```

Build output goes to `dist/`. Chrome loads extension files from `dist/`, not `src/` or `extension/`.

### Flow

1. Content script runs on supported AI chat sites
2. Injects a "Save Context" button at bottom-right
3. User clicks button (or uses popup save)
4. Content script scrapes visible chat text
5. Background service worker sends raw chat to backend with `X-Relay-Client-Id`
6. Backend validates, truncates large chats, sends to LLM for cleanup
7. Backend parses title/content, hashes, dedupes by client + hash
8. Cleaned context stored in Supabase
9. Popup lists saved contexts
10. User selects one → extension injects it into current chat input

Injected format:

```text
You are continuing an existing project.

Here is the full working context:

--- CONTEXT START ---
<saved context>
--- CONTEXT END ---

First, acknowledge you understand this context. Then wait for my next instruction.
```

## Backend API

All context endpoints require:

```http
X-Relay-Client-Id: <client-id>
Content-Type: application/json
```

### `GET /`

Returns API metadata.

### `GET /health`

Returns config health:

```json
{
  "ok": true,
  "supabase_configured": true,
  "llm_configured": true
}
```

### `POST /capture-context`

Body:

```json
{ "raw_chat": "..." }
```

Response:

```json
{
  "id": 1,
  "title": "Project Context",
  "created_at": "2026-05-19T00:00:00Z",
  "deduped": false,
  "truncated": false
}
```

### `GET /list-contexts`

Returns latest 20 contexts for current client id.

### `GET /get-context/{context_id}`

Returns full context. Missing context returns `404`.

## MCP Server

Mounted at `/mcp` on the backend (Streamable HTTP transport). Built with FastMCP.

### Tools

All tools require a `client_id` parameter:

| Tool | Description |
|---|---|
| `list_contexts` | List up to 20 contexts for a client |
| `get_context` | Get full context content by id |
| `capture_context` | Save new context from raw chat text (async, uses LLM cleanup) |

### Client Config

```json
{
  "mcpServers": {
    "relay": {
      "url": "http://localhost:8000/mcp"
    }
  }
}
```

### Test with MCP Inspector

```bash
npx -y @modelcontextprotocol/inspector
```

Connect to `http://localhost:8000/mcp`.

## Environment Variables

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role secret |
| `OPENROUTER_API_KEY` | OpenRouter API key |
| `LLM_API_BASE` | LLM API base URL (default: `https://openrouter.ai/api/v1`) |
| `LLM_MODEL` | Model to use for cleanup (default: `openai/gpt-4o-mini`) |
| `ALLOWED_EXTENSION_ORIGINS` | Comma-separated extension origins for CORS |

## Supabase Setup

Run `supabase_schema.sql` in Supabase SQL editor.

Schema:

```sql
create table if not exists public.contexts (
  id bigserial primary key,
  client_id text not null,
  title text not null,
  content text not null,
  content_hash text not null,
  created_at timestamptz not null default now()
);
```

Indexes:

- `contexts_client_hash_idx` on `(client_id, content_hash)` for dedupe
- `contexts_client_created_idx` on `(client_id, created_at desc)` for listing

Security: RLS enabled, `anon` and `authenticated` privileges revoked, backend uses service role key (bypasses RLS).

## Backend Core Rules

Implemented in `api/core.py`.

**Truncation:** Raw chats over 60K chars retain first 10K + last 50K with a mid-truncation note.

**Cleanup prompt** asks model to return:

```text
Title: <short specific title, max 8 words>

Project goal:
...

Constraints:
...

Decisions made:
...

Important information:
...

Open items:
...
```

**Parsing:** If output starts with `Title:`, title extracted (max 120 chars). Fallback: `Context - <Mon DD>`.

**Dedupe:** SHA-256 hash of cleaned content, matched by `client_id` + `content_hash`.

## Security Notes

- Keep `SUPABASE_SERVICE_ROLE_KEY` only on backend
- Never put service role key in extension code
- Do not commit `.env`
- Contexts are scoped by generated client id, not user auth
- Client id lives in Chrome local extension storage

## Limitations

- No user accounts or auth beyond client id
- No delete or edit/rename endpoint
- No pagination beyond latest 20 contexts
- Scraping depends on third-party site DOM structure
- Backend URL hardcoded in `src/config.ts`
- Large chats lose middle content after 60K chars
- No linter/formatter configured

## License

No license file is currently included.
