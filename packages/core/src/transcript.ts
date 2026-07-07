import { z } from "zod";

/**
 * Provider-agnostic word-level transcript shape stored in transcripts.words.
 * AssemblyAI output is normalized into this on ingest so downstream code
 * (EDL generation, text editor, caption renderer) never touches provider
 * payloads directly. The raw provider payload is retained in transcripts.raw.
 */

export const transcriptWordSchema = z.object({
  /** Stable id, "w{index}" — referenced by EDL segments and the text editor. */
  id: z.string().min(1),
  text: z.string(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  confidence: z.number().min(0).max(1).optional(),
  speaker: z.string().optional(),
});
export type TranscriptWord = z.infer<typeof transcriptWordSchema>;

export const transcriptWordsSchema = z.array(transcriptWordSchema);
