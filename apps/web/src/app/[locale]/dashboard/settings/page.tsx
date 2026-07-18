import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "@/components/settings-form";

// Per-user page — always rendered at request time, never prerendered.
export const dynamic = "force-dynamic";

/** Account settings (refinement 2026-07-18) — correct SaaS IA, real data,
 *  deliberately not overbuilt. */
export default async function SettingsPage({
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

  const t = await getTranslations("settings");
  const tc = await getTranslations("common");

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="flex flex-1 flex-col gap-6 px-6 py-10">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
          <PageHeader
            crumbs={[{ label: tc("dashboard"), href: "/dashboard" }]}
            title={t("pageTitle")}
            subtitle={t("pageSubtitle")}
          />
          <SettingsForm
            email={user!.email ?? ""}
            initialDisplayName={
              (user!.user_metadata?.display_name as string | undefined) ?? ""
            }
          />
        </div>
      </main>
    </div>
  );
}
