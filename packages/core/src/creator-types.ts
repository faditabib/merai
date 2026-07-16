import type { AiIntent } from "./ai-edit";
import { getCreatorStyle, type CreatorStyle, type CreatorStyleId } from "./creator-styles";

/**
 * Creator types (Build 6C.4) — the onboarding wizard's personas. A type is a
 * pointer, not a new entity: it names an existing Creator Style (6C.2) as the
 * recommended look and an AI intent seed for `ai_preferences`. Picking a type
 * pre-configures the wizard; all persistence goes through channels that
 * already exist (brand_kits upsert, user_metadata, ai_preferences).
 *
 * Product names are generic (PRD house rule — no real creators' names in ids
 * or copy; guarded by a test, labels live in i18n).
 */

export const CREATOR_TYPE_IDS = [
  "content-creator",
  "podcast",
  "coach",
  "doctor",
  "educator",
  "business",
] as const;
export type CreatorTypeId = (typeof CREATOR_TYPE_IDS)[number];

export interface CreatorType {
  id: CreatorTypeId;
  /** The recommended Creator Style this type pre-selects. */
  styleId: CreatorStyleId;
  /** Seed for ai_preferences.intent — the wizard writes it as the user's
   *  explicit choice (never a hidden profile). */
  intent: AiIntent;
}

export const CREATOR_TYPES: readonly CreatorType[] = [
  { id: "content-creator", styleId: "high-energy", intent: "short-form" },
  { id: "podcast", styleId: "podcast-classic", intent: "general" },
  { id: "coach", styleId: "founder-bold", intent: "short-form" },
  { id: "doctor", styleId: "medical-trust", intent: "general" },
  { id: "educator", styleId: "educational-clean", intent: "educational" },
  { id: "business", styleId: "luxury-minimal", intent: "general" },
];

export function getCreatorType(id: string): CreatorType | undefined {
  return CREATOR_TYPES.find((t) => t.id === id);
}

/** Resolve a type to its concrete defaults (style bundle + intent seed). */
export function creatorTypeDefaults(
  id: string,
): { style: CreatorStyle; intent: AiIntent } | undefined {
  const type = getCreatorType(id);
  if (!type) return undefined;
  const style = getCreatorStyle(type.styleId);
  if (!style) return undefined;
  return { style, intent: type.intent };
}
