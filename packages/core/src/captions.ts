import type { TranscriptWord } from "./transcript";

/**
 * Caption style presets. Internally these are generic style tokens — real
 * creators' names are visual references only and must never appear in
 * product-facing copy (PRD §5). UI labels come from the i18n message files.
 */

/**
 * Caption segmentation is TIMING-GAP based, not punctuation based: live
 * Arabic transcription returns no punctuation (verified 2026-07-08), so line
 * breaks come from inter-word gaps and length caps. Punctuation, when
 * present (e.g. English), is only a secondary break hint. The Phase 3/4
 * renderer consumes these constants.
 */
export const CAPTION_BREAK_GAP_MS = 500;
export const CAPTION_MAX_LINE_CHARS = 42;
export const CAPTION_MAX_LINE_DURATION_MS = 5_000;

/** Sentence-final punctuation (Arabic + Latin) — secondary break hint only. */
const SENTENCE_END = /[.!?؟…]$/;

export interface CaptionLine {
  words: TranscriptWord[];
  text: string;
  startMs: number;
  endMs: number;
}

/**
 * Group words into caption lines. Primary signal is timing: break on
 * inter-word gaps > CAPTION_BREAK_GAP_MS; also cap line length and duration.
 * Punctuation, when present, is a secondary break hint (live Arabic STT
 * returns none — verified 2026-07-08).
 */
export function buildCaptionLines(words: TranscriptWord[]): CaptionLine[] {
  const lines: CaptionLine[] = [];
  let current: TranscriptWord[] = [];

  const flush = () => {
    if (current.length === 0) return;
    lines.push({
      words: current,
      text: current.map((w) => w.text).join(" "),
      startMs: current[0]!.startMs,
      endMs: current[current.length - 1]!.endMs,
    });
    current = [];
  };

  for (const word of words) {
    if (current.length > 0) {
      const previous = current[current.length - 1]!;
      const gap = word.startMs - previous.endMs;
      const lineChars =
        current.reduce((n, w) => n + w.text.length + 1, 0) + word.text.length;
      const lineDuration = word.endMs - current[0]!.startMs;

      if (
        gap > CAPTION_BREAK_GAP_MS ||
        lineChars > CAPTION_MAX_LINE_CHARS ||
        lineDuration > CAPTION_MAX_LINE_DURATION_MS ||
        SENTENCE_END.test(previous.text)
      ) {
        flush();
      }
    }
    current.push(word);
  }
  flush();
  return lines;
}

/** Index of the caption line active at a source position, or -1. */
export function activeCaptionIndex(
  lines: CaptionLine[],
  sourceMs: number,
): number {
  return lines.findIndex(
    (line) => sourceMs >= line.startMs && sourceMs <= line.endMs,
  );
}

/** Index of the word being spoken within a line (karaoke highlight), or -1. */
export function activeWordIndex(line: CaptionLine, sourceMs: number): number {
  return line.words.findIndex(
    (word) => sourceMs >= word.startMs && sourceMs <= word.endMs,
  );
}

export const CAPTION_STYLE_TOKENS = [
  "bold-yellow-centered", // high-impact, all-caps-feel, center of frame
  "minimal-white-bottom", // clean lower-third, subtle background
  "karaoke-highlight", // word-by-word highlight following speech
  "professional-clean", // premium low placement, no box — doctors/founders/educators
] as const;

export type CaptionStyleToken = (typeof CAPTION_STYLE_TOKENS)[number];

export const DEFAULT_CAPTION_STYLE: CaptionStyleToken = "minimal-white-bottom";

/** Renderer-facing style definition consumed by the caption preview and the
 *  ffmpeg.wasm export pipeline. Fonts must have full Arabic coverage. */
export interface CaptionStyleSpec {
  token: CaptionStyleToken;
  fontFamily: string;
  fontWeight: number;
  /** Vertical anchor as a fraction of frame height (0 = top, 1 = bottom). */
  verticalAnchor: number;
  textColor: string;
  highlightColor?: string;
  backgroundColor?: string;
  uppercaseLatin: boolean;
  /** Word-level timing animation (karaoke) vs. line-level display. */
  wordLevel: boolean;
}

export const CAPTION_STYLE_SPECS: Record<CaptionStyleToken, CaptionStyleSpec> = {
  "bold-yellow-centered": {
    token: "bold-yellow-centered",
    fontFamily: "IBM Plex Sans Arabic",
    fontWeight: 700,
    verticalAnchor: 0.5,
    textColor: "#FFD400",
    uppercaseLatin: true,
    wordLevel: false,
  },
  "minimal-white-bottom": {
    token: "minimal-white-bottom",
    fontFamily: "IBM Plex Sans Arabic",
    fontWeight: 500,
    verticalAnchor: 0.85,
    textColor: "#FFFFFF",
    backgroundColor: "rgba(0,0,0,0.55)",
    uppercaseLatin: false,
    wordLevel: false,
  },
  "karaoke-highlight": {
    token: "karaoke-highlight",
    fontFamily: "IBM Plex Sans Arabic",
    fontWeight: 700,
    verticalAnchor: 0.8,
    textColor: "#FFFFFF",
    highlightColor: "#22D3EE",
    uppercaseLatin: false,
    wordLevel: true,
  },
  "professional-clean": {
    token: "professional-clean",
    fontFamily: "IBM Plex Sans Arabic",
    fontWeight: 500,
    verticalAnchor: 0.88,
    textColor: "#F5F5F4",
    uppercaseLatin: false,
    wordLevel: false,
  },
};
