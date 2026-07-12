import { z } from "zod";
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
  // Build 6B.2 — Caption Studio additions:
  "bold-impact", // large, uppercase, black outline — hype/short-form
  "outline-clean", // white + outline, no box — readable on busy footage
  "brand-box", // box filled with the creator's brand color
  "brand-accent", // text in the creator's accent color, outlined
] as const;

export type CaptionStyleToken = (typeof CAPTION_STYLE_TOKENS)[number];

export const DEFAULT_CAPTION_STYLE: CaptionStyleToken = "minimal-white-bottom";

/** Text stroke drawn behind the fill for legibility on busy footage. */
export interface CaptionOutline {
  color: string;
  /** Stroke width as a fraction of the font size. */
  width: number;
}

/** Renderer-facing style definition consumed by the caption preview and the
 *  server caption rasterizer. Fonts must have full Arabic coverage.
 *  Build 6B.2 fields are additive-optional: absent = pre-6B.2 behavior. */
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
  /** 6B.2: outline stroke behind the fill. */
  outline?: CaptionOutline;
  /** 6B.2: size multiplier over the base font size (bounded on render). */
  fontScale?: number;
  /** 6B.2: which element pulls the creator's brand color, resolved at export. */
  useBrandColor?: "text" | "box";
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
  "bold-impact": {
    token: "bold-impact",
    fontFamily: "IBM Plex Sans Arabic",
    fontWeight: 700,
    verticalAnchor: 0.5,
    textColor: "#FFFFFF",
    outline: { color: "#000000", width: 0.12 },
    fontScale: 1.25,
    uppercaseLatin: true,
    wordLevel: false,
  },
  "outline-clean": {
    token: "outline-clean",
    fontFamily: "IBM Plex Sans Arabic",
    fontWeight: 600,
    verticalAnchor: 0.85,
    textColor: "#FFFFFF",
    outline: { color: "#000000", width: 0.1 },
    uppercaseLatin: false,
    wordLevel: false,
  },
  "brand-box": {
    token: "brand-box",
    fontFamily: "IBM Plex Sans Arabic",
    fontWeight: 600,
    verticalAnchor: 0.85,
    textColor: "#FFFFFF",
    // Fallback box when no brand color is resolved; useBrandColor overrides it.
    backgroundColor: "rgba(0,0,0,0.55)",
    useBrandColor: "box",
    uppercaseLatin: false,
    wordLevel: false,
  },
  "brand-accent": {
    token: "brand-accent",
    fontFamily: "IBM Plex Sans Arabic",
    fontWeight: 700,
    verticalAnchor: 0.82,
    // Fallback text color when no brand color is resolved.
    textColor: "#FFFFFF",
    outline: { color: "#000000", width: 0.08 },
    useBrandColor: "text",
    uppercaseLatin: false,
    wordLevel: false,
  },
};

/**
 * Validation for the `exports.caption_config` jsonb snapshot (Build 6B.2).
 * The render handler parses the column with this and fails loud on malformed
 * data (same trust-boundary rule as `exports.brand`). `fontScale` is clamped
 * to a safe band so a bad value can't blow up the layout.
 */
export const captionStyleSpecSchema = z.object({
  token: z.string(),
  fontFamily: z.string(),
  fontWeight: z.number(),
  verticalAnchor: z.number().min(0).max(1),
  textColor: z.string(),
  highlightColor: z.string().optional(),
  backgroundColor: z.string().optional(),
  uppercaseLatin: z.boolean(),
  wordLevel: z.boolean(),
  outline: z.object({ color: z.string(), width: z.number().min(0).max(0.5) }).optional(),
  fontScale: z.number().min(0.5).max(2).optional(),
  useBrandColor: z.enum(["text", "box"]).optional(),
});

/** #RRGGBB → rgba() string at the given alpha (brand colors are hex). */
export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Brand colors a caption preset may pull from at export time. */
export interface CaptionBrandColors {
  primary: string;
  accent: string;
}

/**
 * Resolve the caption spec that must be SNAPSHOTTED for an export (Build 6B.2).
 * Returns a concrete spec ONLY when the chosen preset needs runtime brand data
 * (useBrandColor); otherwise null — the token path (`resolveStyleSpec`) already
 * carries everything, and a null `exports.caption_config` renders exactly as
 * before 6B.2. Same snapshot philosophy as `exports.brand`: resolve in the app
 * where the brand colors live, store the result, keep the renderer dumb.
 */
export function captionConfigForExport(
  token: string,
  brand?: CaptionBrandColors | null,
): CaptionStyleSpec | null {
  const spec =
    CAPTION_STYLE_SPECS[token as CaptionStyleToken] ??
    CAPTION_STYLE_SPECS[DEFAULT_CAPTION_STYLE];
  if (!spec.useBrandColor || !brand) return null;
  if (spec.useBrandColor === "box") {
    return { ...spec, backgroundColor: hexToRgba(brand.primary, 0.85) };
  }
  return { ...spec, textColor: brand.accent };
}
