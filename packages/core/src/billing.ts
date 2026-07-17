import { z } from "zod";
import { TIER_LIMITS, type SubscriptionTier, type TierLimits } from "./limits";

/**
 * SaaS billing core (Build 9) — pure plan/quota/status math shared by the
 * web app (UI + server actions + webhook) and any future worker checks.
 * Stripe specifics stay in the web provider; THIS is provider-agnostic.
 */

export const BILLING_INTERVALS = ["monthly", "annual"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

export const PAID_TIERS = ["creator", "pro"] as const satisfies readonly SubscriptionTier[];

export interface BillingPlan {
  id: string;
  tier: (typeof PAID_TIERS)[number];
  interval: BillingInterval;
  /** Stripe Price lookup_key — the owner creates Prices carrying these keys;
   *  code never hardcodes price ids. */
  lookupKey: string;
  /** Free trial on first subscription. */
  trialDays: number;
}

export const BILLING_PLANS: readonly BillingPlan[] = [
  { id: "creator-monthly", tier: "creator", interval: "monthly", lookupKey: "creator-monthly", trialDays: 7 },
  { id: "creator-annual", tier: "creator", interval: "annual", lookupKey: "creator-annual", trialDays: 7 },
  { id: "pro-monthly", tier: "pro", interval: "monthly", lookupKey: "pro-monthly", trialDays: 7 },
  { id: "pro-annual", tier: "pro", interval: "annual", lookupKey: "pro-annual", trialDays: 7 },
];

export function getPlan(id: string): BillingPlan | undefined {
  return BILLING_PLANS.find((p) => p.id === id);
}

export function planForLookupKey(lookupKey: string): BillingPlan | undefined {
  return BILLING_PLANS.find((p) => p.lookupKey === lookupKey);
}

/** Stripe subscription statuses (superset-tolerant via catch). */
export const subscriptionStatusSchema = z
  .enum([
    "trialing",
    "active",
    "past_due",
    "canceled",
    "incomplete",
    "incomplete_expired",
    "unpaid",
    "paused",
  ])
  .catch("canceled");
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

/** Statuses that keep paid entitlements (past_due = dunning grace). */
export const ACTIVE_SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  "trialing",
  "active",
  "past_due",
];

/** The tier a subscription actually entitles right now. */
export function tierForSubscription(
  status: SubscriptionStatus | string | null | undefined,
  paidTier: SubscriptionTier,
): SubscriptionTier {
  const parsed = subscriptionStatusSchema.parse(status ?? "canceled");
  return ACTIVE_SUBSCRIPTION_STATUSES.includes(parsed) ? paidTier : "starter";
}

export type UsageKind = "raw_minutes" | "export_minutes";

export function limitForKind(tier: SubscriptionTier, kind: UsageKind): number {
  const limits: TierLimits = TIER_LIMITS[tier];
  return kind === "raw_minutes" ? limits.rawMinutesPerCycle : limits.outputMinutesPerCycle;
}

/** Authoritative quota check: does adding `addedMinutes` exceed the cycle? */
export function quotaExceeded(
  tier: SubscriptionTier,
  kind: UsageKind,
  usedMinutes: number,
  addedMinutes: number,
): boolean {
  return usedMinutes + addedMinutes > limitForKind(tier, kind);
}

export function remainingMinutes(
  tier: SubscriptionTier,
  kind: UsageKind,
  usedMinutes: number,
): number {
  return Math.max(0, limitForKind(tier, kind) - usedMinutes);
}

/** subscriptions row shape as the web app reads it (snake_case = DB). */
export const subscriptionRowSchema = z.object({
  owner_id: z.string().uuid(),
  stripe_customer_id: z.string().nullable(),
  stripe_subscription_id: z.string().nullable(),
  tier: z.enum(["starter", "creator", "pro"]).catch("starter"),
  status: subscriptionStatusSchema,
  interval: z.enum(BILLING_INTERVALS).nullable(),
  current_period_end: z.string().nullable(),
  cancel_at_period_end: z.boolean().default(false),
  trial_end: z.string().nullable(),
});
export type SubscriptionRow = z.infer<typeof subscriptionRowSchema>;

/**
 * Pure webhook mapping: a Stripe subscription object (already JSON) → the
 * subscriptions row to upsert. Tested against the documented payload shape;
 * unknown price lookup keys resolve to null (event ignored by the caller).
 */
export function subscriptionRowFromStripe(input: {
  ownerId: string;
  customerId: string;
  subscription: {
    id: string;
    status: string;
    cancel_at_period_end?: boolean;
    trial_end?: number | null;
    current_period_end?: number | null;
    items?: { data?: Array<{ price?: { lookup_key?: string | null } }> };
  };
}): SubscriptionRow | null {
  const lookupKey = input.subscription.items?.data?.[0]?.price?.lookup_key;
  const plan = lookupKey ? planForLookupKey(lookupKey) : undefined;
  if (!plan) return null;
  const status = subscriptionStatusSchema.parse(input.subscription.status);
  const toIso = (epoch: number | null | undefined) =>
    epoch ? new Date(epoch * 1000).toISOString() : null;
  return {
    owner_id: input.ownerId,
    stripe_customer_id: input.customerId,
    stripe_subscription_id: input.subscription.id,
    tier: tierForSubscription(status, plan.tier),
    status,
    interval: plan.interval,
    current_period_end: toIso(input.subscription.current_period_end),
    cancel_at_period_end: input.subscription.cancel_at_period_end ?? false,
    trial_end: toIso(input.subscription.trial_end),
  };
}
