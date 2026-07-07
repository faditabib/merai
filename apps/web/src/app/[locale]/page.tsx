import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/components/locale-switcher";

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("landing");
  const tCommon = await getTranslations("common");

  const features = [
    { title: t("feature1Title"), body: t("feature1Body") },
    { title: t("feature2Title"), body: t("feature2Body") },
    { title: t("feature3Title"), body: t("feature3Body") },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <span className="text-xl font-bold text-accent">
          {tCommon("appName")}
        </span>
        <nav className="flex items-center gap-4">
          <LocaleSwitcher />
          <Link
            href="/login"
            className="text-sm font-medium hover:text-accent"
          >
            {tCommon("login")}
          </Link>
        </nav>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-16 px-6 py-20">
        <section className="max-w-3xl text-center">
          <h1 className="text-4xl font-bold leading-relaxed sm:text-5xl sm:leading-relaxed">
            {t("heroTitle")}
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-muted">
            {t("heroSubtitle")}
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/signup"
              className="rounded-xl bg-accent px-8 py-3 font-semibold text-accent-foreground transition hover:opacity-90"
            >
              {t("ctaPrimary")}
            </Link>
            <Link href="/login" className="text-sm text-muted hover:text-accent">
              {t("ctaSecondary")}
            </Link>
          </div>
        </section>

        <section className="grid w-full max-w-4xl gap-6 sm:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="rounded-2xl border border-border bg-card p-6 text-start"
            >
              <h2 className="font-semibold">{feature.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {feature.body}
              </p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-border px-6 py-6 text-center text-sm text-muted">
        {t("footerNote")}
      </footer>
    </div>
  );
}
