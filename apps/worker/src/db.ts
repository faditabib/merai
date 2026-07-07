import pg from "pg";
import { env } from "./env";

/**
 * Minimal query interface implemented by pg.Pool in production and by
 * PGlite (in-process Postgres) in tests. Handlers and the queue always go
 * through getDb() so tests can swap the backend with setDb().
 */
export interface Db {
  query<R = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: R[] }>;
  end(): Promise<void>;
}

let db: Db | null = null;

export function getDb(): Db {
  if (!db) {
    if (!env.databaseUrl) {
      throw new Error("SUPABASE_DB_URL is not set (see apps/worker/.env.example)");
    }
    const pool = new pg.Pool({ connectionString: env.databaseUrl, max: 5 });
    const wrapped: Db = {
      async query<R>(text: string, params?: unknown[]) {
        const result = await pool.query(text, params as never[]);
        return { rows: result.rows as R[] };
      },
      end: () => pool.end(),
    };
    db = wrapped;
  }
  return db;
}

/** Test hook: replace the database backend (e.g. with PGlite). */
export function setDb(override: Db): void {
  db = override;
}
