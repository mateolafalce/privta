import { state, mutate, update } from "./store.js";
import { getModelContext } from "./webmcp.js";

const MAX_ROWS = 500;
const controllers = new Map();
const schema = (properties = {}, required = []) => ({ type: "object", properties, required, additionalProperties: false });
const formatUSD = (value) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const error = (message) => ({ ok: false, error: message });
const transaction = (id) => state.transactions.find((row) => row.id === id);

function queryTransactions(args = {}) {
  let rows = state.transactions.filter((row) =>
    (!args.account_id || row.account_id === args.account_id) && (!args.from || row.date >= args.from) && (!args.to || row.date <= args.to) &&
    (!args.categories?.length || args.categories.includes(row.category)) && (!args.merchant_contains || row.merchant.toLowerCase().includes(args.merchant_contains.toLowerCase())) &&
    (!args.min_amount || Math.abs(row.amount) >= args.min_amount) && (!args.max_amount || Math.abs(row.amount) <= args.max_amount) && (!args.recurring_only || row.is_recurring)
  );
  const totalRows = rows.length;
  if (args.group_by) {
    const keyFor = args.group_by === "month" ? (row) => row.date.slice(0, 7) : (row) => row[args.group_by];
    rows = Object.values(rows.reduce((groups, row) => {
      const key = keyFor(row); groups[key] ??= { [args.group_by]: key, total: 0, count: 0 }; groups[key].total += row.amount; groups[key].count += 1; return groups;
    }, {}));
  }
  const sortKey = args.order_by === "total" ? "total" : args.order_by || "date";
  rows.sort((a, b) => sortKey === "date" ? String(b.date).localeCompare(String(a.date)) : Math.abs(b[sortKey] ?? b.amount) - Math.abs(a[sortKey] ?? a.amount));
  const limit = Math.min(Math.max(Number(args.limit) || 50, 1), MAX_ROWS);
  return { total_rows: totalRows, rows: rows.slice(0, limit), summary: { total: rows.reduce((sum, row) => sum + (row.total ?? row.amount), 0), limit_applied: limit, currency: "USD" } };
}

function recurringCharges() {
  const groups = new Map();
  state.transactions.filter((row) => row.is_recurring).forEach((row) => {
    const key = row.merchant.replace(" Premium", ""); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row);
  });
  return [...groups.entries()].filter(([, rows]) => rows.length >= 3).map(([merchant, rows]) => {
    const ordered = rows.sort((a, b) => a.date.localeCompare(b.date)); const initial = Math.abs(ordered[0].amount); const current = Math.abs(ordered.at(-1).amount);
    return { merchant, cadence: "monthly", occurrences: rows.length, initial_amount: initial, current_amount: current, change_percent: Math.round(((current - initial) / initial) * 100), transaction_ids: rows.map((row) => row.id) };
  }).sort((a, b) => b.change_percent - a.change_percent);
}

