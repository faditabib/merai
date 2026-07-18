import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

// Refinement 2026-07-18: creative-identity tools (Brand Kit + Caption
// styles + visual identity) are ONE home — "Creator Studio" — not three
// separate products. Same real route they always shared.
const ACTIONS = [
  {
    key: "newVideo",
    href: "/dashboard/new",
    primary: true,
    icon: "M12 5v14M5 12h14",
  },
  {
    key: "record",
    href: "/dashboard/record",
    primary: false,
    icon: "M15 10l5-3v10l-5-3M3 7a2 2 0 012-2h8a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z",
  },
  {
    key: "creatorStudio",
    href: "/dashboard/brand-kit",
    primary: false,
    icon: "M12 3l2.5 6.5H21l-5 4 2 6.5-6-4-6 4 2-6.5-5-4h6.5L12 3z",
  },
] as const;

/**
 * Primary creator actions (6C.1; Record live since 7.1). Design
 * transformation 2026-07-18: reference-style icon cards — icon + title +
 * one-line description. Same four REAL routes, zero flow changes.
 */
export async function QuickActions() {
  const t = await getTranslations("dashboard.quickActions");

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {ACTIONS.map((action) => (
        <Link
          key={action.key}
          href={action.href}
          className={`group flex flex-col items-start gap-2 rounded-xl border p-4 transition hover:shadow-sm ${
            action.primary
              ? "border-accent/30 bg-accent/5 hover:border-accent"
              : "border-border bg-card hover:border-accent/50"
          }`}
        >
          <span
            aria-hidden
            className={`flex h-9 w-9 items-center justify-center rounded-full ${
              action.primary ? "bg-accent text-accent-foreground" : "bg-accent/10 text-accent"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4.5 w-4.5"
            >
              <path d={action.icon} />
            </svg>
          </span>
          <span className="text-sm font-semibold">{t(action.key)}</span>
          <span className="text-xs leading-relaxed text-muted">
            {t(`hints.${action.key}`)}
          </span>
        </Link>
      ))}
    </div>
  );
}
