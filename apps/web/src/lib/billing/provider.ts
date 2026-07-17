import { getPlan, type BillingPlan } from "@merai/core";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Billing behind a provider interface (Build 9) — the house pattern
 * (AssemblyAI↔mock, Haiku↔heuristic, VGF↔local ffmpeg):
 *  - StripeBillingProvider: wired against Stripe's documented REST API via
 *    fetch (no SDK). Activated by STRIPE_SECRET_KEY; UNVERIFIED until the
 *    first live call (the Phase 1 AssemblyAI playbook). Prices are found by
 *    lookup_key — the owner creates them in the dashboard, code never
 *    hardcodes price ids.
 *  - MockBillingProvider: keyless default. "Checkout" activates the
 *    subscription immediately (service-role upsert + tier sync), so the
 *    whole subscribe → enforce → cancel loop runs with zero keys.
 */

export interface CheckoutInput {
  ownerId: string;
  email: string;
  plan: BillingPlan;
  /** Existing Stripe customer, when the owner already has one. */
  customerId: string | null;
  successUrl: string;
  cancelUrl: string;
}

export interface BillingProvider {
  readonly name: "stripe" | "mock";
  createCheckoutSession(input: CheckoutInput): Promise<{ url: string }>;
  createPortalSession(input: {
    customerId: string;
    returnUrl: string;
  }): Promise<{ url: string }>;
}

const STRIPE_API = "https://api.stripe.com/v1";

function form(params: Record<string, string>): string {
  return new URLSearchParams(params).toString();
}

async function stripeRequest<T>(
  secretKey: string,
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  const response = await fetch(`${STRIPE_API}${path}`, {
    method: params ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      ...(params ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: params ? form(params) : undefined,
  });
  const json = (await response.json()) as T & { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(`stripe ${path}: ${json.error?.message ?? response.status}`);
  }
  return json;
}

class StripeBillingProvider implements BillingProvider {
  readonly name = "stripe" as const;
  constructor(private readonly secretKey: string) {}

  private async priceIdForLookupKey(lookupKey: string): Promise<string> {
    const result = await stripeRequest<{ data: Array<{ id: string }> }>(
      this.secretKey,
      `/prices?lookup_keys[]=${encodeURIComponent(lookupKey)}&active=true&limit=1`,
    );
    const price = result.data[0];
    if (!price) {
      throw new Error(
        `No active Stripe Price with lookup_key "${lookupKey}" — create it in the dashboard`,
      );
    }
    return price.id;
  }

  async createCheckoutSession(input: CheckoutInput): Promise<{ url: string }> {
    const priceId = await this.priceIdForLookupKey(input.plan.lookupKey);
    const params: Record<string, string> = {
      mode: "subscription",
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      "subscription_data[trial_period_days]": String(input.plan.trialDays),
      "subscription_data[metadata][owner_id]": input.ownerId,
      "metadata[owner_id]": input.ownerId,
      client_reference_id: input.ownerId,
      // Upgrades/downgrades for existing subscribers go through the Portal;
      // Checkout is the NEW-subscription path.
      ...(input.customerId
        ? { customer: input.customerId }
        : { customer_email: input.email }),
    };
    const session = await stripeRequest<{ url: string }>(
      this.secretKey,
      "/checkout/sessions",
      params,
    );
    return { url: session.url };
  }

  async createPortalSession(input: {
    customerId: string;
    returnUrl: string;
  }): Promise<{ url: string }> {
    const session = await stripeRequest<{ url: string }>(
      this.secretKey,
      "/billing_portal/sessions",
      { customer: input.customerId, return_url: input.returnUrl },
    );
    return { url: session.url };
  }
}

class MockBillingProvider implements BillingProvider {
  readonly name = "mock" as const;

  async createCheckoutSession(input: CheckoutInput): Promise<{ url: string }> {
    // Keyless dev/test: activate immediately through the same service-role
    // upsert + tier sync the webhook performs.
    const admin = createAdminClient();
    const periodEnd = new Date(
      Date.now() + (input.plan.interval === "annual" ? 365 : 30) * 24 * 3600 * 1000,
    ).toISOString();
    await admin.from("subscriptions").upsert(
      {
        owner_id: input.ownerId,
        stripe_customer_id: `mock_cus_${input.ownerId.slice(0, 8)}`,
        stripe_subscription_id: `mock_sub_${input.ownerId.slice(0, 8)}`,
        tier: input.plan.tier,
        status: "active",
        interval: input.plan.interval,
        current_period_end: periodEnd,
        cancel_at_period_end: false,
        trial_end: null,
      },
      { onConflict: "owner_id" },
    );
    await admin
      .from("profiles")
      .update({ subscription_tier: input.plan.tier })
      .eq("id", input.ownerId);
    return { url: input.successUrl };
  }

  async createPortalSession(input: {
    customerId: string;
    returnUrl: string;
  }): Promise<{ url: string }> {
    return { url: input.returnUrl };
  }
}

/** Env-selected, exactly like the transcription provider. */
export function createBillingProvider(): BillingProvider {
  const override = process.env.BILLING_PROVIDER;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (override === "mock") return new MockBillingProvider();
  if (override === "stripe" || secretKey) {
    if (!secretKey) throw new Error("BILLING_PROVIDER=stripe but STRIPE_SECRET_KEY is unset");
    return new StripeBillingProvider(secretKey);
  }
  return new MockBillingProvider();
}

export { getPlan };
