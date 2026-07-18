"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

const LINKS = [
  { key: "dashboard", href: "/dashboard", exact: true, icon: "M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10" },
  { key: "record", href: "/dashboard/record", exact: false, icon: "M15 10l5-3v10l-5-3M3 7a2 2 0 012-2h8a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" },
  { key: "brandKit", href: "/dashboard/brand-kit", exact: false, icon: "M12 3l2.5 6.5H21l-5 4 2 6.5-6-4-6 4 2-6.5-5-4h6.5L12 3z" },
  { key: "billing", href: "/dashboard/billing", exact: false, icon: "M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7zm0 3h18" },
] as const;

function NavIcon({ d }: { d: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4.5 w-4.5 shrink-0"
    >
      <path d={d} />
    </svg>
  );
}

/**
 * Navigation with active-page states (UX sprint; sidebar variant added in
 * the 2026-07-18 design transformation). Same links, same routes — only the
 * presentation differs per surface.
 */
export function NavLinks({ variant = "top" }: { variant?: "top" | "side" }) {
  const t = useTranslations("common");
  const pathname = usePathname();

  return (
    <>
      {LINKS.filter((link) => variant !== "side" || link.key !== "billing").map((link) => {
        const active = link.exact
          ? pathname === link.href
          : pathname.startsWith(link.href);
        if (variant === "side") {
          return (
            <Link
              key={link.key}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                active
                  ? "bg-accent/10 font-semibold text-accent"
                  : "text-muted hover:bg-border/40 hover:text-foreground"
              }`}
            >
              <NavIcon d={link.icon} />
              {t(link.key)}
            </Link>
          );
        }
        return (
          <Link
            key={link.key}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`text-sm transition ${
              active ? "font-semibold text-accent" : "text-muted hover:text-accent"
            }`}
          >
            {t(link.key)}
          </Link>
        );
      })}
    </>
  );
}
