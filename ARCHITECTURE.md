# Membrane Architecture

## Purpose

Membrane is a Chrome extension plus FastAPI backend. It captures AI chat context from supported chat sites, cleans the raw text through OpenRouter, stores the cleaned output in Supabase, and injects saved context into another supported chat.

## Main Parts

- `src/` - TypeScript extension source
- `extension/` - static MV3 assets copied into `dist/`
- `api/` - FastAPI backend and shared backend helpers
- `tests/` - Python `unittest` coverage for pure backend logic
- `scripts/` - build and backend launch helpers
- `dist/` - generated extension bundle

## Runtime Flow

1. Content script loads on supported chat sites.
2. A visible `Save Context` button appears on the page.
3. User captures visible chat, or opens popup and saves the active tab.
4. Content script sends raw chat to background service worker.
5. Background service worker calls backend with `X-Membrane-Client-Id`.
6. Backend validates input and truncates overly large chats.
7. Backend sends prompt to OpenRouter for cleanup.
8. Cleaned content is parsed into `title` and `content`.
9. Backend dedupes by `client_id` and SHA-256 content hash.
10. Cleaned context is stored in Supabase.
11. Popup lists saved contexts for the current client id.
12. User selects a context and extension injects it into the active composer.

## Backend Boundaries

- `api/core.py` holds pure logic: validation, truncation, prompt construction, parsing, and hashing.
- `api/index.py` holds FastAPI routes, CORS, OpenRouter request handling, and Supabase reads and writes.

## Extension Boundaries

- `src/background.ts` routes extension messages.
- `src/client.ts` manages backend calls and stable browser-local client id.
- `src/content.ts` scrapes chats, injects UI, and inserts context into composer fields.
- `src/popup.ts` drives the popup UI.
- `src/config.ts` defines backend base URL and supported hosts.

## Data Model

Supabase table: `contexts`

- `id`
- `client_id`
- `title`
- `content`
- `content_hash`
- `created_at`

Indexes:

- unique `(client_id, content_hash)` for dedupe
- `(client_id, created_at desc)` for recent context listing

## Key Constraints

- No user auth layer beyond generated client id.
- Backend uses service role key.
- Extension is scoped to supported hostnames and local backend origin.
- Large raw chats retain head and tail only after the capture limit.

