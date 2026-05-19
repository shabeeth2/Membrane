# MVP PRD - Membrane

## Tagline

The memory layer between AI systems.

## Final MVP Statement

Membrane MVP is a Chrome extension plus Python backend that lets a user capture AI chat context from one tool and instantly inject that context into another without rewriting anything.

## Objective

Allow a user to:

1. Capture the visible working context from one AI chat.
2. Save it as cleaned reusable project context.
3. Inject it into another AI chat.
4. Continue work without re-explaining the project.

The MVP proves only the core loop:

```text
GetContext -> InjectContext
```

## Supported Tools

Capture and injection targets:

- ChatGPT
- Claude
- Perplexity

Official browser target:

- Google Chrome stable, Manifest V3

Chromium browsers may work, but are not official MVP targets.

## Non-Goals

Do not build user-facing:

- Search
- Edit or delete context
- Auth system
- Teams
- Files
- Versioning
- Dashboard
- Perfect UI
- Analytics

Minimal invisible infrastructure is allowed only when required for privacy, reliability, or local development.

Accepted invisible additions:

- `client_id` client scoping
- `content_hash` dedupe
- `/health`
- `GET /`
- CORS allowlist
- Operational logs without raw or cleaned content
- 100-character scrape minimum
- Backend input truncation

## User Stories

### Story A - GetContext

I am on a ChatGPT, Claude, or Perplexity chat. I click `Save Context`. The visible conversation is saved as reusable memory.

### Story B - InjectContext

I open another supported AI tool. I open the extension popup. I click a saved context. It is inserted into the chat input in the correct format.

## Architecture

```text
Chrome Extension (TypeScript, MV3)
  - Content script: scrape and inject
  - Popup: context list
  - Background/service worker: API calls

FastAPI on Vercel
  - POST /capture-context
  - GET /list-contexts
  - GET /get-context/{id}
  - GET /health
  - GET /

Supabase Postgres
  - contexts table

OpenRouter
  - cleanup and title generation
```

The extension talks only to FastAPI. Supabase credentials stay server-side.

## Chrome Extension Requirements

### Permissions

```json
{
  "permissions": ["activeTab", "storage", "scripting"],
  "host_permissions": [
    "https://chatgpt.com/*",
    "https://chat.openai.com/*",
    "https://claude.ai/*",
    "https://www.perplexity.ai/*",
    "https://perplexity.ai/*"
  ]
}
```

### Client Scoping

No auth system is built for MVP.

The extension creates or stores a local client id in `chrome.storage`, then sends it with every API request:

```http
X-Membrane-Client-Id: <local extension client id>
```

The backend uses this value to isolate contexts.

### API URL Config

Use build-time configuration:

```ts
export const API_BASE_URL = "http://localhost:8000";
```

For production builds, replace this with the Vercel URL. No settings screen is included.

### Floating Save Button

On supported sites, the content script injects a bottom-right button:

```text
Save Context
```

On click:

1. Disable button.
2. Change label to `Saving...`.
3. Scrape visible chat text.
4. If scraped text is under 100 characters, show `Could not find chat content` and do not call the backend.
5. Send raw text to `POST /capture-context`.
6. On success, show `Context saved`.
7. On failure, show `Could not save context`.

Capture is synchronous for MVP. No queue or job status UI.

### Popup UI

Popup shows:

```text
My Contexts
```

Then the newest 20 saved contexts, sorted by newest first.

Each row shows:

- Title
- Short created date/time

Empty state:

```text
No contexts yet
```

If the active tab is unsupported:

- The popup may still show saved contexts.
- Injection attempts fail with `Unsupported site`.

No pagination, search, delete, or editing.

## DOM Scraping Rules

Capture visible text throughout the current conversation only.

Global rules:

- Capture only the visible current thread.
- Preserve chronological order.
- Prefer role labels: `User:` and `Assistant:`.
- Exclude sidebars, navigation, prompt suggestions, copy buttons, timestamps, and UI chrome.
- Capture only the currently visible selected answer when regenerated variants exist.
- If role-specific scraping fails, use a generic visible main-content fallback.
- If fallback still produces insufficient content, show `Could not find chat content`.

Site expectations:

