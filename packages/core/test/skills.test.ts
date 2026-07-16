import { describe, expect, it } from "vitest";
import {
  AI_INTENTS,
  CREATOR_STYLE_IDS,
  CREATOR_TYPE_IDS,
  getSkill,
  recommendedSkills,
  skillBrainRequest,
  skillDefinitionSchema,
  SKILL_IDS,
  SKILL_INSTRUCTION_MAX_CHARS,
  SKILLS,
} from "../src/index";

describe("Skills catalog (Build 8)", () => {
  it("ships the six launch skills, ids in catalog order, unique", () => {
    expect(SKILLS.map((s) => s.id)).toEqual([...SKILL_IDS]);
    expect(new Set(SKILLS.map((s) => s.id)).size).toBe(SKILLS.length);
  });

  it("every skill validates against the marketplace contract", () => {
    for (const skill of SKILLS) {
      expect(skillDefinitionSchema.safeParse(skill).success, skill.id).toBe(true);
    }
  });

  it("instructions fit the ai_suggestions CHECK and are never empty", () => {
    for (const skill of SKILLS) {
      expect(skill.brain.instruction.length, skill.id).toBeGreaterThan(0);
      expect(skill.brain.instruction.length, skill.id).toBeLessThanOrEqual(
        SKILL_INSTRUCTION_MAX_CHARS,
      );
    }
  });

  it("referential integrity: intents, styles, creator types all exist", () => {
    for (const skill of SKILLS) {
      expect(AI_INTENTS, skill.id).toContain(skill.brain.intent);
      if (skill.look) {
        expect(CREATOR_STYLE_IDS, skill.id).toContain(skill.look.styleId);
      }
      for (const type of skill.creatorTypes) {
        expect(CREATOR_TYPE_IDS, skill.id).toContain(type);
      }
    }
  });

  it("getSkill resolves and rejects", () => {
    expect(getSkill("podcast-editor")?.brain.intent).toBe("general");
    expect(getSkill("nope")).toBeUndefined();
  });
});

describe("recommendedSkills (persona-first ranking)", () => {
  it("puts the creator's own skills first, keeps the rest", () => {
    const forDoctor = recommendedSkills("doctor");
    expect(forDoctor[0]!.id).toBe("medical-creator");
    expect(forDoctor).toHaveLength(SKILLS.length);
  });

  it("null persona returns the catalog order", () => {
    expect(recommendedSkills(null).map((s) => s.id)).toEqual([...SKILL_IDS]);
  });
});

describe("the forward-open contract (marketplace-readiness)", () => {
  it("accepts a third-party skill with unknown step types", () => {
    const parsed = skillDefinitionSchema.safeParse({
      id: "community-chapters",
      version: 3,
      brain: { instruction: "قسّم الفيديو إلى فصول.", intent: "auto" },
      creatorTypes: ["educator"],
      steps: [{ type: "generate-chapters", params: { minChapters: 3 } }],
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.steps[0]!.type).toBe("generate-chapters");
  });

  it("rejects malformed skills loudly (bad id, over-long instruction, fake style)", () => {
    expect(
      skillDefinitionSchema.safeParse({
        id: "Bad Id!",
        version: 1,
        brain: { instruction: "x", intent: "auto" },
      }).success,
    ).toBe(false);
    expect(
      skillDefinitionSchema.safeParse({
        id: "too-long",
        version: 1,
        brain: { instruction: "x".repeat(501), intent: "auto" },
      }).success,
    ).toBe(false);
    expect(
      skillDefinitionSchema.safeParse({
        id: "fake-style",
        version: 1,
        brain: { instruction: "x", intent: "auto" },
        look: { styleId: "not-a-style", aspectRatio: "9:16" },
      }).success,
    ).toBe(false);
  });

  it("skillBrainRequest is exactly what the panel submits", () => {
    const skill = getSkill("shorts-generator")!;
    expect(skillBrainRequest(skill)).toEqual({
      instruction: skill.brain.instruction,
      intent: "short-form",
    });
  });
});
