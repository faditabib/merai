import {
  buildExportPlan,
  renderExportPayloadSchema,
  transcriptWordsSchema,
  type AspectRatio,
  type EdlV1,
  type JobRow,
} from "@merai/core";
import { getDb } from "../db";
import { PermanentJobError } from "../errors";
import { log } from "../logger";
import { createSignedMediaUrl, getServiceClient } from "../storage";
import {
  renderBlankImage,
  renderCaptionImages,
  resolveStyleSpec,
} from "../render/captions";
import { createRenderEngine, RenderAbortedError, type RenderEngine } from "../render/index";

const EXPORTS_BUCKET = "exports";

/**
 * Part size for the over-cap download fallback: safely under the Supabase
 * free-tier 50MB per-file limit so parts always store even before the plan
 * upgrade.
 */
export const EXPORT_PART_BYTES = 45 * 1024 * 1024;

/** Storage rejected the object for size — retrying the same upload cannot succeed. */
export class OutputTooLargeError extends Error {}

interface ExportRow {
  id: string;
  project_id: string;
  owner_id: string;
  edl_version_id: string;
  status: string;
  cancel_requested: boolean;
  aspect_ratio: AspectRatio;
  caption_style: string;
}

/** Injectable side effects so tests never touch storage or real ffmpeg. */
export interface RenderExportDeps {
  signSourceUrl: (storagePath: string) => Promise<string>;
  uploadOutput: (objectPath: string, bytes: Uint8Array) => Promise<void>;
}

const defaultDeps: RenderExportDeps = {
  signSourceUrl: (storagePath) => createSignedMediaUrl(storagePath, 7200),
  uploadOutput: async (objectPath, bytes) => {
    const { error } = await getServiceClient()
      .storage.from(EXPORTS_BUCKET)
      .upload(objectPath, new Blob([bytes.buffer as ArrayBuffer], { type: "video/mp4" }), {
        contentType: "video/mp4",
        upsert: true,
      });
    if (error) {
      // Live-observed message for the per-file cap: "The object exceeded the
      // maximum allowed size". Classified so the handler can fall back to
      // parts instead of burning retries on a deterministic rejection.
      if (/exceeded the maximum allowed size/i.test(error.message)) {
        throw new OutputTooLargeError(`output upload failed: ${error.message}`);
      }
      throw new Error(`output upload failed: ${error.message}`);
    }
  },
};

export async function renderExport(job: JobRow): Promise<void> {
  const payload = renderExportPayloadSchema.parse(job.payload);
  return renderExportWithEngine(
    job,
    createRenderEngine(`${payload.ownerId}/${payload.exportId}/work`),
    defaultDeps,
  );
}

/**
 * Render an export server-side. Idempotent: already-uploaded exports are
 * skipped; retries after a mid-flight crash re-render (frames are cheap,
 * correctness first). Cancellation: exports.cancel_requested is polled
 * between segments (≈13 checkpoints on a full edit) and finishes the job as
 * status 'cancelled' — a completed outcome, not a retryable failure.
 */
