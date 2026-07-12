"use client";

import { useTranslations } from "next-intl";
import {
  captionConfigForExport,
  CAPTION_STYLE_SPECS,
  CAPTION_STYLE_TOKENS,
  type CaptionBrandColors,
  type CaptionStyleSpec,
  type CaptionStyleToken,
} from "@merai/core";

export interface CaptionStylePickerProps {
  value: CaptionStyleToken | string;
  onChange: (token: CaptionStyleToken) => void;
  /** Brand colors so brand-* presets preview with the creator's real colors. */
  brandColors?: CaptionBrandColors | null;
  disabled?: boolean;
}

/** Resolve the spec to preview: brand-* presets pull the creator's colors. */
function previewSpec(token: CaptionStyleToken, brand?: CaptionBrandColors | null): CaptionStyleSpec {
  const spec = CAPTION_STYLE_SPECS[token];
  return (brand && captionConfigForExport(token, brand)) || spec;
}

/**
 * Visual caption preset selector (Build 6B.1, extended 6B.2). Each option is a
 * miniature frame rendered with the preset's real look — colors, weight, size
 * scale, outline, and (for brand presets) the creator's brand color — so
 * creators pick by sight. Used by the editor and the Brand Kit page.
 */
export function CaptionStylePicker(props: CaptionStylePickerProps) {
  const t = useTranslations("captionStudio");

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {CAPTION_STYLE_TOKENS.map((token) => {
        const spec = previewSpec(token, props.brandColors);
        const selected = props.value === token;
        const sample = spec.uppercaseLatin ? t("sample").toUpperCase() : t("sample");
        return (
          <button
            key={token}
            type="button"
            disabled={props.disabled}
            onClick={() => props.onChange(token)}
            aria-pressed={selected}
            className={`flex flex-col overflow-hidden rounded-xl border text-start transition ${
              selected ? "border-accent ring-1 ring-accent" : "border-border hover:border-accent"
            } disabled:opacity-50`}
          >
            <span className="relative block aspect-video w-full bg-neutral-900">
              <span
                className="absolute inset-x-1 flex justify-center"
                style={{ top: `${spec.verticalAnchor * 100}%`, transform: "translateY(-50%)" }}
              >
                <span
                  className="max-w-full truncate rounded px-1.5 py-0.5 leading-tight"
                  style={{
                    fontSize: `${11 * (spec.fontScale ?? 1)}px`,
                    fontWeight: spec.fontWeight,
                    color: spec.textColor,
                    backgroundColor: spec.backgroundColor ?? "transparent",
                    WebkitTextStroke: spec.outline
                      ? `${Math.max(0.5, spec.outline.width * 8)}px ${spec.outline.color}`
                      : undefined,
                    textShadow:
                      spec.backgroundColor || spec.outline ? undefined : "0 1px 2px rgba(0,0,0,0.9)",
                  }}
                >
                  {spec.wordLevel ? (
                    <>
                      <span style={{ color: spec.highlightColor }}>{t("sampleHighlighted")}</span>{" "}
                      {t("sampleRest")}
                    </>
                  ) : (
                    sample
                  )}
                </span>
              </span>
            </span>
            <span className={`px-2 py-1.5 text-xs ${selected ? "text-accent" : "text-muted"}`}>
              {t(`presets.${token}`)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
