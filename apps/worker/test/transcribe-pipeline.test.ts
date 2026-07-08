import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TranscriptWord } from "@merai/core";
import { setDb } from "../src/db";
import { transcribeWithProvider } from "../src/handlers/transcribe";
import { processOne } from "../src/runner";
import { MockTranscriptionProvider } from "../src/transcription/mock";
import type {
  TranscriptionProvider,
  TranscriptionResult,
} from "../src/transcription/types";
import { createTestDb, type TestDb } from "./helpers/pglite-db";

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
  setDb(db);
});

afterAll(() => db.end());

async function seedPipeline() {
  const ownerId = await db.seedUser();
  const projectId = await db.seedProject(ownerId, "transcribing");
  const uploadId = await db.seedUpload(projectId, ownerId, "uploaded");
  return { ownerId, projectId, uploadId };
}

function payloadFor(ids: { uploadId: string; projectId: string; ownerId: string }) {
  return { uploadId: ids.uploadId, projectId: ids.projectId, ownerId: ids.ownerId };
}

describe("transcribe pipeline end-to-end (mock provider, real DB + migration)", () => {
  it("upload → transcribe → analyze → transcript + EDL stored, minutes metered, project ready", async () => {
    const ids = await seedPipeline();
    await db.enqueue("transcribe", payloadFor(ids), {
      dedupeKey: `transcribe:${ids.uploadId}`,
      projectId: ids.projectId,
      ownerId: ids.ownerId,
    });

    // Full production path: claim → handler (mock: no API key set) → complete.
    const claimed = await processOne("w-e2e");
    expect(claimed).toBe(true);

    // Transcription hands off to analysis: project analyzing, analyze queued.
    const { rows: midProjects } = await db.query<{ status: string }>(
      "select status from public.projects where id = $1",
      [ids.projectId],
    );
    expect(midProjects[0]!.status).toBe("analyzing");

    // Second claim runs the analyze job (heuristic engine — hermetic env).
    expect(await processOne("w-e2e")).toBe(true);

    const { rows: transcripts } = await db.query<{
      status: string;
      text: string;
      words: TranscriptWord[];
      language_code: string;
      provider: string;
      provider_transcript_id: string;
    }>("select * from public.transcripts where upload_id = $1", [ids.uploadId]);

    expect(transcripts).toHaveLength(1);
    const transcript = transcripts[0]!;
    expect(transcript.status).toBe("completed");
    expect(transcript.provider).toBe("mock");
    expect(transcript.provider_transcript_id).toBe(`mock-${ids.uploadId}`);
    expect(transcript.language_code).toBe("ar"); // 'auto' resolves to Arabic
    expect(transcript.text).toContain("السلام");
    expect(transcript.words[0]).toMatchObject({ id: "w0" });
    expect(transcript.words.length).toBeGreaterThan(20);

    // Provider duration became authoritative on the upload row.
    const { rows: uploads } = await db.query<{ duration_seconds: string }>(
      "select duration_seconds from public.video_uploads where id = $1",
      [ids.uploadId],
    );
    const duration = Number(uploads[0]!.duration_seconds);
    expect(duration).toBeGreaterThan(0);

    // Raw minutes metered once (STT billed on raw footage).
    const { rows: ledger } = await db.query<{ kind: string; minutes: string }>(
      "select kind, minutes from public.usage_ledger where upload_id = $1",
      [ids.uploadId],
    );
    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.kind).toBe("raw_minutes");
    expect(Number(ledger[0]!.minutes)).toBeCloseTo(duration / 60, 5);

    // Frontend-visible states are terminal and consistent.
    const { rows: projects } = await db.query<{ status: string }>(
      "select status from public.projects where id = $1",
      [ids.projectId],
    );
    expect(projects[0]!.status).toBe("ready");

    for (const key of [`transcribe:${ids.uploadId}`, `analyze:${ids.uploadId}`]) {
      const { rows: jobs } = await db.query<{ status: string }>(
        "select status from public.jobs where dedupe_key = $1",
        [key],
      );
      expect(jobs[0]!.status).toBe("done");
    }

    // First-draft EDL exists: v1, ai-sourced, with the fixture's hesitation
    // (اه) removed as filler and its 2.1s re-take gap NOT double-counted.
    const { rows: edls } = await db.query<{
      version: number;
      source: string;
      edl: { timeline: unknown[]; removed: { reason: string }[] };
    }>("select version, source, edl from public.edl_versions where project_id = $1", [
      ids.projectId,
    ]);
    expect(edls).toHaveLength(1);
    expect(edls[0]!.version).toBe(1);
    expect(edls[0]!.source).toBe("ai");
    expect(edls[0]!.edl.timeline.length).toBeGreaterThan(0);
    expect(edls[0]!.edl.removed.some((r) => r.reason === "filler")).toBe(true);
  }, 20_000);

  it("re-running the handler is idempotent (no duplicate ledger rows, stays ready)", async () => {
    const ids = await seedPipeline();
    const jobId = await db.enqueue("transcribe", payloadFor(ids), {
      dedupeKey: `transcribe:${ids.uploadId}`,
    });
    const { rows } = await db.query<{ id: string } & Record<string, unknown>>(
      "select * from public.jobs where id = $1",
      [jobId],
    );
    const job = rows[0]! as never;
    // Driven directly (not via processOne) — park it so it can't leak into
    // other tests' claims.
    await db.query("update public.jobs set status = 'done' where id = $1", [jobId]);

    const provider = new MockTranscriptionProvider(0);
    await transcribeWithProvider(job, provider);
    await transcribeWithProvider(job, provider); // duplicate delivery / retry

    const { rows: transcripts } = await db.query(
      "select id from public.transcripts where upload_id = $1",
      [ids.uploadId],
    );
    expect(transcripts).toHaveLength(1);

    const { rows: ledger } = await db.query(
      "select id from public.usage_ledger where upload_id = $1",
      [ids.uploadId],
    );
    expect(ledger).toHaveLength(1);

    // Handed off to analysis exactly once (deduped enqueue).
    const { rows: projects } = await db.query<{ status: string }>(
      "select status from public.projects where id = $1",
      [ids.projectId],
    );
    expect(projects[0]!.status).toBe("analyzing");

    const { rows: analyzeJobs } = await db.query(
      "select id from public.jobs where dedupe_key = $1",
      [`analyze:${ids.uploadId}`],
    );
    expect(analyzeJobs).toHaveLength(1);
    // Park it so it can't leak into other tests' claims.
    await db.query("update public.jobs set status = 'done' where dedupe_key = $1", [
      `analyze:${ids.uploadId}`,
    ]);
  });

  it("rejects over-long media permanently (server-side 10-minute enforcement)", async () => {
    const ids = await seedPipeline();
    const jobId = await db.enqueue("transcribe", payloadFor(ids), {
      dedupeKey: `transcribe:${ids.uploadId}`,
    });
    const { rows } = await db.query("select * from public.jobs where id = $1", [jobId]);
    await db.query("update public.jobs set status = 'done' where id = $1", [jobId]);

    const overLong: TranscriptionProvider = {
      name: "stub-overlong",
      async transcribe(): Promise<TranscriptionResult> {
        return {
          providerTranscriptId: "stub-1",
          languageCode: "ar",
          durationSeconds: 650, // > 600s cap
          text: "…",
          words: [],
          raw: {},
        };
      },
    };

    await transcribeWithProvider(rows[0] as never, overLong);

    const { rows: transcripts } = await db.query<{ status: string; error: string }>(
      "select status, error from public.transcripts where upload_id = $1",
      [ids.uploadId],
    );
    expect(transcripts[0]).toMatchObject({ status: "failed", error: "duration_exceeded" });

    const { rows: uploads } = await db.query<{ status: string }>(
      "select status from public.video_uploads where id = $1",
      [ids.uploadId],
    );
    expect(uploads[0]!.status).toBe("failed");

    const { rows: projects } = await db.query<{ status: string }>(
      "select status from public.projects where id = $1",
      [ids.projectId],
    );
    expect(projects[0]!.status).toBe("error");

    // No raw minutes billed for rejected media.
    const { rows: ledger } = await db.query(
      "select id from public.usage_ledger where upload_id = $1",
      [ids.uploadId],
    );
    expect(ledger).toHaveLength(0);
  });

  it("marks the project error when a job permanently exhausts retries", async () => {
    const ids = await seedPipeline();
    // analyze handler is a Phase 2 stub that throws — perfect permanent failure.
    await db.enqueue(
      "analyze",
      { transcriptId: crypto.randomUUID(), projectId: ids.projectId, ownerId: ids.ownerId },
      { dedupeKey: `analyze:${ids.uploadId}`, maxAttempts: 1, projectId: ids.projectId },
    );

    await processOne("w-e2e");

    const { rows: jobs } = await db.query<{ status: string }>(
      "select status from public.jobs where dedupe_key = $1",
      [`analyze:${ids.uploadId}`],
    );
    expect(jobs[0]!.status).toBe("failed");

    const { rows: projects } = await db.query<{ status: string }>(
      "select status from public.projects where id = $1",
      [ids.projectId],
    );
    expect(projects[0]!.status).toBe("error");
  });
});
