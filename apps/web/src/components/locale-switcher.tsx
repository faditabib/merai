"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

/** Switches between Arabic and English, preserving the current path. */
export function LocaleSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const t = useTranslations("common");
  const other = locale === "ar" ? "en" : "ar";

  return (
    <Link
      href={pathname}
      locale={other}
      aria-label={t("language")}
      className="rounded-lg border border-border px-3 py-1.5 text-sm hover:border-accent hover:text-accent"
    >
      {other === "ar" ? "العربية" : "English"}
    </Link>
  );
}
