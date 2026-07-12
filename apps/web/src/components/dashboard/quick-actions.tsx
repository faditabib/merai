import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

/**
 * Primary creator actions (Build 6C.1). Three real routes plus a disabled
 * "Record — soon" chip (the Tella-style suite is Build 7). Mobile-first: wraps
 * on small screens, row on larger.
 */
export async function QuickActions() {
  const t = await getTranslations("dashboard.quickActions");
  const actions = [
    { key: "newVideo", href: "/dashboard/new", primary: true },
    { key: "brandKit", href: "/dashboard/brand-kit", primary: false },
    { key: "captionStudio", href: "/dashboard/brand-kit", primary: false },
  ] as const;

  return (
    <div className="flex flex-wrap gap-3">
      {actions.map((a) => (
        <Link
          key={a.key}
          href={a.href}
          className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition ${
            a.primary
              ? "bg-accent text-accent-foreground hover:opacity-90"
              : "border border-border hover:border-accent hover:text-accent"
          }`}
        >
          {t(a.key)}
        </Link>
      ))}
      <span
        aria-disabled
        title={t("recordSoon")}
        className="flex cursor-default items-center gap-1.5 rounded-xl border border-dashed border-border px-5 py-2.5 text-sm text-muted"
      >
        {t("record")}
        <span className="rounded-full bg-border/60 px-2 py-0.5 text-[11px]">
          {t("recordSoon")}
        </span>
      </span>
    </div>
  );
}
