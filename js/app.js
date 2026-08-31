import { initStore, state } from "./store.js";
import { installWebMCP } from "./webmcp.js";
import { refreshTools } from "./tools.js";

const currency = (amount) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
const date = (value) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`));
const escape = (value) => String(value).replace(/[&<>\"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]);

function renderAccounts() {
  document.querySelector("#account-list").innerHTML = state.accounts.map((account) => `<button class="active"><strong>${escape(account.alias)}</strong><span>${escape(account.type)} · ${currency(account.balance)}</span></button>`).join("");
  document.querySelector("#account-summary").innerHTML = state.accounts.map((account) => `<article class="summary-card"><p>${escape(account.type)}</p><strong>${currency(account.balance)}</strong><span>${escape(account.alias)} · ${escape(account.masked_number)}</span></article>`).join("");
}

function renderTransactions() {
  const rows = [...state.transactions].sort((left, right) => `${right.date}${right.id}`.localeCompare(`${left.date}${left.id}`));
  const visibleRows = rows.slice(0, 15);
  document.querySelector("#transaction-count").textContent = visibleRows.length === rows.length
    ? `${rows.length.toLocaleString("en-US")} transactions`
    : `Showing ${visibleRows.length} of ${rows.length.toLocaleString("en-US")} transactions`;
  document.querySelector("#transaction-table").innerHTML = visibleRows.map((row) => `<tr><td>${date(row.date)}</td><td><strong>${escape(row.merchant)}</strong></td><td><span class="category-pill">${escape(row.category)}</span></td><td>${escape(row.channel)}</td><td class="amount ${row.amount < 0 ? "expense" : "income"}">${row.amount < 0 ? "−" : "+"}${currency(Math.abs(row.amount))}</td></tr>`).join("");
}

installWebMCP();
await refreshTools();
await initStore();
renderAccounts();
renderTransactions();
await refreshTools();
