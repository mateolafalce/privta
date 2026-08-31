import { state, mutate } from "./store.js";
import { getModelContext, type JsonSchema, type WebMCPTool } from "./webmcp.js";
import { appendTransaction, compareRecentSpending, expenseBySize, latestExpense, merchantExpenses, recurringExpenses, searchTransactions, spendingByMonth, summarizeTransactions, transactionByRecency, unusualExpenses } from "./ledger.js";
import { presentDomError, presentDomResult } from "./result-view.js";
import type { DomResult, LedgerTransaction, MerchantFilters, SearchFilters, SummaryFilters } from "./types.js";

const controllers = new Map<string, AbortController>();
const schema = (properties: Record<string, unknown> = {}, required: string[] = []): JsonSchema => ({ type: "object", properties, required, additionalProperties: false });
const formatUSD = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const error = (message: string) => ({ ok: false as const, error: message });
const transaction = (id: unknown) => state.transactions.find((row) => row.id === id);
const localSqlError = (cause: unknown) => cause instanceof Error ? cause.message : String(cause || "Unknown local SQL error.");
const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const asString = (value: unknown) => typeof value === "string" ? value : undefined;
const asNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : undefined;
const asBoolean = (value: unknown) => typeof value === "boolean" ? value : undefined;
const asStringArray = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined;

function summaryFilters(input: unknown): SummaryFilters {
  const value = asRecord(input);
  const metric = value.metric;
  return {
    metric: metric === "spending" || metric === "income" || metric === "net_cash_flow" ? metric : undefined,
    period: asString(value.period),
    from: asString(value.from),
    to: asString(value.to),
    categories: asStringArray(value.categories),
    merchant_contains: asString(value.merchant_contains),
    recurring_only: asBoolean(value.recurring_only),
  };
}

function searchFilters(input: unknown): SearchFilters {
  const value = asRecord(input);
  return {
    from: asString(value.from),
    to: asString(value.to),
    categories: asStringArray(value.categories),
    merchant_contains: asString(value.merchant_contains),
    min_amount: asNumber(value.min_amount),
    max_amount: asNumber(value.max_amount),
    limit: asNumber(value.limit),
  };
}

function merchantFilters(input: unknown): MerchantFilters {
  const value = asRecord(input);
  return {
    from: asString(value.from),
    to: asString(value.to),
    merchant_contains: asString(value.merchant_contains),
    limit: asNumber(value.limit),
  };
}

async function showFinancialSummary(input: unknown = {}) {
  const value = asRecord(input);
  const title = asString(value.title) || "Private financial summary";
  try {
    const result = await summarizeTransactions(summaryFilters(input));
    const presentation: DomResult = { title, from: result.coveredFrom, to: result.coveredTo, total: result.total, transactionCount: result.transactionCount, breakdown: result.breakdown, totalLabel: result.totalLabel, breakdownLabel: result.breakdownLabel };
    presentDomResult(presentation);
    return { ok: true as const, ...presentation };
  } catch (cause) {
    console.error("Local DuckDB financial summary failed.", cause);
    const detail = localSqlError(cause);
    presentDomError({ title: "Financial summary could not be calculated", detail });
    return error(`The private local SQL calculation could not be completed: ${detail}`);
  }
}

async function showLatestExpense() {
  try {
    const expense = await latestExpense();
    const presentation: DomResult = { title: "Latest expense", from: expense.date, to: expense.date, total: expense.amount, transactionCount: 1, breakdown: [{ label: expense.merchant, value: expense.amount }], totalLabel: "Expense amount", breakdownLabel: "Transaction" };
    presentDomResult(presentation);
    return { ok: true as const, ...presentation, category: expense.category, channel: expense.channel };
  } catch (cause) {
    console.error("Local DuckDB latest expense query failed.", cause);
    const detail = localSqlError(cause);
    presentDomError({ title: "Latest expense could not be calculated", detail });
    return error(`The private local SQL calculation could not be completed: ${detail}`);
  }
}

