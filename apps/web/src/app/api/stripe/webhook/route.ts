import { NextResponse } from "next/server";
import { subscriptionRowFromStripe } from "@merai/core";
import { verifyStripeSignature } from "@/lib/billing/signature";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Stripe webhook (Build 9). Signature-verified, idempotent via the
 * billing_events ledger (unique event_id — replays are 200 no-ops), and
 * the subscription→row mapping is the pure, tested core function. Always
 * answers 200 for events we deliberately ignore so Stripe stops retrying.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    // No webhook secret configured (mock-provider deployments): refuse
    // loudly rather than accepting unverifiable events.
    return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!verifyStripeSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }

  let event: {
    id: string;
    type: string;
    data: { object: Record<string, unknown> };
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "bad payload" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Idempotency: first writer wins; a replayed event id is a no-op.
  const { error: ledgerError, data: inserted } = await admin
    .from("billing_events")
    .upsert(
      { event_id: event.id, type: event.type, payload: event.data.object },
      { onConflict: "event_id", ignoreDuplicates: true },
    )
    .select("id");
  if (ledgerError) {
    return NextResponse.json({ error: "ledger failed" }, { status: 500 });
  }
  if (!inserted || inserted.length === 0) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const subscription = event.data.object as {
      id: string;
      status: string;
      customer: string;
      metadata?: { owner_id?: string };
      cancel_at_period_end?: boolean;
      trial_end?: number | null;
      current_period_end?: number | null;
      items?: { data?: Array<{ price?: { lookup_key?: string | null } }> };
    };

    // owner_id rides subscription metadata (set at checkout); fall back to
    // the customer id already stored on a previous event.
    let ownerId = subscription.metadata?.owner_id ?? null;
    if (!ownerId) {
      const { data: existing } = await admin
        .from("subscriptions")
        .select("owner_id")
        .eq("stripe_customer_id", subscription.customer)
        .maybeSingle();
      ownerId = existing?.owner_id ?? null;
    }
    if (!ownerId) {
      // Unknown owner — acknowledged (200) but logged; retrying won't help.
      console.error(`stripe webhook: no owner for customer ${subscription.customer}`);
      return NextResponse.json({ received: true, ignored: "no-owner" });
    }

    const row = subscriptionRowFromStripe({
      ownerId,
      customerId: subscription.customer,
      subscription,
    });
    if (!row) {
      console.error(`stripe webhook: unknown price lookup key on ${subscription.id}`);
      return NextResponse.json({ received: true, ignored: "unknown-plan" });
    }

    const { error: upsertError } = await admin
      .from("subscriptions")
      .upsert(row, { onConflict: "owner_id" });
    if (upsertError) {
      return NextResponse.json({ error: "upsert failed" }, { status: 500 });
    }
    await admin
      .from("profiles")
      .update({ subscription_tier: row.tier })
      .eq("id", ownerId);
  }

  return NextResponse.json({ received: true });
}
