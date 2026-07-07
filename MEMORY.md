# Membrane Memory

## Current Working Notes

- Project is a Chrome extension MV3 plus FastAPI backend.
- Main supported sites are ChatGPT, Claude, Perplexity, Gemini/Bard, Copilot, Grok, and Mistral.
- Local backend runs on `http://127.0.0.1:8000`.
- Build output goes to `dist/`.
- Extension static files are copied from `extension/` into `dist/` during build.
- `npm run check` is the main verification command.

## Important Repo Facts

- All npm scripts use `.venv\Scripts\python.exe`.
- Python tests use `unittest`, not pytest.
- Backend stores cleaned context in Supabase.
- OpenRouter cleanup model defaults to `openai/gpt-4o-mini`.
- Content capture truncates raw chats above 60k chars.

## Decisions Already Made

- Use a persistent browser-local client id instead of user accounts.
- Keep cleanup and dedupe in backend.
- Keep browser-side scraping simple and host-aware.
- Use `dist/` as unpacked Chrome extension target.

## Recent Work

- README expanded with setup, commands, API, schema, and troubleshooting.
- Composer icon placement was improved and a PNG logo asset was added.
- `ARCHITECTURE.md`, `MEMORY.md`, and `CHANGELOG.md` introduced for project tracking.

