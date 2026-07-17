import { describe, expect, it } from "vitest";
import {
  signStripePayload,
  verifyStripeSignature,
} from "../src/lib/billing/signature";

describe("Stripe webhook signature (Build 9)", () => {
  const secret = "whsec_test_secret";
  const body = JSON.stringify({ id: "evt_1", type: "customer.subscription.updated" });

  it("accepts a correctly signed payload", () => {
    const header = signStripePayload(body, secret);
    expect(verifyStripeSignature(body, header, secret)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const header = signStripePayload(body, secret);
    expect(verifyStripeSignature(body + "x", header, secret)).toBe(false);
  });

  it("rejects the wrong secret", () => {
    const header = signStripePayload(body, secret);
    expect(verifyStripeSignature(body, header, "whsec_other")).toBe(false);
  });

  it("rejects a stale timestamp (replay window)", () => {
    const staleTs = Math.floor(Date.now() / 1000) - 3600;
    const header = signStripePayload(body, secret, staleTs);
    expect(verifyStripeSignature(body, header, secret)).toBe(false);
    // …but accepts it when verified against that same clock.
    expect(verifyStripeSignature(body, header, secret, 300, staleTs + 10)).toBe(true);
  });

  it("rejects missing/malformed headers", () => {
    expect(verifyStripeSignature(body, null, secret)).toBe(false);
    expect(verifyStripeSignature(body, "v1=abc", secret)).toBe(false);
    expect(verifyStripeSignature(body, "t=123", secret)).toBe(false);
  });
});
