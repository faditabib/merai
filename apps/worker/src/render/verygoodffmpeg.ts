import { setTimeout as sleep } from "node:timers/promises";
import { log } from "../logger";
import { getServiceClient } from "../storage";
import {
  RenderAbortedError,
  type RenderEngine,
  type RenderRequest,
} from "./types";

const API_BASE = "https://verygoodffmpeg.com/api";
const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 30 * 60_000;
const EXPORTS_BUCKET = "exports";

/**
 * Managed provider: Very Good FFmpeg (chosen over Rendi — official SDK
 * exists, 6h job runtime vs Rendi's 1-10min caps, $0.50→$0.08/GB tiers; see
 * DECISIONS.md). Wired against their DOCUMENTED REST surface (bearer auth,
 * POST /api/ffmpeg with input_files URL map + {{templated}} ffmpeg_commands
 * + output_files, GET /api/jobs/{id}) rather than the npm SDK, whose README
 * was not reachable for verification.
 *
 * ⚠️ UNVERIFIED LIVE — activates via VERYGOODFFMPEG_API_KEY (no account
 * exists yet). Expect the same class of first-call discoveries as the
 * AssemblyAI speech_models incident; the LocalFfmpegEngine remains the
 * default until this is exercised.
 *
 * Caption PNGs/scripts are staged under exports/{workPrefix}/ in our own
 * storage and handed over as signed URLs (their documented input model),
 * then cleaned up.
 */
export class VeryGoodFfmpegEngine implements RenderEngine {
  readonly name = "verygoodffmpeg";

  constructor(
    private readonly apiKey: string,
    private readonly workPrefix: string,
  ) {}

  async render(request: RenderRequest): Promise<Uint8Array> {
    const { plan } = request;
    const storage = getServiceClient().storage.from(EXPORTS_BUCKET);
    const staged: string[] = [];

    const stage = async (name: string, data: Uint8Array | string) => {
      const path = `${this.workPrefix}/${name}`;
      const body = typeof data === "string" ? new TextEncoder().encode(data) : data;
      const { error } = await storage.upload(path, new Blob([body.buffer as ArrayBuffer]), {
        upsert: true,
      });
      if (error) throw new Error(`staging ${name} failed: ${error.message}`);
      staged.push(path);
      const { data: signed, error: signError } = await storage.createSignedUrl(path, 3600);
      if (signError || !signed) throw new Error(`signing ${name} failed`);
      return signed.signedUrl;
    };

    try {
      // Known file tokens → {{templated}} references in commands.
      const inputFiles: Record<string, string> = { "input.mp4": request.sourceUrl };
      for (const image of request.captionImages) {
        inputFiles[image.name] = await stage(image.name, image.data);
      }
      for (const step of plan.segments) {
        if (step.captionsFile && step.captionsScript) {
          inputFiles[step.captionsFile] = await stage(step.captionsFile, step.captionsScript);
        }
      }
      inputFiles[plan.joinFile] = await stage(plan.joinFile, plan.joinScript);

      const knownFiles = new Set([
        ...Object.keys(inputFiles),
        ...plan.segments.map((s) => s.outputFile),
        "out.mp4",
      ]);
      const toCommand = (args: string[]) =>
        args.map((arg) => (knownFiles.has(arg) ? `{{${arg}}}` : arg)).join(" ");

      const submit = await this.request<{ id: string }>("POST", "/ffmpeg", {
        input_files: inputFiles,
        ffmpeg_commands: [
          ...plan.segments.map((s) => toCommand(s.args)),
          toCommand(plan.joinArgs),
        ],
        output_files: ["out.mp4"],
        timeout_seconds: Math.round(POLL_TIMEOUT_MS / 1000),
      });
      log.info(`verygoodffmpeg: submitted job ${submit.id}`);

      const outputUrl = await this.pollUntilDone(submit.id, request);
      const download = await fetch(outputUrl);
      if (!download.ok) throw new Error(`output fetch failed: ${download.status}`);
      return new Uint8Array(await download.arrayBuffer());
    } finally {
      if (staged.length > 0) await storage.remove(staged).catch(() => undefined);
    }
  }

  private async pollUntilDone(id: string, request: RenderRequest): Promise<string> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (request.shouldAbort && (await request.shouldAbort())) {
        // Best-effort remote cancel; endpoint shape unverified.
        await this.request("POST", `/jobs/${id}/cancel`, {}).catch(() => undefined);
        throw new RenderAbortedError();
      }
      const job = await this.request<{
        status: string;
        progress?: number;
        outputs?: Record<string, string>;
        output_files?: Record<string, string>;
        error?: string;
      }>("GET", `/jobs/${id}`);

      if (typeof job.progress === "number") {
        await request.onProgress?.(Math.min(1, Math.max(0, job.progress)));
      }
      const status = job.status?.toLowerCase();
      if (status === "completed" || status === "succeeded" || status === "success") {
        const url = job.outputs?.["out.mp4"] ?? job.output_files?.["out.mp4"];
        if (!url) throw new Error("job completed but no out.mp4 URL returned");
        return url;
      }
      if (status === "failed" || status === "error" || status === "cancelled") {
        throw new Error(`verygoodffmpeg job ${status}: ${job.error ?? "unknown"}`);
      }
      await sleep(POLL_INTERVAL_MS);
    }
    throw new Error(`verygoodffmpeg job ${id} timed out`);
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `verygoodffmpeg ${method} ${path} failed with ${response.status}: ${detail.slice(0, 400)}`,
      );
    }
    return (await response.json()) as T;
  }
}
