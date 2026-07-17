import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setDb } from "../src/db";
import { claimNextJob, completeJob, failJob, failJobPermanently } from "../src/queue";
import { processOne } from "../src/runner";
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

  it("failJobPermanently hard-fails on the first attempt (no retries left)", async () => {
    const id = await db.enqueue("cleanup_expired", {}, { dedupeKey: "q5" });
    const job = await claimNextJob("w-test", ["cleanup_expired"]);
    expect(job?.attempts).toBe(1);
    await failJobPermanently(id, "deterministic failure");

    const { rows } = await db.query<{
      status: string;
      attempts: number;
      max_attempts: number;
      last_error: string;
    }>("select status, attempts, max_attempts, last_error from public.jobs where id = $1", [id]);
    expect(rows[0]).toMatchObject({ status: "failed", last_error: "deterministic failure" });
    expect(rows[0]!.attempts).toBe(rows[0]!.max_attempts);
    // A hard-failed job never re-enters the queue.
    expect(await claimNextJob("w-test", ["cleanup_expired"])).toBeNull();
  });

  it("runner short-circuits PermanentJobError on attempt 1 (render_export, missing row)", async () => {
    const id = await db.enqueue(
      "render_export",
      {
        exportId: "00000000-0000-4000-8000-00000000dead",
        projectId: "00000000-0000-4000-8000-00000000feed",
        ownerId: "00000000-0000-4000-8000-00000000beef",
      },
      { dedupeKey: "q6" },
    );

    expect(await processOne("w-test")).toBe(true);

    const { rows } = await db.query<{ status: string; attempts: number; last_error: string }>(
      "select status, attempts, last_error from public.jobs where id = $1",
      [id],
    );
    expect(rows[0]!.status).toBe("failed"); // not requeued despite attempts < max
    expect(rows[0]!.last_error).toMatch(/not found/);
  });

  it("dedupe_key rejects duplicate enqueues", async () => {
    await db.enqueue("transcribe", {}, { dedupeKey: "dup-1" });
    await expect(db.enqueue("transcribe", {}, { dedupeKey: "dup-1" })).rejects.toThrow(
      /duplicate key|unique/i,
    );
  });
});

describe("stitch failure surfacing (hardening 2026-07-17)", () => {
  it("a permanently failed stitch marks the project error (was: stuck in uploading)", async () => {
    const ownerId = await db.seedUser();
    const projectId = await db.seedProject(ownerId, "uploading");
    const sceneA = await db.seedUpload(projectId, ownerId, "uploaded");
    const sceneB = await db.seedUpload(projectId, ownerId, "uploaded");
    // Missing stitched upload row -> PermanentJobError from the handler.
    await db.enqueue(
      "stitch",
      {
        projectId,
        ownerId,
        uploadIds: [sceneA, sceneB],
        stitchedUploadId: crypto.randomUUID(),
      },
      { dedupeKey: `stitch-surface-${projectId}`, projectId, ownerId },
    );

    // Drain the queue — earlier suite tests leave requeued jobs behind; keep
    // claiming until nothing is immediately runnable.
    while (await processOne("w-stitch-test")) {
      /* drain */
    }

    const { rows: jobs } = await db.query<{ status: string }>(
      "select status from public.jobs where dedupe_key = $1",
      [`stitch-surface-${projectId}`],
    );
    expect(jobs[0]!.status).toBe("failed");

    const { rows: projects } = await db.query<{ status: string }>(
      "select status from public.projects where id = $1",
      [projectId],
    );
    expect(projects[0]!.status).toBe("error");
  });
});
