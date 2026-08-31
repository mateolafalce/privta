const SEED_FILE = "privta-seed.json";
let databasePromise;
let duckDBLibraryPromise;
let seededDatabasePromise;

const sqlString = (value) => `'${String(value).replaceAll("'", "''")}'`;
const asNumber = (value) => Number(value ?? 0);
const asText = (value) => value == null ? "" : String(value);

function duckDBLibrary() {
  if (!duckDBLibraryPromise) duckDBLibraryPromise = import("https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.32.0/+esm");
  return duckDBLibraryPromise;
}

async function database() {
  if (!databasePromise) {
    databasePromise = (async () => {
      const duckdb = await duckDBLibrary();
      const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
      const workerURL = URL.createObjectURL(new Blob([`importScripts("${bundle.mainWorker}");`], { type: "text/javascript" }));
      const worker = new Worker(workerURL);
      const instance = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
      await instance.instantiate(bundle.mainModule, bundle.pthreadWorker);
      URL.revokeObjectURL(workerURL);
      return instance;
    })();
  }
  return databasePromise;
}

async function seededDatabase() {
  if (!seededDatabasePromise) {
    seededDatabasePromise = (async () => {
      const instance = await database();
      const response = await fetch(new URL("../data/seed.json", import.meta.url));
      if (!response.ok) throw new Error("The local transaction seed could not be loaded.");
      await instance.registerFileText(SEED_FILE, await response.text());
      const connection = await instance.connect();
      try {
        await connection.query(`CREATE TABLE transactions AS SELECT * FROM read_json_auto('${SEED_FILE}')`);
      } finally {
        await connection.close();
      }
      return instance;
    })();
  }
  return seededDatabasePromise;
}

function queryDefinition(metric) {
  const definitions = {
    spending: { condition: "amount < 0", aggregate: "SUM(ABS(amount))", key: "category", totalLabel: "Spending total", breakdownLabel: "Largest categories" },
    income: { condition: "amount > 0", aggregate: "SUM(amount)", key: "merchant", totalLabel: "Income total", breakdownLabel: "Income sources" },
    net_cash_flow: { condition: "TRUE", aggregate: "SUM(amount)", key: "category", totalLabel: "Net cash flow", breakdownLabel: "Cash flow by category" },
  };
  return definitions[metric] || null;
}

function filters({ from, to, period, categories, merchant_contains: merchantContains, recurring_only: recurringOnly }, definition) {
  const conditions = [definition.condition];
  if (from) conditions.push(`date >= ${sqlString(from)}`);
  if (to) conditions.push(`date <= ${sqlString(to)}`);
  if (!from && !to && period === "last_7_days") conditions.push("date >= (SELECT MAX(date) - INTERVAL 6 DAY FROM transactions)");
  if (!from && !to && period === "last_30_days") conditions.push("date >= (SELECT MAX(date) - INTERVAL 29 DAY FROM transactions)");
  if (categories?.length) conditions.push(`category IN (${categories.map(sqlString).join(", ")})`);
  if (merchantContains) conditions.push(`LOWER(merchant) LIKE '%' || LOWER(${sqlString(merchantContains)}) || '%'`);
  if (recurringOnly) conditions.push("is_recurring = TRUE");
  return conditions.join(" AND ");
}

