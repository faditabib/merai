import type { Metadata } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { dirFor, routing } from "@/i18n/routing";
import "../globals.css";

// Full Arabic + Latin coverage; loaded once for both locales.
const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "700"],
  variable: "--font-plex-arabic",
});

// Locale pages render dynamically: SSG locale routes (srcRoute /[locale]/…)
// currently break @vercel/next's route→lambda mapping on deploy ("Unable to
// find lambda for route: /ar/login"), returning 404s in production. The
// pages are trivial (landing/auth) and the dashboard is already
// force-dynamic, so on-demand rendering costs nothing meaningful.
// Revisit when the builder handles Next 16 SSG locale routes.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return { title: t("title"), description: t("description") };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  return (
    <html lang={locale} dir={dirFor(locale)} className={plexArabic.variable}>
      <body className="antialiased">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
