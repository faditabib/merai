import { analyzePayloadSchema, type JobRow } from "@merai/core";
import { log } from "../logger";

/**
 * Phase 2: Claude Haiku classification of filler words, best-take detection
 * and false starts over the stored transcript. Cost note: Haiku only —
 * never Sonnet/Opus in runtime calls (margin decision, PRD §6).
 */
export async function analyze(job: JobRow): Promise<void> {
  const payload = analyzePayloadSchema.parse(job.payload);
  log.info(`analyze: not implemented yet (transcript ${payload.transcriptId})`);
  throw new Error("analyze handler is not implemented (Phase 2)");
}
