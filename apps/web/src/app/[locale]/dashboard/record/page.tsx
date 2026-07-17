import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/page-header";
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
  const tc = await getTranslations("common");

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="flex flex-1 flex-col gap-6 px-6 py-10">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
          <PageHeader
            crumbs={[{ label: tc("dashboard"), href: "/dashboard" }]}
            title={t("pageTitle")}
            subtitle={t("pageSubtitle")}
          />
          <RecordFlow />
        </div>
      </main>
    </div>
  );
}