- ChatGPT: extract visible user and assistant turns from the current conversation page on `chatgpt.com` and `chat.openai.com`.
- Claude: extract visible human and assistant turns from the current conversation page on `claude.ai`.
- Perplexity: extract visible question and answer thread from `perplexity.ai`.

The extension sends raw scraped text without cleanup.

Example raw format:

```text
User: ...
Assistant: ...
User: ...
Assistant: ...
```

## Injection Rules

When a context is selected, fetch it from the backend and insert this exact text:

```text
You are continuing an existing project.

Here is the full working context:

--- CONTEXT START ---
{cleaned_context_from_db}
--- CONTEXT END ---

First, acknowledge you understand this context. Then wait for my next instruction.
```

Behavior:

- If the chat input is empty, insert the prompt directly.
- If the chat input already has text, append two blank lines and then the prompt.
- Never auto-submit.
- Leave cursor at the end.
- Show `Context injected` on success.
- Show `Could not inject context` on failure.
- Inject the full cleaned context as a single message. No chunking.

Injection implementation:

1. Find the supported site's known input target.
2. Focus it.
3. Prefer event-driven insertion such as `document.execCommand("insertText", false, text)`.
4. If needed, set `value` or `textContent` and dispatch input events.
5. Avoid system clipboard fallback.
6. Return success only if the text appears in the input afterward.

## Backend Requirements

### Deployment Shape

Use minimal Vercel Python serverless layout:

```text
api/
  index.py
requirements.txt
vercel.json
```

`api/index.py` exposes the FastAPI app.

Suggested `vercel.json`:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/api/index.py" }]
}
```

Backend is stateless. No local files, no queue, no background jobs.

### Environment Variables

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
OPENROUTER_API_KEY
OPENROUTER_MODEL
ALLOWED_EXTENSION_ORIGINS
```

Backend may start if environment variables are missing, so `/health` can explain configuration state.

Product endpoints return safe errors if required env vars are missing. Never echo secret values.

### CORS

MVP CORS policy:

- Allow configured extension origins from `ALLOWED_EXTENSION_ORIGINS`.
- Allow `http://localhost:*` during local development.
- Do not use cookies.
- Do not use `Access-Control-Allow-Origin: *` in production.
- Accept headers:
  - `Content-Type`
  - `X-Membrane-Client-Id`

Unpacked extension origins look like:

```text
chrome-extension://<extension-id>
```

### Root Endpoint

`GET /` returns:

```json
{
  "name": "Membrane API",
  "status": "ok",
  "health": "/health"
}
```

### Health Endpoint

`GET /health` returns:

```json
{
  "ok": true,
  "supabase_configured": true,
  "openrouter_configured": true
}
```

### POST /capture-context

Request headers:

```http
X-Membrane-Client-Id: <local extension client id>
```

Request body:

```json
{
  "raw_chat": "User: ...\nAssistant: ..."
}
```

Steps:

1. Validate client id.
2. Validate raw chat.
3. Apply input cap with head+tail retention.
4. Send retained raw chat to OpenRouter.
5. Parse `Title:` line.
6. Store cleaned context in Supabase.
7. If `client_id + content_hash` already exists, return the existing context instead of inserting a duplicate.

Success response:

```json
{
  "id": 123,
  "title": "Landing Page Positioning",
  "created_at": "2026-05-19T10:30:00Z",
  "deduped": false,
  "truncated": false
}
```

Duplicate response:

```json
{
  "id": 123,
  "title": "Landing Page Positioning",
  "created_at": "2026-05-19T10:30:00Z",
  "deduped": true,
  "truncated": false
}
```

### GET /list-contexts

Request headers:

```http
X-Membrane-Client-Id: <local extension client id>
```

Response:

```json
[
  {
    "id": 123,
    "title": "Landing Page Positioning",
    "created_at": "2026-05-19T10:30:00Z"
  }
]
```

Rules:

- Return only contexts for the client id.
- Return newest 20.
- Sort by `created_at desc`.

### GET /get-context/{id}

Request headers:

```http
X-Membrane-Client-Id: <local extension client id>
```

Response:

```json
{
  "id": 123,
  "title": "Landing Page Positioning",
  "content": "Project goal:\n..."
}
```

Rules:

- Return only if the context belongs to the client id.
- Return `404` if the id does not exist for that client.

### Errors

