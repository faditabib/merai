import { createCanvas, loadImage } from "@napi-rs/canvas";
import {
  BRAND_GRADIENT_IMAGE,
  BRAND_LOGO_IMAGE,
  BRAND_LOWER_THIRD_IMAGE,
  logoBox,
  type BrandExportConfig,
  type GradientOverlayConfig,
  type LogoOverlayConfig,
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
 * Static lower third: name (+ optional title/subtitle) with a background
 * treatment (Build 6C.3: bar | box | none) at a chosen corner. "start" is
 * logical — Arabic anchors RIGHT, Latin LEFT; "end" is the opposite edge; the
 * default (bottom-start bar) reproduces the 6B.1 look exactly.
 */
export function renderLowerThirdImage(
  config: LowerThirdConfig,
  width: number,
  height: number,
): { name: string; data: Uint8Array } {
  registerCaptionFonts();
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const position = config.position ?? "bottom-start";
  const shape = config.shape ?? "bar";
  const isTop = position === "top-start" || position === "top-end";
  const isStartSide = position === "bottom-start" || position === "top-start";
  // Physical right edge? "start" follows the name's reading direction.
  const rtl = ARABIC_CHARS.test(config.name);
  const onRight = isStartSide ? rtl : !rtl;

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
  const blockTop = isTop
    ? Math.round(height * 0.08)
    : Math.round(height * 0.92) - blockHeight;

  // Measure the widest line for the box treatment.
  ctx.textBaseline = "top";
  let textWidth = 0;
  for (const line of lines) {
    ctx.font = `${line.weight} ${line.size}px "${FONT_FAMILY}"`;
    textWidth = Math.max(textWidth, ctx.measureText(line.text).width);
  }
  textWidth = Math.min(textWidth, width * 0.6);

  const barGap = shape === "bar" ? barWidth + lineGap * 2 : 0;
  const boxPad = shape === "box" ? Math.round(nameSize * 0.5) : 0;
  const contentW = textWidth + barGap + boxPad * 2;
  const startX = onRight ? width - padX - contentW : padX;

  // Background treatment.
  if (shape === "box") {
    ctx.fillStyle = rgba(config.accentColor, 0.85);
    ctx.beginPath();
    ctx.roundRect(startX, blockTop - boxPad, contentW, blockHeight + boxPad * 2, Math.round(nameSize * 0.3));
    ctx.fill();
  } else if (shape === "bar") {
    const barX = onRight ? width - padX - barWidth : padX;
    ctx.fillStyle = config.accentColor;
    ctx.fillRect(barX, blockTop - lineGap, barWidth, blockHeight + lineGap * 2);
  }

  const textX = onRight ? width - padX - barGap - boxPad : padX + barGap + boxPad;
  ctx.textAlign = onRight ? "right" : "left";
  if (shape !== "box") {
    ctx.shadowColor = "rgba(0,0,0,0.7)";
    ctx.shadowBlur = Math.round(subSize * 0.2);
    ctx.shadowOffsetY = 1;
  }

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

/**
 * Logo / watermark (Build 6C.3): decode the stored image and draw it into a
 * corner box (sized by frame width, aspect preserved) at the chosen opacity,
 * on a transparent full-frame PNG — so the plan overlays it at 0:0 like every
 * other layer. Returns null for undecodable images (e.g. SVG, which
 * @napi-rs/canvas can't rasterize) so the caller skips the layer, never fails.
 */
export async function renderLogoImage(
  bytes: Uint8Array,
  config: LogoOverlayConfig,
  width: number,
  height: number,
): Promise<{ name: string; data: Uint8Array } | null> {
  try {
    const img = await loadImage(Buffer.from(bytes));
    if (!img.width || !img.height) return null;
    const aspect = img.height / img.width;
    const { x, y, w, h } = logoBox(config.position, config.widthPct, aspect, width, height);
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    ctx.globalAlpha = config.opacity;
    ctx.drawImage(img, x, y, w, h);
    return { name: BRAND_LOGO_IMAGE, data: new Uint8Array(canvas.toBuffer("image/png")) };
  } catch {
    return null;
  }
}

/** Gradient + lower-third PNGs for a brand snapshot (the logo is staged
 *  separately in render-export since it needs an async storage fetch). */
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
