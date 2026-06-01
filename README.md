# Membrane

Membrane is a Chrome extension plus FastAPI backend for moving useful working context between AI chat tools.

It captures visible chat context from ChatGPT, Claude, or Perplexity, sends that raw chat to a local backend, cleans it through OpenRouter, stores the cleaned context in Supabase, then lets you inject saved context into another supported AI chat.

## Status

- Version: `0.1.0`
- Extension: Chrome Manifest V3
- Backend: FastAPI on Python
- Storage: Supabase Postgres
- Cleanup model: OpenRouter, default `openai/gpt-4o-mini`
- Primary dev OS assumptions: Windows paths in npm scripts

## Project Structure

```text
.
|-- api/
|   |-- core.py          # pure backend helpers: validation, truncation, prompts, parsing, hashing
|   |-- index.py         # FastAPI app, routes, OpenRouter calls, Supabase queries
|   `-- __init__.py
|-- extension/
|   |-- manifest.json    # MV3 manifest copied into dist
|   |-- popup.html       # popup shell copied into dist
|   `-- popup.css        # popup styles copied into dist
|-- scripts/
|   |-- copy-static.js   # copies extension static files into dist after TypeScript build
|   `-- run_backend.py   # runs uvicorn on 127.0.0.1:8000 and logs to uvicorn.log
|-- src/
|   |-- background.ts    # service worker message router
|   |-- client.ts        # backend fetch client and per-browser client id
|   |-- config.ts        # backend URL and supported hosts
|   |-- content.ts       # page scraping, save button, import button, context injection
|   |-- popup.ts         # popup UI logic
|   `-- types.ts         # shared TypeScript interfaces
|-- tests/
|   `-- test_core.py     # Python unittest coverage for api/core.py
|-- supabase_schema.sql  # contexts table, indexes, RLS, permission revokes
|-- package.json         # scripts and TypeScript dev deps
|-- requirements.txt     # Python backend deps
|-- tsconfig.json        # TypeScript compiler config
`-- vercel.json          # optional Vercel Python API rewrite
```

Build output goes to `dist/`. Chrome loads extension files from `dist/`, not `src/` or `extension/`.

## How It Works

1. Content script runs on supported AI chat sites.
2. It injects a `Save Context` button at bottom-right.
3. It also injects a small import button near chat composer.
4. User clicks `Save Context`, or uses popup save button.
5. Content script scrapes visible chat text.
6. Background service worker sends raw chat to backend with `X-Membrane-Client-Id`.
7. Backend validates input and truncates very large chats.
8. Backend asks OpenRouter to convert messy chat into clean reusable project context.
9. Backend parses title/content, hashes content, dedupes by client id plus hash.
10. Backend stores context in Supabase `contexts`.
11. Popup lists saved contexts.
12. User clicks a saved context.
13. Extension fetches full context and injects it into current supported chat input.

Injected text format:

```text
You are continuing an existing project.

Here is the full working context:

--- CONTEXT START ---
<saved context>
--- CONTEXT END ---

First, acknowledge you understand this context. Then wait for my next instruction.
```

## Supported Sites

Configured in `src/config.ts` and `extension/manifest.json`:

- `chatgpt.com`
- `chat.openai.com`
- `claude.ai`
- `www.perplexity.ai`
- `perplexity.ai`

## Requirements

- Node.js and npm
- Python 3.12-compatible environment
- Chrome or Chromium-based browser
- Supabase project
- OpenRouter API key

Python dependencies:

- `fastapi`
- `httpx`
- `pydantic`
- `python-dotenv`
- `supabase`
- `uvicorn`

TypeScript dev dependencies:

- `typescript`
- `@types/chrome`

## Setup

Create Python venv:

```powershell
python -m venv .venv
```

Install Python deps:

```powershell
.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Install Node deps:

```powershell
npm install
```

Create `.env` from `.env.example`:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
OPENROUTER_API_KEY=
OPENROUTER_MODEL=openai/gpt-4o-mini
ALLOWED_EXTENSION_ORIGINS=chrome-extension://<your-extension-id>
```

Do not commit real `.env` secrets.

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
- `contexts_client_created_idx` on `(client_id, created_at desc)` for listing newest contexts

