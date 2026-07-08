import { z } from "zod";
import type { TranscriptWord } from "@merai/core";

/**
 * Edit-analysis contract. Engines classify what should be removed from a
 * transcript; the EDL builder turns that into timeline segments. Two
 * implementations: Claude Haiku (context-aware) and a keyless heuristic
 * fallback (unambiguous hesitations only) — mirroring the transcription
 * provider pattern so the pipeline runs end-to-end without credentials.
 */

export const wordRangeSchema = z.object({
  /** Inclusive word-id range in transcript order (e.g. "w4" … "w9"). */
  startWordId: z.string().min(1),
  endWordId: z.string().min(1),
});
export type WordRange = z.infer<typeof wordRangeSchema>;

export const analysisResultSchema = z.object({
  /** Confirmed filler words, grouped so multi-word fillers stay together. */
  fillers: z.array(
    z.object({
      wordIds: z.array(z.string().min(1)).min(1),
      note: z.string().optional(),
    }),
  ),
  /** Abandoned sentence beginnings that get re-attempted. */
  falseStarts: z.array(
    z.object({
      ...wordRangeSchema.shape,
      note: z.string().optional(),
    }),
  ),
  /** Repeated deliveries of the same line; exactly one take is kept. */
  retakes: z.array(
    z.object({
      takes: z.array(wordRangeSchema).min(2),
      /** Index into takes of the strongest delivery (kept). */
      keepIndex: z.number().int().nonnegative(),
      note: z.string().optional(),
    }),
  ),
});
export type AnalysisResult = z.infer<typeof analysisResultSchema>;

export interface AnalysisInput {
  words: TranscriptWord[];
  languageCode: string | null;
}

export interface AnalysisEngine {
  readonly name: string;
  analyze(input: AnalysisInput): Promise<AnalysisResult>;
}
