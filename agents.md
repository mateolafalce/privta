# Privta contributor notes

## Project purpose

Privta is a static, fictional USD banking demo for WebMCP. It is intentionally
client-only: no backend, authentication service, server database, or real
financial integration may be introduced without an explicit product decision.

## Architecture

- `index.html` and `styles.css` contain the responsive banking UI.
- `data/seed.json` is the fixed, fictional transaction seed used by the UI and DuckDB-Wasm.
- `js/data.js` contains the fixed account, contact, and service data, plus a seed fallback.
- `js/store.js` loads the fixed transaction seed and persists runtime state in `localStorage`.
- `js/ledger.js` loads DuckDB-Wasm only when a financial summary is requested, imports the fixed seed into a local SQL table, and runs fixed SQL summary templates.
- `js/result-view.js` renders local SQL results in the visible document.
- `js/webmcp.js` installs the native WebMCP context or a local development shim.
- `js/tools.js` contains WebMCP tool definitions and dynamic registration.
- `js/app.js` renders the account overview and transaction table.
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
- Financial aggregations must be computed through the fixed local SQL templates in `js/ledger.js`; do not reintroduce JavaScript aggregation over transactions.
- Financial SQL results are intentionally rendered in the DOM and returned by their WebMCP tool. Keep the UI result and returned result aligned.
- Register the initial tool set before loading the static seed. Natural periods must use fixed SQL (`last_7_days` or `last_30_days`), and ordinal transaction requests must use the fixed `transactionByRecency` SQL template.
- Write tools use WebMCP/ChatGPT Desktop native approval. Do not add a duplicate
  in-app confirmation or staging flow.
- Mark every write tool with `destructiveHint: true`, state its side effect in
  its description, and record successful approved actions locally.
- Preserve dynamic tool registration. A tool that no longer applies must be
  deregistered with its `AbortController`.
