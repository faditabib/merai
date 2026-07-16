import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

/**
 * Primary creator actions (Build 6C.1; Record went live in Build 7.1).
 * Mobile-first: wraps on small screens, row on larger.
 */
export async function QuickActions() {
  const t = await getTranslations("dashboard.quickActions");
  const actions = [
    { key: "newVideo", href: "/dashboard/new", primary: true },
    { key: "record", href: "/dashboard/record", primary: false },
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
    </div>
  );
}
