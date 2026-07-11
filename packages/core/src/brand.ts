import { z } from "zod";
import { CAPTION_STYLE_TOKENS, DEFAULT_CAPTION_STYLE } from "./captions";

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

/** Static lower third: name + optional title/subtitle over an accent bar. */
export const lowerThirdConfigSchema = z.object({
  name: z.string().min(1).max(80),
  title: z.string().max(120).optional(),
  subtitle: z.string().max(120).optional(),
  accentColor: hexColorSchema.default("#7C3AED"),
  textColor: hexColorSchema.default("#FFFFFF"),
});
export type LowerThirdConfig = z.infer<typeof lowerThirdConfigSchema>;

/**
 * The exports.brand jsonb payload. Presence of a key enables that layer;
 * a null/absent column means "no branding" and renders exactly as before
 * Build 6B.1.
 */
export const brandExportConfigSchema = z.object({
  gradient: gradientOverlayConfigSchema.optional(),
  lowerThird: lowerThirdConfigSchema.optional(),
});
export type BrandExportConfig = z.infer<typeof brandExportConfigSchema>;

/** Filenames the export plan/renderers use for the brand layer PNGs. */
export const BRAND_GRADIENT_IMAGE = "brand-gradient.png";
export const BRAND_LOWER_THIRD_IMAGE = "brand-lower-third.png";

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
});
export type BrandKitRow = z.infer<typeof brandKitRowSchema>;