function logOperation(type, detail) { mutate((s) => s.appliedOps.unshift({ id: `op-${crypto.randomUUID().slice(0, 7)}`, type, detail, applied_at: new Date().toISOString() })); }
function writeTools() { return [
  { name: "make_transfer", title: "Make a transfer", description: "Transfers USD from Privta checking to a saved contact. This changes fictional funds; ChatGPT Desktop must obtain user approval before this tool executes.", annotations: { readOnlyHint: false, destructiveHint: true }, inputSchema: schema({ contact_id: { type: "string", enum: state.contacts.map((contact) => contact.id) }, amount: { type: "number", minimum: 0.01 }, memo: { type: "string" } }, ["contact_id", "amount", "memo"]), execute: ({ contact_id, amount, memo }) => {
    const contact = state.contacts.find((item) => item.id === contact_id); const account = state.accounts.find((item) => item.id === "checking");
    if (!contact || !account) return error("Contact or USD checking account was not found."); if (account.balance < amount) return error("Insufficient USD balance.");
    mutate((s) => { s.accounts.find((item) => item.id === "checking").balance -= amount; s.transactions.unshift({ id: `tx-${crypto.randomUUID()}`, account_id: "checking", date: new Date().toISOString().slice(0, 10), amount: -amount, currency: "USD", merchant: contact.name, category: "Transfers", channel: "Bank transfer", installments: 0, is_recurring: false }); });
    logOperation("Transfer", `${formatUSD(amount)} to ${contact.name} · ${memo}`); return { ok: true, message: `Transferred ${formatUSD(amount)} to ${contact.name}.`, resulting_balance: account.balance, currency: "USD" };
  } },
  { name: "pay_service", title: "Pay a service", description: "Pays a pending USD service bill from Privta checking. ChatGPT Desktop must obtain user approval before this tool executes.", annotations: { readOnlyHint: false, destructiveHint: true }, inputSchema: schema({ service_id: { type: "string" }, amount: { type: "number", minimum: 0.01 } }, ["service_id"]), execute: ({ service_id, amount }) => {
    const service = state.services.find((item) => item.id === service_id); const account = state.accounts.find((item) => item.id === "checking"); const total = amount || service?.amount;
    if (!service || service.status !== "pending") return error("This service cannot be paid."); if (account.balance < total) return error("Insufficient USD balance.");
    mutate((s) => { s.accounts.find((item) => item.id === "checking").balance -= total; s.services.find((item) => item.id === service_id).status = "paid"; }); logOperation("Service payment", `${service.name} · ${formatUSD(total)}`); return { ok: true, message: `${service.name} was paid.`, amount: total, currency: "USD" };
  } },
  { name: "freeze_card", title: "Freeze card", description: "Immediately freezes the specified card. ChatGPT Desktop must obtain user approval before this tool executes.", annotations: { readOnlyHint: false, destructiveHint: true }, inputSchema: schema({ card_id: { type: "string" }, reason: { type: "string" } }, ["card_id", "reason"]), execute: ({ card_id, reason }) => { const card = state.cards.find((item) => item.id === card_id); if (!card || card.status === "frozen") return error("The card is not available."); mutate((s) => { s.cards.find((item) => item.id === card_id).status = "frozen"; }); logOperation("Card frozen", `${card.brand} •••• ${card.last4} · ${reason}`); refreshTools(); return { ok: true, message: "Card frozen." }; } },
  { name: "dispute_charge", title: "Dispute a charge", description: "Starts a dispute for a transaction. ChatGPT Desktop must obtain user approval before this tool executes.", annotations: { readOnlyHint: false, destructiveHint: true }, inputSchema: schema({ transaction_id: { type: "string" }, reason: { type: "string" }, details: { type: "string" } }, ["transaction_id", "reason"]), execute: ({ transaction_id, reason, details = "" }) => { const row = transaction(transaction_id); if (!row) return error("Transaction was not found."); logOperation("Charge disputed", `${row.merchant} · ${formatUSD(Math.abs(row.amount))} · ${reason}`); return { ok: true, message: "Dispute started.", details }; } },
  { name: "create_budget_rule", title: "Create budget rule", description: "Creates a monthly USD budget alert. ChatGPT Desktop must obtain user approval before this tool executes.", annotations: { readOnlyHint: false, destructiveHint: true }, inputSchema: schema({ category: { type: "string" }, monthly_limit: { type: "number", minimum: 0.01 }, action: { type: "string", enum: ["notify", "freeze_card"] } }, ["category", "monthly_limit", "action"]), execute: ({ category, monthly_limit, action }) => { logOperation("Budget rule", `${category}: ${formatUSD(monthly_limit)} / month · ${action}`); return { ok: true, message: "Budget rule created." }; } },
]; }

