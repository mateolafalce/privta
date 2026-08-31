const currency = (amount) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
const date = (value) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`));
const escape = (value) => String(value).replace(/[&<>\"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]);

function closeButton() {
  return '<button class="query-result-close" type="button" aria-label="Close financial summary" title="Close financial summary">&times;</button>';
}

function render(target, content) {
  target.innerHTML = `${closeButton()}${content}`;
  target.querySelector(".query-result-close").addEventListener("click", () => target.replaceChildren());
}

/** Renders the local SQL result in the visible document. */
export function presentDomResult(result) {
  const target = document.querySelector("#query-result");
  if (!target) return;
  const largest = Math.max(...result.breakdown.map((item) => Math.abs(item.value)), 1);
  const rows = result.breakdown.slice(0, 5).map((item) => `<li><span>${escape(item.label)}</span><i><b style="width:${Math.max(3, Math.abs(item.value) / largest * 100)}%"></b></i><strong>${currency(item.value)}</strong></li>`).join("");
  render(target, `<div class="query-result-copy"><p class="eyebrow">LOCAL DUCKDB SQL RESULT</p><h2>${escape(result.title)}</h2><p>${date(result.from)} – ${date(result.to)} · ${result.transactionCount.toLocaleString("en-US")} matching transactions</p></div><div class="query-result-total"><span>${escape(result.totalLabel)}</span><strong>${currency(result.total)}</strong></div><div class="query-result-breakdown"><p>Breakdown</p><ul>${rows}</ul></div>`);
  target.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

/** Renders a safe technical explanation when the local SQL engine cannot start. */
export function presentDomError({ title = "Local SQL unavailable", detail }) {
  const target = document.querySelector("#query-result");
  if (!target) return;
  render(target, `<div class="query-result-copy"><p class="eyebrow">LOCAL DUCKDB SQL ERROR</p><h2>${escape(title)}</h2><p>${escape(detail)}</p></div>`);
  target.scrollIntoView({ block: "nearest", behavior: "smooth" });
}
