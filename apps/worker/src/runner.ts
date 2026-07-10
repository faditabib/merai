import { getDb } from "./db";
import { handlers } from "./handlers/index";
import { log } from "./logger";
import { claimNextJob, completeJob, failJob } from "./queue";
import { JOB_TYPES } from "@merai/core";

/**
 * Claim and process a single job. Extracted from the main loop so tests can
 * drive the exact production path (claim → handler → complete/fail →
 * permanent-failure surfacing) against an injected database.
 *
 * @returns true if a job was claimed (poll again immediately).
 */
export async function processOne(workerId: string): Promise<boolean> {
  const job = await claimNextJob(workerId, JOB_TYPES);
  if (!job) return false;

  log.info(
    `claimed job ${job.id} type=${job.type} attempt=${job.attempts}/${job.max_attempts}`,
  );

  try {
    await handlers[job.type](job);
    await completeJob(job.id);
    log.info(`job ${job.id} done`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(`job ${job.id} failed: ${message}`);
    await failJob(job.id, message);

    // Retries exhausted → surface the failure where the UI looks for it.
    if (job.attempts >= job.max_attempts) {
      // Pipeline jobs gate the project itself…
      if (job.project_id && (job.type === "transcribe" || job.type === "analyze")) {
        await getDb().query(
          "update public.projects set status = 'error' where id = $1",
          [job.project_id],
        );
        log.warn(
          `job ${job.id} permanently failed — project ${job.project_id} marked error`,
        );
      }
      // …render jobs gate only their exports row (the project stays ready).
      if (job.type === "render_export") {
        const exportId = (job.payload as { exportId?: string })?.exportId;
        if (exportId) {
          await getDb().query(
            "update public.exports set status = 'failed', error = $2 where id = $1 and status in ('pending','rendering')",
            [exportId, message.slice(0, 500)],
          );
          log.warn(`job ${job.id} permanently failed — export ${exportId} marked failed`);
        }
      }
    }
  }
  return true;
}
