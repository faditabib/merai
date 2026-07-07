import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";

// Per-user page — always rendered at request time, never prerendered.
export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { SignOutButton } from "@/components/sign-out-button";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect({ href: "/login", locale });
  }

  const t = await getTranslations("dashboard");
  const tCommon = await getTranslations("common");
  const name = user?.user_metadata?.display_name ?? user?.email ?? "";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <span className="text-xl font-bold text-accent">
          {tCommon("appName")}
        </span>
        <nav className="flex items-center gap-3">
          <LocaleSwitcher />
          <SignOutButton />
        </nav>
      </header>

      <main className="flex flex-1 flex-col gap-8 px-6 py-10">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="mt-1 text-muted">{t("greeting", { name })}</p>
        </div>

        <section className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border p-12 text-center">
          <h2 className="text-lg font-semibold">{t("emptyTitle")}</h2>
          <p className="max-w-md text-sm leading-relaxed text-muted">
            {t("emptyBody")}
          </p>
          <button
            type="button"
            disabled
            className="mt-3 cursor-not-allowed rounded-xl bg-accent px-6 py-2.5 font-semibold text-accent-foreground opacity-50"
          >
            {t("newProject")}
          </button>
        </section>
      </main>
    </div>
  );
}
