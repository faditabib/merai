import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { SignOutButton } from "@/components/sign-out-button";

/** Shared authenticated-area header. */
export async function AppHeader() {
  const t = await getTranslations("common");
  return (
    <header className="flex items-center justify-between border-b border-border px-6 py-4">
      <Link href="/dashboard" className="text-xl font-bold text-accent">
        {t("appName")}
      </Link>
      <nav className="flex items-center gap-3">
        <Link
          href="/dashboard/brand-kit"
          className="text-sm text-muted transition hover:text-accent"
        >
          {t("brandKit")}
        </Link>
        <LocaleSwitcher />
        <SignOutButton />
      </nav>
    </header>
  );
}
