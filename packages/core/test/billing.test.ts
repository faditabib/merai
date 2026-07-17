import { describe, expect, it } from "vitest";
import {
  ACTIVE_SUBSCRIPTION_STATUSES,
  BILLING_PLANS,
  getPlan,
  limitForKind,
  planForLookupKey,
  quotaExceeded,
  remainingMinutes,
  subscriptionRowFromStripe,
  subscriptionStatusSchema,
  tierForSubscription,
  TIER_LIMITS,
} from "../src/index";

describe("billing plans (Build 9)", () => {
  it("ships creator/pro × monthly/annual with unique ids and lookup keys", () => {
    expect(BILLING_PLANS).toHaveLength(4);
    expect(new Set(BILLING_PLANS.map((p) => p.id)).size).toBe(4);
    expect(new Set(BILLING_PLANS.map((p) => p.lookupKey)).size).toBe(4);
    for (const plan of BILLING_PLANS) {
      expect(["creator", "pro"]).toContain(plan.tier);
      expect(plan.trialDays).toBeGreaterThan(0);
    }
  });

  it("resolves by id and lookup key", () => {
    expect(getPlan("pro-annual")?.interval).toBe("annual");
    expect(planForLookupKey("creator-monthly")?.tier).toBe("creator");
    expect(getPlan("nope")).toBeUndefined();
  });
});

describe("subscription status → entitled tier", () => {
  it("active-ish statuses keep the paid tier", () => {
    for (const status of ACTIVE_SUBSCRIPTION_STATUSES) {
      expect(tierForSubscription(status, "pro")).toBe("pro");
    }
  });
  it("terminal/limbo statuses fall back to starter", () => {
    for (const status of ["canceled", "unpaid", "incomplete_expired", "paused"]) {
      expect(tierForSubscription(status, "pro")).toBe("starter");
    }
  });
  it("unknown provider statuses degrade safely (catch → canceled → starter)", () => {
    expect(subscriptionStatusSchema.parse("weird_future_status")).toBe("canceled");
    expect(tierForSubscription("weird_future_status", "creator")).toBe("starter");
  });
});

describe("quota math", () => {
  it("limits come from TIER_LIMITS", () => {
    expect(limitForKind("starter", "raw_minutes")).toBe(TIER_LIMITS.starter.rawMinutesPerCycle);
    expect(limitForKind("pro", "export_minutes")).toBe(TIER_LIMITS.pro.outputMinutesPerCycle);
  });
  it("exceeds only past the limit (boundary inclusive)", () => {
    expect(quotaExceeded("starter", "raw_minutes", 50, 10)).toBe(false); // 60 = limit
    expect(quotaExceeded("starter", "raw_minutes", 50, 10.5)).toBe(true);
  });
  it("remainingMinutes floors at zero", () => {
    expect(remainingMinutes("starter", "raw_minutes", 100)).toBe(0);
    expect(remainingMinutes("starter", "raw_minutes", 20)).toBe(40);
  });
});

describe("subscriptionRowFromStripe (pure webhook mapping)", () => {
  const base = {
    ownerId: "11111111-1111-1111-1111-111111111111",
    customerId: "cus_123",
    subscription: {
      id: "sub_123",
      status: "active",
      cancel_at_period_end: false,
      trial_end: null,
      current_period_end: 1_800_000_000,
      items: { data: [{ price: { lookup_key: "pro-monthly" } }] },
    },
  };

  it("maps an active pro subscription", () => {
    const row = subscriptionRowFromStripe(base)!;
    expect(row.tier).toBe("pro");
    expect(row.status).toBe("active");
    expect(row.interval).toBe("monthly");
    expect(row.stripe_customer_id).toBe("cus_123");
    expect(row.current_period_end).toBe(new Date(1_800_000_000 * 1000).toISOString());
  });

  it("a canceled subscription entitles starter but keeps the record", () => {
    const row = subscriptionRowFromStripe({
      ...base,
      subscription: { ...base.subscription, status: "canceled" },
    })!;
    expect(row.tier).toBe("starter");
    expect(row.status).toBe("canceled");
  });

  it("trialing carries trial_end and the paid tier", () => {
    const row = subscriptionRowFromStripe({
      ...base,
      subscription: { ...base.subscription, status: "trialing", trial_end: 1_790_000_000 },
    })!;
    expect(row.tier).toBe("pro");
    expect(row.trial_end).toBe(new Date(1_790_000_000 * 1000).toISOString());
  });

  it("unknown lookup keys are ignored (null) — never a guessed tier", () => {
    expect(
      subscriptionRowFromStripe({
        ...base,
        subscription: {
          ...base.subscription,
          items: { data: [{ price: { lookup_key: "enterprise-2027" } }] },
        },
      }),
    ).toBeNull();
  });
});
