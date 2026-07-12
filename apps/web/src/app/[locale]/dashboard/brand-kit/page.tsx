import { getTranslations } from "next-intl/server";
import {
  brandKitRowSchema,
  logoOverlayPrefSchema,
  type BrandKitRow,
  type CreatorStyleId,
  type LogoOverlayPref,
} from "@merai/core";
import { Link, redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/app-header";
import { BrandKitForm } from "@/components/brand-kit-form";

// Per-user page — always rendered at request time, never prerendered.
export const dynamic = "force-dynamic";

const BRAND_BUCKET = "brand-assets";

export default async function BrandKitPage({
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

  const t = await getTranslations("brandKit");

  // One kit per creator (unique owner_id); RLS scopes this to the owner.
  const { data: row, error } = await supabase
    .from("brand_kits")
    .select(
      "id, owner_id, name, logo_path, primary_color, secondary_color, accent_color, caption_style_default, overlay_default, lower_third_default, caption_default_config",
    )
    .eq("owner_id", user!.id)
    .maybeSingle();

  // A parse failure or query error shouldn't wedge the page — fall back to a
  // fresh form (kit = null) so the creator can still set up branding. A hard
  // error (RLS/connection) shows the recoverable error state.
  let kit: BrandKitRow | null = null;
  if (row) {
    const parsed = brandKitRowSchema.safeParse(row);
    if (parsed.success) kit = parsed.data;
  }

  // Sign the stored logo for the preview (private bucket — signed URLs only).
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
        <div className="flex flex-col gap-1">
          <Link
            href="/dashboard"
            className="text-sm text-muted hover:text-accent"
          >
            ← {t("pageTitle")}
          </Link>
          <h1 className="text-2xl font-bold">{t("pageTitle")}</h1>
          <p className="text-muted">{t("pageSubtitle")}</p>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-red-500">
            {t("loadError")}
          </p>
        ) : (
          <BrandKitForm
            ownerId={user!.id}
            initialKit={kit}
            initialLogoUrl={logoUrl}
            initialStyleId={
              (user!.user_metadata?.creator_style as CreatorStyleId | undefined) ?? null
            }
            initialLogoOverlay={
              (logoOverlayPrefSchema.safeParse(user!.user_metadata?.logo_overlay).data as
                | LogoOverlayPref
                | undefined) ?? null
            }
          />
        )}
      </main>
    </div>
  );
}
