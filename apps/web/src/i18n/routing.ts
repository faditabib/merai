import { defineRouting } from "next-intl/routing";

/**
 * Arabic is the default locale and lives at the root path (merai.studio/…);
 * English is the adapted locale at /en/…. See DECISIONS.md.
 */
export const routing = defineRouting({
  locales: ["ar", "en"],
  defaultLocale: "ar",
  localePrefix: "as-needed",
  // Arabic-first product: "/" is always Arabic regardless of browser
  // Accept-Language (Arabic creators often run English browsers). English
  // is an explicit choice at /en. See DECISIONS.md.
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];

export function dirFor(locale: string): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}
