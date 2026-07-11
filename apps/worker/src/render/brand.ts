import { createCanvas } from "@napi-rs/canvas";
import {
  BRAND_GRADIENT_IMAGE,
  BRAND_LOWER_THIRD_IMAGE,
  type BrandExportConfig,
  type GradientOverlayConfig,
  type LowerThirdConfig,
} from "@merai/core";
import { registerCaptionFonts, FONT_FAMILY } from "./captions";

/**
 * Brand layer rasterization (Build 6B.1). Like captions, brand layers are
 * transparent full-frame PNGs composited by ffmpeg — text shaping (Arabic
 * lower thirds) happens here in Skia+HarfBuzz, never in ffmpeg. Both layers
 * are STATIC for the whole video: animation is a later build; this is the
 * rendering/config foundation only.
 */

/** #RRGGBB + opacity → rgba() (canvas gradients need explicit alpha). */
function rgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const ARABIC_CHARS = /[؀-ۿݐ-ݿ]/;

/**
 * Bottom readability gradient: fully transparent at the top of its band,
 * `config.color` at `config.opacity` along the bottom edge.
 */
export function renderGradientImage(
  config: GradientOverlayConfig,
  width: number,
  height: number,
): { name: string; data: Uint8Array } {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const top = Math.round(height * (1 - config.heightPct));
  const gradient = ctx.createLinearGradient(0, top, 0, height);
  gradient.addColorStop(0, rgba(config.color, 0));
  gradient.addColorStop(1, rgba(config.color, config.opacity));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, top, width, height - top);

  return {
    name: BRAND_GRADIENT_IMAGE,
    data: new Uint8Array(canvas.toBuffer("image/png")),
  };
}

/**
 * Static lower third: accent bar + name (+ optional title/subtitle), anchored
 * to the start-side lower corner. "Start" follows the text's own direction:
 * Arabic names anchor to the RIGHT edge, Latin to the LEFT — mirroring how
 * the product treats chrome (logical) vs. timeline (physical).
 */
export function renderLowerThirdImage(
  config: LowerThirdConfig,
  width: number,
  height: number,
): { name: string; data: Uint8Array } {
  registerCaptionFonts();
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const rtl = ARABIC_CHARS.test(config.name);
  const nameSize = Math.round(height * 0.038);
  const subSize = Math.round(height * 0.026);
  const padX = Math.round(width * 0.05);
  const barWidth = Math.max(4, Math.round(width * 0.006));
  const lineGap = Math.round(subSize * 0.45);

  const lines: { text: string; size: number; weight: number; alpha: number }[] = [
    { text: config.name, size: nameSize, weight: 700, alpha: 1 },
  ];
  if (config.title) lines.push({ text: config.title, size: subSize, weight: 500, alpha: 0.92 });
  if (config.subtitle) lines.push({ text: config.subtitle, size: subSize, weight: 500, alpha: 0.8 });

  const blockHeight =
    lines.reduce((sum, l) => sum + l.size, 0) + lineGap * (lines.length - 1);
  // The block's bottom sits at ~92% height — the classic lower-third band.
  const blockBottom = Math.round(height * 0.92);
  const blockTop = blockBottom - blockHeight;

  // Accent bar along the start edge of the text block.
  const barX = rtl ? width - padX - barWidth : padX;
  ctx.fillStyle = config.accentColor;
  ctx.fillRect(barX, blockTop - lineGap, barWidth, blockHeight + lineGap * 2);

  const textX = rtl ? width - padX - barWidth - lineGap * 2 : padX + barWidth + lineGap * 2;
  ctx.textAlign = rtl ? "right" : "left";
  ctx.textBaseline = "top";
  ctx.shadowColor = "rgba(0,0,0,0.7)";
  ctx.shadowBlur = Math.round(subSize * 0.2);
  ctx.shadowOffsetY = 1;

  let y = blockTop;
  const maxWidth = width * 0.6;
  for (const line of lines) {
    ctx.font = `${line.weight} ${line.size}px "${FONT_FAMILY}"`;
    ctx.fillStyle = rgba(config.textColor, line.alpha);
    ctx.fillText(line.text, textX, y, maxWidth);
    y += line.size + lineGap;
  }

  return {
    name: BRAND_LOWER_THIRD_IMAGE,
    data: new Uint8Array(canvas.toBuffer("image/png")),
  };
}

/** All brand layer PNGs for an export's brand snapshot (order irrelevant —
 *  the plan's segment args decide compositing order). */
export function renderBrandImages(
  brand: BrandExportConfig,
  width: number,
  height: number,
): { name: string; data: Uint8Array }[] {
  const images: { name: string; data: Uint8Array }[] = [];
  if (brand.gradient) images.push(renderGradientImage(brand.gradient, width, height));
  if (brand.lowerThird) {
    images.push(renderLowerThirdImage(brand.lowerThird, width, height));
  }
  return images;
}
