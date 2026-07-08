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

export const CAPTION_STYLE_TOKENS = [
  "bold-yellow-centered", // high-impact, all-caps-feel, center of frame
  "minimal-white-bottom", // clean lower-third, subtle background
  "karaoke-highlight", // word-by-word highlight following speech
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
};
