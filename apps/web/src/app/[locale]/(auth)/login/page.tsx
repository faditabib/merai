import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { AuthForm } from "@/components/auth-form";

export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");
  const tCommon = await getTranslations("common");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6">
      <Link href="/" className="text-2xl font-bold text-accent">
        {tCommon("appName")}
      </Link>
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8">
        <h1 className="mb-6 text-xl font-semibold">{t("loginTitle")}</h1>
        <AuthForm mode="login" />
      </div>
    </main>
  );
}
