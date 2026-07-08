import {
  analyzePayloadSchema,
  DEFAULT_CAPTION_STYLE,
  transcriptWordsSchema,
  type AspectRatio,
  type JobRow,
} from "@merai/core";
import { createAnalysisEngine, type AnalysisEngine } from "../analysis/index";
import { getDb } from "../db";
import { buildEdl } from "../edl/build-edl";
import { log } from "../logger";

interface TranscriptRow {
  id: string;
  upload_id: string;
  project_id: string;
  owner_id: string;
  status: string;
  language_code: string | null;
  words: unknown;
}

/**
 * Analyze a completed transcript and produce the first-draft EDL (v1,
 * source='ai'): silence + confirmed fillers + false starts + weaker takes
 * removed. Idempotent — if EDL v1 already exists the handler converges the
 * project to 'ready' and exits; the analysis result is persisted on the
 * transcript so retries after the EDL insert never re-bill the model.
 */
export async function analyze(job: JobRow): Promise<void> {
  return analyzeWithEngine(job, createAnalysisEngine());
}

/** Engine-injectable core — tests drive this with stub engines. */
export async function analyzeWithEngine(
  job: JobRow,
  engine: AnalysisEngine,
): Promise<void> {
  const payload = analyzePayloadSchema.parse(job.payload);
  const db = getDb();

  // Already produced? Converge and exit (job retry / duplicate enqueue).
  const { rows: existingEdl } = await db.query(
    "select id from public.edl_versions where project_id = $1 and version = 1",
    [payload.projectId],
  );
  if (existingEdl.length > 0) {
    log.info(`analyze: EDL v1 already exists for project ${payload.projectId} — converging`);
    await db.query(
      "update public.projects set status = 'ready' where id = $1 and status = 'analyzing'",
      [payload.projectId],
    );
    return;
  }

  const { rows: transcripts } = await db.query<TranscriptRow>(
    `select id, upload_id, project_id, owner_id, status, language_code, words
     from public.transcripts where id = $1`,
    [payload.transcriptId],
  );
  const transcript = transcripts[0];
  if (!transcript) throw new Error(`transcript ${payload.transcriptId} not found`);
  if (transcript.status !== "completed") {
    throw new Error(
      `transcript ${transcript.id} is "${transcript.status}", expected completed`,
    );
  }

  const words = transcriptWordsSchema.parse(transcript.words ?? []);

  const { rows: projects } = await db.query<{ default_aspect_ratio: AspectRatio }>(
    "select default_aspect_ratio from public.projects where id = $1",
    [transcript.project_id],
  );
  const project = projects[0];
  if (!project) throw new Error(`project ${transcript.project_id} not found`);

  const { rows: uploads } = await db.query<{ duration_seconds: string | null }>(
    "select duration_seconds from public.video_uploads where id = $1",
    [transcript.upload_id],
  );
  const durationSeconds = uploads[0]?.duration_seconds;

  const analysis = await engine.analyze({
    words,
    languageCode: transcript.language_code,
  });

  // Persist before building the EDL: a failure past this point retries
  // without re-billing the model (idempotency + cost).
  await db.query(
    "update public.transcripts set analysis = $2 where id = $1",
    [transcript.id, JSON.stringify({ engine: engine.name, result: analysis })],
  );

  const edl = buildEdl({
    projectId: transcript.project_id,
    sourceUploadId: transcript.upload_id,
    words,
    analysis,
    aspectRatio: project.default_aspect_ratio,
    captionStyle: DEFAULT_CAPTION_STYLE,
    totalDurationMs:
      durationSeconds != null ? Math.round(Number(durationSeconds) * 1000) : null,
  });

  await db.query(
    `insert into public.edl_versions (project_id, owner_id, version, source, edl)
     values ($1, $2, 1, 'ai', $3)
     on conflict (project_id, version) do nothing`,
    [transcript.project_id, transcript.owner_id, JSON.stringify(edl)],
  );

  await db.query("update public.projects set status = 'ready' where id = $1", [
    transcript.project_id,
  ]);

  log.info(
    `analyze: project ${transcript.project_id} ready — ${edl.timeline.length} kept segments, ${edl.removed.length} removals (engine=${engine.name})`,
  );
}
