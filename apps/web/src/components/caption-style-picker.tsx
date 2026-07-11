"use client";

import { useTranslations } from "next-intl";
import {
  CAPTION_STYLE_SPECS,
  CAPTION_STYLE_TOKENS,
  type CaptionStyleToken,
} from "@merai/core";

export interface CaptionStylePickerProps {
  value: CaptionStyleToken | string;
  onChange: (token: CaptionStyleToken) => void;
  disabled?: boolean;
}

/**
 * Visual caption preset selector (Build 6B.1): each option is a miniature
 * video frame with the preset's real colors/weight/placement, so creators
 * pick by look, not by label. Used by the editor and the Brand Kit page.
 */
export function CaptionStylePicker(props: CaptionStylePickerProps) {
  const t = useTranslations("captionStudio");

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {CAPTION_STYLE_TOKENS.map((token) => {
        const spec = CAPTION_STYLE_SPECS[token];
        const selected = props.value === token;
        return (
          <button
            key={token}
            type="button"
            disabled={props.disabled}
            onClick={() => props.onChange(token)}
            aria-pressed={selected}
            className={`flex flex-col overflow-hidden rounded-xl border text-start transition ${
              selected
                ? "border-accent ring-1 ring-accent"
                : "border-border hover:border-accent"
            } disabled:opacity-50`}
          >
            {/* Miniature frame: real preset colors, weight and placement. */}
            <span className="relative block aspect-video w-full bg-neutral-900">
              <span
                className="absolute inset-x-1 flex justify-center"
                style={{
                  top: `${spec.verticalAnchor * 100}%`,
                  transform: "translateY(-50%)",
                }}
              >
                <span
                  className="max-w-full truncate rounded px-1.5 py-0.5 text-[10px] leading-tight"
                  style={{
                    fontWeight: spec.fontWeight,
                    color: spec.textColor,
                    backgroundColor: spec.backgroundColor ?? "transparent",
                    textShadow: spec.backgroundColor
                      ? undefined
                      : "0 1px 2px rgba(0,0,0,0.9)",
                  }}
                >
                  {spec.wordLevel ? (
                    <>
                      <span style={{ color: spec.highlightColor }}>
                        {t("sampleHighlighted")}
                      </span>{" "}
                      {t("sampleRest")}
                    </>
                  ) : (
                    t("sample")
                  )}
                </span>
              </span>
            </span>
            <span
              className={`px-2 py-1.5 text-xs ${selected ? "text-accent" : "text-muted"}`}
            >
              {t(`presets.${token}`)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
