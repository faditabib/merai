import {
  MAX_RAW_UPLOAD_SECONDS,
  transcribePayloadSchema,
  type JobRow,
} from "@merai/core";
import { getDb } from "../db";
import { log } from "../logger";
import { createSignedMediaUrl } from "../storage";
import { createTranscriptionProvider } from "../transcription/index";
import type { TranscriptionProvider } from "../transcription/types";

interface UploadRow {
  id: string;
  project_id: string;
  owner_id: string;
  storage_path: string;
  status: string;
}

interface ProjectRow {
  id: string;
  source_language: "ar" | "en" | "auto";
  status: string;
}

/**
 * Transcribe a raw upload. Idempotent: re-running after a partial failure
 * (or a duplicate enqueue) converges on the same state — the transcript row
 * is upserted by upload_id and usage metering is deduplicated by a unique
 * index. Business rejections (e.g. over-long media) complete the job and
 * record the failure on domain rows; only transient errors throw (→ retry).
 */
export async function transcribe(job: JobRow): Promise<void> {
  return transcribeWithProvider(job, createTranscriptionProvider());
}

/** Provider-injectable core — tests drive this with stub providers. */
export async function transcribeWithProvider(
  job: JobRow,
  provider: TranscriptionProvider,
): Promise<void> {
  const payload = transcribePayloadSchema.parse(job.payload);
  const db = getDb();

  const { rows: uploads } = await db.query<UploadRow>(
    `select id, project_id, owner_id, storage_path, status
     from public.video_uploads where id = $1`,
    [payload.uploadId],
  );
  const upload = uploads[0];
  if (!upload) throw new Error(`upload ${payload.uploadId} not found`);

  // Already done on a previous attempt? Hand off to analysis and exit.
  const { rows: existing } = await db.query<{ id: string; status: string }>(
    "select id, status from public.transcripts where upload_id = $1",
    [upload.id],
  );
  if (existing[0]?.status === "completed") {
    log.info(`transcribe: upload ${upload.id} already transcribed — converging`);
    await enqueueAnalyze(upload, existing[0].id);
    return;
  }

  const { rows: projects } = await db.query<ProjectRow>(
    "select id, source_language, status from public.projects where id = $1",
    [upload.project_id],
  );
  const project = projects[0];
  if (!project) throw new Error(`project ${upload.project_id} not found`);

  const { rows: upserted } = await db.query<{ id: string }>(
    `insert into public.transcripts (upload_id, project_id, owner_id, provider, status)
     values ($1, $2, $3, $4, 'processing')
     on conflict (upload_id)
     do update set status = 'processing', provider = excluded.provider, error = null
     returning id`,
    [upload.id, upload.project_id, upload.owner_id, provider.name],
  );
  const transcriptId = upserted[0]!.id;

  const result = await provider.transcribe({
    uploadId: upload.id,
    languageHint: project.source_language,
    getAudioUrl: () => createSignedMediaUrl(upload.storage_path),
  });

  // Authoritative duration check — client-side probing is UX only. Small
  // slack for container-metadata rounding differences.
  if (
    result.durationSeconds != null &&
    result.durationSeconds > MAX_RAW_UPLOAD_SECONDS + 2
  ) {
    log.warn(
      `transcribe: upload ${upload.id} is ${result.durationSeconds}s — over the ${MAX_RAW_UPLOAD_SECONDS}s cap, rejecting`,
    );
    await db.query(
      `update public.transcripts set status = 'failed', error = 'duration_exceeded'
       where upload_id = $1`,
      [upload.id],
    );
    await db.query(
      `update public.video_uploads set status = 'failed', error = 'duration_exceeded'
       where id = $1`,
      [upload.id],
    );
    await db.query("update public.projects set status = 'error' where id = $1", [
      upload.project_id,
    ]);
    return; // permanent business failure — no retry
  }

  await db.query(
    `update public.transcripts
     set status = 'completed',
         provider_transcript_id = $2,
         language_code = $3,
         text = $4,
         words = $5,
         raw = $6,
         error = null
     where upload_id = $1`,
    [
      upload.id,
      result.providerTranscriptId,
      result.languageCode,
      result.text,
      JSON.stringify(result.words),
      JSON.stringify(result.raw),
    ],
  );

  if (result.durationSeconds != null) {
    // Provider-measured duration is authoritative; also meter raw minutes
    // (STT is billed on raw footage — PRD §7). Unique index on upload_id
    // makes the ledger insert idempotent across retries.
    await db.query(
      "update public.video_uploads set duration_seconds = $2 where id = $1",
      [upload.id, result.durationSeconds],
    );
    await db.query(
      `insert into public.usage_ledger (owner_id, kind, minutes, upload_id, billing_period)
       values ($1, 'raw_minutes', $2, $3, date_trunc('month', now() at time zone 'utc')::date)
       on conflict (upload_id) do nothing`,
      [upload.owner_id, result.durationSeconds / 60, upload.id],
    );
  } else {
    log.warn(
      `transcribe: provider reported no duration for upload ${upload.id} — raw minutes not metered`,
    );
  }

  // Hand off to the analysis stage (Phase 2): analyzing → ready.
  await enqueueAnalyze(upload, transcriptId);

  log.info(
    `transcribe: upload ${upload.id} completed (${result.words.length} words, lang=${result.languageCode ?? "?"}, provider=${provider.name}) — analysis enqueued`,
  );
}

/** Enqueue the analyze job (deduped per upload) and move the project into
 *  'analyzing'. The analyze handler converges to 'ready'. */
async function enqueueAnalyze(
  upload: Pick<UploadRow, "id" | "project_id" | "owner_id">,
  transcriptId: string,
): Promise<void> {
  const db = getDb();
  await db.query(
    `insert into public.jobs (type, payload, dedupe_key, owner_id, project_id)
     values ('analyze', $1::jsonb, $2, $3, $4)
     on conflict (dedupe_key) do nothing`,
    [
      JSON.stringify({
        transcriptId,
        projectId: upload.project_id,
        ownerId: upload.owner_id,
      }),
      `analyze:${upload.id}`,
      upload.owner_id,
      upload.project_id,
    ],
  );
  await db.query(
    `update public.projects set status = 'analyzing'
     where id = $1 and status = 'transcribing'`,
    [upload.project_id],
  );
}
