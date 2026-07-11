import { z } from "zod";

/**
 * Background job contract shared by the Next.js app (producer) and the
 * Railway worker (consumer). Every payload is zod-validated on both sides so
 * a malformed enqueue fails loudly at the producer, not silently in the worker.
 *
 * Idempotency: producers set jobs.dedupe_key (e.g. `transcribe:{uploadId}`)
 * so retried enqueues are no-ops, and handlers must be safe to re-run.
 */

export const JOB_TYPES = [
  "transcribe",
  "analyze",
  "generate_edl",
  "render_export",
  "cleanup_expired",
] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const transcribePayloadSchema = z.object({
  uploadId: z.string().uuid(),
  projectId: z.string().uuid(),
  ownerId: z.string().uuid(),
});
export type TranscribePayload = z.infer<typeof transcribePayloadSchema>;

export const analyzePayloadSchema = z.object({
  transcriptId: z.string().uuid(),
  projectId: z.string().uuid(),
  ownerId: z.string().uuid(),
});
export type AnalyzePayload = z.infer<typeof analyzePayloadSchema>;

/** AI Editing Brain request (Build 5.5) — the job fills an ai_suggestions
 *  row; it never mutates EDLs. Formerly a reserved stub. */
export const generateEdlPayloadSchema = z.object({
  suggestionId: z.string().uuid(),
  projectId: z.string().uuid(),
  ownerId: z.string().uuid(),
});
export type GenerateEdlPayload = z.infer<typeof generateEdlPayloadSchema>;

/** Server-side export render (Phase 4.5 — replaced ffmpeg.wasm). */
export const renderExportPayloadSchema = z.object({
  exportId: z.string().uuid(),
  projectId: z.string().uuid(),
  ownerId: z.string().uuid(),
});
export type RenderExportPayload = z.infer<typeof renderExportPayloadSchema>;

/** Periodic retention sweep; no payload. */
export const cleanupExpiredPayloadSchema = z.object({});

export const jobPayloadSchemas = {
  transcribe: transcribePayloadSchema,
  analyze: analyzePayloadSchema,
  generate_edl: generateEdlPayloadSchema,
  render_export: renderExportPayloadSchema,
  cleanup_expired: cleanupExpiredPayloadSchema,
} satisfies Record<JobType, z.ZodTypeAny>;

export const jobStatusSchema = z.enum(["queued", "processing", "done", "failed"]);
export type JobStatus = z.infer<typeof jobStatusSchema>;

/** Row shape of public.jobs as seen over the wire. */
export interface JobRow {
  id: string;
  type: JobType;
  payload: unknown;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  run_at: string;
  locked_at: string | null;
  locked_by: string | null;
  last_error: string | null;
  dedupe_key: string | null;
  owner_id: string | null;
  project_id: string | null;
  created_at: string;
  updated_at: string;
}
