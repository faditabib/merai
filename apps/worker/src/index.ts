import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { JOB_TYPES } from "@merai/core";
import { getDb } from "./db";
import { log } from "./logger";
import { reapStaleJobs } from "./queue";
import { processOne } from "./runner";

const workerId = `worker-${randomUUID().slice(0, 8)}`;
const POLL_INTERVAL_MS = 2_000;

let shuttingDown = false;

const REAP_EVERY_MS = 5 * 60_000;

async function main() {
  log.info(`Merai worker ${workerId} started (types: ${JOB_TYPES.join(", ")})`);
  let lastReap = 0;

  while (!shuttingDown) {
    let claimed = false;
    try {
      // Recover jobs orphaned by a crashed worker (startup + every 5 min).
      if (Date.now() - lastReap > REAP_EVERY_MS) {
        lastReap = Date.now();
        const reaped = await reapStaleJobs();
        if (reaped > 0) log.warn(`reaped ${reaped} stale processing job(s)`);
      }
      claimed = await processOne(workerId);
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
  await getDb().end();
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
