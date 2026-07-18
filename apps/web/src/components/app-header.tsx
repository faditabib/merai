import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { NavLinks } from "@/components/nav-links";
import { SignOutButton } from "@/components/sign-out-button";

/**
 * Authenticated app shell (design transformation 2026-07-18): a fixed
 * inline-end sidebar on lg+ (logo, icon nav, REAL plan widget) plus a
 * topbar (greeting with avatar, locale, sign-out; nav links inline on
 * small screens where the sidebar is hidden). Every page keeps its own
 * <main> — a CSS sibling rule pads it beside the sidebar, so no page
 * markup changed. All data shown is real (auth user + profiles tier).
 */
export async function AppHeader() {
  const t = await getTranslations("common");
  const tb = await getTranslations("billing");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const name =
    (user?.user_metadata?.display_name as string | undefined) ??
    user?.email?.split("@")[0] ??
    "";
  let tier = "starter";
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("subscription_tier")
      .eq("id", user.id)
      .maybeSingle();
    tier = profile?.subscription_tier ?? "starter";
  }

  return (
    <>
      {/* Sidebar (lg+) — fixed on the inline-end side (right in RTL). */}
      <aside className="app-shell-anchor fixed inset-y-0 end-0 z-30 hidden w-60 flex-col border-s border-border bg-card px-4 py-6 lg:flex">
        <Link href="/dashboard" className="px-3 text-xl font-bold text-accent">
          {t("appName")}
        </Link>
        <nav className="mt-8 flex flex-col gap-1">
          <NavLinks variant="side" />
        </nav>
        {/* Plan widget — REAL tier from profiles; upgrade goes to billing. */}
        <div className="mt-auto rounded-xl border border-border p-3">
          <p className="text-xs text-muted">{tb("currentPlan")}</p>
          <p className="mt-0.5 text-sm font-semibold">{tb(`tiers.${tier}`)}</p>
          {tier !== "pro" && (
            <Link
              href="/dashboard/billing"
              className="mt-2 block text-sm font-medium text-accent underline-offset-4 hover:underline"
            >
              {tb("managePlan")} ←
            </Link>
          )}
        </div>
      </aside>

      {/* Topbar — full-width on mobile, beside the sidebar on lg+. */}
      <header className="flex items-center justify-between gap-4 border-b border-border bg-card px-6 py-3.5 lg:me-60">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/15 text-sm font-bold text-accent"
          >
            {name.slice(0, 1) || "م"}
          </span>
          <span className="text-sm font-medium">{t("greeting", { name })}</span>
        </div>
        <nav className="flex items-center gap-4 overflow-x-auto">
          <span className="flex items-center gap-4 lg:hidden">
            <NavLinks />
          </span>
          <LocaleSwitcher />
          <SignOutButton />
        </nav>
      </header>
    </>
  );
}
