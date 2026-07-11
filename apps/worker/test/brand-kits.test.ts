import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./helpers/pglite-db";

/**
 * Brand Kit ownership isolation (Build 6B.1). Exercises the ACTUAL RLS
 * policies from the migration under `set role authenticated`, the same way
 * the AI feedback/preferences tests do — the worker uses the service role,
 * so these guarantees only hold for the anon/authenticated client paths the
 * web app uses.
 */

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
  setGrants();
});

async function setGrants() {
  await db.query("grant usage on schema public to authenticated");
  await db.query(
    "grant select, insert, update, delete on public.brand_kits to authenticated",
  );
}

afterAll(() => db.end());

async function asUser(uid: string) {
  await db.query("select set_config('test.uid', $1, false)", [uid]);
  await db.query("set role authenticated");
}

async function insertKit(owner: string, name: string) {
  await db.query(
    `insert into public.brand_kits (owner_id, name, primary_color, secondary_color, accent_color)
     values ($1, $2, '#111111', '#222222', '#333333')`,
    [owner, name],
  );
}

describe("brand_kits RLS (real DB + migrations)", () => {
  it("lets an owner create and read their own kit", async () => {
    const owner = await db.seedUser();
    await asUser(owner);
    await insertKit(owner, "My Channel");
    const { rows } = await db.query<{ name: string; owner_id: string }>(
      "select name, owner_id from public.brand_kits",
    );
    await db.query("reset role");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "My Channel", owner_id: owner });
  });

  it("rejects a foreign insert via the with-check policy", async () => {
    const owner = await db.seedUser();
    const stranger = await db.seedUser();
    await asUser(owner);
    await expect(insertKit(stranger, "Not Mine")).rejects.toThrow(/row-level security/);
    await db.query("reset role");
  });

  it("hides another user's kit and blocks cross-owner updates", async () => {
    const owner = await db.seedUser();
    const stranger = await db.seedUser();
    await asUser(owner);
    await insertKit(owner, "Owner Kit");
    await db.query("reset role");

    // Stranger sees nothing and cannot mutate the owner's row.
    await asUser(stranger);
    const { rows: visible } = await db.query("select id from public.brand_kits");
    expect(visible).toHaveLength(0);
    await db.query(
      "update public.brand_kits set name = 'hijacked' where owner_id = $1",
      [owner],
    );
    await db.query("reset role");

    // Owner's data is untouched.
    await asUser(owner);
    const { rows } = await db.query<{ name: string }>(
      "select name from public.brand_kits where owner_id = $1",
      [owner],
    );
    await db.query("reset role");
    expect(rows[0]!.name).toBe("Owner Kit");
  });

  it("enforces one kit per creator (unique owner_id)", async () => {
    const owner = await db.seedUser();
    await asUser(owner);
    await insertKit(owner, "First");
    await expect(insertKit(owner, "Second")).rejects.toThrow(/unique|duplicate/i);
    await db.query("reset role");
  });
});
