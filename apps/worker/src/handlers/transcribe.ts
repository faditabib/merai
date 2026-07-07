import { transcribePayloadSchema, type JobRow } from "@merai/core";
import { log } from "../logger";

/**
 * Phase 1: download signed audio URL for the upload, submit to AssemblyAI,
 * poll/receive webhook, normalize words into transcripts.words, then enqueue
 * an `analyze` job. Handler must stay idempotent (dedupe_key per upload).
 */
export async function transcribe(job: JobRow): Promise<void> {
  const payload = transcribePayloadSchema.parse(job.payload);
  log.info(`transcribe: not implemented yet (upload ${payload.uploadId})`);
  throw new Error("transcribe handler is not implemented (Phase 1)");
}
