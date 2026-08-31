import type { DomResult } from "./types.js";

const currency = (amount: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
const date = (value: string) => {
  const parsed = /^\d{4}-\d{2}-\d{2}/.test(value) ? new Date(`${value.slice(0, 10)}T12:00:00`) : new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(parsed);
};
const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const escape = (value: unknown) => String(value).replace(/[&<>\"]/g, (character) => entities[character] ?? character);

function closeButton() {
  return '<button class="query-result-close" type="button" aria-label="Close financial summary" title="Close financial summary">&times;</button>';
}

function render(target: Element, content: string) {
  target.innerHTML = `${closeButton()}${content}`;
  target.querySelector(".query-result-close")?.addEventListener("click", () => target.replaceChildren());
}

/** Renders the local SQL result in the visible document. */
export function presentDomResult(result: DomResult) {
  const target = document.querySelector("#query-result");
  if (!target) return;
  const largest = Math.max(...result.breakdown.map((item) => Math.abs(item.value)), 1);
  const rows = result.breakdown.slice(0, 5).map((item) => `<li><span>${escape(item.label)}</span><i><b style="width:${Math.max(3, Math.abs(item.value) / largest * 100)}%"></b></i><strong>${currency(item.value)}</strong></li>`).join("");
  render(target, `<div class="query-result-copy"><p class="eyebrow">LOCAL DUCKDB SQL RESULT</p><h2>${escape(result.title)}</h2><p>${date(result.from)} – ${date(result.to)} · ${result.transactionCount.toLocaleString("en-US")} matching transactions</p></div><div class="query-result-total"><span>${escape(result.totalLabel)}</span><strong>${currency(result.total)}</strong></div><div class="query-result-breakdown"><p>Breakdown</p><ul>${rows}</ul></div>`);
  target.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

/** Renders a safe technical explanation when the local SQL engine cannot start. */
export function presentDomError({ title = "Local SQL unavailable", detail }: { title?: string; detail: string }) {
  const target = document.querySelector("#query-result");
  if (!target) return;
  render(target, `<div class="query-result-copy"><p class="eyebrow">LOCAL DUCKDB SQL ERROR</p><h2>${escape(title)}</h2><p>${escape(detail)}</p></div>`);
  target.scrollIntoView({ block: "nearest", behavior: "smooth" });
}
