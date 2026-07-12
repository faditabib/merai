import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import {
  BLANK_IMAGE,
  CAPTION_STYLE_SPECS,
  DEFAULT_CAPTION_STYLE,
  type CaptionOverlayPlan,
  type CaptionStyleSpec,
  type CaptionStyleToken,
} from "@merai/core";
import { log } from "../logger";

/**
 * Server-side caption rasterization (@napi-rs/canvas = Skia + HarfBuzz, so
 * Arabic shaping/bidi is native — visually verified 2026-07-10, see
 * DECISIONS.md). One transparent full-frame PNG per caption line + one blank
 * gap filler, mirroring the retired browser rasterizer exactly so exports
 * keep looking like the editor preview.
 *
 * Fonts are vendored (OFL) — the same IBM Plex Sans Arabic the UI uses.
 */

const FONT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../assets/fonts");
export const FONT_FAMILY = "IBM Plex Sans Arabic";

let fontsRegistered = false;
/** Shared by caption and brand-layer rasterizers (render/brand.ts). */
export function registerCaptionFonts(): void {
  if (fontsRegistered) return;
  for (const file of ["IBMPlexSansArabic-Medium.ttf", "IBMPlexSansArabic-Bold.ttf"]) {
    const ok = GlobalFonts.registerFromPath(join(FONT_DIR, file), FONT_FAMILY);
    if (!ok) log.warn(`caption font failed to register: ${file}`);
  }
  fontsRegistered = true;
}

export function resolveStyleSpec(token: string): CaptionStyleSpec {
  return (
    CAPTION_STYLE_SPECS[token as CaptionStyleToken] ??
    CAPTION_STYLE_SPECS[DEFAULT_CAPTION_STYLE]
  );
}

/**
 * Highest vertical anchor a caption may keep when a lower third shares the
 * bottom band. The lower third occupies roughly 0.84–0.92 of frame height
 * (see render/brand.ts); anchoring captions at ≤0.74 clears it with room to
 * breathe. Live E2E finding (Build 6B.1): minimal-white-bottom (0.85) and a
 * lower third overprinted each other.
 */
export const CAPTION_ANCHOR_ABOVE_LOWER_THIRD = 0.74;

/**
 * Lift a bottom-anchored caption above a lower third so the two never
 * overprint. Centered/high styles (anchor already ≤ the ceiling) are
 * untouched; only bottom styles move, and only when a lower third exists.
 */
export function captionSpecAboveLowerThird(
  spec: CaptionStyleSpec,
  hasLowerThird: boolean,
): CaptionStyleSpec {
  if (!hasLowerThird || spec.verticalAnchor <= CAPTION_ANCHOR_ABOVE_LOWER_THIRD) {
    return spec;
  }
  return { ...spec, verticalAnchor: CAPTION_ANCHOR_ABOVE_LOWER_THIRD };
}

export function renderBlankImage(width: number, height: number): {
  name: string;
  data: Uint8Array;
} {
  const canvas = createCanvas(width, height);
  return { name: BLANK_IMAGE, data: new Uint8Array(canvas.toBuffer("image/png")) };
}

export function renderCaptionImages(
  captions: CaptionOverlayPlan[],
  spec: CaptionStyleSpec,
  width: number,
  height: number,
): { name: string; data: Uint8Array }[] {
  registerCaptionFonts();
  // 6B.2: fontScale grows/shrinks the base size (preset-driven).
  const fontSize = Math.round(height * 0.045 * (spec.fontScale ?? 1));
  // Skia weight selection happens via the CSS-style font string.
  const fontDecl = `${spec.fontWeight} ${fontSize}px "${FONT_FAMILY}"`;

  const images: { name: string; data: Uint8Array }[] = [];

  for (const caption of captions) {
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    ctx.font = fontDecl;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const text = spec.uppercaseLatin
      ? caption.line.text.toUpperCase()
      : caption.line.text;
    const x = width / 2;
    const y = Math.round(spec.verticalAnchor * height);
    const maxWidth = width * 0.9;

    if (spec.backgroundColor) {
      const metrics = ctx.measureText(text);
      const textWidth = Math.min(metrics.width, maxWidth);
      const padX = fontSize * 0.5;
      const padY = fontSize * 0.35;
      ctx.fillStyle = spec.backgroundColor;
      ctx.beginPath();
      ctx.roundRect(
        x - textWidth / 2 - padX,
        y - fontSize / 2 - padY,
        textWidth + padX * 2,
        fontSize + padY * 2,
        fontSize * 0.25,
      );
      ctx.fill();
    } else if (!spec.outline) {
      // Outline provides its own contrast; only fall back to a drop shadow
      // when there's neither a box nor an outline (6B.2).
      ctx.shadowColor = "rgba(0,0,0,0.9)";
      ctx.shadowBlur = fontSize * 0.15;
      ctx.shadowOffsetY = 2;
    }

    // 6B.2: outline stroke drawn behind the fill for busy-footage legibility.
    if (spec.outline) {
      ctx.lineWidth = fontSize * spec.outline.width;
      ctx.strokeStyle = spec.outline.color;
      ctx.lineJoin = "round";
      ctx.miterLimit = 2;
      ctx.strokeText(text, x, y, maxWidth);
    }

    ctx.fillStyle = spec.textColor;
    ctx.fillText(text, x, y, maxWidth);

    images.push({
      name: caption.file,
      data: new Uint8Array(canvas.toBuffer("image/png")),
    });
  }

  return images;
}
