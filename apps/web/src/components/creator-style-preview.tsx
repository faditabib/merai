"use client";

import { resolveCaptionSpec, type CreatorStyle } from "@merai/core";
import { captionSpanStyle } from "@/components/caption-preview";

export interface CreatorStylePreviewProps {
  style: CreatorStyle;
  sampleText: string;
  fontPx?: number;
  className?: string;
}

/**
 * A one-frame preview of a Creator Style (Build 6C.2): the style's tinted
 * background + bottom gradient + a caption sample styled by the SAME
 * `captionSpanStyle` the export uses (brand color resolved from the style's
 * palette), plus a lower-third accent hint. What you see is what "Apply" sets.
 */
export function CreatorStylePreview(props: CreatorStylePreviewProps) {
  const { style } = props;
  const spec = resolveCaptionSpec(style.caption, {
    primary: style.colors.primary,
    accent: style.colors.accent,
  });
  const fontPx = props.fontPx ?? 13;
  const text = spec.uppercaseLatin ? props.sampleText.toUpperCase() : props.sampleText;

  return (
    <div
      className={`relative overflow-hidden rounded-lg ${props.className ?? ""}`}
      style={{
        aspectRatio: "16 / 10",
        background: `linear-gradient(150deg, ${style.colors.primary}33, #1b2130 70%, #141824)`,
      }}
    >
      {/* Bottom readability gradient (the style's overlay). */}
      {style.overlay && (
        <div
          className="absolute inset-x-0 bottom-0"
          style={{
            height: `${style.overlay.heightPct * 100}%`,
            background: `linear-gradient(to bottom, transparent, ${style.overlay.color}${Math.round(
              style.overlay.opacity * 255,
            )
              .toString(16)
              .padStart(2, "0")})`,
          }}
        />
      )}
      {/* Lower-third accent hint (identity text is the creator's, so just a bar). */}
      <div
        className="absolute bottom-[8%] h-4 w-1 rounded"
        style={{ insetInlineStart: "6%", backgroundColor: style.lowerThird.accentColor }}
      />
      {/* Caption sample — styled exactly like the export. */}
      <div
        className="absolute inset-x-2 flex justify-center"
        style={{ top: `${spec.verticalAnchor * 100}%`, transform: "translateY(-50%)" }}
      >
        <span
          className="max-w-[92%] truncate rounded px-2 py-0.5 text-center leading-snug"
          style={captionSpanStyle(spec, fontPx)}
        >
          {text}
        </span>
      </div>
    </div>
  );
}
