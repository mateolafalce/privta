# Privta

> Built for [OpenAI's WebMCP Challenge](https://openai.com/webmcp-challenge/).

Privta is a fictional, agent-native USD banking experience built with WebMCP.
It demonstrates an important boundary: private account data stays in the
browser tab, while ChatGPT Desktop can use local tools to summarize it and act
on it only after its native approval flow has been accepted.

## Run locally

```bash
python3 -m venv .venv  # only if it does not exist yet
.venv/bin/python scripts/serve.py
```

Open `http://127.0.0.1:4173` in a WebMCP-capable browser. The included shim
lets the UI work in ordinary browsers too.

To export the deterministic, fictional 2,400-transaction seed:

```bash
.venv/bin/python scripts/seed.py
```

## WebMCP design

`js/webmcp.js` registers tools through `document.modelContext.registerTool`.
Read tools return only bounded, structured results: `query_transactions` caps
responses at 500 rows. UI tools let the agent render a chart, highlight rows,
and persist an insight in the application instead of merely describing them in
chat.

Write tools are direct operations, not a custom in-app approval workflow.
They use `destructiveHint: true` and explicitly describe their side effect, so
ChatGPT Desktop can present its native human-approval interface before the
operation executes. Privta records approved actions in the Activity tab.

Tools are registered dynamically. For example, once the card is frozen,
`freeze_card` is deregistered with an `AbortController` and the live tool count
updates in the header.

## Demo data

All accounts, services, transactions, and transfers use fictional USD values.
The deterministic dataset covers 18 months and contains planted findings:

- Spotify and Spotify Premium as a possible duplicate subscription.
- A water bill that increases more than 300%.
- A recurring unfamiliar `GAMERX ONLINE` charge.
- Seasonal July and December spending spikes.
- A 12-installment purchase and a mid-period salary increase.

There is no backend, login, server database, or real money integration.
