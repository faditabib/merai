import { getTranslations } from "next-intl/server";
import { brandKitRowSchema, type BrandKitRow } from "@merai/core";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/app-header";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { PageHeader } from "@/components/page-header";

// Per-user page — always rendered at request time, never prerendered.
export const dynamic = "force-dynamic";

const BRAND_BUCKET = "brand-assets";

/**
 * Creator Onboarding Wizard route (Build 6C.4). Always reachable — re-running
 * it is a harmless guided Brand-Kit writer (identity fields preserved by
 * `creatorStyleBrandKitPatch`); the dashboard controls when it's suggested.
 */
export default async function OnboardingPage({
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

  const t = await getTranslations("onboardingWizard");
  const tc = await getTranslations("common");

  // Existing kit (if any) so a re-run edits rather than resets.
  const { data: row } = await supabase
    .from("brand_kits")
    .select(
      "id, owner_id, name, logo_path, primary_color, secondary_color, accent_color, caption_style_default, overlay_default, lower_third_default, caption_default_config",
    )
    .eq("owner_id", user!.id)
    .maybeSingle();

  let kit: BrandKitRow | null = null;
  if (row) {
    const parsed = brandKitRowSchema.safeParse(row);
    if (parsed.success) kit = parsed.data;
  }

  let logoUrl: string | null = null;
  if (kit?.logo_path) {
    const objectName = kit.logo_path.slice(BRAND_BUCKET.length + 1);
    const { data: signed } = await supabase.storage
      .from(BRAND_BUCKET)
      .createSignedUrl(objectName, 3600);
    logoUrl = signed?.signedUrl ?? null;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="flex flex-1 flex-col gap-6 px-6 py-10">
        <div className="mx-auto w-full max-w-3xl">
          <PageHeader
            crumbs={[{ label: tc("dashboard"), href: "/dashboard" }]}
            title={t("title")}
            subtitle={t("subtitle")}
          />
        </div>
        <OnboardingWizard ownerId={user!.id} initialKit={kit} initialLogoUrl={logoUrl} />
      </main>
    </div>
  );
}
