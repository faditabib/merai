import { z } from "zod";
import { AI_INTENTS, type AiIntent } from "./ai-edit";
import { CREATOR_STYLE_IDS } from "./creator-styles";
import { CREATOR_TYPE_IDS, type CreatorTypeId } from "./creator-types";
import { aspectRatioSchema } from "./edl";

/**
 * Merai Skills (Build 8) — productized AI workflows. A Skill is a versioned,
 * zod-VALIDATED definition that drives runtimes the product already has:
 * the AI Brain (instruction + intent through the existing suggestion flow),
 * the look system (Creator Style + format recommendation), and the persona
 * graph (which creator types see it first).
 *
 * The marketplace contract is the SCHEMA, not this catalog: any skill —
 * first-party today, marketplace tomorrow — validates against
 * `skillDefinitionSchema` at load time. `steps` is forward-open
 * ({type, params}, the EDL-effects pattern) so multi-step pipelines land
 * without a schema version bump. Zero migrations: a future marketplace
 * table stores this same validated shape.
 */

export const SKILL_IDS = [
  "podcast-editor",
  "shorts-generator",
  "course-creator",
  "business-videos",
  "social-media",
  "medical-creator",
] as const;
export type SkillId = (typeof SKILL_IDS)[number];

/** Matches the ai_suggestions.instruction CHECK (1..500 chars). */
export const SKILL_INSTRUCTION_MAX_CHARS = 500;

/** Forward-open pipeline step — executors ignore unknown types. */
export const skillStepSchema = z.object({
  type: z.string().min(1),
  params: z.record(z.string(), z.unknown()).default({}),
});
export type SkillStep = z.infer<typeof skillStepSchema>;

export const skillDefinitionSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  version: z.number().int().min(1),
  /** What the skill asks the Brain to do (existing suggestion flow). */
  brain: z.object({
    instruction: z.string().min(1).max(SKILL_INSTRUCTION_MAX_CHARS),
    intent: z.enum(AI_INTENTS),
  }),
  /** Optional look recommendation (existing Creator Style system). */
  look: z
    .object({
      styleId: z.enum(CREATOR_STYLE_IDS),
      aspectRatio: aspectRatioSchema,
    })
    .optional(),
  /** Personas that see this skill first (recommendation ranking). */
  creatorTypes: z.array(z.enum(CREATOR_TYPE_IDS)).default([]),
  /** Future multi-step pipelines — contract ships now, executor later. */
  steps: z.array(skillStepSchema).default([]),
});
export type SkillDefinition = z.infer<typeof skillDefinitionSchema>;

const catalog: SkillDefinition[] = [
  {
    id: "podcast-editor",
    version: 1,
    brain: {
      instruction:
        "جهّز هذه الحلقة كبودكاست احترافي: احذف الصمت الطويل وكلمات الحشو والتلعثم مع الحفاظ على الإيقاع الطبيعي للحوار، وطبّق نمط ترجمة هادئًا مناسبًا للبودكاست.",
      intent: "general",
    },
    look: { styleId: "podcast-classic", aspectRatio: "1:1" },
    creatorTypes: ["podcast"],
    steps: [],
  },
  {
    id: "shorts-generator",
    version: 1,
    brain: {
      instruction:
        "حوّل هذا الفيديو إلى مقطع قصير سريع الإيقاع: احذف كل صمت وحشو وتكرار بلا تردد، وأبقِ الجمل الأقوى فقط، وطبّق نمط ترجمة كبيرًا لافتًا يناسب الريلز.",
      intent: "short-form",
    },
    look: { styleId: "high-energy", aspectRatio: "9:16" },
    creatorTypes: ["content-creator", "coach"],
    steps: [],
  },
  {
    id: "course-creator",
    version: 1,
    brain: {
      instruction:
        "جهّز هذا الدرس التعليمي: احذف الحشو والتلعثم بلطف مع الحفاظ على الوقفات الطبيعية للشرح وكل الجمل التعليمية، وطبّق نمط ترجمة واضحًا سهل القراءة.",
      intent: "educational",
    },
    look: { styleId: "educational-clean", aspectRatio: "16:9" },
    creatorTypes: ["educator"],
    steps: [],
  },
  {
    id: "business-videos",
    version: 1,
    brain: {
      instruction:
        "جهّز هذا الفيديو بمظهر احترافي للأعمال: احذف الحشو والتردد والصمت الزائد للحصول على رسالة موجزة وواثقة، وطبّق نمط ترجمة أنيقًا رسميًا.",
      intent: "general",
    },
    look: { styleId: "luxury-minimal", aspectRatio: "16:9" },
    creatorTypes: ["business"],
    steps: [],
  },
  {
    id: "social-media",
    version: 1,
    brain: {
      instruction:
        "جهّز هذا الفيديو للنشر على وسائل التواصل: قصّه بإيقاع سريع بحذف الصمت والحشو والتكرار، وأبقِ الخطّاف الافتتاحي قويًا، وطبّق نمط ترجمة جذابًا.",
      intent: "short-form",
    },
    look: { styleId: "high-energy", aspectRatio: "9:16" },
    creatorTypes: ["content-creator"],
    steps: [],
  },
  {
    id: "medical-creator",
    version: 1,
    brain: {
      instruction:
        "جهّز هذا المحتوى الطبي التوعوي: احذف الحشو والتلعثم مع الحفاظ الكامل على دقة المعلومة الطبية وكل التحذيرات والجرعات المذكورة، وطبّق نمط ترجمة نظيفًا موثوقًا.",
      intent: "general",
    },
    look: { styleId: "medical-trust", aspectRatio: "9:16" },
    creatorTypes: ["doctor"],
    steps: [],
  },
];

/** The launch catalog — every entry is schema-validated at module load, the
 *  exact gate a marketplace skill will pass through. */
export const SKILLS: readonly SkillDefinition[] = catalog.map((skill) =>
  skillDefinitionSchema.parse(skill),
);

export function getSkill(id: string): SkillDefinition | undefined {
  return SKILLS.find((s) => s.id === id);
}

/** Persona-first ordering: the creator's own skills, then the rest. */
export function recommendedSkills(
  creatorType: CreatorTypeId | null | undefined,
): readonly SkillDefinition[] {
  if (!creatorType) return SKILLS;
  return [...SKILLS].sort((a, b) => {
    const aFirst = a.creatorTypes.includes(creatorType) ? 0 : 1;
    const bFirst = b.creatorTypes.includes(creatorType) ? 0 : 1;
    return aFirst - bFirst;
  });
}

/** What one tap submits through the existing Brain flow. */
export function skillBrainRequest(skill: SkillDefinition): {
  instruction: string;
  intent: AiIntent;
} {
  return { instruction: skill.brain.instruction, intent: skill.brain.intent };
}
