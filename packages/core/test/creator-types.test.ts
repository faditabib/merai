import { describe, expect, it } from "vitest";
import {
  AI_INTENTS,
  CREATOR_STYLE_IDS,
  CREATOR_TYPE_IDS,
  CREATOR_TYPES,
  creatorTypeDefaults,
  getCreatorType,
} from "../src/index";

describe("Creator Types catalog (Build 6C.4)", () => {
  it("has 6 types, ids in catalog order", () => {
    expect(CREATOR_TYPES).toHaveLength(6);
    expect(CREATOR_TYPES.map((t) => t.id)).toEqual([...CREATOR_TYPE_IDS]);
  });

  it("every type references a real Creator Style and a valid AI intent", () => {
    for (const type of CREATOR_TYPES) {
      expect(CREATOR_STYLE_IDS, type.id).toContain(type.styleId);
      expect(AI_INTENTS, type.id).toContain(type.intent);
    }
  });

  it("styles are not double-booked (each type gets a distinct look)", () => {
    const styleIds = CREATOR_TYPES.map((t) => t.styleId);
    expect(new Set(styleIds).size).toBe(styleIds.length);
  });

  // PRD house rule: real creators' names never ship in ids (labels are i18n).
  it("carries NO real creator names in ids", () => {
    const blocklist = ["hormozi", "garyvee", "gary vee", "vaynerchuk", "abdaal", "gadzhi"];
    for (const id of CREATOR_TYPE_IDS) {
      const lower = id.toLowerCase();
      for (const name of blocklist) expect(lower.includes(name), id).toBe(false);
    }
  });

  it("getCreatorType resolves ids and rejects unknowns", () => {
    expect(getCreatorType("doctor")?.styleId).toBe("medical-trust");
    expect(getCreatorType("influencer")).toBeUndefined();
  });

  it("creatorTypeDefaults resolves the full style bundle + intent", () => {
    const d = creatorTypeDefaults("educator");
    expect(d?.style.id).toBe("educational-clean");
    expect(d?.intent).toBe("educational");
    expect(d?.style.caption).toBeDefined();
    expect(creatorTypeDefaults("nope")).toBeUndefined();
  });
});