export async function renderExportWithEngine(
  job: JobRow,
  engine: RenderEngine,
  deps: RenderExportDeps,
): Promise<void> {
  const payload = renderExportPayloadSchema.parse(job.payload);
  const db = getDb();

  const { rows: exportRows } = await db.query<ExportRow>(
    `select id, project_id, owner_id, edl_version_id, status, cancel_requested,
            aspect_ratio, caption_style
     from public.exports where id = $1`,
    [payload.exportId],
  );
  const exportRow = exportRows[0];
  if (!exportRow) throw new PermanentJobError(`export ${payload.exportId} not found`);

  if (exportRow.status === "uploaded") {
    log.info(`render: export ${exportRow.id} already uploaded — skipping`);
    return;
  }
  const markCancelled = async () => {
    await db.query(
      "update public.exports set status = 'cancelled' where id = $1",
      [exportRow.id],
    );
    log.info(`render: export ${exportRow.id} cancelled`);
  };
  if (exportRow.cancel_requested) {
    await markCancelled();
    return;
  }

  const { rows: edlRows } = await db.query<{ edl: EdlV1 }>(
    "select edl from public.edl_versions where id = $1",
    [exportRow.edl_version_id],
  );
  if (!edlRows[0])
    throw new PermanentJobError(`edl version ${exportRow.edl_version_id} not found`);
  // The exports row records what the user requested at export time.
  const edl: EdlV1 = {
    ...edlRows[0].edl,
    aspectRatio: exportRow.aspect_ratio,
    captionStyle: exportRow.caption_style,
  };

  const { rows: transcriptRows } = await db.query<{ words: unknown }>(
    "select words from public.transcripts where project_id = $1",
    [exportRow.project_id],
  );
  const words = transcriptWordsSchema.parse(transcriptRows[0]?.words ?? []);

  const { rows: uploadRows } = await db.query<{ storage_path: string }>(
    `select storage_path from public.video_uploads
     where project_id = $1 order by created_at desc limit 1`,
    [exportRow.project_id],
  );
  if (!uploadRows[0])
    throw new PermanentJobError(`no upload for project ${exportRow.project_id}`);

  await db.query(
    "update public.exports set status = 'rendering', progress = 0 where id = $1",
    [exportRow.id],
  );

  const plan = buildExportPlan({ edl, words });
  const captionImages = renderCaptionImages(
    plan.captions,
    resolveStyleSpec(exportRow.caption_style),
    plan.width,
    plan.height,
  );
  if (plan.captions.length > 0) {
    captionImages.push(renderBlankImage(plan.width, plan.height));
  }

  let bytes: Uint8Array;
  try {
    bytes = await engine.render({
      plan,
      sourceUrl: await deps.signSourceUrl(uploadRows[0].storage_path),
      captionImages,
      onProgress: async (ratio) => {
        await db.query("update public.exports set progress = $2 where id = $1", [
          exportRow.id,
          Math.min(1, Math.max(0, ratio)),
        ]);
      },
      shouldAbort: async () => {
        const { rows } = await db.query<{ cancel_requested: boolean }>(
          "select cancel_requested from public.exports where id = $1",
          [exportRow.id],
        );
        return rows[0]?.cancel_requested === true;
      },
    });
  } catch (err) {
    if (err instanceof RenderAbortedError) {
      await markCancelled();
      return;
    }
    throw err; // transient → queue retry; permanent failure marks the row (runner)
  }

  const objectPath = `${exportRow.owner_id}/${exportRow.id}.mp4`;
  let parts = 1;
  try {
    await deps.uploadOutput(objectPath, bytes);
  } catch (err) {
    if (!(err instanceof OutputTooLargeError)) throw err;
    if (bytes.length <= EXPORT_PART_BYTES) {
      // Splitting can't produce anything smaller than the rejected object —
      // the bucket's cap is below the fallback's part size.
      throw new PermanentJobError(err.message, { cause: err });
    }
    // Download fallback: the render succeeded — store the file as .partN
    // objects under the per-file cap; the browser reassembles on download.
    parts = Math.ceil(bytes.length / EXPORT_PART_BYTES);
    log.warn(
      `render: export ${exportRow.id} output ${(bytes.length / 1024 / 1024).toFixed(1)}MB is over the storage per-file cap — storing as ${parts} parts`,
    );
    try {
      for (let i = 0; i < parts; i++) {
        // slice (not subarray): the copy owns an exactly-sized buffer, which
        // uploadOutput turns into a Blob via .buffer.
        await deps.uploadOutput(
          `${objectPath}.part${i}`,
          bytes.slice(i * EXPORT_PART_BYTES, Math.min((i + 1) * EXPORT_PART_BYTES, bytes.length)),
        );
      }
    } catch (partErr) {
      if (partErr instanceof OutputTooLargeError) {
        // Even a 45MB part is rejected — the bucket cap is set lower than
        // the fallback assumes. No retry can fix that.
        throw new PermanentJobError(partErr.message, { cause: partErr });
      }
      throw partErr;
    }
  }

  await db.query(
    `update public.exports
     set status = 'uploaded', progress = 1,
         storage_path = $2, size_bytes = $3, duration_seconds = $4, parts = $5, error = null
     where id = $1`,
    [
      exportRow.id,
      `${EXPORTS_BUCKET}/${objectPath}`,
      bytes.length,
      plan.outputDurationMs / 1000,
      parts,
    ],
  );
  log.info(
    `render: export ${exportRow.id} uploaded (${(bytes.length / 1024 / 1024).toFixed(1)}MB, ${(plan.outputDurationMs / 1000).toFixed(1)}s, parts=${parts}, engine=${engine.name})`,
  );
}
