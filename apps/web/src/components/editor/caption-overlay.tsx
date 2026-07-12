"use client";

import { useMemo } from "react";
import {
  activeCaptionIndex,
  activeWordIndex,
  buildCaptionLines,
  captionConfigForExport,
  CAPTION_STYLE_SPECS,
  type CaptionBrandColors,
  type CaptionStyleToken,
  type EdlV1,
  type TranscriptWord,
} from "@merai/core";

export interface CaptionOverlayProps {
  edl: EdlV1;
  words: TranscriptWord[];
  sourceMs: number;
  styleToken: CaptionStyleToken;
  /** Brand colors so brand-* presets preview with the creator's real colors. */
  brandColors?: CaptionBrandColors | null;
}

/**
 * Live caption preview over the video, rendered from the KEPT words only
 * (captions reflect the edit, not the raw source). Line breaks are
 * timing-gap based (@merai/core buildCaptionLines). karaoke-highlight paints
 * the word currently being spoken.
 */
export function CaptionOverlay(props: CaptionOverlayProps) {
  const base = CAPTION_STYLE_SPECS[props.styleToken] ?? CAPTION_STYLE_SPECS["minimal-white-bottom"];
  // Brand-* presets resolve the creator's color, mirroring the export (6B.2).
  const spec = (props.brandColors && captionConfigForExport(props.styleToken, props.brandColors)) || base;

  const lines = useMemo(() => {
    const wordById = new Map(props.words.map((w) => [w.id, w]));
    const keptWords: TranscriptWord[] = [];
    for (const segment of props.edl.timeline) {
      for (const id of segment.wordIds ?? []) {
        const word = wordById.get(id);
        if (word) keptWords.push(word);
      }
    }
    return buildCaptionLines(keptWords);
  }, [props.edl, props.words]);

  const lineIndex = activeCaptionIndex(lines, props.sourceMs);
  if (lineIndex === -1) return null;
  const line = lines[lineIndex]!;
  const wordIndex = spec.wordLevel ? activeWordIndex(line, props.sourceMs) : -1;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 flex justify-center px-6"
      style={{ top: `${spec.verticalAnchor * 100}%`, transform: "translateY(-50%)" }}
    >
      <span
        className="max-w-[90%] rounded-lg px-3 py-1.5 text-center font-bold leading-snug"
        style={{
          fontFamily: `${spec.fontFamily}, sans-serif`,
          fontSize: `${1.25 * (spec.fontScale ?? 1)}rem`,
          fontWeight: spec.fontWeight,
          color: spec.textColor,
          backgroundColor: spec.backgroundColor ?? "transparent",
          WebkitTextStroke: spec.outline
            ? `${Math.max(0.5, spec.outline.width * 14)}px ${spec.outline.color}`
            : undefined,
          textShadow:
            spec.backgroundColor || spec.outline ? undefined : "0 1px 3px rgba(0,0,0,0.9)",
        }}
      >
        {spec.wordLevel
          ? line.words.map((word, index) => (
              <span
                key={word.id}
                style={{
                  color:
                    index <= wordIndex && wordIndex >= 0
                      ? spec.highlightColor
                      : spec.textColor,
                }}
              >
                {word.text}
                {index < line.words.length - 1 ? " " : ""}
              </span>
            ))
          : spec.uppercaseLatin
            ? line.text.toUpperCase()
            : line.text}
      </span>
    </div>
  );
}
