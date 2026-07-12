import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { renderLogoImage, renderLowerThirdImage } from "../src/render/brand";

function samplePng(w = 120, h = 60): Uint8Array {
  const c = createCanvas(w, h);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#ff0000";
  ctx.fillRect(0, 0, w, h);
  return new Uint8Array(c.toBuffer("image/png"));
}

const LOGO_CFG = {
  storagePath: "brand-assets/owner/logo.png",
  position: "bottom-end" as const,
  opacity: 0.9,
  widthPct: 0.18,
};

describe("renderLogoImage (Build 6C.3)", () => {
  it("rasterizes a decodable logo into a full-frame PNG", async () => {
    const img = await renderLogoImage(samplePng(), LOGO_CFG, 720, 1280);
    expect(img).not.toBeNull();
    expect(img!.name).toBe("brand-logo.png");
    expect(img!.data.length).toBeGreaterThan(0);
  });

  it("returns null for undecodable bytes (SVG / corrupt) so the caller skips it", async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');
    expect(await renderLogoImage(svg, LOGO_CFG, 720, 1280)).toBeNull();
    expect(await renderLogoImage(new Uint8Array([1, 2, 3, 4]), LOGO_CFG, 720, 1280)).toBeNull();
  });

  it("handles every corner position without throwing", async () => {
    for (const position of ["bottom-start", "bottom-end", "top-start", "top-end"] as const) {
      const img = await renderLogoImage(samplePng(), { ...LOGO_CFG, position }, 720, 1280);
      expect(img?.data.length).toBeGreaterThan(0);
    }
  });
});

describe("renderLowerThirdImage variants (Build 6C.3)", () => {
  const base = {
    name: "د. أحمد",
    title: "استشاري قلب",
    accentColor: "#7C3AED",
    textColor: "#FFFFFF",
  };

  it("renders bar / box / none shapes at top and bottom positions", () => {
    for (const shape of ["bar", "box", "none"] as const) {
      for (const position of ["bottom-start", "bottom-end", "top-start", "top-end"] as const) {
        const img = renderLowerThirdImage({ ...base, shape, position }, 720, 1280);
        expect(img.name).toBe("brand-lower-third.png");
        expect(img.data.length).toBeGreaterThan(0);
      }
    }
  });

  it("still renders the default (no position/shape) — 6B.1 look", () => {
    const img = renderLowerThirdImage(base, 720, 1280);
    expect(img.data.length).toBeGreaterThan(0);
  });
});
