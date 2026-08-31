/** WebMCP adapter. Native modelContext is preferred; the shim keeps local demos testable. */
const SHIM_FLAG = "__privtaWebMCPShim";
class ModelContextShim extends EventTarget {
  #tools = new Map();
  constructor() { super(); this[SHIM_FLAG] = true; }
  async registerTool(tool, options = {}) {
    if (!tool?.name || !tool.description || typeof tool.execute !== "function") throw new DOMException("Invalid WebMCP tool", "InvalidStateError");
    if (this.#tools.has(tool.name)) throw new DOMException(`Tool already registered: ${tool.name}`, "InvalidStateError");
    if (options.signal?.aborted) throw new DOMException("Registration aborted", "AbortError");
    this.#tools.set(tool.name, tool);
    options.signal?.addEventListener("abort", () => { this.#tools.delete(tool.name); this.dispatchEvent(new Event("toolchange")); }, { once: true });
    this.dispatchEvent(new Event("toolchange"));
  }
  async getTools() { return [...this.#tools.values()].map(({ execute, ...tool }) => ({ ...tool, origin: location.origin })); }
  async executeTool(tool, args = {}) {
    const rec = this.#tools.get(typeof tool === "string" ? tool : tool.name);
    if (!rec) throw new DOMException("Tool not found", "NotFoundError");
    const result = await rec.execute(typeof args === "string" ? JSON.parse(args) : args);
    return JSON.stringify(result);
  }
}
export function installWebMCP() {
  const native = document.modelContext ?? navigator.modelContext;
  if (native?.registerTool) return { context: native, source: native[SHIM_FLAG] ? "shim" : "native" };
  const shim = new ModelContextShim();
  Object.defineProperty(document, "modelContext", { configurable: true, get: () => shim });
  return { context: shim, source: "shim" };
}
export const getModelContext = () => document.modelContext ?? navigator.modelContext;
export async function onToolsChanged(callback) { getModelContext()?.addEventListener?.("toolchange", callback); }
