import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setDb } from "../src/db";
import { claimNextJob, completeJob, failJob } from "../src/queue";
import { createTestDb, type TestDb } from "./helpers/pglite-db";

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
  setDb(db);
});

afterAll(() => db.end());

describe("postgres job queue (real migration applied to PGlite)", () => {
  it("migration created the schema: auth trigger provisions a profile", async () => {
    const userId = await db.seedUser();
    const { rows } = await db.query<{ id: string; locale: string }>(
      "select id, locale from public.profiles where id = $1",
      [userId],
    );
    expect(rows[0]).toMatchObject({ id: userId, locale: "ar" });
  });

  it("claims jobs oldest-first and marks them processing", async () => {
    const first = await db.enqueue("cleanup_expired", {}, { dedupeKey: "q1" });
    const second = await db.enqueue("cleanup_expired", {}, { dedupeKey: "q2" });

    const claimed = await claimNextJob("w-test", ["cleanup_expired"]);
    expect(claimed?.id).toBe(first);
    expect(claimed?.status).toBe("processing");
    expect(claimed?.attempts).toBe(1);
    expect(claimed?.locked_by).toBe("w-test");

    const next = await claimNextJob("w-test", ["cleanup_expired"]);
    expect(next?.id).toBe(second);

    // Queue drained — nothing left to claim.
    expect(await claimNextJob("w-test", ["cleanup_expired"])).toBeNull();

    await completeJob(first);
    await completeJob(second);
  });

  it("does not hand out jobs of other types", async () => {
    const id = await db.enqueue("transcribe", { x: 1 }, { dedupeKey: "q3" });
    expect(await claimNextJob("w-test", ["analyze"])).toBeNull();
    const claimed = await claimNextJob("w-test", ["transcribe"]);
    expect(claimed?.id).toBe(id);
    await completeJob(id);
  });

  it("fail_job requeues with exponential backoff, then fails permanently", async () => {
    const id = await db.enqueue("cleanup_expired", {}, { dedupeKey: "q4", maxAttempts: 2 });

    // Attempt 1 → failure → requeued in the future.
    let job = await claimNextJob("w-test", ["cleanup_expired"]);
    expect(job?.id).toBe(id);
    await failJob(id, "first failure");

    let { rows } = await db.query<{ status: string; run_at: string; last_error: string }>(
      "select status, run_at, last_error from public.jobs where id = $1",
      [id],
    );
    expect(rows[0]!.status).toBe("queued");
    expect(rows[0]!.last_error).toBe("first failure");
    expect(new Date(rows[0]!.run_at).getTime()).toBeGreaterThan(Date.now() + 30_000);

    // Not claimable until run_at passes.
    expect(await claimNextJob("w-test", ["cleanup_expired"])).toBeNull();

    // Force it due, fail again → attempts exhausted → permanent failure.
    await db.query("update public.jobs set run_at = now() where id = $1", [id]);
    job = await claimNextJob("w-test", ["cleanup_expired"]);
    expect(job?.attempts).toBe(2);
    await failJob(id, "second failure");

    ({ rows } = await db.query(
      "select status, run_at, last_error from public.jobs where id = $1",
      [id],
    ));
    expect(rows[0]!.status).toBe("failed");
  });

  it("dedupe_key rejects duplicate enqueues", async () => {
    await db.enqueue("transcribe", {}, { dedupeKey: "dup-1" });
    await expect(db.enqueue("transcribe", {}, { dedupeKey: "dup-1" })).rejects.toThrow(
      /duplicate key|unique/i,
    );
  });
});
