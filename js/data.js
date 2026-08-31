const seeded = (seed = 81427) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const money = (value) => Math.round(value / 10) * 10;

export const accounts = [
  { id: "checking", type: "Everyday checking", currency: "USD", alias: "ethan.privta", balance: 19439, masked_number: "•••• 0381" },
];

export const contacts = [
  { id: "emma", name: "Emma Williams", bank_alias: "emma.williams.home", bank: "Aurora Bank", last_transfer: "2026-08-05" },
  { id: "noah", name: "Noah Carter", bank_alias: "noah.carter", bank: "South Bank", last_transfer: "2026-07-12" },
];

export const services = [
  { id: "water", name: "Clearwater Utility", type: "Water", amount: 13.6, due_date: "2026-09-10", status: "pending" },
  { id: "energy", name: "Northstar Energy", type: "Electricity", amount: 28.84, due_date: "2026-09-08", status: "pending" },
  { id: "internet", name: "Fiberline", type: "Internet", amount: 22.5, due_date: "2026-09-15", status: "pending" },
];

const categories = ["Groceries", "Dining", "Transport", "Health", "Home", "Entertainment", "Education", "Clothing", "Transfers"];
const merchants = {
  Groceries: ["North Market", "Freshway", "Maple Grocer"],
  Dining: ["Nomad Cafe", "Pasta House", "QuickBite"],
  Transport: ["Harbor Fuel", "RideNow", "MetroPass"],
  Health: ["Central Pharmacy", "North Clinic"],
  Home: ["Homecraft", "Clearwater Utility", "Northstar Energy"],
  Entertainment: ["Cinepolis", "Spotify", "Netflix"],
  Education: ["SkillForge", "Technical Books"],
  Clothing: ["Nomad Apparel", "Urban Store"],
  Transfers: ["Emma Williams", "Noah Carter"],
};

function iso(date) { return date.toISOString().slice(0, 10); }
function entry(id, account_id, date, amount, merchant, category, extra = {}) {
  return { id, account_id, date, amount: Math.round(amount * 100) / 100, currency: "USD", merchant, category, channel: "Card", installments: 0, is_recurring: false, ...extra };
}

export function createTransactions() {
  const random = seeded();
  const tx = [];
  const start = new Date("2025-03-01T12:00:00");
  let id = 1;
  for (let month = 0; month < 18; month++) {
    const monthDate = new Date(start.getFullYear(), start.getMonth() + month, 1, 12);
    const seasonal = [6, 11].includes(monthDate.getMonth()) ? 1.55 : 1;
    const salary = month >= 10 ? 17500 : 13200;
    tx.push(entry(`tx-${id++}`, "checking", iso(new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)), salary, "ACME Services", "Income", { channel: "Bank transfer", is_recurring: true }));
    tx.push(entry(`tx-${id++}`, "checking", iso(new Date(monthDate.getFullYear(), monthDate.getMonth(), 5)), -4250, "Emma Williams", "Transfers", { channel: "Bank transfer", is_recurring: true }));
    tx.push(entry(`tx-${id++}`, "checking", iso(new Date(monthDate.getFullYear(), monthDate.getMonth(), 8)), -8.4, "Spotify", "Entertainment", { is_recurring: true }));
    tx.push(entry(`tx-${id++}`, "checking", iso(new Date(monthDate.getFullYear(), monthDate.getMonth(), 9)), -9.9, "Spotify Premium", "Entertainment", { is_recurring: true }));
    const water = month < 12 ? 3.1 + month * .42 : 13.6;
    tx.push(entry(`tx-${id++}`, "checking", iso(new Date(monthDate.getFullYear(), monthDate.getMonth(), 10)), -water, "Clearwater Utility", "Home", { channel: "Auto-debit", is_recurring: true }));
    tx.push(entry(`tx-${id++}`, "checking", iso(new Date(monthDate.getFullYear(), monthDate.getMonth(), 16)), -23.45, "GAMERX ONLINE", "Entertainment", { is_recurring: true }));
    if (month >= 11 && month < 23) tx.push(entry(`tx-${id++}`, "checking", iso(new Date(monthDate.getFullYear(), monthDate.getMonth(), 18)), -75.4, "Northstar Laptop — installment " + (month - 10) + "/12", "Education", { installments: 12, channel: "Card" }));
    for (let n = 0; n < 127; n++) {
      const category = categories[Math.floor(random() * categories.length)];
      const merchant = merchants[category][Math.floor(random() * merchants[category].length)];
      const day = 2 + Math.floor(random() * 26);
      const amount = -(7 + random() * (category === "Groceries" ? 780 : 240) * seasonal);
      tx.push(entry(`tx-${id++}`, "checking", iso(new Date(monthDate.getFullYear(), monthDate.getMonth(), day)), amount, merchant, category, { channel: random() > .55 ? "Card" : "QR" }));
    }
  }
  return tx.slice(0, 2400).sort((a, b) => b.date.localeCompare(a.date));
}
