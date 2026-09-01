declare module "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.32.0/+esm" {
  export interface DuckDBBundle {
    mainWorker: string;
    mainModule: string;
    pthreadWorker?: string;
  }

  export interface DuckDBRow {
    toJSON(): Record<string, unknown>;
  }

  export interface DuckDBQueryResult {
    toArray(): DuckDBRow[];
  }

  export interface DuckDBConnection {
    query(sql: string): Promise<DuckDBQueryResult>;
    close(): Promise<void>;
  }

  export class VoidLogger {
    constructor();
  }

  export class AsyncDuckDB {
    constructor(logger: VoidLogger, worker: Worker);
    instantiate(mainModule: string, pthreadWorker?: string): Promise<void>;
    registerFileText(name: string, text: string): Promise<void>;
    connect(): Promise<DuckDBConnection>;
  }

  export function getJsDelivrBundles(): unknown;
  export function selectBundle(bundles: unknown): Promise<DuckDBBundle>;
}
