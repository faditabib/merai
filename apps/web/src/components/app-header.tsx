import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { NavLinks } from "@/components/nav-links";
import {
  NotificationsMenu,
  UserMenu,
  type NotificationItem,
} from "@/components/topbar-menus";

/**
 * Authenticated app shell (design transformation; refined 2026-07-18 after
 * the owner walkthrough): START-side sidebar (right in RTL, left in LTR)
 * holding PRODUCT navigation only + the real plan widget; topbar holds
 * account concerns (user dropdown: settings/subscription/language/theme/
 * logout) and the notifications bell fed by REAL recent events.
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
  const notifications: NotificationItem[] = [];
  if (user) {
    const [{ data: profile }, { data: readyProjects }, { data: doneExports }] =
      await Promise.all([
        supabase.from("profiles").select("subscription_tier").eq("id", user.id).maybeSingle(),
        supabase
          .from("projects")
          .select("id, title, created_at")
          .eq("status", "ready")
          .order("created_at", { ascending: false })
          .limit(3),
        supabase
          .from("exports")
          .select("id, created_at, status")
          .eq("status", "uploaded")
          .order("created_at", { ascending: false })
          .limit(2),
      ]);
    tier = profile?.subscription_tier ?? "starter";
    for (const p of readyProjects ?? []) {
      notifications.push({ id: `p-${p.id}`, kind: "projectReady", title: p.title, at: p.created_at });
    }
    for (const e of doneExports ?? []) {
      notifications.push({ id: `e-${e.id}`, kind: "exportDone", title: "", at: e.created_at });
    }
    notifications.sort((a, b) => (a.at < b.at ? 1 : -1));
  }

  return (
    <>
      {/* Sidebar (lg+) — START side: right in RTL, left in LTR. */}
      <aside className="app-shell-anchor fixed inset-y-0 start-0 z-30 hidden w-60 flex-col border-e border-border bg-card px-4 py-6 lg:flex">
        <Link href="/dashboard" className="px-3 text-xl font-bold text-accent">
          {t("appName")}
        </Link>
        <nav className="mt-8 flex flex-col gap-1">
          <NavLinks variant="side" />
        </nav>
        <div className="mt-auto rounded-xl border border-border p-3">
          <p className="text-xs text-muted">{tb("currentPlan")}</p>
          <p className="mt-0.5 text-sm font-semibold">{tb(`tiers.${tier}`)}</p>
          {tier !== "pro" && (
            <Link
              href="/dashboard/billing"
              className="mt-2 block text-sm font-medium text-accent underline-offset-4 hover:underline"
            >
              {tb("managePlan")}
            </Link>
          )}
        </div>
      </aside>

      {/* Topbar — account concerns only; inline product nav on mobile. */}
      <header className="flex items-center justify-between gap-4 border-b border-border bg-card px-6 py-3 lg:ms-60">
        <nav className="flex items-center gap-4 overflow-x-auto lg:hidden">
          <NavLinks />
        </nav>
        <div className="ms-auto flex items-center gap-2">
          <NotificationsMenu items={notifications.slice(0, 5)} />
          <UserMenu name={name} />
        </div>
      </header>
    </>
  );
}
