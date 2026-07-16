"use client";

import { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  CREATOR_TYPES,
  creatorStyleBrandKitPatch,
  creatorTypeDefaults,
  getCreatorStyle,
  CREATOR_STYLES,
  type BrandKitRow,
  type CreatorStyleId,
  type CreatorTypeId,
} from "@merai/core";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { CreatorStylePreview } from "@/components/creator-style-preview";

const BRAND_BUCKET = "brand-assets";
const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

/** Emoji type marks — dependency-free, locale-neutral. */
const TYPE_ICONS: Record<CreatorTypeId, string> = {
  "content-creator": "🎬",
  podcast: "🎙️",
  coach: "💪",
  doctor: "🩺",
  educator: "📚",
  business: "💼",
};

const STEP_COUNT = 4;

export interface OnboardingWizardProps {
  ownerId: string;
  /** Existing kit (identity preserved on re-run) — null for fresh creators. */
  initialKit: BrandKitRow | null;
  initialLogoUrl: string | null;
}

/**
 * Creator Onboarding Wizard (Build 6C.4). Four skippable steps — type →
 * brand basics → look → summary — that end in ONE guided write through
 * channels that already exist: `creatorStyleBrandKitPatch` → brand_kits
 * upsert, `user_metadata` flags (creator_type / creator_style /
 * onboarding_completed_at / logo_overlay), and an ai_preferences intent seed.
 * Zero migrations; re-running edits rather than resets (identity preserved).
 */
