import { OVERLAY_MARGIN_PCT, type OverlayPosition } from "./brand";
import type { AspectRatio } from "./edl";

/**
 * Auto Canvas (Build 7.5) — a pure layout brain. Given the source's real
 * dimensions and the brand layers in play, it recommends the aspect ratio,
 * clamps captions into the title-safe band, resolves lower-third collisions,
 * and picks a free corner for the logo/watermark. Every output flows through
 * existing snapshot channels (edl.aspectRatio, caption_config.verticalAnchor,
 * exports.brand.logo.position) — the renderer needs zero new code.
 *
 * All rules are deterministic and unit-tested; the UI surfaces what Auto
 * chose (no silent magic).
 */

/** Title-safe band for the caption anchor (fraction of frame height). */
export const CAPTION_SAFE_MIN = 0.12;
export const CAPTION_SAFE_MAX = 0.88;

/** Bottom lower third → captions lift to this anchor at most (the style
 *  catalog's convention, e.g. the `viral` preset). */
export const ANCHOR_ABOVE_LOWER_THIRD = 0.72;
/** Top lower third → captions push down to at least this anchor. */
export const ANCHOR_BELOW_TOP_LOWER_THIRD = 0.3;

/** Shared safe margin — the same constant the logo layer and PiP use. */
export const AUTO_SAFE_MARGIN_PCT = OVERLAY_MARGIN_PCT;

/** Watermark corner preference (top-end is the watermark convention). */
const LOGO_CORNER_PREFERENCE: readonly OverlayPosition[] = [
  "top-end",
  "top-start",
  "bottom-end",
  "bottom-start",
];

/**
 * Aspect recommendation from real source dimensions.
 * Landscape (≥3:2) → 16:9 · portrait (≤4:5) → 9:16 · in between → 1:1.
 * Unknown dims → 9:16 (the product's short-form-first default).
 */
export function recommendAspectRatio(
  sourceWidth: number | null | undefined,
  sourceHeight: number | null | undefined,
): AspectRatio {
  if (!sourceWidth || !sourceHeight || sourceWidth <= 0 || sourceHeight <= 0) {
    return "9:16";
  }
  const ratio = sourceWidth / sourceHeight;
  if (ratio >= 1.5) return "16:9";
  if (ratio <= 0.8) return "9:16";
  return "1:1";
}

export interface AutoLayoutInput {
  /** The creator's caption anchor (their spec) — respected, then made safe. */
  captionAnchor: number;
  /** Lower third in play? (its position; undefined = none). */
  lowerThirdPosition?: OverlayPosition | null;
  /** Logo/watermark in play? */
  hasLogo: boolean;
}

export interface AutoLayout {
  captionAnchor: number;
  /** Chosen free corner; null when no logo is in play. */
  logoPosition: OverlayPosition | null;
}

/** Clamp + resolve collisions: captions stay the creator's, made safe. */
export function autoCaptionAnchor(
  anchor: number,
  lowerThirdPosition?: OverlayPosition | null,
): number {
  let result = Number.isFinite(anchor) ? anchor : CAPTION_SAFE_MAX;
  result = Math.min(CAPTION_SAFE_MAX, Math.max(CAPTION_SAFE_MIN, result));
  if (lowerThirdPosition === "bottom-start" || lowerThirdPosition === "bottom-end") {
    result = Math.min(result, ANCHOR_ABOVE_LOWER_THIRD);
  }
  if (lowerThirdPosition === "top-start" || lowerThirdPosition === "top-end") {
    result = Math.max(result, ANCHOR_BELOW_TOP_LOWER_THIRD);
  }
  return result;
}

/** First free corner in watermark preference order. Occupied: the lower
 *  third's corner, and the caption band's two corners (anchor ≥ 0.6 blocks
 *  the bottom pair; ≤ 0.4 blocks the top pair). */
export function autoLogoPosition(
  captionAnchor: number,
  lowerThirdPosition?: OverlayPosition | null,
): OverlayPosition {
  const occupied = new Set<OverlayPosition>();
  if (lowerThirdPosition) occupied.add(lowerThirdPosition);
  if (captionAnchor >= 0.6) {
    occupied.add("bottom-start");
    occupied.add("bottom-end");
  }
  if (captionAnchor <= 0.4) {
    occupied.add("top-start");
    occupied.add("top-end");
  }
  for (const corner of LOGO_CORNER_PREFERENCE) {
    if (!occupied.has(corner)) return corner;
  }
  // Everything nominally occupied (e.g. mid captions + lower third):
  // fall back to the conventional watermark corner.
  return "top-end";
}

/** The full auto layout for an export snapshot. */
export function applyAutoLayout(input: AutoLayoutInput): AutoLayout {
  const captionAnchor = autoCaptionAnchor(
    input.captionAnchor,
    input.lowerThirdPosition,
  );
  return {
    captionAnchor,
    logoPosition: input.hasLogo
      ? autoLogoPosition(captionAnchor, input.lowerThirdPosition)
      : null,
  };
}
