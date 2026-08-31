# Privta

**Privta** derives from *Private Data*: a private, secure space for managing
your financial information.

> Built for [OpenAI's WebMCP Challenge](https://openai.com/webmcp-challenge/).

Privta is a fictional, agent-native USD banking experience built with WebMCP.
It demonstrates an important boundary: private account data stays in the
browser tab, while ChatGPT Desktop can use local tools to summarize it and act
on it only after its native approval flow has been accepted.

## Proposed architecture for third-party banks

The current project remains a client-only, fictional demo. For a production
integration, each bank would run its own isolated Privta tenant and retain
control of its records, encryption keys, access policy, and audit evidence.

```text
                         AI CONTROL PLANE
                 (tool schemas, constrained intent,
                     structured local SQL results)
                                  │
                                  │ Receives the results requested
                                  │ by the person through local tools
                                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ CUSTOMER DEVICE · LOCAL TRUST ZONE                                        │
│                                                                          │
│  Privta browser app ── local WebMCP boundary ── native human approval    │
│  • local account view     • minimized tool context   • every write        │
│  • in-browser summaries   • no financial data egress  • one-time consent  │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │ mTLS, device binding, short-lived tokens
                                ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ BANK PRIVATE TENANT · DATA TRUST ZONE                                    │
│                                                                          │
│  Bank access edge ── Privacy policy broker ── Bank tool façade           │
│  • OAuth/OIDC exchange  • consent and purpose      • minimum fields      │
│  • network isolation    • ABAC and rate limits     • scoped capabilities  │
│                                                                          │
│                                      │                                   │
│                                      ▼                                   │
│                    Core banking · ledger · PII systems                   │
│                    HSM/KMS keys · immutable audit trail                  │
└──────────────────────────────────────────────────────────────────────────┘

Private data path: customer device ↔ bank tenant only.
Write path: native human approval → one-time, least-privilege capability.
```

The architecture separates the **data plane** from the **AI control plane**.
Financial records, personally identifiable information, calculation inputs,
and rendered results move only between the customer's browser and the bank's
private tenant over mutually authenticated transport. Summaries are calculated
in the browser whenever possible; where bank access is required, the bank tool
façade returns the minimum fields needed for that local calculation.

In this demo, the AI client receives the structured result of the local SQL
tool so it can answer the person's question, and the same result is visible in
the DOM. A production privacy design may choose a stricter data-minimization
boundary, but that is not the behavior demonstrated by this version.

Every request crossing into bank systems is evaluated by a privacy policy
broker for customer consent, declared purpose, role and attribute-based access,
and rate limits. The broker issues short-lived, audience-bound tokens; write
operations additionally require native human approval and a one-time,
least-privilege capability. Core banking credentials are never exposed to the
browser or the AI client.

Bank-owned HSM/KMS keys protect data at rest and service-to-service transport,
while immutable, privacy-minimized audit events record policy decisions and
approved writes. Each tenant should use separate keys, service identities,
network segmentation, and retention policies so that one bank's data and
operational metadata cannot be correlated with another's. The result is a
local-first experience that preserves the useful WebMCP interaction model while
minimizing both data egress and the blast radius of a compromised component.

## Run locally

```bash
python3 -m venv .venv  # only if it does not exist yet
npm install
npm run dev
```

`npm run dev` compiles the TypeScript sources in `src/` to `dist/` and starts
the Python static server. Open `http://127.0.0.1:4173` in a WebMCP-capable
browser. The included shim also keeps local development testable in ordinary
browsers.

To export the deterministic, fictional 2,400-transaction seed:

```bash
.venv/bin/python scripts/seed.py
```

## WebMCP design

`src/webmcp.ts` registers tools through `document.modelContext.registerTool`.
`show_financial_summary` runs fixed SQL templates against a local DuckDB-Wasm
database for spending, income, or net cash flow, including the fixed
`last_7_days` and `last_30_days` periods. The read-only tool set also supports
transaction search, historical smallest/largest expenses, monthly and recent
period spending comparisons, category and merchant breakdowns, recurring
debits, current account balances, and statistically unusual debits. The
`show_transaction_by_recency` tool covers ordinal requests such as “the tenth
most recent transaction.” Each result is rendered in the page's DOM and
returned to the agent, so the person and agent see the same summary.

Every financial aggregate uses a fixed local SQL template; tool parameters
only select documented filters and bounded result sizes. An expense means a
debit (`amount < 0`) and therefore includes outbound transfers. The fictional
seed has no opening balances or recurrence frequency, so Privta deliberately
does not present a reconstructed balance history or a future balance forecast.

DuckDB-Wasm is loaded on demand as a version-pinned browser dependency from
jsDelivr. When a financial summary is requested, Privta imports the fixed
`data/seed.json` transaction seed into its local `transactions` table. Approved
transfers are inserted into that same table. The database, transaction import,
and SQL execution remain entirely on the customer device; no transaction data
is sent to that CDN or to a backend.

Write tools are direct operations, not a custom in-app approval workflow.
They use `destructiveHint: true` and explicitly describe their side effect, so
ChatGPT Desktop can present its native human-approval interface before the
operation executes. Privta records approved actions locally.

Tools are registered initially before state hydration, then refreshed using an
`AbortController` to remove outdated registrations.

## Try these queries

Use these prompts in ChatGPT Desktop to explore Privta's local WebMCP tools:

- “How much did I spend in the last 30 days? Break it down by category.”
- “Compare my spending in the latest 30 days with the previous 30 days.”
- “Show my recurring charges and identify subscriptions that might be duplicates.”
- “Which of my expenses are statistically unusual, and why were they flagged?”
- “Find my `GAMERX ONLINE` charges and dispute the most recent one as unrecognized.”
