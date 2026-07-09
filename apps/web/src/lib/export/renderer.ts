import { FFmpeg } from "@ffmpeg/ffmpeg";
import type { ExportPlan } from "./plan";

/**
 * ffmpeg.wasm orchestration (browser only). Single-threaded, self-hosted
 * core (see DECISIONS.md — COOP/COEP would break Supabase media loading).
 * The FFmpeg instance is reused across exports; the 32MB core loads once.
 */

export type ExportStage = "loading" | "downloading" | "rendering";

let instance: FFmpeg | null = null;

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

export async function renderExport(options: {
  videoUrl: string;
  plan: ExportPlan;
  captionImages: { name: string; data: Uint8Array }[];
  onStage: (stage: ExportStage) => void;
  onProgress: (ratio: number) => void;
}): Promise<Uint8Array> {
  options.onStage("loading");
  const ffmpeg = await getFFmpeg();

  options.onStage("downloading");
  const response = await fetch(options.videoUrl);
  if (!response.ok) throw new Error(`source fetch failed: ${response.status}`);
  const source = new Uint8Array(await response.arrayBuffer());

  const files = ["input.mp4", "out.mp4", ...options.captionImages.map((f) => f.name)];
  try {
    await ffmpeg.writeFile("input.mp4", source);
    for (const image of options.captionImages) {
      await ffmpeg.writeFile(image.name, image.data);
    }

    options.onStage("rendering");
    const onProgress = ({ progress }: { progress: number }) =>
      options.onProgress(Math.max(0, Math.min(1, progress)));
    ffmpeg.on("progress", onProgress);
    let exitCode: number;
    try {
      exitCode = await ffmpeg.exec(options.plan.args);
    } finally {
      ffmpeg.off("progress", onProgress);
    }
    if (exitCode !== 0) throw new Error(`ffmpeg exited with code ${exitCode}`);

    const output = await ffmpeg.readFile("out.mp4");
    if (typeof output === "string" || output.length === 0) {
      throw new Error("empty render output");
    }
    return output as Uint8Array;
  } finally {
    // Free wasm FS memory regardless of outcome.
    for (const file of files) {
      try {
        await ffmpeg.deleteFile(file);
      } catch {
        /* not written */
      }
    }
  }
}
