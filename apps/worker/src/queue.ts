import type { JobRow, JobType } from "@merai/core";
import { getDb } from "./db";

/**
 * Atomically claim the next runnable job via public.claim_next_job
 * (FOR UPDATE SKIP LOCKED — safe with multiple worker instances).
 */
export async function claimNextJob(
  workerId: string,
  types: readonly JobType[],
): Promise<JobRow | null> {
  const { rows } = await getDb().query<JobRow>(
    "select * from public.claim_next_job($1, $2)",
    [workerId, types],
  );
  const job = rows[0];
  // A no-match call returns a single all-null composite row.
  return job && job.id ? job : null;
}

export async function completeJob(jobId: string): Promise<void> {
  await getDb().query("select public.complete_job($1)", [jobId]);
}

/** Requeues with exponential backoff until max_attempts, then fails hard. */
export async function failJob(jobId: string, error: string): Promise<void> {
  await getDb().query("select public.fail_job($1, $2)", [jobId, error]);
}

/**
 * Hard-fail immediately, skipping remaining retries — for deterministic
 * errors (PermanentJobError) where re-running the handler cannot succeed.
 */
export async function failJobPermanently(jobId: string, error: string): Promise<void> {
  await getDb().query(
    `update public.jobs
     set status = 'failed', attempts = greatest(attempts, max_attempts),
         locked_at = null, locked_by = null, last_error = $2
     where id = $1`,
    [jobId, error],
  );
}

/**
 * Requeue jobs stuck in 'processing' whose worker died mid-job (crash,
 * deploy, OOM). Threshold must exceed the longest legitimate job — the
 * transcribe handler can poll AssemblyAI for up to 15 minutes.
 */
export const STALE_JOB_MINUTES = 20;

export async function reapStaleJobs(): Promise<number> {
  const { rows } = await getDb().query<{ id: string }>(
    `update public.jobs
     set status = 'queued', locked_by = null, locked_at = null,
         last_error = coalesce(last_error, '') || ' [reaped: worker died mid-job]'
     where status = 'processing'
       and locked_at < now() - make_interval(mins => $1)
     returning id`,
    [STALE_JOB_MINUTES],
  );
  return rows.length;
}
