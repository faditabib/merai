import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { env } from "../env";
import { log } from "../logger";
import {
  RenderAbortedError,
  type RenderEngine,
  type RenderRequest,
} from "./types";

const execFileAsync = promisify(execFile);

/** Generous per-command ceiling; a full 10-min segment renders in seconds
 *  natively but leave headroom for slow shared vCPUs. */
const COMMAND_TIMEOUT_MS = 15 * 60_000;

/**
 * Default engine: ffmpeg on the worker itself (zero marginal cost, media
 * never leaves our storage↔worker path). Executes the segment-wise plan in a
 * temp dir: per-segment input-seeked encodes, then the -c copy join.
 * Requires the ffmpeg binary (Dockerfile installs it; FFMPEG_PATH overrides).
 */
export class LocalFfmpegEngine implements RenderEngine {
  readonly name = "local-ffmpeg";

  async render(request: RenderRequest): Promise<Uint8Array> {
    const { plan } = request;
    const dir = await mkdtemp(join(tmpdir(), "merai-render-"));
    try {
      // Materialize inputs.
      const response = await fetch(request.sourceUrl);
      if (!response.ok) {
        throw new Error(`source fetch failed: ${response.status}`);
      }
      await writeFile(
        join(dir, "input.mp4"),
        new Uint8Array(await response.arrayBuffer()),
      );
      for (const image of request.captionImages) {
        await writeFile(join(dir, image.name), image.data);
      }

      const run = async (args: string[]) => {
        await execFileAsync(env.ffmpegPath, ["-y", "-v", "error", ...args], {
          cwd: dir,
          timeout: COMMAND_TIMEOUT_MS,
          maxBuffer: 4 * 1024 * 1024,
        });
      };

      const totalMs =
        plan.segments.reduce((sum, s) => sum + s.durationMs, 0) || 1;
      let completedMs = 0;

      for (const step of plan.segments) {
        if (request.shouldAbort && (await request.shouldAbort())) {
          throw new RenderAbortedError();
        }
        if (step.captionsFile && step.captionsScript) {
          await writeFile(join(dir, step.captionsFile), step.captionsScript);
        }
        const startedAt = Date.now();
        await run(step.args);
        completedMs += step.durationMs;
        log.info(
          `render: seg${step.index} (${(step.durationMs / 1000).toFixed(1)}s) in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
        );
        await request.onProgress?.(Math.min(1, completedMs / totalMs));
      }

      if (request.shouldAbort && (await request.shouldAbort())) {
        throw new RenderAbortedError();
      }
      await writeFile(join(dir, plan.joinFile), plan.joinScript);
      await run(plan.joinArgs);

      const output = await readFile(join(dir, "out.mp4"));
      if (output.length === 0) throw new Error("empty render output");
      return new Uint8Array(output);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