Security:

- RLS enabled
- `anon` and `authenticated` table/sequence privileges revoked
- Backend uses `SUPABASE_SERVICE_ROLE_KEY`

Because service role key bypasses RLS, keep backend trusted and never expose service role key in extension code.

## Build Extension

```powershell
npm run build
```

This runs:

```text
tsc && node scripts/copy-static.js
```

Result:

- TypeScript compiles from `src/` to `dist/`
- `manifest.json`, `popup.html`, `popup.css` copy from `extension/` to `dist/`

## Load Extension In Chrome

1. Run `npm run build`.
2. Open `chrome://extensions`.
3. Enable Developer mode.
4. Click `Load unpacked`.
5. Select `D:\projects\Membrane\dist`.
6. Copy generated extension ID.
7. Put `chrome-extension://<id>` in `.env` as `ALLOWED_EXTENSION_ORIGINS`.
8. Restart backend after changing `.env`.

## Run Backend

```powershell
npm run backend
```

Backend starts at:

```text
http://127.0.0.1:8000
```

Logs write to:

```text
uvicorn.log
```

Health check:

```text
GET http://127.0.0.1:8000/health
```

Response includes:

- `ok`
- `supabase_configured`
- `openrouter_configured`

## Commands

| Command | Purpose |
|---|---|
| `npm run build` | Compile TypeScript and copy static extension files to `dist/` |
| `npm test` | Run Python `unittest discover -s tests` |
| `npm run backend` | Start FastAPI backend on `127.0.0.1:8000` |
| `npm run check:python` | Run `py_compile` on `api/core.py` and `api/index.py` |
| `npm run check` | Run build, tests, and Python compile check |

## Backend API

Base URL in extension:

```ts
export const API_BASE_URL = "http://localhost:8000";
```

All context endpoints require:

```http
X-Membrane-Client-Id: <client-id>
Content-Type: application/json
```

### `GET /`

Returns API metadata.

Example:

```json
{
  "name": "Membrane API",
  "status": "ok",
  "health": "/health"
}
```

### `GET /health`

Returns backend config health.

Example:

```json
{
  "ok": true,
  "supabase_configured": true,
  "openrouter_configured": true
}
```

### `POST /capture-context`

Body:

```json
{
  "raw_chat": "..."
}
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

Behavior:

- Missing client id -> `401`
- Empty raw chat -> `400`
- Missing server env -> `500`
- OpenRouter timeout -> `504`
- OpenRouter HTTP or parse failure -> `502`
- DB insert failure -> `500`

### `GET /list-contexts`

Returns latest 20 contexts for current client id.

Response:

```json
[
  {
    "id": 1,
    "title": "Project Context",
    "created_at": "2026-05-19T00:00:00Z"
  }
]
```

### `GET /get-context/{context_id}`

Returns full context for current client id.

Response:

```json
{
  "id": 1,
  "title": "Project Context",
  "content": "Project goal:\n..."
}
```

Missing context -> `404`.

## Backend Core Rules

Implemented in `api/core.py`.

Validation:

- `X-Membrane-Client-Id` must be non-empty.
- `raw_chat` must be non-empty after trim.

Truncation:

- Raw chat limit: `60_000` chars
- If raw chat is over limit:
  - keep first `10_000` chars
  - keep last `50_000` chars
  - insert Membrane truncation note between head and tail
  - return `truncated: true`

Cleanup prompt asks model to return exactly:

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

Parsing:

- If output starts with `Title:`, title extracted and maxed at 120 chars.
- Remaining content stored as context.
- If no title line exists, fallback title is `Context - <Mon DD>`.

Dedupe:

- SHA-256 hash of cleaned content.
- Existing row matched by `client_id` and `content_hash`.

## Extension Details

### Background Service Worker

`src/background.ts` handles runtime messages:

- `LIST_CONTEXTS`
- `GET_CONTEXT`
- `CAPTURE_CONTEXT`
- `INJECT_CONTEXT`
- `OPEN_POPUP`

### Backend Client

`src/client.ts`:

- stores client id in `chrome.storage.local` under `membrane_client_id`
- creates random 16-byte hex client id when none exists
- adds `X-Membrane-Client-Id` to every backend request
- throws backend `detail` message on non-2xx responses

### Content Script

`src/content.ts`:

- checks supported host
- injects `Save Context` button
- scrapes chat content using site-specific selectors
- falls back to visible main/body text
- rejects capture under 100 chars
- injects context into textareas, contenteditable inputs, textbox roles, or ProseMirror inputs
- displays temporary toast messages for success/errors
- observes DOM changes to keep import button near composer

### Popup

`src/popup.ts`:

- loads latest contexts on open
- refreshes context list
- saves current chat from active supported tab
- injects selected context into active supported tab
- shows status messages

## Chrome Permissions

Manifest permissions:

- `activeTab`
- `storage`
- `scripting`

Host permissions:

- supported AI chat URLs
- `http://localhost:8000/*`

