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
