import type {
  GradientOverlayConfig,
  LowerThirdConfig,
  LowerThirdShape,
  OverlayPosition,
} from "./brand";
import { CAPTION_STYLE_SPECS, type CaptionStyleSpec } from "./captions";
import type { AspectRatio } from "./edl";

/**
 * Creator Styles (Build 6C.2) — selectable creative identities. A style is NOT
 * a new runtime object: it is a curated BUNDLE that, on Apply, writes existing
 * Brand-Kit fields (colors + caption default + overlay + lower-third colors).
 * Once applied, the 6B.1/6B.3 editor→export pipeline carries it with zero new
 * render/worker/DB code.
 *
 * Product names are generic. Internal inspiration is a private reference only
 * and must NEVER appear in ids, labels, or copy (PRD house rule; guarded by a
 * test). No saved-preset library, no migration — a hybrid code catalog.
 */

export const CREATOR_STYLE_IDS = [
  "founder-bold",
  "educational-clean",
  "podcast-classic",
  "medical-trust",
  "luxury-minimal",
  "high-energy",
] as const;
export type CreatorStyleId = (typeof CREATOR_STYLE_IDS)[number];

export interface CreatorStyleColors {
  primary: string;
  secondary: string;
  accent: string;
}

export interface CreatorStyle {
  id: CreatorStyleId;
  /** Resolved caption default (a real CaptionStyleSpec). */
  caption: CaptionStyleSpec;
  colors: CreatorStyleColors;
  /** Gradient readability overlay default (null = none). */
  overlay: GradientOverlayConfig | null;
  /** Lower-third treatment the style sets — colors + optional shape/position
   *  (identity text stays the creator's). */
  lowerThird: {
    accentColor: string;
    textColor: string;
    shape?: LowerThirdShape;
    position?: OverlayPosition;
  };
  /** Optional logo/watermark placement the style suggests (the image stays the
   *  creator's own upload). */
  logo?: { position: OverlayPosition; opacity: number; widthPct: number };
  /** Recommended export format (a soft default). */
  aspectRatio: AspectRatio;
  /** i18n key under creatorStyles.useCases.* */
  useCaseKey: string;
}

/** Base a style's caption on a Caption Studio preset spec, with overrides. */
function caption(token: keyof typeof CAPTION_STYLE_SPECS, over: Partial<CaptionStyleSpec> = {}): CaptionStyleSpec {
  return { ...CAPTION_STYLE_SPECS[token], ...over };
}

export const CREATOR_STYLES: readonly CreatorStyle[] = [
  {
    id: "founder-bold",
    caption: caption("bold-impact", { fontScale: 1.3, verticalAnchor: 0.72 }),
    colors: { primary: "#111111", secondary: "#FFFFFF", accent: "#FFD400" },
    overlay: { opacity: 0.6, heightPct: 0.4, color: "#000000" },
    lowerThird: { accentColor: "#FFD400", textColor: "#111111" },
    aspectRatio: "9:16",
    useCaseKey: "coaching",
  },
  {
    id: "educational-clean",
    caption: caption("educational"),
    colors: { primary: "#2563EB", secondary: "#F3F4F6", accent: "#10B981" },
    overlay: { opacity: 0.4, heightPct: 0.3, color: "#000000" },
    lowerThird: { accentColor: "#2563EB", textColor: "#FFFFFF" },
    aspectRatio: "16:9",
    useCaseKey: "tutorials",
  },
  {
    id: "podcast-classic",
    caption: caption("podcast"),
    colors: { primary: "#1F2937", secondary: "#9CA3AF", accent: "#F59E0B" },
    overlay: { opacity: 0.5, heightPct: 0.35, color: "#000000" },
    lowerThird: { accentColor: "#F59E0B", textColor: "#FFFFFF", shape: "box", position: "bottom-start" },
    logo: { position: "top-end", opacity: 0.85, widthPct: 0.16 },
    aspectRatio: "1:1",
    useCaseKey: "podcast",
  },
  {
    id: "medical-trust",
    // brand-box carries the trust-blue brand color into the caption at export.
    caption: caption("brand-box"),
    colors: { primary: "#0EA5E9", secondary: "#E0F2FE", accent: "#0369A1" },
    overlay: { opacity: 0.4, heightPct: 0.3, color: "#000000" },
    lowerThird: { accentColor: "#0EA5E9", textColor: "#FFFFFF", shape: "bar", position: "bottom-start" },
    logo: { position: "bottom-end", opacity: 0.9, widthPct: 0.18 },
    aspectRatio: "9:16",
    useCaseKey: "medical",
  },
  {
    id: "luxury-minimal",
    caption: caption("luxury"),
    colors: { primary: "#0B0B0B", secondary: "#F5F5F4", accent: "#C6A15B" },
    overlay: { opacity: 0.35, heightPct: 0.3, color: "#000000" },
    lowerThird: { accentColor: "#C6A15B", textColor: "#F5E9C8" },
    aspectRatio: "9:16",
    useCaseKey: "premium",
  },
  {
    id: "high-energy",
    caption: caption("high-energy", { fontScale: 1.4 }),
    colors: { primary: "#EF4444", secondary: "#111111", accent: "#FACC15" },
    overlay: { opacity: 0.6, heightPct: 0.45, color: "#000000" },
    lowerThird: { accentColor: "#EF4444", textColor: "#FFFFFF" },
    aspectRatio: "9:16",
    useCaseKey: "shortform",
  },
];

export function getCreatorStyle(id: string): CreatorStyle | undefined {
  return CREATOR_STYLES.find((s) => s.id === id);
}

/** Existing kit fields the patch needs to preserve identity text. */
export interface CreatorStylePatchInput {
  lower_third_default?:
    | (Partial<LowerThirdConfig> & { name?: string })
    | null;
}

/** The exact brand_kits fields an "Apply Style" upsert writes. */
export interface BrandKitStylePatch {
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  caption_style_default: string;
  caption_default_config: CaptionStyleSpec;
  overlay_default: GradientOverlayConfig | null;
  lower_third_default: {
    name: string;
    title?: string;
    subtitle?: string;
    accentColor: string;
    textColor: string;
  };
}

/**
 * Pure resolver: a Creator Style + the creator's current kit → the brand_kits
 * patch to upsert. **Overwrites the "look"** (colors, caption default, overlay,
 * lower-third colors) and **preserves identity** — the lower-third name/title/
 * subtitle are kept from the existing kit (logo_path is never touched here).
 */
export function creatorStyleBrandKitPatch(
  style: CreatorStyle,
  existing?: CreatorStylePatchInput | null,
): BrandKitStylePatch {
  const lt = existing?.lower_third_default ?? null;
  return {
    primary_color: style.colors.primary,
    secondary_color: style.colors.secondary,
    accent_color: style.colors.accent,
    caption_style_default: style.caption.token,
    caption_default_config: style.caption,
    overlay_default: style.overlay,
    lower_third_default: {
      // Identity text preserved; only the treatment restyles.
      name: lt?.name ?? "",
      ...(lt?.title ? { title: lt.title } : {}),
      ...(lt?.subtitle ? { subtitle: lt.subtitle } : {}),
      accentColor: style.lowerThird.accentColor,
      textColor: style.lowerThird.textColor,
      ...(style.lowerThird.shape ? { shape: style.lowerThird.shape } : {}),
      ...(style.lowerThird.position ? { position: style.lowerThird.position } : {}),
    },
  };
}
