import { initStore, state } from "./store.js";
import { installWebMCP } from "./webmcp.js";
import { refreshTools } from "./tools.js";

const currency = (amount: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
const date = (value: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`));
const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const escape = (value: unknown) => String(value).replace(/[&<>\"]/g, (character) => entities[character] ?? character);

function renderAccounts() {
  const target = document.querySelector("#account-summary");
  if (!target) return;
  target.innerHTML = state.accounts.map((account) => `<article class="summary-card"><p>${escape(account.type)}</p><strong>${currency(account.balance)}</strong><span>${escape(account.alias)} · ${escape(account.masked_number)}</span></article>`).join("");
}

function renderTransactions() {
  const rows = [...state.transactions].sort((left, right) => `${right.date}${right.id}`.localeCompare(`${left.date}${left.id}`));
  const visibleRows = rows.slice(0, 15);
  const count = document.querySelector("#transaction-count");
  const table = document.querySelector("#transaction-table");
  if (count) {
    count.textContent = visibleRows.length === rows.length
      ? `${rows.length.toLocaleString("en-US")} transactions`
      : `Showing ${visibleRows.length} of ${rows.length.toLocaleString("en-US")} transactions`;
  }
  if (table) {
    table.innerHTML = visibleRows.map((row) => `<tr><td>${date(row.date)}</td><td><strong>${escape(row.merchant)}</strong></td><td><span class="category-pill">${escape(row.category)}</span></td><td>${escape(row.channel)}</td><td class="amount ${row.amount < 0 ? "expense" : "income"}">${row.amount < 0 ? "−" : "+"}${currency(Math.abs(row.amount))}</td></tr>`).join("");
  }
}

installWebMCP();
await refreshTools();
await initStore();
renderAccounts();
renderTransactions();
await refreshTools();
