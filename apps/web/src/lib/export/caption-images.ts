import type { CaptionStyleSpec } from "@merai/core";
import type { CaptionOverlayPlan } from "./plan";

/**
 * Rasterize caption lines to transparent full-frame PNGs using Canvas2D.
 * The browser does the Arabic shaping/bidi (ffmpeg's drawtext cannot without
 * fribidi/harfbuzz — see DECISIONS.md), so exported captions look exactly
 * like the preview. Karaoke burns line-level in MVP (word-level would need a
 * PNG per word state).
 */
export async function renderCaptionImages(
  captions: CaptionOverlayPlan[],
  spec: CaptionStyleSpec,
  width: number,
  height: number,
  isRtl: boolean,
): Promise<{ name: string; data: Uint8Array }[]> {
  const fontSize = Math.round(height * 0.045);
  const fontDecl = `${spec.fontWeight} ${fontSize}px "${spec.fontFamily}"`;
  try {
    await document.fonts.load(fontDecl, "مرحبا Aa");
    await document.fonts.ready;
  } catch {
    // Font loading is best-effort; canvas falls back to sans-serif.
  }

  const images: { name: string; data: Uint8Array }[] = [];

  for (const caption of captions) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;

    ctx.font = fontDecl;
    ctx.direction = isRtl ? "rtl" : "ltr";
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
    } else {
      ctx.shadowColor = "rgba(0,0,0,0.9)";
      ctx.shadowBlur = fontSize * 0.15;
      ctx.shadowOffsetY = 2;
    }

    ctx.fillStyle = spec.textColor;
    ctx.fillText(text, x, y, maxWidth);

    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("caption rasterization failed"))),
        "image/png",
      ),
    );
    images.push({
      name: caption.file,
      data: new Uint8Array(await blob.arrayBuffer()),
    });
  }

  return images;
}