/** Runs a fixed, local SQL template. User-provided values are only SQL literals. */
export async function summarizeTransactions(filtersInput) {
  const definition = queryDefinition(filtersInput.metric);
  if (!definition) throw new Error("Choose spending, income, or net_cash_flow.");

  const instance = await seededDatabase();
  const where = filters(filtersInput, definition);
  const connection = await instance.connect();
  try {
    const summary = await connection.query(`
      SELECT
        ROUND(COALESCE(${definition.aggregate}, 0), 2) AS total,
        CAST(COUNT(*) AS DOUBLE) AS transaction_count,
        COALESCE(CAST(MIN(date) AS VARCHAR), '') AS covered_from,
        COALESCE(CAST(MAX(date) AS VARCHAR), '') AS covered_to
      FROM transactions
      WHERE ${where}
    `);
    const breakdown = await connection.query(`
      SELECT ${definition.key} AS label, ROUND(${definition.aggregate}, 2) AS value
      FROM transactions
      WHERE ${where}
      GROUP BY ${definition.key}
      ORDER BY ABS(value) DESC, label ASC
    `);
    const totals = summary.toArray()[0].toJSON();
    return {
      total: asNumber(totals.total),
      transactionCount: asNumber(totals.transaction_count),
      coveredFrom: asText(totals.covered_from),
      coveredTo: asText(totals.covered_to),
      breakdown: breakdown.toArray().map((row) => {
        const value = row.toJSON();
        return { label: asText(value.label), value: asNumber(value.value) };
      }),
      totalLabel: definition.totalLabel,
      breakdownLabel: definition.breakdownLabel,
    };
  } finally {
    await connection.close();
  }
}

export async function appendTransaction(row) {
  const instance = await seededDatabase();
  const connection = await instance.connect();
  try {
    await connection.query(`
      INSERT INTO transactions (id, account_id, date, amount, currency, merchant, category, channel, installments, is_recurring)
      VALUES (
        ${sqlString(row.id)}, ${sqlString(row.account_id)}, ${sqlString(row.date)}, ${asNumber(row.amount)},
        ${sqlString(row.currency)}, ${sqlString(row.merchant)}, ${sqlString(row.category)}, ${sqlString(row.channel)},
        ${asNumber(row.installments)}, ${row.is_recurring ? "TRUE" : "FALSE"}
      )
    `);
  } finally {
    await connection.close();
  }
}

export async function latestExpense() {
  const instance = await seededDatabase();
  const connection = await instance.connect();
  try {
    const result = await connection.query(`
      SELECT id, date, amount, merchant, category, channel
      FROM transactions
      WHERE amount < 0
      ORDER BY date DESC, id DESC
      LIMIT 1
    `);
    const row = result.toArray()[0]?.toJSON();
    if (!row) throw new Error("No expense transaction was found.");
    return {
      id: asText(row.id), date: asText(row.date), amount: Math.abs(asNumber(row.amount)),
      merchant: asText(row.merchant), category: asText(row.category), channel: asText(row.channel),
    };
  } finally {
    await connection.close();
  }
}

/** Returns the smallest or largest debit by absolute value from a fixed local SQL template. */
export async function expenseBySize(direction) {
  if (!['smallest', 'largest'].includes(direction)) throw new Error('Choose smallest or largest.');
  const instance = await seededDatabase();
  const connection = await instance.connect();
  try {
    const result = await connection.query(`
      SELECT id, date, amount, merchant, category, channel
      FROM transactions
      WHERE amount < 0
      ORDER BY ABS(amount) ${direction === 'smallest' ? 'ASC' : 'DESC'}, date ASC, id ASC
      LIMIT 1
    `);
    const row = result.toArray()[0]?.toJSON();
    if (!row) throw new Error('No expense transaction was found.');
    return { id: asText(row.id), date: asText(row.date), amount: Math.abs(asNumber(row.amount)), merchant: asText(row.merchant), category: asText(row.category), channel: asText(row.channel) };
  } finally {
    await connection.close();
  }
}

/** Finds matching transactions using a fixed SELECT template and literal filters. */
export async function searchTransactions({ from, to, categories, merchant_contains: merchantContains, min_amount: minAmount, max_amount: maxAmount, limit = 20 } = {}) {
  const instance = await seededDatabase();
  const connection = await instance.connect();
  const conditions = [filters({ from, to, categories, merchant_contains: merchantContains }, { condition: 'TRUE' })];
  if (minAmount != null) conditions.push(`ABS(amount) >= ${asNumber(minAmount)}`);
  if (maxAmount != null) conditions.push(`ABS(amount) <= ${asNumber(maxAmount)}`);
  const safeLimit = Math.max(1, Math.min(50, Math.floor(Number(limit) || 20)));
  try {
    const result = await connection.query(`
      SELECT id, date, amount, merchant, category, channel
      FROM transactions
      WHERE ${conditions.join(' AND ')}
      ORDER BY date DESC, id DESC
      LIMIT ${safeLimit}
    `);
    return result.toArray().map((row) => {
      const value = row.toJSON();
      return { id: asText(value.id), date: asText(value.date), amount: asNumber(value.amount), merchant: asText(value.merchant), category: asText(value.category), channel: asText(value.channel) };
    });
  } finally {
    await connection.close();
  }
}

