# Membrane

Chrome extension (MV3) + FastAPI backend. Captures chat context from ChatGPT, Claude, Perplexity, cleans it via OpenRouter (GPT-4o-mini), stores in Supabase, and injects into other AI chats.

## Architecture

- `src/` — TypeScript for the extension (compiled to `dist/` via `tsc`)
- `api/` — Python FastAPI backend (uvicorn), routes in `api/index.py`, core logic in `api/core.py`
- `extension/` — static assets (`manifest.json`, `popup.html`, `popup.css`) copied to `dist/` at build
- `tests/` — Python unittest tests for `api/core.py`
- `scripts/run_backend.py` — launches uvicorn on `127.0.0.1:8000`
- `scripts/copy-static.js` — copies static files to `dist/` after `tsc`

**Flow:** content script scrapes chat text → `POST /capture-context` with `X-Membrane-Client-Id` header → backend sends to OpenRouter for cleanup → stores result in Supabase (deduped by SHA-256 hash).

## Commands

| Command | What it does |
|---|---|
| `npm run build` | `tsc && node scripts/copy-static.js` |
| `npm test` | Python unittest on `tests/` |
| `npm run backend` | Starts uvicorn on `127.0.0.1:8000` |
| `npm run check:python` | `py_compile` validation of `api/core.py api/index.py` |
| `npm run check` | Full: build → test → python check |

## Key details

- **Python in venv:** All npm scripts reference `.venv\Scripts\python.exe` (Windows path). Set up with `python -m venv .venv`
- **Dependencies:** `pip install -r requirements.txt` — FastAPI, httpx, supabase, uvicorn, python-dotenv, pydantic
- **Backend CORS:** Reads `ALLOWED_EXTENSION_ORIGINS` (comma-separated) from `.env` + allows localhost regex
- **Chat truncation:** Raw chat >60K chars → head 10K + tail 50K with a mid-truncation note
- **OpenRouter timeout:** 12s (HTTP 504 on timeout, 502 on failures)
- **Error bundling:** All OpenRouter 4xx/5xx status codes → HTTP 502
- **Testing:** Python `unittest` only (no pytest) — `npm test` runs `unittest discover -s tests`
- **No linter/formatter** configured — just `tsc` for TS and `py_compile` for Python

## Env (`.env`)

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
OPENROUTER_API_KEY=
OPENROUTER_MODEL=openai/gpt-4o-mini
ALLOWED_EXTENSION_ORIGINS=chrome-extension://<id>
```