function readTools() { return [
  { name: "get_accounts", title: "Get accounts", description: "Returns the user's accounts, USD balances, aliases, and cards.", annotations: { readOnlyHint: true }, inputSchema: schema(), execute: () => ({ accounts: state.accounts, cards: state.cards, currency: "USD" }) },
  { name: "describe_data", title: "Describe data", description: "Describes available data, actual date coverage, and transaction categories.", annotations: { readOnlyHint: true }, inputSchema: schema(), execute: () => ({ ready: state.ready, tables: ["accounts", "transactions", "contacts", "services", "cards"], date_range: [state.transactions.at(-1)?.date, state.transactions[0]?.date], categories: [...new Set(state.transactions.map((row) => row.category))].sort(), currency: "USD" }) },
  { name: "query_transactions", title: "Query transactions", description: "Queries transaction data with structured filters and returns no more than 500 rows to protect privacy.", annotations: { readOnlyHint: true }, inputSchema: schema({ account_id: { type: "string" }, from: { type: "string" }, to: { type: "string" }, categories: { type: "array", items: { type: "string" } }, merchant_contains: { type: "string" }, min_amount: { type: "number" }, max_amount: { type: "number" }, recurring_only: { type: "boolean" }, group_by: { type: "string", enum: ["category", "merchant", "month", "channel"] }, order_by: { type: "string", enum: ["date", "amount", "total"] }, limit: { type: "number", maximum: 500 } }), execute: queryTransactions },
  { name: "find_recurring", title: "Find recurring charges", description: "Finds recurring subscriptions and charges, including initial and current USD amount.", annotations: { readOnlyHint: true }, inputSchema: schema(), execute: () => ({ recurring_charges: recurringCharges(), currency: "USD" }) },
  { name: "get_current_view", title: "Get current view", description: "Returns exactly what the person is seeing: active tab, filters, account, and selected transaction.", annotations: { readOnlyHint: true }, inputSchema: schema(), execute: () => ({ active_view: state.activeView, filters: state.filters, selected_account: state.selectedAccount, selected_transaction: state.selectedTransactionId }) },
  { name: "compare_periods", title: "Compare periods", description: "Compares spending by category across two date ranges and orders the largest change first.", annotations: { readOnlyHint: true }, inputSchema: schema({ from_a: { type: "string" }, to_a: { type: "string" }, from_b: { type: "string" }, to_b: { type: "string" } }, ["from_a", "to_a", "from_b", "to_b"]), execute: (args) => { const sum = (from, to) => state.transactions.filter((row) => row.date >= from && row.date <= to && row.amount < 0).reduce((all, row) => ((all[row.category] = (all[row.category] || 0) + Math.abs(row.amount)), all), {}); const a = sum(args.from_a, args.to_a), b = sum(args.from_b, args.to_b); return { currency: "USD", comparison: [...new Set([...Object.keys(a), ...Object.keys(b)])].map((category) => ({ category, period_a: a[category] || 0, period_b: b[category] || 0, delta: (a[category] || 0) - (b[category] || 0), delta_percent: b[category] ? Math.round(((a[category] - b[category]) / b[category]) * 100) : null })).sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta)) }; } },
  { name: "show_chart", title: "Show chart", description: "Renders a bar, line, or donut chart directly inside Privta.", annotations: { readOnlyHint: false }, inputSchema: schema({ type: { type: "string", enum: ["bar", "line", "donut"] }, data: { type: "array" }, title: { type: "string" }, subtitle: { type: "string" } }, ["type", "data", "title"]), execute: (chart) => { update({ chart, activeView: "analysis" }); return { ok: true, message: "Chart shown in Privta." }; } },
  { name: "highlight_transactions", title: "Highlight transactions", description: "Highlights transaction rows directly in the Privta table.", annotations: { readOnlyHint: false }, inputSchema: schema({ transaction_ids: { type: "array", items: { type: "string" }, maxItems: 50 }, reason: { type: "string" } }, ["transaction_ids", "reason"]), execute: ({ transaction_ids, reason }) => { update({ highlights: transaction_ids, activeView: "transactions" }); return { ok: true, message: `${transaction_ids.length} transactions highlighted.`, reason }; } },
  { name: "pin_insight", title: "Pin insight", description: "Pins an insight card persistently in Privta's analysis view.", annotations: { readOnlyHint: false }, inputSchema: schema({ title: { type: "string" }, body: { type: "string" }, severity: { type: "string", enum: ["info", "medium", "high"] }, transaction_ids: { type: "array", items: { type: "string" } } }, ["title", "body", "severity"]), execute: (insight) => { mutate((s) => s.insights.unshift({ ...insight, id: crypto.randomUUID() })); return { ok: true, message: "Insight pinned." }; } },
]; }

export async function refreshTools() {
  const context = getModelContext(); if (!context) return;
  for (const controller of controllers.values()) controller.abort(); controllers.clear();
  const tools = [...readTools(), ...writeTools().filter((tool) => tool.name !== "freeze_card" || state.cards.some((card) => card.status !== "frozen"))];
  await Promise.all(tools.map(async (tool) => { const controller = new AbortController(); controllers.set(tool.name, controller); await context.registerTool(tool, { signal: controller.signal }); }));
}