export function OnboardingWizard(props: OnboardingWizardProps) {
  const t = useTranslations("onboardingWizard");
  const ts = useTranslations("creatorStyles");
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const kit = props.initialKit;

  const [step, setStep] = useState(0);
  const [typeId, setTypeId] = useState<CreatorTypeId | null>(null);
  const [styleId, setStyleId] = useState<CreatorStyleId | null>(null);

  const [name, setName] = useState(kit?.name ?? "");
  const [primary, setPrimary] = useState(kit?.primary_color ?? "#7C3AED");
  const [secondary, setSecondary] = useState(kit?.secondary_color ?? "#0EA5E9");
  const [accent, setAccent] = useState(kit?.accent_color ?? "#F59E0B");
  // Once the creator edits a color, style switches stop re-seeding the palette.
  const [colorsEdited, setColorsEdited] = useState(false);

  const [logoUrl, setLogoUrl] = useState<string | null>(props.initialLogoUrl);
  const [logoPath, setLogoPath] = useState<string | null>(kit?.logo_path ?? null);
  const [logoError, setLogoError] = useState(false);
  const logoInput = useRef<HTMLInputElement | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const seedColors = (id: CreatorStyleId) => {
    const style = getCreatorStyle(id);
    if (!style) return;
    setPrimary(style.colors.primary);
    setSecondary(style.colors.secondary);
    setAccent(style.colors.accent);
  };

  const pickType = (id: CreatorTypeId) => {
    setTypeId(id);
    const defaults = creatorTypeDefaults(id);
    if (defaults) {
      setStyleId(defaults.style.id);
      if (!colorsEdited) seedColors(defaults.style.id);
    }
    setStep(1);
  };

  const pickStyle = (id: CreatorStyleId) => {
    setStyleId(id);
    if (!colorsEdited) seedColors(id);
  };

  const editColor = (set: (v: string) => void) => (v: string) => {
    set(v);
    setColorsEdited(true);
  };

  async function uploadLogo(file: File) {
    setLogoError(false);
    if (!LOGO_TYPES.includes(file.type) || file.size > LOGO_MAX_BYTES) {
      setLogoError(true);
      return;
    }
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
    const objectName = `${props.ownerId}/logo.${ext}`;
    const { error } = await supabase.storage
      .from(BRAND_BUCKET)
      .upload(objectName, file, { upsert: true, contentType: file.type });
    if (error) {
      setLogoError(true);
      return;
    }
    setLogoPath(`${BRAND_BUCKET}/${objectName}`);
    setLogoUrl(URL.createObjectURL(file));
  }

  /** Skip = never re-nag, change nothing else. */
  const skip = () => {
    void supabase.auth.updateUser({
      data: { onboarding_completed_at: new Date().toISOString() },
    });
    router.push("/dashboard");
  };

  async function finish(target: "upload" | "dashboard") {
    if (!typeId || !styleId) return;
    const style = getCreatorStyle(styleId);
    const defaults = creatorTypeDefaults(typeId);
    if (!style || !defaults) return;
    setSaving(true);
    setSaveError(false);
    try {
      // 1. Brand Kit: the tested style patch + the wizard's own inputs on top.
      const patch = creatorStyleBrandKitPatch(style, kit);
      const { error } = await supabase.from("brand_kits").upsert(
        {
          ...patch,
          owner_id: props.ownerId,
          name: name.trim(),
          logo_path: logoPath,
          primary_color: primary,
          secondary_color: secondary,
          accent_color: accent,
        },
        { onConflict: "owner_id" },
      );
      if (error) throw error;

      // 2. Creator-level flags (user_metadata, zero-migration — 6A/6C pattern).
      const { error: metaError } = await supabase.auth.updateUser({
        data: {
          creator_type: typeId,
          creator_style: styleId,
          onboarding_completed_at: new Date().toISOString(),
          ...(style.logo ? { logo_overlay: { enabled: true, ...style.logo } } : {}),
        },
      });
      if (metaError) throw metaError;

      // 3. AI intent seed — the user's explicit wizard choice (best-effort;
      // the assistant panel exposes and edits the same row).
      await supabase
        .from("ai_preferences")
        .upsert({ owner_id: props.ownerId, intent: defaults.intent });

      router.push(target === "upload" ? "/dashboard/new" : "/dashboard");
    } catch (err) {
      console.error("onboarding save failed", err);
      setSaveError(true);
      setSaving(false);
    }
  }

  const colorField = (label: string, value: string, onChange: (v: string) => void) => (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
      <span className="text-sm">{label}</span>
      <span className="flex items-center gap-2">
        <span dir="ltr" className="text-xs tabular-nums text-muted">
          {value.toUpperCase()}
        </span>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-12 cursor-pointer rounded border border-border bg-transparent"
        />
      </span>
    </label>
  );

  const selectedStyle = styleId ? getCreatorStyle(styleId) : undefined;
  const recommendedStyleId = typeId ? creatorTypeDefaults(typeId)?.style.id : undefined;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      {/* Header: progress + skip */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2" aria-label={t("stepOf", { current: step + 1, total: STEP_COUNT })}>
          {Array.from({ length: STEP_COUNT }, (_, i) => (
            <span
              key={i}
              className={`h-2 rounded-full transition-all ${
                i === step ? "w-6 bg-accent" : i < step ? "w-2 bg-accent/50" : "w-2 bg-border"
              }`}
            />
          ))}
          <span className="ms-2 text-xs text-muted">
            {t("stepOf", { current: step + 1, total: STEP_COUNT })}
          </span>
        </div>
        <button
          type="button"
          onClick={skip}
          className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted transition hover:border-accent hover:text-accent"
        >
          {t("skip")}
        </button>
      </div>

      {/* Step 0 — creator type */}
      {step === 0 && (
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="text-xl font-bold">{t("typeTitle")}</h2>
            <p className="mt-1 text-sm text-muted">{t("typeSubtitle")}</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CREATOR_TYPES.map((type) => (
              <button
                key={type.id}
                type="button"
                onClick={() => pickType(type.id)}
                className={`flex flex-col items-start gap-1.5 rounded-2xl border p-4 text-start transition hover:border-accent ${
                  typeId === type.id ? "border-accent ring-1 ring-accent" : "border-border"
                }`}
              >
                <span className="text-2xl" aria-hidden>
                  {TYPE_ICONS[type.id]}
                </span>
                <span className="font-semibold">{t(`types.${type.id}.name`)}</span>
                <span className="text-xs leading-relaxed text-muted">
                  {t(`types.${type.id}.desc`)}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Step 1 — brand basics */}
      {step === 1 && (
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="text-xl font-bold">{t("brandTitle")}</h2>
            <p className="mt-1 text-sm text-muted">{t("brandSubtitle")}</p>
          </div>
          <label className="flex flex-col gap-1.5 text-sm">
            {t("nameLabel")}
            <input
              type="text"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("namePlaceholder")}
              className="rounded-xl border border-border bg-transparent px-3 py-2"
            />
          </label>
          <div className="grid gap-2 sm:grid-cols-3">
            {colorField(t("primaryColor"), primary, editColor(setPrimary))}
            {colorField(t("secondaryColor"), secondary, editColor(setSecondary))}
            {colorField(t("accentColor"), accent, editColor(setAccent))}
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm">{t("logoLabel")}</span>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => logoInput.current?.click()}
                className="rounded-xl border border-border px-4 py-2 text-sm hover:border-accent"
              >
                {logoUrl ? t("logoReplace") : t("logoUpload")}
              </button>
              {logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt=""
                  className="h-12 w-12 rounded-lg border border-border object-contain"
                />
              )}
              <input
                ref={logoInput}
                type="file"
                accept={LOGO_TYPES.join(",")}
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadLogo(file);
                }}
              />
            </div>
            {logoError && (
              <p role="alert" className="text-sm text-red-500">
                {t("logoError")}
              </p>
            )}
          </div>
        </section>
      )}

      {/* Step 2 — look (Creator Style, recommended pre-selected) */}
      {step === 2 && (
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="text-xl font-bold">{t("styleTitle")}</h2>
            <p className="mt-1 text-sm text-muted">{t("styleSubtitle")}</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CREATOR_STYLES.map((style) => {
              const selected = styleId === style.id;
              const recommended = recommendedStyleId === style.id;
              return (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => pickStyle(style.id)}
                  className={`flex flex-col overflow-hidden rounded-xl border text-start transition hover:border-accent ${
                    selected ? "border-accent ring-1 ring-accent" : "border-border"
                  }`}
                >
                  <CreatorStylePreview style={style} sampleText={ts("sample")} />
                  <span className="flex items-center justify-between gap-2 p-2.5">
                    <span className="text-sm font-medium">{ts(`names.${style.id}`)}</span>
                    {recommended && (
                      <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] text-accent">
                        {t("recommended")}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
          {colorsEdited && <p className="text-xs text-muted">{t("colorsKeptNote")}</p>}
        </section>
      )}

      {/* Step 3 — summary + CTAs */}
      {step === 3 && selectedStyle && (
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="text-xl font-bold">{t("summaryTitle")}</h2>
            <p className="mt-1 text-sm text-muted">{t("summarySubtitle")}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-[1.2fr_1fr]">
            <CreatorStylePreview style={selectedStyle} sampleText={ts("sample")} fontPx={16} />
            <dl className="flex flex-col gap-3 rounded-2xl border border-border p-4 text-sm">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted">{t("styleLabel")}</dt>
                <dd className="font-medium">{ts(`names.${selectedStyle.id}`)}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted">{t("yourPalette")}</dt>
                <dd className="flex gap-1.5">
                  {[primary, accent, secondary].map((c, i) => (
                    <span
                      key={i}
                      className="h-5 w-5 rounded-full border border-border/50"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted">{t("formatLabel")}</dt>
                <dd dir="ltr" className="font-medium tabular-nums">
                  {selectedStyle.aspectRatio}
                </dd>
              </div>
            </dl>
          </div>
          {saveError && (
            <p role="alert" className="text-sm text-red-500">
              {t("saveError")}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={() => void finish("upload")}
              className="rounded-xl bg-accent px-6 py-2.5 font-semibold text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              {saving ? t("saving") : t("ctaUpload")}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void finish("dashboard")}
              className="rounded-xl border border-border px-6 py-2.5 font-semibold transition hover:border-accent hover:text-accent disabled:opacity-50"
            >
              {t("ctaDashboard")}
            </button>
          </div>
        </section>
      )}

      {/* Footer nav (back / next) — step 0 advances by picking a card. */}
      {step > 0 && (
        <div className="flex items-center justify-between border-t border-border pt-4">
          <button
            type="button"
            disabled={saving}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            className="rounded-xl border border-border px-5 py-2 text-sm transition hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {t("back")}
          </button>
          {step < 3 && (
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(3, s + 1))}
              className="rounded-xl bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground transition hover:opacity-90"
            >
              {t("next")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
