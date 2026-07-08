import { z } from "zod";

/**
 * EDL (Edit Decision List) v1 — the canonical, versioned representation of an
 * edit. Stored as jsonb in edl_versions.edl and validated on every read/write.
 *
 * Times are integer milliseconds relative to the SOURCE video. The output
 * timeline is derived by concatenating `timeline` segments in order (ripple
 * model): output time = sum of durations of preceding segments.
 *
 * v1 is single-track (video+audio locked together). J/L-cuts in Phase 5 will
 * introduce v2 with decoupled audio/video tracks; the `version` discriminator
 * exists so both can coexist during migration.
 */

/**
 * Timing rules for automatic edit generation (Phase 2 plan, informed by live
 * Arabic testing):
 *  - Interior word gaps longer than SILENCE_MIN_GAP_MS are removable silence.
 *  - SEGMENT_PAD_MS of breathing room is preserved around kept speech so
 *    cuts don't clip word onsets/tails.
 *  - Words below LOW_CONFIDENCE_THRESHOLD are filler/error CANDIDATES for AI
 *    review (live test: a hesitation merged into the next word at conf 0.36)
 *    — never auto-removed by confidence alone.
 */
export const SILENCE_MIN_GAP_MS = 800;
export const SEGMENT_PAD_MS = 120;
export const LOW_CONFIDENCE_THRESHOLD = 0.6;

export const aspectRatioSchema = z.enum(["9:16", "1:1", "16:9"]);
export type AspectRatio = z.infer<typeof aspectRatioSchema>;

export const removalReasonSchema = z.enum([
  "silence",
  "filler",
  "bad-take",
  "false-start",
  "user",
]);
export type RemovalReason = z.infer<typeof removalReasonSchema>;

const segmentBase = {
  /** Stable id so UI edits and AI suggestions can reference segments. */
  id: z.string().min(1),
  /** In-point in the source video, inclusive, ms. */
  sourceInMs: z.number().int().nonnegative(),
  /** Out-point in the source video, exclusive, ms. Must be > sourceInMs. */
  sourceOutMs: z.number().int().positive(),
  /** Word ids from transcripts.words covered by this segment, if speech. */
  wordIds: z.array(z.string()).optional(),
};

/** A segment that survives into the output, in output order. */
export const keptSegmentSchema = z
  .object(segmentBase)
  .refine((s) => s.sourceOutMs > s.sourceInMs, {
    message: "sourceOutMs must be greater than sourceInMs",
  });
export type KeptSegment = z.infer<typeof keptSegmentSchema>;

/** A segment the AI (or user) removed — kept for the review UI so removals
 *  are visible, explainable, and restorable. */
export const removedSegmentSchema = z
  .object({
    ...segmentBase,
    reason: removalReasonSchema,
    /** Model-facing explanation, e.g. "repeated take of sentence 4, weaker delivery". */
    note: z.string().optional(),
  })
  .refine((s) => s.sourceOutMs > s.sourceInMs, {
    message: "sourceOutMs must be greater than sourceInMs",
  });
export type RemovedSegment = z.infer<typeof removedSegmentSchema>;

export const edlV1Schema = z.object({
  version: z.literal(1),
  projectId: z.string().uuid(),
  sourceUploadId: z.string().uuid(),
  /** Ordered kept segments; concatenation = output video. */
  timeline: z.array(keptSegmentSchema),
  /** Removed material, restorable from the review UI. */
  removed: z.array(removedSegmentSchema),
  aspectRatio: aspectRatioSchema,
  /** Caption style token; see captions.ts. */
  captionStyle: z.string(),
});
export type EdlV1 = z.infer<typeof edlV1Schema>;

/** Total output duration in ms for an EDL. */
export function edlOutputDurationMs(edl: EdlV1): number {
  return edl.timeline.reduce((sum, s) => sum + (s.sourceOutMs - s.sourceInMs), 0);
}
