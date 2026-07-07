import type { JobRow, JobType } from "@merai/core";
import { analyze } from "./analyze";
import { cleanupExpired } from "./cleanup-expired";
import { generateEdl } from "./generate-edl";
import { transcribe } from "./transcribe";

export type JobHandler = (job: JobRow) => Promise<void>;

export const handlers: Record<JobType, JobHandler> = {
  transcribe,
  analyze,
  generate_edl: generateEdl,
  cleanup_expired: cleanupExpired,
};
