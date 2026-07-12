"use client";

import { useTranslations } from "next-intl";
import {
  CAPTION_PRESETS,
  CAPTION_STYLE_SPECS,
  type CaptionBrandColors,
  type CaptionOutline,
  type CaptionStyleSpec,
} from "@merai/core";
import { CaptionPreview, captionSpanStyle } from "@/components/caption-preview";

export interface CaptionStudioProps {
  /** The working caption spec (controlled). */
  spec: CaptionStyleSpec;
  onChange: (spec: CaptionStyleSpec) => void;
  brandColors?: CaptionBrandColors | null;
  /** Optional "set as default" affordance (Brand Kit page only). */
  onSetDefault?: () => void;
  savingDefault?: boolean;
  savedDefault?: boolean;
  /** Compact mode hides the big preview (the editor shows it over the video). */
  compact?: boolean;
}

const DEFAULT_OUTLINE: CaptionOutline = { color: "#000000", width: 0.1 };
const TEXT_SWATCHES = ["#FFFFFF", "#FFD400", "#111111", "#F5E9C8"];

type Position = "top" | "center" | "bottom";
function anchorToPosition(a: number): Position {
  return a <= 0.3 ? "top" : a <= 0.6 ? "center" : "bottom";
}
const POSITION_ANCHOR: Record<Position, number> = { top: 0.12, center: 0.5, bottom: 0.85 };

/**
 * Caption Studio (Build 6B.3): a creator-facing caption designer — preset
 * gallery + live preview + controls, all driven by a single working spec.
 * The preview is the shared CaptionPreview, so it matches the export.
 */
export function CaptionStudio(props: CaptionStudioProps) {
  const t = useTranslations("captionStudio");
  const spec = props.spec;
  const patch = (p: Partial<CaptionStyleSpec>) => props.onChange({ ...spec, ...p });

  return (
    <div className="flex flex-col gap-5">
      {/* Preset gallery */}
      <div>
        <h3 className="mb-2 text-sm font-medium">{t("galleryTitle")}</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {CAPTION_PRESETS.map((preset) => {
            const selected = spec.token === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => props.onChange(CAPTION_STYLE_SPECS[preset.id])}
                aria-pressed={selected}
                className={`flex flex-col overflow-hidden rounded-xl border text-start transition ${
                  selected ? "border-accent ring-1 ring-accent" : "border-border hover:border-accent"
                }`}
              >
                <CaptionPreview
                  spec={CAPTION_STYLE_SPECS[preset.id]}
                  sampleText={t("sample")}
                  brandColors={props.brandColors}
                  fontPx={11}
                  aspect="16 / 10"
                />
                <span className="flex flex-col gap-0.5 p-2">
                  <span className={`text-sm font-medium ${selected ? "text-accent" : ""}`}>
                    {t(`presets.${preset.id}`)}
                  </span>
                  <span className="flex items-center gap-1.5 text-[11px] text-muted">
                    <span className="rounded bg-border/60 px-1.5 py-0.5">
                      {t(`animations.${preset.animation}`)}
                    </span>
                    <span className="truncate">{t(`useCases.${preset.useCaseKey}`)}</span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className={props.compact ? "" : "grid gap-5 lg:grid-cols-[220px_1fr]"}>
        {/* Live preview (hidden in compact editor mode — video shows it there) */}
        {!props.compact && (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{t("previewTitle")}</h3>
            <CaptionPreview
              spec={spec}
              sampleText={t("sampleLong")}
              brandColors={props.brandColors}
              fontPx={20}
              className="mx-auto w-full max-w-[220px]"
            />
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-col gap-4">
          <h3 className="text-sm font-medium">{t("controlsTitle")}</h3>

          {/* Position */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">{t("position")}</span>
            <div className="flex gap-1.5">
              {(["top", "center", "bottom"] as Position[]).map((pos) => {
                const active = anchorToPosition(spec.verticalAnchor) === pos;
                return (
                  <button
                    key={pos}
                    type="button"
                    onClick={() => patch({ verticalAnchor: POSITION_ANCHOR[pos] })}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-xs ${
                      active ? "border-accent bg-accent/15 text-accent" : "border-border text-muted hover:border-accent"
                    }`}
                  >
                    {t(`positions.${pos}`)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Font scale */}
          <label className="flex flex-col gap-1.5 text-xs text-muted">
            {t("fontScale", { percent: Math.round((spec.fontScale ?? 1) * 100) })}
            <input
              type="range"
              min={60}
              max={180}
              step={5}
              value={Math.round((spec.fontScale ?? 1) * 100)}
              onChange={(e) => patch({ fontScale: Number(e.target.value) / 100 })}
              dir="ltr"
            />
          </label>

          {/* Text color / brand color */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">{t("textColor")}</span>
            <div className="flex flex-wrap items-center gap-2">
              {TEXT_SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  onClick={() => patch({ textColor: c, useBrandColor: undefined })}
                  className={`h-7 w-7 rounded-full border-2 ${
                    spec.textColor === c && !spec.useBrandColor ? "border-accent" : "border-border"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
              {props.brandColors && (
                <button
                  type="button"
                  onClick={() =>
                    patch({ useBrandColor: spec.backgroundColor ? "box" : "text" })
                  }
                  className={`rounded-lg border px-2.5 py-1 text-xs ${
                    spec.useBrandColor ? "border-accent bg-accent/15 text-accent" : "border-border text-muted hover:border-accent"
                  }`}
                >
                  {t("useBrandColor")}
                </button>
              )}
            </div>
          </div>

          {/* Toggles */}
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={Boolean(spec.outline)}
                onChange={(e) => patch({ outline: e.target.checked ? DEFAULT_OUTLINE : undefined })}
              />
              {t("outline")}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={Boolean(spec.backgroundColor)}
                onChange={(e) =>
                  patch({
                    backgroundColor: e.target.checked ? "rgba(0,0,0,0.6)" : undefined,
                    // Dropping the box also drops a brand-box color intent.
                    useBrandColor: e.target.checked ? spec.useBrandColor : spec.useBrandColor === "box" ? undefined : spec.useBrandColor,
                  })
                }
              />
              {t("backgroundBox")}
            </label>
          </div>

          {props.onSetDefault && (
            <div className="flex items-center gap-3 border-t border-border pt-3">
              <button
                type="button"
                onClick={props.onSetDefault}
                disabled={props.savingDefault}
                className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
              >
                {props.savingDefault ? t("saving") : t("setDefault")}
              </button>
              {props.savedDefault && (
                <span className="text-xs text-emerald-600">{t("defaultSaved")}</span>
              )}
              {/* tiny inline chip of the current look */}
              <span
                className="ms-auto truncate rounded px-2 py-0.5 text-xs"
                style={captionSpanStyle(
                  props.brandColors ? spec : spec,
                  12,
                )}
              >
                {t("sample")}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
