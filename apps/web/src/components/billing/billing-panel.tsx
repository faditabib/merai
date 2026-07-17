"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { BILLING_PLANS, type SubscriptionTier } from "@merai/core";
import { openBillingPortal, startCheckout } from "@/app/actions/billing";

export interface BillingPanelProps {
  entitledTier: SubscriptionTier;
  /** True when a provider customer exists (portal available). */
  hasSubscription: boolean;
}

/**
 * Plan grid + portal entry (Build 9). Checkout is the new-subscription path;
 * upgrades/downgrades/cancel/resume for existing subscribers go through the
 * provider portal (Stripe Billing Portal; the mock returns here).
 */
export function BillingPanel(props: BillingPanelProps) {
  const t = useTranslations("billing");
  const [interval, setInterval] = useState<"monthly" | "annual">("monthly");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState(false);

  const go = async (fn: () => Promise<{ ok: boolean; url?: string }>) => {
    setWorking(true);
    setError(false);
    try {
      const result = await fn();
      if (!result.ok || !result.url) throw new Error("billing action failed");
      window.location.assign(result.url);
    } catch (err) {
      console.error(err);
      setError(true);
      setWorking(false);
    }
  };

  const visiblePlans = BILLING_PLANS.filter((p) => p.interval === interval);

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-semibold">{t("plansTitle")}</h2>
        <div className="flex gap-1.5">
          {(["monthly", "annual"] as const).map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => setInterval(i)}
              className={`rounded-lg border px-3 py-1 text-sm ${
                interval === i
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-border text-muted hover:border-accent"
              }`}
            >
              {t(`intervals.${i}`)}
            </button>
          ))}
        </div>
        {props.hasSubscription && (
          <button
            type="button"
            disabled={working}
            onClick={() => void go(openBillingPortal)}
            className="ms-auto rounded-lg border border-border px-4 py-1.5 text-sm hover:border-accent disabled:opacity-50"
          >
            {t("managePlan")}
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {visiblePlans.map((plan) => {
          const isCurrent = props.entitledTier === plan.tier;
          return (
            <div
              key={plan.id}
              className={`flex flex-col gap-2 rounded-xl border p-4 ${
                isCurrent ? "border-accent bg-accent/5" : "border-border"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold">{t(`tiers.${plan.tier}`)}</span>
                {plan.trialDays > 0 && !isCurrent && (
                  <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] text-accent">
                    {t("trialBadge", { days: plan.trialDays })}
                  </span>
                )}
              </div>
              <p className="text-sm text-muted">{t(`planPitch.${plan.tier}`)}</p>
              <button
                type="button"
                disabled={working || isCurrent}
                onClick={() => void go(() => startCheckout({ planId: plan.id }))}
                className={`mt-auto rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 ${
                  isCurrent
                    ? "border border-border text-muted"
                    : "bg-accent text-accent-foreground hover:opacity-90"
                }`}
              >
                {isCurrent ? t("currentBadge") : t("choosePlan")}
              </button>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted">{t("starterNote")}</p>
      {error && (
        <p role="alert" className="text-sm text-red-500">
          {t("actionError")}
        </p>
      )}
    </section>
  );
}
