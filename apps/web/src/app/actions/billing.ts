"use server";

import { getPlan } from "@merai/core";
import { createBillingProvider } from "@/lib/billing/provider";
import { createClient } from "@/lib/supabase/server";

/**
 * Billing server actions (Build 9). Checkout is the NEW-subscription path;
 * plan changes and cancel/resume for existing subscribers go through the
 * provider's portal (Stripe Billing Portal; the mock returns to the page).
 */

function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.replace(/^/, "https://") ??
    "http://localhost:3000"
  );
}

export async function startCheckout(input: {
  planId: string;
}): Promise<{ ok: boolean; url?: string; error?: string }> {
  const plan = getPlan(input.planId);
  if (!plan) return { ok: false, error: "unknown-plan" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { ok: false, error: "not-authenticated" };

  const { data: existing } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("owner_id", user.id)
    .maybeSingle();

  try {
    const provider = createBillingProvider();
    const { url } = await provider.createCheckoutSession({
      ownerId: user.id,
      email: user.email,
      plan,
      customerId: existing?.stripe_customer_id ?? null,
      successUrl: `${siteUrl()}/dashboard/billing?checkout=success`,
      cancelUrl: `${siteUrl()}/dashboard/billing?checkout=cancelled`,
    });
    return { ok: true, url };
  } catch (err) {
    console.error("checkout failed", err);
    return { ok: false, error: "checkout-failed" };
  }
}

export async function openBillingPortal(): Promise<{
  ok: boolean;
  url?: string;
  error?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not-authenticated" };

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!subscription?.stripe_customer_id) return { ok: false, error: "no-subscription" };

  try {
    const provider = createBillingProvider();
    const { url } = await provider.createPortalSession({
      customerId: subscription.stripe_customer_id,
      returnUrl: `${siteUrl()}/dashboard/billing`,
    });
    return { ok: true, url };
  } catch (err) {
    console.error("portal failed", err);
    return { ok: false, error: "portal-failed" };
  }
}