async function showTransactionByRecency(input: unknown = {}) {
  const position = asNumber(asRecord(input).position);
  try {
    const entry = await transactionByRecency(position ?? 1);
    const presentation: DomResult = { title: `Transaction #${position} by recency`, from: entry.date, to: entry.date, total: Math.abs(entry.amount), transactionCount: 1, breakdown: [{ label: entry.merchant, value: Math.abs(entry.amount) }], totalLabel: entry.amount < 0 ? "Expense amount" : "Income amount", breakdownLabel: "Transaction" };
    presentDomResult(presentation);
    return { ok: true as const, ...presentation, category: entry.category, channel: entry.channel, kind: entry.amount < 0 ? "expense" : "income" };
  } catch (cause) {
    console.error("Local DuckDB positioned transaction query failed.", cause);
    const detail = localSqlError(cause);
    presentDomError({ title: "Transaction could not be calculated", detail });
    return error(`The private local SQL calculation could not be completed: ${detail}`);
  }
}

function presentExpense(title: string, expense: LedgerTransaction) {
  const presentation: DomResult = { title, from: expense.date, to: expense.date, total: expense.amount, transactionCount: 1, breakdown: [{ label: expense.merchant, value: expense.amount }], totalLabel: "Expense amount", breakdownLabel: "Transaction" };
  presentDomResult(presentation);
  return { ok: true as const, ...presentation, transactionId: expense.id, category: expense.category, channel: expense.channel, definition: "Expenses are debit transactions (amount < 0), including transfers." };
}

async function showExpenseBySize(direction: "smallest" | "largest") {
  const title = direction === "smallest" ? "Smallest historical expense" : "Largest historical expense";
  try { return presentExpense(title, await expenseBySize(direction)); }
  catch (cause) { console.error(`Local DuckDB ${direction} expense query failed.`, cause); const detail = localSqlError(cause); presentDomError({ title: `${title} could not be calculated`, detail }); return error(`The private local SQL calculation could not be completed: ${detail}`); }
}

function dateRange(rows: { date: string }[]) {
  const first = rows[0];
  const last = rows.at(-1);
  return { from: first?.date || "", to: last?.date || "" };
}

async function showTransactionSearch(input: unknown = {}) {
  try {
    const transactions = await searchTransactions(searchFilters(input));
    if (!transactions.length) return error("No transactions matched those filters.");
    const expenses = transactions.filter((entry) => entry.amount < 0);
    const { from, to } = dateRange([...transactions].sort((a, b) => a.date.localeCompare(b.date)));
    const presentation: DomResult = { title: "Matching transactions", from, to, total: expenses.reduce((sum, entry) => sum + Math.abs(entry.amount), 0), transactionCount: transactions.length, breakdown: transactions.map((entry) => ({ label: `${entry.merchant} · ${entry.date}`, value: Math.abs(entry.amount) })), totalLabel: "Expense total in matches", breakdownLabel: "Most recent matches" };
    presentDomResult(presentation);
    return { ok: true as const, ...presentation, transactions, definition: "The rendered list is limited to the requested number of newest matching transactions." };
  } catch (cause) { console.error("Local DuckDB transaction search failed.", cause); const detail = localSqlError(cause); presentDomError({ title: "Transaction search could not be calculated", detail }); return error(`The private local SQL calculation could not be completed: ${detail}`); }
}

async function showSpendingByMonth(input: unknown = {}) {
  try {
    const rows = await spendingByMonth(asNumber(asRecord(input).months) ?? 6);
    if (!rows.length) return error("No expenses were found for that period.");
    const presentation: DomResult = { title: "Monthly spending", from: rows[0]?.month ?? "", to: rows.at(-1)?.month ?? "", total: rows.reduce((sum, row) => sum + row.amount, 0), transactionCount: rows.reduce((sum, row) => sum + row.transactionCount, 0), breakdown: rows.map((row) => ({ label: row.month.slice(0, 7), value: row.amount })), totalLabel: "Spending total", breakdownLabel: "Months" };
    presentDomResult(presentation);
    return { ok: true as const, ...presentation, months: rows };
  } catch (cause) { console.error("Local DuckDB monthly spending query failed.", cause); const detail = localSqlError(cause); presentDomError({ title: "Monthly spending could not be calculated", detail }); return error(`The private local SQL calculation could not be completed: ${detail}`); }
}

