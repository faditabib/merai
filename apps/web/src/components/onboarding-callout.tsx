"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

const STEP_KEYS = ["upload", "analyze", "review", "export"] as const;

/**
 * The 4-step workflow strip (Build 6A onboarding). Pure presentation —
 * reused by the dismissible callout and the dashboard empty state, so the
 * "how Merai works" story is told once and rendered everywhere it helps.
 * RTL-safe: numbering and layout use logical utilities only.
 */
export function WorkflowSteps() {
  const t = useTranslations("dashboard.onboarding");
  return (
    <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {STEP_KEYS.map((key, index) => (
        <li key={key} className="flex items-start gap-3">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm font-bold text-accent">
            {index + 1}
          </span>
          <span className="min-w-0">
            <span className="block font-semibold">{t(`steps.${key}.title`)}</span>
            <span className="mt-0.5 block text-sm leading-relaxed text-muted">
              {t(`steps.${key}.body`)}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Dismissible first-time onboarding. Shown until the user dismisses it;
 * the flag lives in auth user_metadata (per-user, cross-device, no schema
 * churn for a UX flag). Dismiss hides instantly and persists best-effort —
 * if the write fails offline, the callout simply reappears next session.
 */
export function OnboardingCallout() {
  const t = useTranslations("dashboard.onboarding");
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;

  const dismiss = () => {
    setHidden(true);
    void createClient().auth.updateUser({
      data: { onboarding_dismissed_at: new Date().toISOString() },
    });
  };

  return (
    <section
      aria-label={t("title")}
      className="flex flex-col gap-4 rounded-2xl border border-accent/30 bg-accent/5 p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold">{t("title")}</h2>
          <p className="mt-0.5 text-sm text-muted">{t("subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs text-muted transition hover:border-accent hover:text-accent"
        >
          {t("dismiss")}
        </button>
      </div>
      <WorkflowSteps />
    </section>
  );
}