- `400`: invalid or missing raw chat
- `401`: missing client id
- `404`: context not found for this client
- `500`: server configuration or database error
- `502`: OpenRouter cleanup failed
- `504`: OpenRouter timeout

## OpenRouter Cleanup

OpenRouter cleanup is required before saving. If cleanup fails, do not store a context.

Model:

- Default via `OPENROUTER_MODEL`
- Recommended initial value: `openai/gpt-4o-mini` or another fast, low-cost model available through OpenRouter

Timeout:

- Use a strict timeout around 8-12 seconds.

Raw input cap:

- Cap raw input around 60,000 characters.
- Use head+tail retention:
  - first 10,000 characters
  - last 50,000 characters
- If truncated, tell the cleanup prompt that middle content may be omitted.

Cleanup prompt:

```text
You convert messy AI chat logs into clean reusable project context.

Return exactly:

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

Preserve exact code snippets, commands, API contracts, schemas, prompts, and user-approved decisions when they are important.
Do not invent details.
Do not omit critical details.
Make this context reusable for another AI system.
```

Backend behavior:

- Parse the first `Title:` line into the `title` column.
- Store the remaining cleaned context in `content`.
- If title parsing fails, fall back to `Context - <date>`.
- Store no raw chat.

## Database Schema

```sql
create table contexts (
  id bigserial primary key,
  client_id text not null,
  title text not null,
  content text not null,
  content_hash text not null,
  created_at timestamptz not null default now()
);

create unique index contexts_client_hash_idx
  on contexts (client_id, content_hash);

create index contexts_client_created_idx
  on contexts (client_id, created_at desc);
```

No raw chat persistence.

No RLS dependency for MVP because FastAPI is the policy boundary and uses the Supabase service role key server-side only. RLS can be added later with real auth.

## Logging

No analytics and no product event tracking.

Server logs may include operational events:

- Capture requested
- Raw length
- Truncated true or false
- OpenRouter success or failure
- DB insert or dedupe success or failure

Logs must not include:

- Raw chat
- Cleaned context
- Secret values

Extension may log to console during development and should be quiet in production.

## Definition of Done

MVP is complete when:

- Context can be saved from ChatGPT.
- Claude can be opened.
- Saved context can be injected into Claude.
- Claude behaves as if it has the original working context.
- The same basic flow works across ChatGPT, Claude, and Perplexity.

Timing:

- From an already saved context, opening the popup, clicking a context, fetching it, and injecting it into Claude takes under 5 seconds on a normal connection.
- Capture shows feedback immediately and usually completes under 15 seconds for chats under the input cap.
- `/list-contexts` and `/get-context/{id}` usually respond under 1 second excluding cold starts.
- OpenRouter cleanup is not required to complete under 5 seconds.

## Testing Contract

Backend tests:

- Missing client id returns `401`.
- Empty raw chat returns `400`.
- Cleanup parse extracts `Title:`.
- Duplicate cleaned content returns existing row.
- List returns newest 20 only for that client.
- Get context cannot cross client boundary.

Extension manual tests:

- ChatGPT save button appears and captures visible thread.
- Claude save button appears and captures visible thread.
- Perplexity save button appears and captures visible thread.
- Popup lists contexts.
- Clicking context injects into empty input.
- Clicking context appends into non-empty input.
- Unsupported active tab fails cleanly.

Automated browser tests against real ChatGPT, Claude, and Perplexity are post-MVP because auth and DOM churn make them brittle.

## Build Order

1. Create Supabase schema.
2. Build FastAPI app with root, health, and three product endpoints.
3. Add OpenRouter cleanup integration.
4. Add backend tests.
5. Scaffold Chrome MV3 extension.
6. Implement client id storage and API client.
7. Implement content script save button and scraping.
8. Implement site-specific injection.
9. Implement popup list and click-to-inject.
10. Manually test across ChatGPT, Claude, and Perplexity.

## Post-MVP Phases

### Phase 2 - Better Injection

- Smarter formatting per AI
- Context metadata

### Phase 3 - Versioning

- Update context
- History
- Branches

### Phase 4 - Search and Library

- Tags
- Fast search

### Phase 5 - Teams

- Shared contexts
- Permissions

### Phase 6 - SDK, MCP, and Web App

- Developer integration
- ContextOS dashboard