## CORS

Backend CORS:

- allows origins from `.env` `ALLOWED_EXTENSION_ORIGINS`
- allows localhost/127.0.0.1 via regex
- allows methods `GET`, `POST`, `OPTIONS`
- allows headers `Content-Type`, `X-Membrane-Client-Id`

## Tests

Tests use Python `unittest`, not pytest.

Run:

```powershell
npm test
```

Current test coverage focuses on pure backend helpers:

- missing client id rejection
- empty raw chat rejection
- cleanup output title parsing
- fallback title
- truncation head/tail retention
- stable content hashing

Full check:

```powershell
npm run check
```

## Optional Vercel Config

`vercel.json` rewrites all routes to `api/index.py`:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/api/index.py" }]
}
```

Current extension config points to local backend:

```ts
export const API_BASE_URL = "http://localhost:8000";
```

Change `src/config.ts` before using a deployed backend.

## Common Dev Flow

1. Start backend:

   ```powershell
   npm run backend
   ```

2. Build extension:

   ```powershell
   npm run build
   ```

3. Reload unpacked extension in Chrome.
4. Open supported chat site.
5. Click `Save Context`.
6. Open another supported chat site.
7. Click Membrane popup or import button.
8. Select saved context to inject.

## Troubleshooting

`Could not load contexts`

- Backend may not be running.
- `.env` may be missing Supabase values.
- Extension origin may not be allowed by CORS.

`Could not save context`

- Chat scrape may be under 100 chars.
- OpenRouter key/model may be invalid.
- OpenRouter request may have timed out.
- Supabase insert may have failed.

`Unsupported site`

- Active tab hostname is not in `SUPPORTED_HOSTS`.
- Site match may be missing in `manifest.json`.

`Context not found`

- Context id does not belong to current client id.
- Browser local storage client id changed.

`Server configuration missing`

- Missing one or more required `.env` values:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `OPENROUTER_API_KEY`
  - `OPENROUTER_MODEL`

## Security Notes

- Keep `SUPABASE_SERVICE_ROLE_KEY` only on backend.
- Never put service role key in extension code.
- Do not commit `.env`.
- Contexts are scoped by generated client id, not user auth.
- Client id lives in Chrome local extension storage.
- Current backend trusts `X-Membrane-Client-Id`; this is adequate for local MVP, not strong auth.

## Limitations

- No user accounts or auth beyond client id.
- No delete endpoint.
- No edit/rename context endpoint.
- No pagination beyond latest 20 contexts.
- No lint/formatter configured.
- Scraping depends on third-party site DOM structure.
- Backend URL is hardcoded in `src/config.ts`.
- Large chats lose middle content after 60K chars.

## Files To Change For Common Tasks

Add supported site:

- `src/config.ts`
- `extension/manifest.json`
- `src/content.ts` selector logic if needed

Change backend URL:

- `src/config.ts`

Change cleanup model:

- `.env` `OPENROUTER_MODEL`

Change cleanup format:

- `api/core.py` `cleanup_prompt`
- `api/core.py` `parse_cleanup_output`
- tests in `tests/test_core.py`

Change DB schema:

- `supabase_schema.sql`
- Supabase queries in `api/index.py`

Change popup UI:

- `extension/popup.html`
- `extension/popup.css`
- `src/popup.ts`

## License

No license file is currently included.
