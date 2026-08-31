import { accounts, cards, contacts, services, createTransactions } from "./data.js";

const STORAGE_KEY = "privta-demo-state-v1";
const listeners = new Set();
const baseState = {
  ready: false,
  activeView: "transactions",
  selectedAccount: "checking",
  selectedTransactionId: null,
  filters: { from: "", to: "", category: "", search: "", minAmount: "" }, activeRange: "",
  accounts: structuredClone(accounts), cards: structuredClone(cards), contacts, services: structuredClone(services),
  transactions: [], insights: [], highlights: [], chart: null, appliedOps: [],
};
const restored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
export const state = { ...baseState, ...(restored || {}) };

export function initStore() {
  if (!state.transactions.length) state.transactions = createTransactions();
  state.ready = true;
  persist(); emit();
}
export function update(patch) { Object.assign(state, patch); persist(); emit(); }
export function mutate(fn) { fn(state); persist(); emit(); }
export function subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
function emit() { listeners.forEach((listener) => listener(state)); }
function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    accounts: state.accounts, cards: state.cards, services: state.services, transactions: state.transactions,
    insights: state.insights, highlights: state.highlights, chart: state.chart, appliedOps: state.appliedOps,
    activeRange: state.activeRange,
  }));
}
export function filteredTransactions() {
  const f = state.filters;
  return state.transactions.filter((t) =>
    (!state.selectedAccount || t.account_id === state.selectedAccount) &&
    (!f.from || t.date >= f.from) && (!f.to || t.date <= f.to) &&
    (!f.category || t.category === f.category) &&
    (!f.search || `${t.merchant} ${t.category}`.toLowerCase().includes(f.search.toLowerCase())) &&
    (!f.minAmount || Math.abs(t.amount) >= Number(f.minAmount))
  );
}
