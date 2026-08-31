import { initStore, state, subscribe, update, mutate, filteredTransactions } from "./store.js";
import { installWebMCP } from "./webmcp.js";
import { refreshTools } from "./tools.js";

const $ = (selector) => document.querySelector(selector);
const currency = (amount) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
const date = (value) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`));
const escape = (value) => String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);
let toastTimer;

function toast(message) { const target = $("#toast"); target.textContent = message; target.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => target.classList.remove("show"), 2600); }
function renderAccounts() {
  $("#account-list").innerHTML = state.accounts.map((account) => `<button class="${account.id === state.selectedAccount ? "active" : ""}" data-account="${account.id}"><strong>${escape(account.alias)}</strong><span>${escape(account.type)} · ${currency(account.balance)}</span></button>`).join("");
  $("#account-summary").innerHTML = state.accounts.map((account) => {
    const card = state.cards.find((item) => item.account_id === account.id);
    const isCard = Boolean(card);
    const cardInfo = isCard ? `<div class="card-payment"><span>Payment due Sep 5</span><strong>${currency(Math.max(card.used * .1, 25))} minimum</strong></div>` : "";
    return `<article class="summary-card ${isCard ? "credit-card" : ""}"><p>${isCard ? "Credit card balance" : escape(account.type)}</p><strong>${currency(account.balance)}</strong><span>${escape(account.alias)} · ${account.masked_number}</span>${cardInfo}</article>`;
  }).join("");
}
function renderTable() {
  const rows = filteredTransactions();
  $("#transaction-count").textContent = `${rows.length.toLocaleString("en-US")} transactions found`;
  $("#transaction-table").innerHTML = rows.slice(0, 100).map((row) => `<tr data-transaction="${row.id}" class="${state.highlights.includes(row.id) ? "highlighted" : ""} ${state.selectedTransactionId === row.id ? "selected" : ""}" aria-selected="${state.selectedTransactionId === row.id}"><td>${date(row.date)}</td><td><strong>${escape(row.merchant)}</strong></td><td><span class="category-pill">${escape(row.category)}</span></td><td>${escape(row.channel)}</td><td class="amount ${row.amount < 0 ? "expense" : "income"}">${row.amount < 0 ? "−" : "+"}${currency(Math.abs(row.amount))}</td></tr>`).join("") || `<tr><td colspan="5">No transactions match these filters.</td></tr>`;
  renderTransactionDetail();
}
function renderTransactionDetail() {
  const row = state.transactions.find((item) => item.id === state.selectedTransactionId);
  const target = $("#transaction-detail");
  if (!row) { target.innerHTML = ""; return; }
  const account = state.accounts.find((item) => item.id === row.account_id);
  target.innerHTML = `<div><p class="eyebrow">Selected transaction</p><h2>${escape(row.merchant)}</h2><p>${date(row.date)} · ${escape(account?.type || "Account")} · ${escape(row.channel)}</p></div><div class="transaction-detail-amount"><strong class="${row.amount < 0 ? "expense" : "income"}">${row.amount < 0 ? "−" : "+"}${currency(Math.abs(row.amount))}</strong><button class="text-button" data-action="transaction-detail">View full details</button></div>`;
}
function renderFilterStatus() {
  const labels = { from: "start date", to: "end date", category: "category", search: "search", minAmount: "minimum amount" };
  const active = Object.entries(state.filters).filter(([, value]) => value).map(([key]) => labels[key]);
  $("#filter-status").textContent = active.length ? `${active.length} active filter${active.length === 1 ? "" : "s"}: ${active.join(", ")}` : "Showing all activity for the selected account";
  document.querySelectorAll("[data-range]").forEach((button) => button.classList.toggle("active", button.dataset.range === state.activeRange));
  const fields = { from: "filter-from", to: "filter-to", category: "filter-category", search: "filter-search", minAmount: "filter-min" };
  Object.entries(fields).forEach(([key, id]) => { if (document.activeElement?.id !== id) $(`#${id}`).value = state.filters[key]; });
}
function renderInsights() {
  const planted = [{ id: "duplicate", title: "Possible duplicate subscription", body: "Spotify and Spotify Premium are both charged every month ($18.30 total).", severity: "medium" }, { id: "water", title: "Water bill increased 339%", body: "Clearwater Utility increased from $3.10 to $13.60 over the covered period.", severity: "high" }];
  const insights = [...state.insights, ...planted];
  $("#insights").innerHTML = insights.map((item) => `<article class="insight severity-${item.severity}" data-insight="${item.id}"><h3>${escape(item.title)}</h3><p>${escape(item.body)}</p></article>`).join("");
}
function renderChart() {
  const totals = state.transactions.filter((row) => row.amount < 0 && row.date >= "2026-08-01").reduce((all, row) => ((all[row.category] = (all[row.category] || 0) + Math.abs(row.amount)), all), {});
  const data = state.chart?.data?.map((item) => ({ label: item.label || item.category || item.name, value: Number(item.value ?? item.total ?? item.amount ?? 0) })) || Object.entries(totals).map(([label, value]) => ({ label, value }));
  const max = Math.max(...data.map((item) => item.value), 1);
  $("#chart").innerHTML = data.slice(0, 9).map((item) => `<div class="bar" style="height:${Math.max(8, item.value / max * 100)}%"><i>${currency(item.value)}</i><span>${escape(item.label)}</span></div>`).join("");
  if (state.chart?.title) $(".chart-panel h2").textContent = state.chart.title;
}
function renderActivity() {
  const target = $("#pending-ops"); const count = state.appliedOps.length;
  $("#pending-badge").textContent = count; $("#pending-tab-count").textContent = count ? ` ${count}` : "";
  if (!count) { target.innerHTML = `<section class="empty-state"><h2>No agent activity yet</h2><p>Actions approved in ChatGPT Desktop will be recorded here.</p></section>`; return; }
  target.innerHTML = state.appliedOps.map((op) => `<article class="pending-card"><div><h2>${escape(op.type)}</h2><p>${escape(op.detail)}</p><p>${new Date(op.applied_at).toLocaleString("en-US")} · approved in ChatGPT Desktop</p></div><strong class="op-amount">Completed</strong></article>`).join("");
}
function render() { renderAccounts(); renderTable(); renderFilterStatus(); renderInsights(); renderChart(); renderActivity(); document.querySelectorAll(".tabs button, .quick-nav button").forEach((button) => button.classList.toggle("active", button.dataset.view === state.activeView)); $("#view-title").textContent = ({ transactions: "Transactions", analysis: "Analysis", activity: "Activity" })[state.activeView]; document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === `view-${state.activeView}`)); }

