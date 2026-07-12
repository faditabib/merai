import { z } from "zod";
import {
  captionStyleSpecSchema,
  CAPTION_STYLE_TOKENS,
  DEFAULT_CAPTION_STYLE,
} from "./captions";

/**
 * Creator branding (Build 6B.1). Two distinct shapes live here:
 *
 *  1. The Brand Kit — a per-creator row (brand_kits table) holding identity
 *     defaults: colors, logo, preferred caption style, overlay defaults.
 *  2. BrandExportConfig — the SNAPSHOT stored on an exports row (`brand`
 *     jsonb) when the user requests a render. Colors are resolved into the
 *     snapshot at export time so the render is self-contained: the worker
 *     never joins brand_kits, and later kit edits can't change an export
 *     that already happened (same semantics as aspect_ratio/caption_style).
 *
 * Layer order in the rendered frame (binding for renderers):
 *   video → gradient overlay → captions → lower third.
 *
 * Deliberately NOT in the EDL: `downgradeEdlV2ToV1` refuses `has-effects`,
 * so brand overlays riding EDL v2 effects would permanent-fail every branded
 * export until the renderer learns tracks. Export-row config keeps old
 * projects and kit-less exports byte-identical (brand = null).
 */

export const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "expected #RRGGBB");
export type HexColor = z.infer<typeof hexColorSchema>;

/** Bottom readability gradient: transparent top → `color` at `opacity`. */
export const gradientOverlayConfigSchema = z.object({
  /** Peak opacity at the bottom edge, 0–1. */
  opacity: z.number().min(0).max(1).default(0.6),
  /** Portion of frame height the gradient covers, from the bottom. */
  heightPct: z.number().min(0.05).max(1).default(0.35),
  color: hexColorSchema.default("#000000"),
});
export type GradientOverlayConfig = z.infer<typeof gradientOverlayConfigSchema>;

/** Which edge/corner an overlay anchors to. "start"/"end" are logical (RTL). */
export const overlayPositionSchema = z.enum([
  "bottom-start",
  "bottom-end",
  "top-start",
  "top-end",
]);
export type OverlayPosition = z.infer<typeof overlayPositionSchema>;

/** Lower-third background treatment (Build 6C.3). */
export const lowerThirdShapeSchema = z.enum(["bar", "box", "none"]);
export type LowerThirdShape = z.infer<typeof lowerThirdShapeSchema>;

/** Static lower third: name + optional title/subtitle. Build 6C.3 adds an
 *  optional position + background shape (additive; absent = bottom-start bar). */
export const lowerThirdConfigSchema = z.object({
  name: z.string().min(1).max(80),
  title: z.string().max(120).optional(),
  subtitle: z.string().max(120).optional(),
  accentColor: hexColorSchema.default("#7C3AED"),
  textColor: hexColorSchema.default("#FFFFFF"),
  position: overlayPositionSchema.optional(),
  shape: lowerThirdShapeSchema.optional(),
});
export type LowerThirdConfig = z.infer<typeof lowerThirdConfigSchema>;

/**
 * Logo / watermark overlay (Build 6C.3). The image lives in brand-assets
 * (`storagePath`); the worker composites it at a corner, sized to `widthPct`
 * of frame width, at `opacity`. widthPct is clamped to a readable band.
 */
export const logoOverlayConfigSchema = z.object({
  storagePath: z.string().min(1),
  position: overlayPositionSchema.default("bottom-end"),
  opacity: z.number().min(0.1).max(1).default(0.9),
  widthPct: z.number().min(0.08).max(0.35).default(0.18),
});
export type LogoOverlayConfig = z.infer<typeof logoOverlayConfigSchema>;

/** The creator-level logo placement default (user_metadata.logo_overlay) —
 *  no storagePath (that comes from brand_kits.logo_path at export time). */
export const logoOverlayPrefSchema = z.object({
  enabled: z.boolean().default(false),
  position: overlayPositionSchema.default("bottom-end"),
  opacity: z.number().min(0.1).max(1).default(0.9),
  widthPct: z.number().min(0.08).max(0.35).default(0.18),
});
export type LogoOverlayPref = z.infer<typeof logoOverlayPrefSchema>;

/**
 * The exports.brand jsonb payload. Presence of a key enables that layer;
 * a null/absent column means "no branding" and renders exactly as before
 * Build 6B.1. Build 6C.3 adds an optional `logo` key (additive; no migration).
 */
export const brandExportConfigSchema = z.object({
  gradient: gradientOverlayConfigSchema.optional(),
  lowerThird: lowerThirdConfigSchema.optional(),
  logo: logoOverlayConfigSchema.optional(),
});
export type BrandExportConfig = z.infer<typeof brandExportConfigSchema>;

/** Filenames the export plan/renderers use for the brand layer PNGs. */
export const BRAND_GRADIENT_IMAGE = "brand-gradient.png";
export const BRAND_LOWER_THIRD_IMAGE = "brand-lower-third.png";
export const BRAND_LOGO_IMAGE = "brand-logo.png";

/** Shared overlay geometry so the DOM preview and the canvas renderer place
 *  the logo identically (export parity — no fake preview). Margin is a
 *  fraction of the SHORTER frame side; box is sized by frame WIDTH. */
export const OVERLAY_MARGIN_PCT = 0.05;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Where a logo of intrinsic ratio `aspect` (h/w) sits for a given position and
 * `widthPct`, in pixels for a `frameW`×`frameH` frame. Used by the worker
 * (canvas) and mirrored by the preview (CSS %) — same inputs, same placement.
 */
export function logoBox(
  position: OverlayPosition,
  widthPct: number,
  aspect: number,
  frameW: number,
  frameH: number,
): Box {
  const margin = Math.round(Math.min(frameW, frameH) * OVERLAY_MARGIN_PCT);
  const w = Math.round(frameW * widthPct);
  const h = Math.round(w * aspect);
  const isTop = position === "top-start" || position === "top-end";
  const isStart = position === "bottom-start" || position === "top-start";
  // "start" = left in LTR framing; the worker/preview both treat the frame as
  // LTR-physical for corner logos (a watermark corner is not text).
  const x = isStart ? margin : frameW - margin - w;
  const y = isTop ? margin : frameH - margin - h;
  return { x, y, w, h };
}

/** brand_kits row shape as the web app reads/writes it (snake_case = DB). */
export const brandKitRowSchema = z.object({
  id: z.string().uuid(),
  owner_id: z.string().uuid(),
  name: z.string(),
  logo_path: z.string().nullable(),
  primary_color: hexColorSchema,
  secondary_color: hexColorSchema,
  accent_color: hexColorSchema,
  caption_style_default: z.enum(CAPTION_STYLE_TOKENS).catch(DEFAULT_CAPTION_STYLE),
  overlay_default: gradientOverlayConfigSchema.nullable(),
  lower_third_default: lowerThirdConfigSchema.omit({ name: true })
    .extend({ name: z.string().max(80).default("") })
    .nullable(),
  // Build 6B.3: the creator's single default caption spec (null = use the
  // caption_style_default token). Tolerant of absence for older selects.
  caption_default_config: captionStyleSpecSchema.nullish().catch(null),
});
export type BrandKitRow = z.infer<typeof brandKitRowSchema>;
