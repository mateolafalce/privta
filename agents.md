# Privta contributor notes

## Project purpose

Privta is a static, fictional USD banking demo for WebMCP. It is intentionally
client-only: no backend, authentication service, server database, or real
financial integration may be introduced without an explicit product decision.

## Architecture

- `index.html` and `styles.css` contain the responsive banking UI.
- `js/data.js` deterministically creates the in-browser, fictional transaction seed.
- `js/store.js` holds app state and persists it in `localStorage`.
- `js/webmcp.js` installs the native WebMCP context or a local development shim.
- `js/tools.js` contains WebMCP tool definitions and dynamic registration.
- `js/app.js` renders the UI and keeps the shared UI context current.
- `scripts/seed.py` exports an inspectable JSON copy of the deterministic USD seed.

## Commands

Always use the repository virtual environment for Python:

```bash
.venv/bin/python scripts/serve.py
.venv/bin/python scripts/seed.py
```

Create `.venv` first with `python3 -m venv .venv` if it is absent.

## Product and safety rules

- Keep all UI copy, tool names, schemas, comments, and documentation in English.
- Use USD exclusively. Do not add another currency.
- All demo values and identities must remain fictional.
- Account data stays local to the browser. Keep read results bounded.
- Write tools use WebMCP/ChatGPT Desktop native approval. Do not add a duplicate
  in-app confirmation or staging flow.
- Mark every write tool with `destructiveHint: true`, state its side effect in
  its description, and record successful approved actions in Activity.
- Preserve dynamic tool registration. A tool that no longer applies must be
  deregistered with its `AbortController`.
