import { env } from "../env";
import { log } from "../logger";
import { LocalFfmpegEngine } from "./local-ffmpeg";
import { VeryGoodFfmpegEngine } from "./verygoodffmpeg";
import type { RenderEngine } from "./types";

export { RenderAbortedError } from "./types";
export type { RenderEngine, RenderRequest } from "./types";

/**
 * Engine selection — the ONLY place the Very Good FFmpeg key is read.
 * Local ffmpeg (zero marginal cost, media stays in our storage↔worker path)
 * is the default; setting VERYGOODFFMPEG_API_KEY switches to the managed
 * provider with zero code changes. RENDER_ENGINE=local|verygoodffmpeg
 * overrides. Same pattern as transcription and analysis.
 */
export function createRenderEngine(workPrefix: string): RenderEngine {
  const forced = process.env.RENDER_ENGINE;

  if (forced === "local") return new LocalFfmpegEngine();

  if (env.verygoodFfmpegApiKey) {
    return new VeryGoodFfmpegEngine(env.verygoodFfmpegApiKey, workPrefix);
  }

  if (forced === "verygoodffmpeg") {
    throw new Error("RENDER_ENGINE=verygoodffmpeg but VERYGOODFFMPEG_API_KEY is not set");
  }

  log.info("render engine: local ffmpeg (set VERYGOODFFMPEG_API_KEY to use the managed provider)");
  return new LocalFfmpegEngine();
}
