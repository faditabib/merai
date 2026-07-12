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
  // Build 6B.3 — creator-facing preset catalog (see CAPTION_PRESETS). The
  // older tokens above stay resolvable for backward compatibility but are
  // hidden from the gallery.
  "viral",
  "podcast",
  "educational",
  "medical",
  "luxury",
  "minimal",
  "high-energy",
  "professional",
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
  /** The preset/token id. Widened to string so a persisted/snapshotted spec
   *  (exports.caption_config, brand_kits.caption_default_config) is structurally
   *  assignable; the built-in CAPTION_STYLE_SPECS keys stay strongly typed. */
  token: string;
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
  // Build 6B.3 — the creator-facing gallery presets.
  viral: {
    token: "viral",
    fontFamily: "IBM Plex Sans Arabic",
    fontWeight: 700,
    verticalAnchor: 0.72,
    textColor: "#FFFFFF",
    outline: { color: "#000000", width: 0.14 },
    fontScale: 1.3,
    uppercaseLatin: false,
    wordLevel: false,
  },
  podcast: {
    token: "podcast",
    fontFamily: "IBM Plex Sans Arabic",
    fontWeight: 500,
    verticalAnchor: 0.85,
    textColor: "#FFFFFF",
    backgroundColor: "rgba(0,0,0,0.6)",
    uppercaseLatin: false,
    wordLevel: false,
  },
  educational: {
    token: "educational",
    fontFamily: "IBM Plex Sans Arabic",
    fontWeight: 600,
    verticalAnchor: 0.85,
    textColor: "#FFFFFF",
    backgroundColor: "rgba(17,24,39,0.72)",
    fontScale: 1.05,
    uppercaseLatin: false,
    wordLevel: false,
  },
  medical: {
    token: "medical",
    fontFamily: "IBM Plex Sans Arabic",
    fontWeight: 500,
    verticalAnchor: 0.86,
    textColor: "#F0F6FF",
    uppercaseLatin: false,
    wordLevel: false,
  },
  luxury: {
    token: "luxury",
    fontFamily: "IBM Plex Sans Arabic",
    fontWeight: 400,
    verticalAnchor: 0.86,
    textColor: "#F5E9C8",
    fontScale: 0.95,
    uppercaseLatin: false,
    wordLevel: false,
  },
  minimal: {
    token: "minimal",
    fontFamily: "IBM Plex Sans Arabic",
    fontWeight: 500,
    verticalAnchor: 0.85,
    textColor: "#FFFFFF",
    fontScale: 0.9,
    uppercaseLatin: false,
    wordLevel: false,
  },
  "high-energy": {
    token: "high-energy",
    fontFamily: "IBM Plex Sans Arabic",
    fontWeight: 700,
    verticalAnchor: 0.5,
    textColor: "#FFD400",
    outline: { color: "#000000", width: 0.16 },
    fontScale: 1.4,
    uppercaseLatin: true,
    wordLevel: false,
  },
  professional: {
    token: "professional",
    fontFamily: "IBM Plex Sans Arabic",
    fontWeight: 500,
    verticalAnchor: 0.85,
    textColor: "#FFFFFF",
    backgroundColor: "rgba(15,23,42,0.55)",
    uppercaseLatin: false,
    wordLevel: false,
  },
};

/** Motion label shown on a preset card. The rendered caption is STATIC (one
 *  PNG per line); animated export is deferred, so this is descriptive only and
 *  never claims motion the export lacks. */
export type CaptionAnimation = "pop" | "fade" | "static";

export const CAPTION_PRESET_IDS = [
  "viral",
  "podcast",
  "educational",
  "medical",
  "luxury",
  "minimal",
  "high-energy",
  "professional",
] as const;
export type CaptionPresetId = (typeof CAPTION_PRESET_IDS)[number];

export interface CaptionPreset {
  id: CaptionPresetId;
  animation: CaptionAnimation;
  /** i18n key under captionStudio.useCases.* */
  useCaseKey: string;
}

/** The creator-facing gallery (Build 6B.3). Ordered for display; each spec is
 *  CAPTION_STYLE_SPECS[id]; names/use-cases are localized in the messages. */
export const CAPTION_PRESETS: readonly CaptionPreset[] = [
  { id: "viral", animation: "pop", useCaseKey: "shortform" },
  { id: "podcast", animation: "fade", useCaseKey: "talkingHead" },
  { id: "educational", animation: "fade", useCaseKey: "tutorials" },
  { id: "medical", animation: "static", useCaseKey: "clinical" },
  { id: "luxury", animation: "fade", useCaseKey: "premium" },
  { id: "minimal", animation: "static", useCaseKey: "vlogs" },
  { id: "high-energy", animation: "pop", useCaseKey: "promos" },
  { id: "professional", animation: "fade", useCaseKey: "business" },
];

/**
 * Coarse hue → color-word key for the export "your video style" card
 * (cosmetic). Returns a key localized under captionStudio.colorNames.*.
 */
export function hueName(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d < 0.08) return l < 0.2 ? "black" : l > 0.85 ? "white" : "gray";
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  if (h < 20 || h >= 345) return "red";
  if (h < 45) return "orange";
  if (h < 70) return "yellow";
  if (h < 160) return "green";
  if (h < 195) return "teal";
  if (h < 255) return "blue";
  if (h < 290) return "purple";
  return "pink";
}

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
  return resolveCaptionSpec(spec, brand);
}

/**
 * Apply the creator's brand color to a caption spec that opts in via
 * `useBrandColor` (Build 6B.3). Works on ANY spec — including a customized
 * studio working spec — so per-video tweaks (scale/position/outline) survive.
 * A no-op when the spec doesn't use brand color or no colors are supplied.
 */
export function resolveCaptionSpec(
  spec: CaptionStyleSpec,
  brand?: CaptionBrandColors | null,
): CaptionStyleSpec {
  if (!spec.useBrandColor || !brand) return spec;
  if (spec.useBrandColor === "box") {
    return { ...spec, backgroundColor: hexToRgba(brand.primary, 0.85) };
  }
  return { ...spec, textColor: brand.accent };
}
