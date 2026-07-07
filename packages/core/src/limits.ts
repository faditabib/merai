/**
 * Product limits and tier definitions. Single source of truth for both the
 * web app (client-side validation, UI copy) and the worker/server (hard
 * enforcement). Server-side checks are authoritative; client checks are UX.
 */

/** Hard cap on a single raw upload, regardless of tier (PRD §5/§7). */
export const MAX_RAW_UPLOAD_SECONDS = 600;

export const MAX_RAW_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024; // 2 GiB safety cap

/** Raw footage retention (margin decision; see DECISIONS.md). */
export const RAW_RETENTION_DAYS = 30;

/** Final exports retention. */
export const EXPORT_RETENTION_DAYS = 90;

export type SubscriptionTier = "starter" | "creator" | "pro";

export interface TierLimits {
  /** Raw footage minutes uploadable per billing cycle (STT is billed on raw). */
  rawMinutesPerCycle: number;
  /** Finished output minutes exportable per billing cycle. */
  outputMinutesPerCycle: number;
}

/** Placeholder quotas — final numbers are a Phase 6 pricing decision. */
export const TIER_LIMITS: Record<SubscriptionTier, TierLimits> = {
  starter: { rawMinutesPerCycle: 60, outputMinutesPerCycle: 15 },
  creator: { rawMinutesPerCycle: 300, outputMinutesPerCycle: 90 },
  pro: { rawMinutesPerCycle: 1000, outputMinutesPerCycle: 300 },
};
