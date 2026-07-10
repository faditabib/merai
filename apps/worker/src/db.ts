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
    // Idle clients dropped by the pooler emit 'error' at the pool level —
    // without a handler that is an unhandled event and crashes the process
    // (observed live 2026-07-09 after an overnight idle). Log and continue;
    // pg discards the dead client and dials a fresh one on next use.
    pool.on("error", (err) => {
      console.error(
        `${new Date().toISOString()} [ERROR] idle db client error (recovered): ${err.message}`,
      );
      // Dynamic import keeps db.ts's static graph dependency-free and avoids
      // any import-order surprises; the alert itself never throws.
      void import("./alert").then(({ sendAlert }) =>
        sendAlert(`Merai worker: idle db client error (recovered): ${err.message}`),
      );
    });
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
