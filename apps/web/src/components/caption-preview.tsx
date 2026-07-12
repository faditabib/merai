"use client";

import type { CSSProperties } from "react";
import {
  resolveCaptionSpec,
  type CaptionBrandColors,
  type CaptionStyleSpec,
} from "@merai/core";

/**
 * The single caption styling source shared by every preview surface (gallery,
 * live preview, export card) — its fields mirror the server rasterizer
 * (render/captions.ts), so "preview = export" is structural. The worker draws
 * the same spec, so a caption that looks right here renders right.
 */
export function captionSpanStyle(spec: CaptionStyleSpec, fontPx: number): CSSProperties {
  const scaled = fontPx * (spec.fontScale ?? 1);
  return {
    // Resolve via --font-caption (Plex, loaded by the layout) so the preview
    // uses the SAME font the worker rasterizes even though the UI is Tajawal.
    // spec.fontFamily is retained as the record/worker family + a fallback.
    fontFamily: `var(--font-caption), ${spec.fontFamily}, sans-serif`,
    fontSize: `${scaled}px`,
    fontWeight: spec.fontWeight,
    color: spec.textColor,
    backgroundColor: spec.backgroundColor ?? "transparent",
    WebkitTextStroke: spec.outline
      ? `${Math.max(0.5, spec.outline.width * scaled)}px ${spec.outline.color}`
      : undefined,
    textShadow: spec.backgroundColor || spec.outline ? undefined : "0 1px 3px rgba(0,0,0,0.9)",
  };
}

export interface CaptionPreviewProps {
  spec: CaptionStyleSpec;
  sampleText: string;
  /** Resolves brand-* presets to the creator's colors (preview = export). */
  brandColors?: CaptionBrandColors | null;
  /** Base font size in px before the spec's fontScale. */
  fontPx?: number;
  /** Frame aspect (default 9:16, the primary creator format). */
  aspect?: string;
  className?: string;
}

/** A framed caption preview: a neutral video-stand-in with the caption placed
 *  by the spec's vertical anchor, rendered exactly as it will export. */
export function CaptionPreview(props: CaptionPreviewProps) {
  const spec = resolveCaptionSpec(props.spec, props.brandColors);
  const fontPx = props.fontPx ?? 16;
  const text = spec.uppercaseLatin ? props.sampleText.toUpperCase() : props.sampleText;
  return (
    <div
      className={`relative overflow-hidden rounded-lg ${props.className ?? ""}`}
      style={{
        aspectRatio: props.aspect ?? "9 / 16",
        background: "linear-gradient(160deg,#3f4c66,#2b3346 70%,#20263a)",
      }}
    >
      <div
        className="absolute inset-x-2 flex justify-center"
        style={{ top: `${spec.verticalAnchor * 100}%`, transform: "translateY(-50%)" }}
      >
        <span
          className="max-w-[92%] truncate rounded px-2 py-1 text-center leading-snug"
          style={captionSpanStyle(spec, fontPx)}
        >
          {text}
        </span>
      </div>
    </div>
  );
}
