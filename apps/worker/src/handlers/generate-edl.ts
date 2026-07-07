import { generateEdlPayloadSchema, type JobRow } from "@merai/core";
import { log } from "../logger";

/**
 * Phase 2: combine silence detection (from word timestamps), filler/take
 * analysis and false starts into the first-draft EDL (edl_versions v1,
 * source='ai').
 */
export async function generateEdl(job: JobRow): Promise<void> {
  const payload = generateEdlPayloadSchema.parse(job.payload);
  log.info(`generate_edl: not implemented yet (transcript ${payload.transcriptId})`);
  throw new Error("generate_edl handler is not implemented (Phase 2)");
}
