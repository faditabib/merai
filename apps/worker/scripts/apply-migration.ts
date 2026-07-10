/**
 * Apply a single migration file to the live database:
 *   npx tsx scripts/apply-migration.ts ../../supabase/migrations/<file>.sql
 * Uses SUPABASE_DB_URL from apps/worker/.env. Migrations are written
 * idempotent, so re-running one is safe.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import pg from "pg";

const file = process.argv[2];
if (!file) {
  console.error("usage: tsx scripts/apply-migration.ts <path-to-migration.sql>");
  process.exit(1);
}

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL is not set");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query(readFileSync(file, "utf8"));
  console.log(`applied: ${file}`);
} finally {
  await client.end();
}
