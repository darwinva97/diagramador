/**
 * Almacén único en un Durable Object con SQLite (fuerte consistencia, sin cuota de D1).
 * El Worker ejecuta SQL a través de los métodos RPC `all` y `run`.
 */
import { DurableObject } from 'cloudflare:workers';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, pass_hash TEXT NOT NULL, salt TEXT NOT NULL,
  created_at TEXT NOT NULL, settings TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, prefix TEXT NOT NULL,
  key_hash TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL, last_used_at TEXT
);
CREATE INDEX IF NOT EXISTS api_keys_user ON api_keys(user_id);
CREATE TABLE IF NOT EXISTS docs (
  user_id TEXT NOT NULL, kind TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL,
  data TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, kind, id)
);
`;

type Env = Record<string, unknown>;

export class Store extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.blockConcurrencyWhile(async () => { this.ctx.storage.sql.exec(SCHEMA); });
  }
  all<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
    return this.ctx.storage.sql.exec(sql, ...(params as SqlStorageValue[])).toArray() as T[];
  }
  run(sql: string, params: unknown[] = []): { changes: number } {
    const cur = this.ctx.storage.sql.exec(sql, ...(params as SqlStorageValue[]));
    return { changes: cur.rowsWritten };
  }
  /** Varias sentencias en una transacción. */
  batch(stmts: { sql: string; params?: unknown[] }[]): { changes: number } {
    let changes = 0;
    this.ctx.storage.transactionSync(() => {
      for (const s of stmts) changes += this.ctx.storage.sql.exec(s.sql, ...((s.params ?? []) as SqlStorageValue[])).rowsWritten;
    });
    return { changes };
  }
}
