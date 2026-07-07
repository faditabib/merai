import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { Db } from "../../src/db";

/**
 * Real-Postgres test harness (PGlite = Postgres compiled to WASM, in-process).
 * Applies the ACTUAL migrations from supabase/migrations, so every test run
 * also validates that the migration SQL executes cleanly. Only Supabase's
 * platform-managed schemas (auth, storage) and roles are stubbed.
 */

const MIGRATIONS_DIR = join(import.meta.dirname, "../../../../supabase/migrations");

const PLATFORM_STUBS = /* sql */ `
  -- Supabase-managed pieces the migrations reference:
  create schema auth;
  create table auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('test.uid', true), '')::uuid $$;

  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text,
    name text
  );
  create function storage.foldername(name text) returns text[]
    language sql immutable as
    $$ select (string_to_array(name, '/'))[1 : array_length(string_to_array(name, '/'), 1) - 1] $$;

  create role anon;
  create role authenticated;
`;

export interface TestDb extends Db {
  /** Seed a user (auth trigger creates the profile) and return its id. */
  seedUser(email?: string): Promise<string>;
  seedProject(ownerId: string, status?: string): Promise<string>;
  seedUpload(projectId: string, ownerId: string, status?: string): Promise<string>;
  enqueue(
    type: string,
    payload: Record<string, unknown>,
    options?: { dedupeKey?: string; maxAttempts?: number; projectId?: string; ownerId?: string },
  ): Promise<string>;
}

export async function createTestDb(): Promise<TestDb> {
  const pglite = new PGlite();

  await pglite.exec(PLATFORM_STUBS);

  const migrations = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  if (migrations.length === 0) throw new Error("No migrations found");
  for (const file of migrations) {
    await pglite.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }

  const db: TestDb = {
    async query<R>(text: string, params?: unknown[]) {
      const result = await pglite.query(text, params);
      return { rows: result.rows as R[] };
    },
    end: () => pglite.close(),

    async seedUser(email = `user-${crypto.randomUUID().slice(0, 8)}@test.dev`) {
      const id = crypto.randomUUID();
      await pglite.query(
        "insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}')",
        [id, email],
      );
      return id;
    },

    async seedProject(ownerId, status = "transcribing") {
      const result = await pglite.query<{ id: string }>(
        `insert into public.projects (owner_id, title, status, source_language)
         values ($1, 'Test project', $2, 'auto') returning id`,
        [ownerId, status],
      );
      return result.rows[0]!.id;
    },

    async seedUpload(projectId, ownerId, status = "uploaded") {
      const id = crypto.randomUUID();
      await pglite.query(
        `insert into public.video_uploads
           (id, project_id, owner_id, storage_path, original_filename, mime_type, size_bytes, status)
         values ($1, $2, $3, $4, 'clip.mp4', 'video/mp4', 1024, $5)`,
        [id, projectId, ownerId, `raw-uploads/${ownerId}/${id}/original.mp4`, status],
      );
      return id;
    },

    async enqueue(type, payload, options = {}) {
      const result = await pglite.query<{ id: string }>(
        `insert into public.jobs (type, payload, dedupe_key, max_attempts, project_id, owner_id)
         values ($1, $2::jsonb, $3, $4, $5, $6) returning id`,
        [
          type,
          JSON.stringify(payload),
          options.dedupeKey ?? null,
          options.maxAttempts ?? 3,
          options.projectId ?? null,
          options.ownerId ?? null,
        ],
      );
      return result.rows[0]!.id;
    },
  };

  return db;
}
