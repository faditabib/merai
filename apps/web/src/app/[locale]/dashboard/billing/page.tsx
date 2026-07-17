import { getFormatter, getTranslations } from "next-intl/server";
import {
  limitForKind,
  subscriptionRowSchema,
  tierForSubscription,
  type SubscriptionRow,
  type SubscriptionTier,
} from "@merai/core";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/app-header";
import { BillingPanel } from "@/components/billing/billing-panel";
import { PageHeader } from "@/components/page-header";

// Per-user page — always rendered at request time, never prerendered.
export const dynamic = "force-dynamic";

function currentBillingPeriod(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

/** Billing & usage (Build 9). */
export default async function BillingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect({ href: "/login", locale });
  }

  const t = await getTranslations("billing");
  const format = await getFormatter();

  const [{ data: subRow }, { data: profile }, { data: ledger }] = await Promise.all([
    supabase.from("subscriptions").select("*").eq("owner_id", user!.id).maybeSingle(),
    supabase.from("profiles").select("subscription_tier").eq("id", user!.id).maybeSingle(),
    supabase
      .from("usage_ledger")
      .select("kind, minutes")
      .eq("owner_id", user!.id)
      .eq("billing_period", currentBillingPeriod()),
  ]);

  let subscription: SubscriptionRow | null = null;
  if (subRow) {
    const parsed = subscriptionRowSchema.safeParse(subRow);
    if (parsed.success) subscription = parsed.data;
  }

  const entitledTier: SubscriptionTier = subscription
    ? tierForSubscription(subscription.status, subscription.tier)
    : ((profile?.subscription_tier as SubscriptionTier | undefined) ?? "starter");

  const usage = { raw_minutes: 0, export_minutes: 0 };
  for (const row of ledger ?? []) {
    if (row.kind === "raw_minutes") usage.raw_minutes += Number(row.minutes);
    if (row.kind === "export_minutes") usage.export_minutes += Number(row.minutes);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="flex flex-1 flex-col gap-6 px-6 py-10">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          <PageHeader
            crumbs={[{ label: t("backToDashboard"), href: "/dashboard" }]}
            title={t("pageTitle")}
            subtitle={t("pageSubtitle")}
          />

          {/* Current plan */}
          <section className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-semibold">{t("currentPlan")}</h2>
              <span className="rounded-full bg-accent/15 px-3 py-1 text-sm font-semibold text-accent">
                {t(`tiers.${entitledTier}`)}
              </span>
              {subscription && (
                <span className="text-xs text-muted">
                  {t(`statuses.${subscription.status}`)}
                </span>
              )}
            </div>
            {subscription?.trial_end && subscription.status === "trialing" && (
              <p className="text-sm text-muted">
                {t("trialUntil", {
                  date: format.dateTime(new Date(subscription.trial_end), {
                    dateStyle: "medium",
                  }),
                })}
              </p>
            )}
            {subscription?.current_period_end && (
              <p className="text-sm text-muted">
                {subscription.cancel_at_period_end
                  ? t("endsOn", {
                      date: format.dateTime(new Date(subscription.current_period_end), {
                        dateStyle: "medium",
                      }),
                    })
                  : t("renewsOn", {
                      date: format.dateTime(new Date(subscription.current_period_end), {
                        dateStyle: "medium",
                      }),
                    })}
              </p>
            )}

            {/* Usage meters */}
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {(["raw_minutes", "export_minutes"] as const).map((kind) => {
                const limit = limitForKind(entitledTier, kind);
                const used = usage[kind];
                const pct = Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
                return (
                  <div key={kind} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-sm">
                      <span>{t(`usage.${kind}`)}</span>
                      <span dir="ltr" className="tabular-nums text-muted">
                        {Math.round(used)} / {limit}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-border">
                      <div
                        className={`h-full rounded-full ${pct >= 100 ? "bg-red-500" : "bg-accent"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <BillingPanel
            entitledTier={entitledTier}
            hasSubscription={subscription?.stripe_customer_id != null}
          />
        </div>
      </main>
    </div>
  );
}
