/** WebMCP adapter. Native modelContext is preferred; the shim keeps local demos testable. */
const SHIM_FLAG = "__privtaWebMCPShim";

export interface JsonSchema {
  type: "object";
  properties: Record<string, unknown>;
  required: string[];
  additionalProperties: false;
}

export interface WebMCPTool {
  name: string;
  title?: string;
  description: string;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
  inputSchema: JsonSchema;
  execute: (args?: unknown) => unknown | Promise<unknown>;
}

export interface ModelContext extends EventTarget {
  registerTool(tool: WebMCPTool, options?: { signal?: AbortSignal }): Promise<void>;
  getTools?: () => Promise<unknown[]>;
  executeTool?: (tool: string | { name: string }, args?: unknown) => Promise<string>;
}

declare global {
  interface Document {
    modelContext?: ModelContext;
  }
  interface Navigator {
    modelContext?: ModelContext;
  }
}

let installedContext: ModelContext | undefined;
let installedSource = "unavailable";

class ModelContextShim extends EventTarget implements ModelContext {
  #tools = new Map<string, WebMCPTool>();
  readonly [SHIM_FLAG] = true;

  async registerTool(tool: WebMCPTool, options: { signal?: AbortSignal } = {}) {
    if (!tool?.name || !tool.description || typeof tool.execute !== "function") throw new DOMException("Invalid WebMCP tool", "InvalidStateError");
    if (this.#tools.has(tool.name)) throw new DOMException(`Tool already registered: ${tool.name}`, "InvalidStateError");
    if (options.signal?.aborted) throw new DOMException("Registration aborted", "AbortError");
    this.#tools.set(tool.name, tool);
    options.signal?.addEventListener("abort", () => { this.#tools.delete(tool.name); this.dispatchEvent(new Event("toolchange")); }, { once: true });
    this.dispatchEvent(new Event("toolchange"));
  }

  async getTools() { return [...this.#tools.values()].map(({ execute, ...tool }) => ({ ...tool, origin: location.origin })); }

  async executeTool(tool: string | { name: string }, args: unknown = {}) {
    const rec = this.#tools.get(typeof tool === "string" ? tool : tool.name);
    if (!rec) throw new DOMException("Tool not found", "NotFoundError");
    const result = await rec.execute(typeof args === "string" ? JSON.parse(args) : args);
    return JSON.stringify(result);
  }
}

function isShim(value: ModelContext): boolean {
  return Boolean((value as ModelContextShim)[SHIM_FLAG]);
}

export function installWebMCP() {
  const native = document.modelContext ?? navigator.modelContext;
  if (native?.registerTool) {
    installedContext = native;
    installedSource = isShim(native) ? "shim" : "native";
    return { context: installedContext, source: installedSource };
  }
  const shim = new ModelContextShim();
  Object.defineProperty(document, "modelContext", { configurable: true, get: () => shim });
  installedContext = shim;
  installedSource = "shim";
  return { context: installedContext, source: installedSource };
}

export const getModelContext = () => installedContext ?? document.modelContext ?? navigator.modelContext;
export const getModelContextSource = () => installedSource;
export async function onToolsChanged(callback: EventListener) { getModelContext()?.addEventListener?.("toolchange", callback); }
