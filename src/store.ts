import { accounts, contacts, services, createTransactions } from "./data.js";
import type { AppState, Transaction } from "./types.js";

const STORAGE_KEY = "privta-demo-state-v8";
const listeners = new Set<(next: AppState) => void>();
const baseState: AppState = {
  ready: false,
  activeView: "transactions",
  selectedAccount: "checking",
  selectedTransactionId: null,
  filters: { from: "", to: "", category: "", search: "", minAmount: "" }, activeRange: "",
  accounts: structuredClone(accounts), contacts, services: structuredClone(services),
  transactions: [], insights: [], highlights: [], appliedOps: [],
};
const restored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") as Partial<AppState> | null;
export const state: AppState = { ...baseState, ...(restored || {}) };

async function fixedSeed(): Promise<Transaction[]> {
  try {
    const response = await fetch(new URL("../data/seed.json", import.meta.url));
    if (!response.ok) throw new Error("The local transaction seed could not be loaded.");
    return response.json() as Promise<Transaction[]>;
  } catch (cause) {
    console.error("Fixed transaction seed failed to load; using the built-in fallback.", cause);
    return createTransactions();
  }
}

export async function initStore() {
  if (!state.transactions.length) state.transactions = await fixedSeed();
  if (!["transactions", "activity"].includes(state.activeView)) state.activeView = "transactions";
  state.ready = true;
  persist(); emit();
}
export function update(patch: Partial<AppState>) { Object.assign(state, patch); persist(); emit(); }
export function mutate(fn: (next: AppState) => void) { fn(state); persist(); emit(); }
export function subscribe(listener: (next: AppState) => void) { listeners.add(listener); return () => listeners.delete(listener); }
function emit() { listeners.forEach((listener) => listener(state)); }
function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    accounts: state.accounts, services: state.services, transactions: state.transactions,
    insights: state.insights, highlights: state.highlights, appliedOps: state.appliedOps,
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