async function showRecentSpendingComparison() {
  try {
    const comparison = await compareRecentSpending();
    const presentation: DomResult = { title: "Recent spending comparison", from: comparison.from, to: comparison.to, total: comparison.currentTotal, transactionCount: comparison.currentTransactionCount, breakdown: [{ label: "Latest 30 days", value: comparison.currentTotal }, { label: "Previous 30 days", value: comparison.previousTotal }], totalLabel: "Latest 30-day spending", breakdownLabel: "Periods" };
    presentDomResult(presentation);
    return { ok: true as const, ...presentation, previousTotal: comparison.previousTotal, difference: comparison.difference, percentChange: comparison.percentChange, definition: "The two periods are 30 calendar days ending on the newest available transaction date; expenses are debit transactions." };
  } catch (cause) { console.error("Local DuckDB spending comparison failed.", cause); const detail = localSqlError(cause); presentDomError({ title: "Recent spending comparison could not be calculated", detail }); return error(`The private local SQL calculation could not be completed: ${detail}`); }
}

async function showRecurringExpenses() {
  try {
    const rows = await recurringExpenses();
    if (!rows.length) return error("No recurring expenses were found.");
    const presentation: DomResult = { title: "Recurring expenses", from: rows.map((row) => row.firstDate).sort()[0] ?? "", to: rows.map((row) => row.lastDate).sort().at(-1) ?? "", total: rows.reduce((sum, row) => sum + row.amount, 0), transactionCount: rows.reduce((sum, row) => sum + row.transactionCount, 0), breakdown: rows.map((row) => ({ label: row.merchant, value: row.amount })), totalLabel: "Historical recurring spending", breakdownLabel: "Merchants" };
    presentDomResult(presentation);
    return { ok: true as const, ...presentation, recurringMerchants: rows, definition: "A recurring expense is a debit transaction explicitly marked is_recurring in the local ledger; no future date is inferred." };
  } catch (cause) { console.error("Local DuckDB recurring expense query failed.", cause); const detail = localSqlError(cause); presentDomError({ title: "Recurring expenses could not be calculated", detail }); return error(`The private local SQL calculation could not be completed: ${detail}`); }
}

async function showMerchantExpenses(input: unknown = {}) {
  try {
    const filtersInput = merchantFilters(input);
    const rows = await merchantExpenses(filtersInput);
    if (!rows.length) return error("No merchant expenses matched those filters.");
    const presentation: DomResult = { title: filtersInput.merchant_contains ? "Merchant spending match" : "Top merchants by spending", from: rows.map((row) => row.firstDate).sort()[0] ?? "", to: rows.map((row) => row.lastDate).sort().at(-1) ?? "", total: rows.reduce((sum, row) => sum + row.amount, 0), transactionCount: rows.reduce((sum, row) => sum + row.transactionCount, 0), breakdown: rows.map((row) => ({ label: row.merchant, value: row.amount })), totalLabel: "Spending across listed merchants", breakdownLabel: "Merchants" };
    presentDomResult(presentation);
    return { ok: true as const, ...presentation, merchants: rows };
  } catch (cause) { console.error("Local DuckDB merchant summary failed.", cause); const detail = localSqlError(cause); presentDomError({ title: "Merchant spending could not be calculated", detail }); return error(`The private local SQL calculation could not be completed: ${detail}`); }
}

async function showUnusualExpenses(input: unknown = {}) {
  try {
    const expenses = await unusualExpenses({ limit: asNumber(asRecord(input).limit) ?? 10 });
    if (!expenses.length) return error("No statistically unusual expenses were found.");
    const { from, to } = dateRange([...expenses].sort((a, b) => a.date.localeCompare(b.date)));
    const presentation: DomResult = { title: "Unusual expenses", from, to, total: expenses.reduce((sum, expense) => sum + expense.amount, 0), transactionCount: expenses.length, breakdown: expenses.map((expense) => ({ label: expense.merchant, value: expense.amount })), totalLabel: "Flagged spending", breakdownLabel: "Transactions" };
    presentDomResult(presentation);
    return { ok: true as const, ...presentation, expenses, definition: "An unusual expense is a debit at least two population standard deviations above the historical debit average. This is a statistical flag, not fraud determination." };
  } catch (cause) { console.error("Local DuckDB unusual expense query failed.", cause); const detail = localSqlError(cause); presentDomError({ title: "Unusual expenses could not be calculated", detail }); return error(`The private local SQL calculation could not be completed: ${detail}`); }
}

