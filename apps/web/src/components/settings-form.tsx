"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

/** Account settings sections (refinement 2026-07-18): real email, real
 *  display-name save (auth.updateUser), language + subscription links. */
export function SettingsForm(props: { email: string; initialDisplayName: string }) {
  const t = useTranslations("settings");
  const locale = useLocale();
  const pathname = usePathname();
  const [displayName, setDisplayName] = useState(props.initialDisplayName);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setError(false);
    const { error: updateError } = await createClient().auth.updateUser({
      data: { display_name: displayName.trim() },
    });
    if (updateError) setError(true);
    else setSaved(true);
    setSaving(false);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Account */}
      <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold">{t("accountTitle")}</h2>
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted">{t("emailLabel")}</span>
          <span dir="ltr">{props.email}</span>
        </div>
        <label className="flex flex-col gap-1.5 text-sm">
          {t("displayNameLabel")}
          <input
            type="text"
            value={displayName}
            maxLength={80}
            onChange={(e) => setDisplayName(e.target.value)}
            className="rounded-xl border border-border bg-transparent px-3 py-2"
          />
        </label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="w-fit rounded-xl bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
          >
            {saving ? t("saving") : t("save")}
          </button>
          {saved && <span className="text-sm text-emerald-600">{t("savedNote")}</span>}
          {error && (
            <span role="alert" className="text-sm text-red-500">
              {t("saveError")}
            </span>
          )}
        </div>
      </section>

      {/* Preferences */}
      <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold">{t("preferencesTitle")}</h2>
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted">{t("languageLabel")}</span>
          <Link
            href={pathname}
            locale={locale === "ar" ? "en" : "ar"}
            className="text-accent underline-offset-4 hover:underline"
          >
            {locale === "ar" ? "English" : "العربية"}
          </Link>
        </div>
        <p className="text-xs text-muted">{t("themeHint")}</p>
      </section>

      {/* Subscription */}
      <section className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-5">
        <div>
          <h2 className="font-semibold">{t("subscriptionTitle")}</h2>
          <p className="mt-0.5 text-sm text-muted">{t("subscriptionHint")}</p>
        </div>
        <Link
          href="/dashboard/billing"
          className="shrink-0 rounded-xl border border-border px-4 py-2 text-sm transition hover:border-accent hover:text-accent"
        >
          {t("subscriptionCta")}
        </Link>
      </section>
    </div>
  );
}
