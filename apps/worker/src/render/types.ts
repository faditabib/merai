import type { ExportPlan } from "@merai/core";

/**
 * Render-engine contract — same pattern as TranscriptionProvider and
 * AnalysisEngine: a keyless local default plus an env-key-activated managed
 * provider, selected in ./index.ts.
 */

export interface RenderRequest {
  plan: ExportPlan;
  /** Signed URL for the source video (input.mp4). */
  sourceUrl: string;
  /** Caption PNGs (incl. the blank gap filler) referenced by the plan. */
  captionImages: { name: string; data: Uint8Array }[];
  /** Called with 0..1 as segments complete (13 checkpoints on a full edit). */
  onProgress?: (ratio: number) => void | Promise<void>;
  /** Polled between segments; true aborts the render. */
  shouldAbort?: () => Promise<boolean>;
}

export class RenderAbortedError extends Error {
  constructor() {
    super("render aborted");
    this.name = "RenderAbortedError";
  }
}

export interface RenderEngine {
  readonly name: string;
  /** Resolves to the final MP4 bytes. */
  render(request: RenderRequest): Promise<Uint8Array>;
}