function showAccountBalance(input: unknown = {}) {
  const accountId = asString(asRecord(input).account_id);
  const accounts = state.accounts.filter((account) => !accountId || account.id === accountId);
  if (!accounts.length) return error("The requested account was not found.");
  const latestDate = state.transactions.reduce((latest, entry) => entry.date > latest ? entry.date : latest, "");
  if (!latestDate) return error("Account data is not ready.");
  const presentation: DomResult = { title: "Current account balance", from: latestDate, to: latestDate, total: accounts.reduce((sum, account) => sum + account.balance, 0), transactionCount: accounts.length, breakdown: accounts.map((account) => ({ label: account.alias, value: account.balance })), totalLabel: accounts.length === 1 ? "Current balance" : "Combined balance", breakdownLabel: "Accounts" };
  presentDomResult(presentation);
  return { ok: true as const, ...presentation, accounts: accounts.map(({ id, alias, balance, currency }) => ({ id, name: alias, balance, currency })), definition: "Balances are the current local account balances, not a balance reconstructed from transactions." };
}

function logOperation(type: string, detail: string) { mutate((s) => s.appliedOps.unshift({ id: `op-${crypto.randomUUID().slice(0, 7)}`, type, detail, applied_at: new Date().toISOString() })); }

function writeTools(): WebMCPTool[] { return [
  { name: "make_transfer", title: "Make a transfer", description: "Transfers USD from Privta checking to a saved contact. This changes fictional funds; ChatGPT Desktop must obtain user approval before this tool executes.", annotations: { readOnlyHint: false, destructiveHint: true }, inputSchema: schema({ contact_id: { type: "string", enum: state.contacts.map((contact) => contact.id) }, amount: { type: "number", minimum: 0.01 }, memo: { type: "string" } }, ["contact_id", "amount", "memo"]), execute: async (input) => {
    const { contact_id: contactId, amount, memo } = asRecord(input);
    const contact = state.contacts.find((item) => item.id === contactId); const account = state.accounts.find((item) => item.id === "checking");
    if (!contact || !account) return error("Contact or USD checking account was not found.");
    if (typeof amount !== "number" || account.balance < amount) return error("Insufficient USD balance.");
    const addedTransaction = { id: `tx-${crypto.randomUUID()}`, account_id: "checking", date: new Date().toISOString().slice(0, 10), amount: -amount, currency: "USD" as const, merchant: contact.name, category: "Transfers", channel: "Bank transfer", installments: 0, is_recurring: false };
    mutate((s) => {
      const checking = s.accounts.find((item) => item.id === "checking");
      if (checking) checking.balance -= amount;
      s.transactions.unshift(addedTransaction);
    });
    try { await appendTransaction(addedTransaction); } catch (cause) { console.error("Local DuckDB transfer insert failed.", cause); }
    logOperation("Transfer", `${formatUSD(amount)} to ${contact.name} · ${String(memo ?? "")}`); return { ok: true, message: "Transfer completed in Privta." };
  } },
  { name: "pay_service", title: "Pay a service", description: "Pays a pending USD service bill from Privta checking. ChatGPT Desktop must obtain user approval before this tool executes.", annotations: { readOnlyHint: false, destructiveHint: true }, inputSchema: schema({ service_id: { type: "string" }, amount: { type: "number", minimum: 0.01 } }, ["service_id"]), execute: (input) => {
    const { service_id: serviceId, amount } = asRecord(input);
    const service = state.services.find((item) => item.id === serviceId); const account = state.accounts.find((item) => item.id === "checking"); const total = asNumber(amount) || service?.amount;
    if (!service || service.status !== "pending" || total == null) return error("This service cannot be paid."); if (!account || account.balance < total) return error("Insufficient USD balance.");
    mutate((s) => {
      const checking = s.accounts.find((item) => item.id === "checking");
      const bill = s.services.find((item) => item.id === serviceId);
      if (checking) checking.balance -= total;
      if (bill) bill.status = "paid";
    }); logOperation("Service payment", `${service.name} · ${formatUSD(total)}`); return { ok: true, message: "Service payment completed in Privta." };
  } },
  { name: "dispute_charge", title: "Dispute a charge", description: "Starts a dispute for a transaction. ChatGPT Desktop must obtain user approval before this tool executes.", annotations: { readOnlyHint: false, destructiveHint: true }, inputSchema: schema({ transaction_id: { type: "string" }, reason: { type: "string" }, details: { type: "string" } }, ["transaction_id", "reason"]), execute: (input) => { const { transaction_id: transactionId, reason, details = "" } = asRecord(input); const row = transaction(transactionId); if (!row) return error("Transaction was not found."); logOperation("Charge disputed", `${row.merchant} · ${formatUSD(Math.abs(row.amount))} · ${String(reason ?? "")}`); return { ok: true, message: "Dispute started.", details }; } },
  { name: "create_budget_rule", title: "Create budget rule", description: "Creates a monthly USD budget alert. ChatGPT Desktop must obtain user approval before this tool executes.", annotations: { readOnlyHint: false, destructiveHint: true }, inputSchema: schema({ category: { type: "string" }, monthly_limit: { type: "number", minimum: 0.01 }, action: { type: "string", enum: ["notify"] } }, ["category", "monthly_limit", "action"]), execute: (input) => { const { category, monthly_limit: monthlyLimit, action } = asRecord(input); logOperation("Budget rule", `${String(category ?? "")}: ${formatUSD(asNumber(monthlyLimit) ?? 0)} / month · ${String(action ?? "")}`); return { ok: true, message: "Budget rule created." }; } },
]; }