/** Returns fixed monthly spending buckets ending at the newest available transaction date. */
export async function spendingByMonth(months) {
  const safeMonths = [3, 6, 12, 18].includes(Number(months)) ? Number(months) : 6;
  const instance = await seededDatabase();
  const connection = await instance.connect();
  try {
    const result = await connection.query(`
      SELECT CAST(DATE_TRUNC('month', date) AS VARCHAR) AS month, ROUND(SUM(ABS(amount)), 2) AS amount, CAST(COUNT(*) AS DOUBLE) AS transaction_count
      FROM transactions
      WHERE amount < 0
        AND date >= (SELECT DATE_TRUNC('month', MAX(date)) - INTERVAL ${safeMonths - 1} MONTH FROM transactions)
      GROUP BY DATE_TRUNC('month', date)
      ORDER BY DATE_TRUNC('month', date) ASC
    `);
    return result.toArray().map((row) => {
      const value = row.toJSON();
      return { month: asText(value.month).slice(0, 10), amount: asNumber(value.amount), transactionCount: asNumber(value.transaction_count) };
    });
  } finally {
    await connection.close();
  }
}

/** Compares the latest available 30 days of spending with the preceding 30 days. */
export async function compareRecentSpending() {
  const instance = await seededDatabase();
  const connection = await instance.connect();
  try {
    const result = await connection.query(`
      WITH bounds AS (SELECT MAX(date) AS end_date FROM transactions)
      SELECT
        ROUND(SUM(CASE WHEN date >= end_date - INTERVAL 29 DAY THEN ABS(amount) ELSE 0 END), 2) AS current_total,
        ROUND(SUM(CASE WHEN date >= end_date - INTERVAL 59 DAY AND date < end_date - INTERVAL 29 DAY THEN ABS(amount) ELSE 0 END), 2) AS previous_total,
        CAST(SUM(CASE WHEN date >= end_date - INTERVAL 29 DAY THEN 1 ELSE 0 END) AS DOUBLE) AS current_transaction_count,
        CAST(SUM(CASE WHEN date >= end_date - INTERVAL 59 DAY AND date < end_date - INTERVAL 29 DAY THEN 1 ELSE 0 END) AS DOUBLE) AS previous_transaction_count,
        CAST(MIN(CASE WHEN date >= end_date - INTERVAL 29 DAY THEN date END) AS VARCHAR) AS current_from,
        CAST(end_date AS VARCHAR) AS current_to
      FROM transactions, bounds
      WHERE amount < 0 AND date >= end_date - INTERVAL 59 DAY
    `);
    const row = result.toArray()[0]?.toJSON();
    const currentTotal = asNumber(row.current_total);
    const previousTotal = asNumber(row.previous_total);
    return { currentTotal, previousTotal, currentTransactionCount: asNumber(row.current_transaction_count), previousTransactionCount: asNumber(row.previous_transaction_count), difference: currentTotal - previousTotal, percentChange: previousTotal ? (currentTotal - previousTotal) / previousTotal * 100 : null, from: asText(row.current_from), to: asText(row.current_to) };
  } finally {
    await connection.close();
  }
}