function bindEvents() {
  document.addEventListener("click", async (event) => {
    const view = event.target.closest("[data-view]"); if (view) { update({ activeView: view.dataset.view }); await refreshTools(); return; }
    const account = event.target.closest("[data-account]"); if (account) { update({ selectedAccount: account.dataset.account }); return; }
    const range = event.target.closest("[data-range]"); if (range) { applyQuickRange(range.dataset.range); return; }
    const action = event.target.closest("[data-action]"); if (action) { const messages = { transfer: "Transfer flow is ready for your agent.", statement: "Your latest statement is ready to review.", "transaction-detail": "Full transaction context is available to your agent." }; toast(messages[action.dataset.action]); return; }
    const row = event.target.closest("[data-transaction]"); if (row) { update({ selectedTransactionId: row.dataset.transaction }); toast("Transaction selected — your agent can now see its context."); await refreshTools(); }
  });
  $("#filters").addEventListener("input", (event) => {
    const map = { "filter-from": "from", "filter-to": "to", "filter-category": "category", "filter-search": "search", "filter-min": "minAmount" };
    mutate((current) => { current.filters[map[event.target.id]] = event.target.value; current.activeRange = ""; });
  });
  $("#reset-filters").addEventListener("click", () => { update({ filters: { from: "", to: "", category: "", search: "", minAmount: "" }, activeRange: "" }); $("#filters").reset(); });
  document.querySelectorAll("[data-prompt]").forEach((button) => button.addEventListener("click", () => toast(`Ask ChatGPT: “${button.dataset.prompt}”`)));
}

function applyQuickRange(range) {
  const latest = state.transactions.reduce((value, row) => row.date > value ? row.date : value, "");
  const end = new Date(`${latest}T12:00:00`);
  const start = new Date(end);
  if (range === "month") start.setDate(1); else start.setDate(end.getDate() - Number(range) + 1);
  const iso = (value) => value.toISOString().slice(0, 10);
  const from = iso(start); const to = iso(end);
  update({ filters: { ...state.filters, from, to }, activeRange: range });
  $("#filter-from").value = from; $("#filter-to").value = to;
}

function populateCategories() { const select = $("#filter-category"); [...new Set(state.transactions.map((row) => row.category))].sort().forEach((category) => select.insertAdjacentHTML("beforeend", `<option value="${escape(category)}">${escape(category)}</option>`)); }

initStore();
installWebMCP();
populateCategories();
bindEvents();
subscribe(render);
await refreshTools();
render();