function readTools(): WebMCPTool[] { return [
  { name: "describe_data", title: "Describe data", description: "Confirms that Privta is ready to run private financial SQL summaries in the browser. It does not return account or transaction data.", annotations: { readOnlyHint: true }, inputSchema: schema(), execute: () => ({ ready: state.ready, presentations: ["financial_summary"] }) },
  { name: "show_latest_expense", title: "Show latest expense", description: "Runs a local DuckDB SQL query for the latest expense, renders it in the Privta document, and returns the transaction summary.", annotations: { readOnlyHint: true }, inputSchema: schema(), execute: showLatestExpense },
  { name: "show_smallest_expense", title: "Show smallest expense", description: "Runs fixed local SQL for the historical debit with the smallest absolute amount. Expenses are debits, including transfers; it renders and returns the result.", annotations: { readOnlyHint: true }, inputSchema: schema(), execute: () => showExpenseBySize("smallest") },
  { name: "show_largest_expense", title: "Show largest expense", description: "Runs fixed local SQL for the historical debit with the largest absolute amount. Expenses are debits, including transfers; it renders and returns the result.", annotations: { readOnlyHint: true }, inputSchema: schema(), execute: () => showExpenseBySize("largest") },
  { name: "search_transactions", title: "Search transactions", description: "Runs fixed local SQL to find the newest matching transactions by date, category, merchant text, or absolute amount. It returns at most 50 rows and renders the matching summary.", annotations: { readOnlyHint: true }, inputSchema: schema({ from: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" }, to: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" }, categories: { type: "array", items: { type: "string" } }, merchant_contains: { type: "string", maxLength: 120 }, min_amount: { type: "number", minimum: 0 }, max_amount: { type: "number", minimum: 0 }, limit: { type: "integer", minimum: 1, maximum: 50 } }), execute: showTransactionSearch },
  { name: "show_spending_by_month", title: "Show monthly spending", description: "Runs fixed local SQL to group debit spending by month, ending on the newest available transaction date.", annotations: { readOnlyHint: true }, inputSchema: schema({ months: { type: "integer", enum: [3, 6, 12, 18], description: "Number of latest calendar months to include." } }), execute: showSpendingByMonth },
  { name: "compare_recent_spending", title: "Compare recent spending", description: "Runs fixed local SQL to compare debit spending in the latest available 30 days with the preceding 30 days.", annotations: { readOnlyHint: true }, inputSchema: schema(), execute: showRecentSpendingComparison },
  { name: "show_category_breakdown", title: "Show category breakdown", description: "Runs the fixed local spending summary grouped by category. Expenses are debit transactions, including transfers.", annotations: { readOnlyHint: true }, inputSchema: schema({ title: { type: "string", maxLength: 120 }, period: { type: "string", enum: ["last_7_days", "last_30_days", "all_available"] }, from: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" }, to: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" }, recurring_only: { type: "boolean" } }), execute: (input = {}) => showFinancialSummary({ ...asRecord(input), title: asString(asRecord(input).title) || "Spending by category", metric: "spending" }) },
  { name: "show_recurring_transactions", title: "Show recurring transactions", description: "Runs fixed local SQL to group recurring debit transactions by merchant. It reports observed history and does not infer a future payment date.", annotations: { readOnlyHint: true }, inputSchema: schema(), execute: showRecurringExpenses },
  { name: "show_merchant_summary", title: "Show merchant summary", description: "Runs fixed local SQL to group debit spending by merchant, optionally filtering merchant text or a date range.", annotations: { readOnlyHint: true }, inputSchema: schema({ from: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" }, to: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" }, merchant_contains: { type: "string", maxLength: 120 }, limit: { type: "integer", minimum: 1, maximum: 25 } }), execute: showMerchantExpenses },
  { name: "show_account_balance", title: "Show account balance", description: "Returns the current local balance for one or all Privta accounts and renders it in the document. It does not reconstruct a historical balance from transactions.", annotations: { readOnlyHint: true }, inputSchema: schema({ account_id: { type: "string", enum: state.accounts.map((account) => account.id) } }), execute: showAccountBalance },
  { name: "show_unusual_expenses", title: "Show unusual expenses", description: "Runs fixed local SQL to flag debit transactions at least two population standard deviations above the historical debit average. This is not a fraud decision.", annotations: { readOnlyHint: true }, inputSchema: schema({ limit: { type: "integer", minimum: 1, maximum: 25 } }), execute: showUnusualExpenses },
  { name: "show_transaction_by_recency", title: "Show transaction by recency", description: "Runs fixed local SQL for an ordinal transaction such as the tenth most recent transaction, renders it in the Privta document, and returns the transaction summary.", annotations: { readOnlyHint: true }, inputSchema: schema({ position: { type: "integer", minimum: 1, maximum: 100, description: "The requested 1-based position among all transactions, ordered newest first." } }, ["position"]), execute: showTransactionByRecency },
  { name: "show_financial_summary", title: "Show financial summary", description: "Runs a local DuckDB SQL summary for spending, income, or cash flow, renders the result in the Privta document, and returns the summary. Use last_7_days for last week and last_30_days for last month.", annotations: { readOnlyHint: true }, inputSchema: schema({ title: { type: "string", maxLength: 120, description: "Optional concise user-facing title." }, metric: { type: "string", enum: ["spending", "income", "net_cash_flow"] }, period: { type: "string", enum: ["last_7_days", "last_30_days", "all_available"], description: "Use last_7_days for last week and last_30_days for last month." }, from: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Optional inclusive date in YYYY-MM-DD." }, to: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Optional inclusive date in YYYY-MM-DD." }, categories: { type: "array", items: { type: "string" } }, merchant_contains: { type: "string" }, recurring_only: { type: "boolean" } }, ["metric"]), execute: showFinancialSummary },
]; }

export async function refreshTools() {
  const context = getModelContext(); if (!context) return;
  for (const controller of controllers.values()) controller.abort(); controllers.clear();
  const tools = [...readTools(), ...writeTools()];
  await Promise.all(tools.map(async (tool) => { const controller = new AbortController(); controllers.set(tool.name, controller); await context.registerTool(tool, { signal: controller.signal }); }));
}
