"use client";

import { useMemo } from "react";
import {
  activeCaptionIndex,
  activeWordIndex,
  buildCaptionLines,
  resolveCaptionSpec,
  type CaptionBrandColors,
  type CaptionStyleSpec,
  type EdlV1,
  type TranscriptWord,
} from "@merai/core";
import { captionSpanStyle } from "@/components/caption-preview";

export interface CaptionOverlayProps {
  edl: EdlV1;
  words: TranscriptWord[];
  sourceMs: number;
  /** The working caption spec (Build 6B.3). */
  spec: CaptionStyleSpec;
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
  // Brand-* presets resolve the creator's color, mirroring the export (6B.3).
  const spec = resolveCaptionSpec(props.spec, props.brandColors);

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
        className="max-w-[90%] rounded-lg px-3 py-1.5 text-center leading-snug"
        style={captionSpanStyle(spec, 20)}
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
