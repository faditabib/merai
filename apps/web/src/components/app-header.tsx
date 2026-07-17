import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { NavLinks } from "@/components/nav-links";
import { SignOutButton } from "@/components/sign-out-button";

/** Shared authenticated-area header — nav with active states (UX sprint). */
export async function AppHeader() {
  const t = await getTranslations("common");
  return (
    <header className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
      <Link href="/dashboard" className="text-xl font-bold text-accent">
        {t("appName")}
      </Link>
      <nav className="flex items-center gap-4 overflow-x-auto">
        <NavLinks />
        <LocaleSwitcher />
        <SignOutButton />
      </nav>
    </header>
  );
}
