import { FFmpeg } from "@ffmpeg/ffmpeg";
import type { ExportPlan } from "./plan";

/**
 * ffmpeg.wasm orchestration (browser only). Single-threaded, self-hosted
 * core (see DECISIONS.md — COOP/COEP would break Supabase media loading).
 *
 * Execution is SEGMENT-WISE (see plan.ts): one small input-seeked ffmpeg run
 * per kept segment, then a -c copy join. Peak memory is bounded by one
 * segment's pipeline plus the files sitting in the wasm FS; the source and
 * caption images are deleted before the join to keep the ceiling low.
 */

export type ExportStage = "loading" | "downloading" | "rendering";

export class ExportCancelledError extends Error {
  constructor() {
    super("export cancelled");
    this.name = "ExportCancelledError";
  }
}

let instance: FFmpeg | null = null;
let activeAbort: AbortController | null = null;
let cancelled = false;

/**
 * Abort the in-flight export: interrupts the source download and terminates
 * the wasm core (the only way to stop a running exec). The core reloads on
 * the next export.
 */
export function cancelActiveExport(): void {
  cancelled = true;
  activeAbort?.abort();
  if (instance) {
    try {
      instance.terminate();
    } catch {
      /* already dead */
    }
    instance = null;
  }
}

async function getFFmpeg(): Promise<FFmpeg> {
  if (instance?.loaded) return instance;
  const ffmpeg = instance ?? new FFmpeg();
  await ffmpeg.load({
    coreURL: "/ffmpeg/ffmpeg-core.js",
    wasmURL: "/ffmpeg/ffmpeg-core.wasm",
  });
  instance = ffmpeg;
  return ffmpeg;
}

async function deleteQuietly(ffmpeg: FFmpeg, files: Iterable<string>) {
  for (const file of files) {
    try {
      await ffmpeg.deleteFile(file);
    } catch {
      /* not written or core gone */
    }
  }
}

export async function renderExport(options: {
  videoUrl: string;
  plan: ExportPlan;
  captionImages: { name: string; data: Uint8Array }[];
  onStage: (stage: ExportStage) => void;
  onProgress: (ratio: number) => void;
}): Promise<Uint8Array> {
  const { plan } = options;
  cancelled = false;
  activeAbort = new AbortController();
  const throwIfCancelled = () => {
    if (cancelled) throw new ExportCancelledError();
  };

  options.onStage("loading");
  const ffmpeg = await getFFmpeg();
  throwIfCancelled();

  options.onStage("downloading");
  let source: Uint8Array;
  try {
    const response = await fetch(options.videoUrl, { signal: activeAbort.signal });
    if (!response.ok) throw new Error(`source fetch failed: ${response.status}`);
    source = new Uint8Array(await response.arrayBuffer());
  } catch (err) {
    if (cancelled) throw new ExportCancelledError();
    throw err;
  }
  throwIfCancelled();

  // Everything we may write, for unconditional cleanup.
  const written = new Set<string>(["input.mp4", "out.mp4", plan.joinFile]);
  for (const image of options.captionImages) written.add(image.name);
  for (const step of plan.segments) {
    written.add(step.outputFile);
    if (step.captionsFile) written.add(step.captionsFile);
  }

  const encoder = new TextEncoder();
  const totalMs = plan.segments.reduce((sum, s) => sum + s.durationMs, 0) || 1;

  try {
    await ffmpeg.writeFile("input.mp4", source);
    for (const image of options.captionImages) {
      await ffmpeg.writeFile(image.name, image.data);
    }

    options.onStage("rendering");
    let completedMs = 0;

    const exec = async (args: string[], stepDurationMs: number | null) => {
      const onProgress = ({ progress, time }: { progress: number; time: number }) => {
        if (stepDurationMs == null) return;
        // `time` is the segment's out_time in µs — reliable per-step signal
        // (the wrapper's `progress` ratio is relative to the FULL input
        // duration, which is wrong for seeked runs).
        const stepMs =
          Number.isFinite(time) && time > 0
            ? Math.min(stepDurationMs, time / 1000)
            : Math.min(1, Math.max(0, progress)) * stepDurationMs;
        options.onProgress(Math.min(1, (completedMs + stepMs) / totalMs));
      };
      ffmpeg.on("progress", onProgress);
      let exitCode: number;
      try {
        exitCode = await ffmpeg.exec(args);
      } catch (err) {
        if (cancelled) throw new ExportCancelledError();
        throw err;
      } finally {
        try {
          ffmpeg.off("progress", onProgress);
        } catch {
          /* core terminated */
        }
      }
      throwIfCancelled();
      if (exitCode !== 0) {
        throw new Error(`ffmpeg exited with code ${exitCode} (${args.join(" ").slice(0, 120)}…)`);
      }
    };

    // Per-segment renders — the only place real encoding happens.
    for (const step of plan.segments) {
      throwIfCancelled();
      if (step.captionsFile && step.captionsScript) {
        await ffmpeg.writeFile(step.captionsFile, encoder.encode(step.captionsScript));
      }
      await exec(step.args, step.durationMs);
      completedMs += step.durationMs;
      options.onProgress(Math.min(1, completedMs / totalMs));
      if (step.captionsFile) await deleteQuietly(ffmpeg, [step.captionsFile]);
    }

    // Free the source + caption images before the join to lower the ceiling.
    await deleteQuietly(ffmpeg, [
      "input.mp4",
      ...options.captionImages.map((f) => f.name),
    ]);

    // Join: pure remux of the segment files.
    await ffmpeg.writeFile(plan.joinFile, encoder.encode(plan.joinScript));
    await exec(plan.joinArgs, null);

    const output = await ffmpeg.readFile("out.mp4");
    if (typeof output === "string" || output.length === 0) {
      throw new Error("empty render output");
    }
    return output as Uint8Array;
  } finally {
    activeAbort = null;
    if (!cancelled) await deleteQuietly(ffmpeg, written);
  }
}
