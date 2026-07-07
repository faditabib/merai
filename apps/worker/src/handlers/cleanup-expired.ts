import type { JobRow } from "@merai/core";
import { log } from "../logger";

/**
 * Retention sweep (scheduled periodically): delete storage objects and mark
 * rows expired for video_uploads/exports past expires_at. Implemented with
 * the retention feature in Phase 6; safe no-op until then.
 */
export async function cleanupExpired(_job: JobRow): Promise<void> {
  log.info("cleanup_expired: retention sweep not implemented yet (Phase 6) — no-op");
}
