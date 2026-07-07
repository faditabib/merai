import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { JOB_TYPES } from "@merai/core";
import { handlers } from "./handlers/index";
import { log } from "./logger";
import { claimNextJob, completeJob, failJob, pool } from "./queue";

const workerId = `worker-${randomUUID().slice(0, 8)}`;
const POLL_INTERVAL_MS = 2_000;

let shuttingDown = false;

/** @returns true if a job was claimed (poll again immediately). */
async function processOne(): Promise<boolean> {
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
  }
  return true;
}

async function main() {
  log.info(`Merai worker ${workerId} started (types: ${JOB_TYPES.join(", ")})`);

  while (!shuttingDown) {
    let claimed = false;
    try {
      claimed = await processOne();
    } catch (err) {
      // Claim/DB-level error — back off and retry rather than crash-loop.
      log.error("queue error", err);
      await sleep(POLL_INTERVAL_MS * 5);
    }
    if (!claimed && !shuttingDown) {
      await sleep(POLL_INTERVAL_MS);
    }
  }

  log.info("shutting down, draining pool…");
  await pool.end();
}

function requestShutdown(signal: string) {
  log.info(`received ${signal}`);
  shuttingDown = true;
}

process.on("SIGTERM", () => requestShutdown("SIGTERM"));
process.on("SIGINT", () => requestShutdown("SIGINT"));

main().catch((err) => {
  log.error("fatal worker error", err);
  process.exit(1);
});
