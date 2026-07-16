import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { stitchPayloadSchema, type JobRow } from "@merai/core";
import { getDb } from "../db";
import { env } from "../env";
import { PermanentJobError } from "../errors";
import { log } from "../logger";
import { getServiceClient } from "../storage";

const execFileAsync = promisify(execFile);

/** One normalize pass per scene must finish comfortably within this. */
const COMMAND_TIMEOUT_MS = 10 * 60 * 1000;

/** Normalization target: every scene becomes this before the -c copy join. */
const TARGET_W = 1280;
const TARGET_H = 720;

interface UploadRow {
  id: string;
  project_id: string;
  owner_id: string;
  storage_path: string;
  status: string;
}

export interface StitchDeps {
  /** Download a storage object ("{bucket}/{objectName}") to bytes. */
  fetchBytes(storagePath: string): Promise<Uint8Array>;
  /** Store bytes at a storage path (upsert). */
  storeBytes(storagePath: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** Normalize each scene and concat-join; returns the MP4 bytes. */
  runStitch(scenes: Uint8Array[]): Promise<Uint8Array>;
}

const defaultDeps: StitchDeps = {
  async fetchBytes(storagePath) {
    const slash = storagePath.indexOf("/");
    const { data, error } = await getServiceClient()
      .storage.from(storagePath.slice(0, slash))
      .download(storagePath.slice(slash + 1));
    if (error || !data) {
      throw new Error(`scene download failed for ${storagePath}: ${error?.message}`);
    }
    return new Uint8Array(await data.arrayBuffer());
  },
  async storeBytes(storagePath, bytes, contentType) {
    const slash = storagePath.indexOf("/");
    const { error } = await getServiceClient()
      .storage.from(storagePath.slice(0, slash))
      .upload(storagePath.slice(slash + 1), bytes, { contentType, upsert: true });
    if (error) {
      throw new Error(`stitched upload failed for ${storagePath}: ${error.message}`);
    }
  },
  runStitch: ffmpegStitch,
};

/**
 * Normalize-then-join (Build 7.4) — the export pipeline's proven memory
 * model, never one big filter graph (banned since the Phase 4 stress tests):
 * each scene gets ONE small ffmpeg run to the common target (letterboxed
 * 1280×720, 30fps, H.264 + AAC 48kHz stereo), then a concat-demuxer
 * `-c copy` join. Peak memory is bounded by one scene.
 */
async function ffmpegStitch(scenes: Uint8Array[]): Promise<Uint8Array> {
  const dir = await mkdtemp(join(tmpdir(), "merai-stitch-"));
  try {
    const run = (args: string[]) =>
      execFileAsync(env.ffmpegPath, ["-y", "-v", "error", ...args], {
        cwd: dir,
        timeout: COMMAND_TIMEOUT_MS,
        maxBuffer: 4 * 1024 * 1024,
      });

    const parts: string[] = [];
    for (let i = 0; i < scenes.length; i++) {
      const input = `scene-${i}.bin`;
      const output = `part-${i}.mp4`;
      await writeFile(join(dir, input), scenes[i]!);
      await run([
        "-i", input,
        "-vf",
        `scale=${TARGET_W}:${TARGET_H}:force_original_aspect_ratio=decrease,` +
          `pad=${TARGET_W}:${TARGET_H}:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p`,
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "23",
        "-c:a", "aac",
        "-b:a", "128k",
        "-ar", "48000",
        "-ac", "2",
        output,
      ]);
      await rm(join(dir, input), { force: true }); // lower the disk ceiling
      parts.push(output);
    }

    const list = parts.map((p) => `file '${p}'`).join("\n");
    await writeFile(join(dir, "list.txt"), `${list}\n`);
    await run(["-f", "concat", "-safe", "0", "-i", "list.txt", "-c", "copy", "out.mp4"]);
    return new Uint8Array(await readFile(join(dir, "out.mp4")));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function stitch(job: JobRow): Promise<void> {
  return stitchWithDeps(job, defaultDeps);
}

/** Deps-injectable core — PGlite tests drive this with fake storage/ffmpeg. */
export async function stitchWithDeps(job: JobRow, deps: StitchDeps): Promise<void> {
  const payload = stitchPayloadSchema.parse(job.payload);
  const db = getDb();

  const { rows: stitchedRows } = await db.query<UploadRow>(
    `select id, project_id, owner_id, storage_path, status
     from public.video_uploads where id = $1`,
    [payload.stitchedUploadId],
  );
  const stitched = stitchedRows[0];
  if (!stitched) {
    throw new PermanentJobError(`stitched upload ${payload.stitchedUploadId} not found`);
  }

  // Re-run after a partial failure? The bytes are in place — converge.
  if (stitched.status === "uploaded") {
    log.info(`stitch: upload ${stitched.id} already stitched — converging`);
    await handoffToTranscribe(stitched);
    return;
  }

  const { rows: scenes } = await db.query<UploadRow>(
    `select id, project_id, owner_id, storage_path, status
     from public.video_uploads where id = any($1::uuid[])`,
    [payload.uploadIds],
  );
  const byId = new Map(scenes.map((s) => [s.id, s]));
  const ordered = payload.uploadIds.map((id) => byId.get(id));
  for (let i = 0; i < ordered.length; i++) {
    const scene = ordered[i];
    if (!scene) {
      throw new PermanentJobError(`scene upload ${payload.uploadIds[i]} not found`);
    }
    if (scene.status !== "uploaded") {
      throw new PermanentJobError(
        `scene upload ${scene.id} is '${scene.status}', expected 'uploaded'`,
      );
    }
  }

  const sceneBytes: Uint8Array[] = [];
  for (const scene of ordered) {
    sceneBytes.push(await deps.fetchBytes(scene!.storage_path));
  }

  const started = Date.now();
  const out = await deps.runStitch(sceneBytes);
  log.info(
    `stitch: ${ordered.length} scenes → ${(out.length / (1024 * 1024)).toFixed(1)}MB in ${Math.round((Date.now() - started) / 1000)}s`,
  );

  await deps.storeBytes(stitched.storage_path, out, "video/mp4");

  await db.query(
    `update public.video_uploads set status = 'uploaded', size_bytes = $2, error = null
     where id = $1`,
    [stitched.id, out.length],
  );

  await handoffToTranscribe(stitched);
}

/** Same handoff `completeUpload` performs for single-source projects. */
async function handoffToTranscribe(
  stitched: Pick<UploadRow, "id" | "project_id" | "owner_id">,
): Promise<void> {
  const db = getDb();
  await db.query(
    `update public.projects set status = 'transcribing'
     where id = $1 and status = 'uploading'`,
    [stitched.project_id],
  );
  await db.query(
    `insert into public.jobs (type, payload, dedupe_key, owner_id, project_id)
     values ('transcribe', $1::jsonb, $2, $3, $4)
     on conflict (dedupe_key) do nothing`,
    [
      JSON.stringify({
        uploadId: stitched.id,
        projectId: stitched.project_id,
        ownerId: stitched.owner_id,
      }),
      `transcribe:${stitched.id}`,
      stitched.owner_id,
      stitched.project_id,
    ],
  );
}
