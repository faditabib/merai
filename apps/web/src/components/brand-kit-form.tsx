"use client";

import { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  CAPTION_STYLE_SPECS,
  DEFAULT_CAPTION_STYLE,
  gradientOverlayConfigSchema,
  type BrandKitRow,
  type CaptionStyleSpec,
} from "@merai/core";
import { createClient } from "@/lib/supabase/client";
import { CaptionStudio } from "@/components/caption-studio";

const BRAND_BUCKET = "brand-assets";
const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

const GRADIENT_DEFAULTS = gradientOverlayConfigSchema.parse({});

export interface BrandKitFormProps {
  ownerId: string;
  initialKit: BrandKitRow | null;
  /** Signed URL for the stored logo, when one exists. */
  initialLogoUrl: string | null;
}

/**
 * Brand Kit settings (Build 6B.1): identity the creator fills once — colors,
 * logo, default caption preset, gradient/lower-third defaults — and every
 * export can then carry. Saves via owner-RLS upsert; the logo goes to the
 * private brand-assets bucket (signed URLs only).
 */
export function BrandKitForm(props: BrandKitFormProps) {
  const t = useTranslations("brandKit");
  const supabase = useMemo(() => createClient(), []);
  const kit = props.initialKit;

  const [name, setName] = useState(kit?.name ?? "");
  const [primary, setPrimary] = useState(kit?.primary_color ?? "#7C3AED");
  const [secondary, setSecondary] = useState(kit?.secondary_color ?? "#0EA5E9");
  const [accent, setAccent] = useState(kit?.accent_color ?? "#F59E0B");
  // The working caption spec for the studio: the saved default config if
  // present, else the default-token's base spec.
  const [captionSpec, setCaptionSpec] = useState<CaptionStyleSpec>(
    kit?.caption_default_config ??
      CAPTION_STYLE_SPECS[kit?.caption_style_default ?? DEFAULT_CAPTION_STYLE],
  );

  const [gradientOn, setGradientOn] = useState(kit?.overlay_default != null);
  const [gradientOpacity, setGradientOpacity] = useState(
    kit?.overlay_default?.opacity ?? GRADIENT_DEFAULTS.opacity,
  );
  const [gradientHeight, setGradientHeight] = useState(
    kit?.overlay_default?.heightPct ?? GRADIENT_DEFAULTS.heightPct,
  );

  const [ltName, setLtName] = useState(kit?.lower_third_default?.name ?? "");
  const [ltTitle, setLtTitle] = useState(kit?.lower_third_default?.title ?? "");
  const [ltSubtitle, setLtSubtitle] = useState(
    kit?.lower_third_default?.subtitle ?? "",
  );

  const [logoUrl, setLogoUrl] = useState<string | null>(props.initialLogoUrl);
  const [logoPath, setLogoPath] = useState<string | null>(kit?.logo_path ?? null);
  const [logoError, setLogoError] = useState(false);
  const logoInput = useRef<HTMLInputElement | null>(null);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);

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

  async function save() {
    setSaving(true);
    setSaved(false);
    setSaveError(false);
    try {
      const overlay_default = gradientOn
        ? { opacity: gradientOpacity, heightPct: gradientHeight, color: "#000000" }
        : null;
      const lower_third_default = ltName.trim()
        ? {
            name: ltName.trim(),
            ...(ltTitle.trim() ? { title: ltTitle.trim() } : {}),
            ...(ltSubtitle.trim() ? { subtitle: ltSubtitle.trim() } : {}),
            accentColor: primary,
            textColor: "#FFFFFF",
          }
        : null;

      const { error } = await supabase.from("brand_kits").upsert(
        {
          owner_id: props.ownerId,
          name: name.trim(),
          logo_path: logoPath,
          primary_color: primary,
          secondary_color: secondary,
          accent_color: accent,
          // The default preset token (for display/back-compat) + the full
          // crafted default spec (Build 6B.3, single default preference).
          caption_style_default: captionSpec.token,
          caption_default_config: captionSpec,
          overlay_default,
          lower_third_default,
        },
        { onConflict: "owner_id" },
      );
      if (error) throw error;
      setSaved(true);
    } catch (err) {
      console.error("brand kit save failed", err);
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  }

  const colorField = (
    label: string,
    value: string,
    onChange: (v: string) => void,
  ) => (
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

  return (
    <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
      <div className="flex flex-col gap-6">
        {/* Identity */}
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
          <h2 className="font-semibold">{t("identityTitle")}</h2>
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
        </section>

        {/* Colors */}
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
          <h2 className="font-semibold">{t("colorsTitle")}</h2>
          <div className="grid gap-2 sm:grid-cols-3">
            {colorField(t("primaryColor"), primary, setPrimary)}
            {colorField(t("secondaryColor"), secondary, setSecondary)}
            {colorField(t("accentColor"), accent, setAccent)}
          </div>
        </section>

        {/* Default caption preset */}
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
          <h2 className="font-semibold">{t("captionTitle")}</h2>
          <p className="text-sm text-muted">{t("captionHint")}</p>
          <CaptionStudio
            spec={captionSpec}
            onChange={setCaptionSpec}
            brandColors={{ primary, accent }}
          />
        </section>

        {/* Gradient overlay defaults */}
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
          <label className="flex items-center gap-2 font-semibold">
            <input
              type="checkbox"
              checked={gradientOn}
              onChange={(e) => setGradientOn(e.target.checked)}
            />
            {t("gradientTitle")}
          </label>
          <p className="text-sm text-muted">{t("gradientHint")}</p>
          {gradientOn && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm">
                {t("gradientOpacity", {
                  percent: Math.round(gradientOpacity * 100),
                })}
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={Math.round(gradientOpacity * 100)}
                  onChange={(e) => setGradientOpacity(Number(e.target.value) / 100)}
                  dir="ltr"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                {t("gradientHeight", {
                  percent: Math.round(gradientHeight * 100),
                })}
                <input
                  type="range"
                  min={10}
                  max={60}
                  value={Math.round(gradientHeight * 100)}
                  onChange={(e) => setGradientHeight(Number(e.target.value) / 100)}
                  dir="ltr"
                />
              </label>
            </div>
          )}
        </section>

        {/* Lower third defaults */}
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
          <h2 className="font-semibold">{t("lowerThirdTitle")}</h2>
          <p className="text-sm text-muted">{t("lowerThirdHint")}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1.5 text-sm">
              {t("lowerThirdName")}
              <input
                type="text"
                value={ltName}
                maxLength={80}
                onChange={(e) => setLtName(e.target.value)}
                placeholder={t("lowerThirdNamePlaceholder")}
                className="rounded-xl border border-border bg-transparent px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              {t("lowerThirdRole")}
              <input
                type="text"
                value={ltTitle}
                maxLength={120}
                onChange={(e) => setLtTitle(e.target.value)}
                placeholder={t("lowerThirdRolePlaceholder")}
                className="rounded-xl border border-border bg-transparent px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              {t("lowerThirdSubtitle")}
              <input
                type="text"
                value={ltSubtitle}
                maxLength={120}
                onChange={(e) => setLtSubtitle(e.target.value)}
                className="rounded-xl border border-border bg-transparent px-3 py-2"
              />
            </label>
          </div>
        </section>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="rounded-xl bg-accent px-6 py-2.5 font-semibold text-accent-foreground disabled:opacity-50"
          >
            {saving ? t("saving") : t("save")}
          </button>
          {saved && <span className="text-sm text-emerald-600">{t("savedNote")}</span>}
          {saveError && (
            <span role="alert" className="text-sm text-red-500">
              {t("saveError")}
            </span>
          )}
        </div>
      </div>

      {/* Live preview: gradient + lower third + caption sample on a mock frame. */}
      <aside className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted">{t("previewTitle")}</h2>
        <div className="relative aspect-video overflow-hidden rounded-2xl bg-neutral-800">
          {gradientOn && (
            <div
              className="absolute inset-x-0 bottom-0"
              style={{
                height: `${gradientHeight * 100}%`,
                background: `linear-gradient(to bottom, transparent, rgba(0,0,0,${gradientOpacity}))`,
              }}
            />
          )}
          {ltName.trim() && (
            <div
              className="absolute bottom-[8%] flex flex-col gap-0.5 border-s-4 ps-2 text-white"
              style={{ borderColor: primary, insetInlineStart: "5%" }}
            >
              <span className="text-sm font-bold leading-tight">{ltName}</span>
              {ltTitle.trim() && (
                <span className="text-xs leading-tight opacity-90">{ltTitle}</span>
              )}
              {ltSubtitle.trim() && (
                <span className="text-xs leading-tight opacity-75">{ltSubtitle}</span>
              )}
            </div>
          )}
          <div className="absolute inset-x-0 top-[62%] flex justify-center">
            <span className="rounded bg-black/55 px-2 py-0.5 text-xs text-white">
              {t("previewCaption")}
            </span>
          </div>
        </div>
        <p className="text-xs leading-relaxed text-muted">{t("previewNote")}</p>
      </aside>
    </div>
  );
}
