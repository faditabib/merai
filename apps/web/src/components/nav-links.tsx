"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

const LINKS = [
  { key: "dashboard", href: "/dashboard", exact: true },
  { key: "record", href: "/dashboard/record", exact: false },
  { key: "brandKit", href: "/dashboard/brand-kit", exact: false },
  { key: "billing", href: "/dashboard/billing", exact: false },
] as const;

/**
 * Header navigation with active-page states (UX sprint 2026-07-17). The
 * recorder — the core product — is now reachable from every page, and the
 * current section is visibly marked.
 */
export function NavLinks() {
  const t = useTranslations("common");
  const pathname = usePathname();

  return (
    <>
      {LINKS.map((link) => {
        const active = link.exact
          ? pathname === link.href
          : pathname.startsWith(link.href);
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
