export type Currency = "USD";

export interface Transaction {
  id: string;
  account_id: string;
  date: string;
  amount: number;
  currency: Currency;
  merchant: string;
  category: string;
  channel: string;
  installments: number;
  is_recurring: boolean;
}

export interface Account {
  id: string;
  type: string;
  currency: Currency;
  alias: string;
  balance: number;
  masked_number: string;
}

export interface Contact {
  id: string;
  name: string;
  bank_alias: string;
  bank: string;
  last_transfer: string;
}

export interface Service {
  id: string;
  name: string;
  type: string;
  amount: number;
  due_date: string;
  status: string;
}

export interface AppliedOp {
  id: string;
  type: string;
  detail: string;
  applied_at: string;
}

export interface TransactionFilters {
  from: string;
  to: string;
  category: string;
  search: string;
  minAmount: string;
}

export interface AppState {
  ready: boolean;
  activeView: string;
  selectedAccount: string;
  selectedTransactionId: string | null;
  filters: TransactionFilters;
  activeRange: string;
  accounts: Account[];
  contacts: Contact[];
  services: Service[];
  transactions: Transaction[];
  insights: unknown[];
  highlights: unknown[];
  appliedOps: AppliedOp[];
}

export type SummaryMetric = "spending" | "income" | "net_cash_flow";

export interface BreakdownItem {
  label: string;
  value: number;
}

export interface DomResult {
  title: string;
  from: string;
  to: string;
  total: number;
  transactionCount: number;
  breakdown: BreakdownItem[];
  totalLabel: string;
  breakdownLabel?: string;
}

export interface LedgerSummary {
  total: number;
  transactionCount: number;
  coveredFrom: string;
  coveredTo: string;
  breakdown: BreakdownItem[];
  totalLabel: string;
  breakdownLabel: string;
}

export interface LedgerTransaction {
  id: string;
  date: string;
  amount: number;
  merchant: string;
  category: string;
  channel: string;
}

export interface MonthlySpending {
  month: string;
  amount: number;
  transactionCount: number;
}

export interface SpendingComparison {
  currentTotal: number;
  previousTotal: number;
  currentTransactionCount: number;
  previousTransactionCount: number;
  difference: number;
  percentChange: number | null;
  from: string;
  to: string;
}

export interface RecurringExpense {
  merchant: string;
  category: string;
  amount: number;
  transactionCount: number;
  firstDate: string;
  lastDate: string;
}

export interface MerchantExpense {
  merchant: string;
  amount: number;
  transactionCount: number;
  firstDate: string;
  lastDate: string;
}

export interface UnusualExpense extends LedgerTransaction {
  amountAboveAverage: number;
}

export interface SummaryFilters {
  metric?: SummaryMetric;
  from?: string;
  to?: string;
  period?: string;
  categories?: string[];
  merchant_contains?: string;
  recurring_only?: boolean;
}

export interface SearchFilters {
  from?: string;
  to?: string;
  categories?: string[];
  merchant_contains?: string;
  min_amount?: number;
  max_amount?: number;
  limit?: number;
}

export interface MerchantFilters {
  from?: string;
  to?: string;
  merchant_contains?: string;
  limit?: number;
}
