import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

/**
 * Brand-setup nudge (Build 6C.1). Data-driven: rendered by the dashboard only
 * when the creator's Brand Kit is missing or incomplete. No dismissal storage
 * — it disappears on its own once the kit is set up.
 */
export async function BrandSetupNudge() {
  const t = await getTranslations("dashboard.brandNudge");
  return (
    <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-accent/30 bg-accent/5 p-4">
      <div className="min-w-0 flex-1">
        <h2 className="font-semibold">{t("title")}</h2>
        <p className="mt-0.5 text-sm text-muted">{t("body")}</p>
      </div>
      <Link
        href="/dashboard/brand-kit"
        className="shrink-0 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:opacity-90"
      >
        {t("cta")}
      </Link>
    </section>
  );
}