/** Groups recurring debits by merchant from the locally seeded ledger. */
export async function recurringExpenses() {
  const instance = await seededDatabase();
  const connection = await instance.connect();
  try {
    const result = await connection.query(`
      SELECT merchant, category, ROUND(SUM(ABS(amount)), 2) AS amount, CAST(COUNT(*) AS DOUBLE) AS transaction_count,
        CAST(MIN(date) AS VARCHAR) AS first_date, CAST(MAX(date) AS VARCHAR) AS last_date
      FROM transactions
      WHERE amount < 0 AND is_recurring = TRUE
      GROUP BY merchant, category
      ORDER BY amount DESC, merchant ASC
    `);
    return result.toArray().map((row) => { const value = row.toJSON(); return { merchant: asText(value.merchant), category: asText(value.category), amount: asNumber(value.amount), transactionCount: asNumber(value.transaction_count), firstDate: asText(value.first_date), lastDate: asText(value.last_date) }; });
  } finally {
    await connection.close();
  }
}

/** Groups debit spending by merchant using a fixed local SQL template. */
export async function merchantExpenses({ from, to, merchant_contains: merchantContains, limit = 10 } = {}) {
  const instance = await seededDatabase();
  const connection = await instance.connect();
  const where = filters({ from, to, merchant_contains: merchantContains }, { condition: 'amount < 0' });
  const safeLimit = Math.max(1, Math.min(25, Math.floor(Number(limit) || 10)));
  try {
    const result = await connection.query(`
      SELECT merchant, ROUND(SUM(ABS(amount)), 2) AS amount, CAST(COUNT(*) AS DOUBLE) AS transaction_count,
        CAST(MIN(date) AS VARCHAR) AS first_date, CAST(MAX(date) AS VARCHAR) AS last_date
      FROM transactions
      WHERE ${where}
      GROUP BY merchant
      ORDER BY amount DESC, merchant ASC
      LIMIT ${safeLimit}
    `);
    return result.toArray().map((row) => { const value = row.toJSON(); return { merchant: asText(value.merchant), amount: asNumber(value.amount), transactionCount: asNumber(value.transaction_count), firstDate: asText(value.first_date), lastDate: asText(value.last_date) }; });
  } finally {
    await connection.close();
  }
}

/** Flags debit transactions at least two standard deviations above the historical debit average. */
export async function unusualExpenses({ limit = 10 } = {}) {
  const instance = await seededDatabase();
  const connection = await instance.connect();
  const safeLimit = Math.max(1, Math.min(25, Math.floor(Number(limit) || 10)));
  try {
    const result = await connection.query(`
      WITH debit_stats AS (
        SELECT AVG(ABS(amount)) AS average_amount, STDDEV_POP(ABS(amount)) AS standard_deviation
        FROM transactions WHERE amount < 0
      )
      SELECT id, date, amount, merchant, category, channel,
        ROUND(ABS(amount) - average_amount, 2) AS amount_above_average
      FROM transactions, debit_stats
      WHERE amount < 0 AND ABS(amount) >= average_amount + (2 * standard_deviation)
      ORDER BY ABS(amount) DESC, date DESC, id DESC
      LIMIT ${safeLimit}
    `);
    return result.toArray().map((row) => { const value = row.toJSON(); return { id: asText(value.id), date: asText(value.date), amount: Math.abs(asNumber(value.amount)), merchant: asText(value.merchant), category: asText(value.category), channel: asText(value.channel), amountAboveAverage: asNumber(value.amount_above_average) }; });
  } finally {
    await connection.close();
  }
}

/** Returns one transaction at a fixed recency position; it never exposes arbitrary SQL. */
export async function transactionByRecency(position) {
  const offset = Math.max(0, Math.min(99, Math.floor(Number(position) || 1) - 1));
  const instance = await seededDatabase();
  const connection = await instance.connect();
  try {
    const result = await connection.query(`
      SELECT id, date, amount, merchant, category, channel
      FROM transactions
      ORDER BY date DESC, id DESC
      LIMIT 1 OFFSET ${offset}
    `);
    const row = result.toArray()[0]?.toJSON();
    if (!row) throw new Error("No transaction was found at that position.");
    return {
      id: asText(row.id), date: asText(row.date), amount: asNumber(row.amount),
      merchant: asText(row.merchant), category: asText(row.category), channel: asText(row.channel),
    };
  } finally {
    await connection.close();
  }
}
