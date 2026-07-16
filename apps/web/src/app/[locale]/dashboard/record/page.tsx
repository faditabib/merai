import { getTranslations } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/app-header";
import { RecordFlow } from "@/components/record/record-flow";

// Per-user page — always rendered at request time, never prerendered.
export const dynamic = "force-dynamic";

/** Recording studio route (Build 7.1) — camera+mic capture into the
 *  existing upload pipeline. */
export default async function RecordPage({
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

  const t = await getTranslations("record");

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="flex flex-1 flex-col gap-6 px-6 py-10">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
          <div className="flex flex-col gap-1">
            <Link href="/dashboard" className="text-sm text-muted hover:text-accent">
              ← {t("backToDashboard")}
            </Link>
            <h1 className="text-2xl font-bold">{t("pageTitle")}</h1>
            <p className="text-muted">{t("pageSubtitle")}</p>
          </div>
          <RecordFlow />
        </div>
      </main>
    </div>
  );
}
