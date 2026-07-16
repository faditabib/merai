import { describe, expect, it } from "vitest";
import {
  addTag,
  allTags,
  filterProjects,
  normalizeTag,
  removeTag,
  TAGS_PER_PROJECT_MAX,
} from "../src/lib/projects/organize";

describe("normalizeTag (Build 7.7)", () => {
  it("trims, collapses whitespace, caps length", () => {
    expect(normalizeTag("  بودكاست  ")).toBe("بودكاست");
    expect(normalizeTag("client   work")).toBe("client work");
    expect(normalizeTag("x".repeat(40))).toHaveLength(24);
  });
  it("empty and whitespace-only → null", () => {
    expect(normalizeTag("")).toBeNull();
    expect(normalizeTag("   ")).toBeNull();
  });
});

describe("addTag / removeTag", () => {
  it("adds normalized, dedupes case-insensitively", () => {
    expect(addTag(["Client"], "client")).toEqual(["Client"]); // same array semantics
    expect(addTag([], " Podcast ")).toEqual(["Podcast"]);
  });
  it("returns the SAME array when nothing changes", () => {
    const tags = ["a"];
    expect(addTag(tags, "A")).toBe(tags);
    expect(removeTag(tags, "nope")).toBe(tags);
  });
  it("caps at TAGS_PER_PROJECT_MAX", () => {
    const full = Array.from({ length: TAGS_PER_PROJECT_MAX }, (_, i) => `t${i}`);
    expect(addTag(full, "extra")).toBe(full);
  });
  it("removes case-insensitively", () => {
    expect(removeTag(["Client", "بودكاست"], "client")).toEqual(["بودكاست"]);
  });
});

describe("allTags", () => {
  it("distinct across projects, first spelling wins, sorted", () => {
    const tags = allTags([
      { id: "1", title: "a", tags: ["Client", "podcast"] },
      { id: "2", title: "b", tags: ["client", "Ads"] },
    ]);
    expect(tags).toEqual(["Ads", "Client", "podcast"]);
  });
});

describe("filterProjects", () => {
  const projects = [
    { id: "1", title: "حلقة البودكاست الأولى", tags: ["بودكاست"] },
    { id: "2", title: "Client promo", tags: ["client", "ads"] },
    { id: "3", title: "درس تعليمي", tags: [] },
  ];

  it("query matches title OR tags, case-insensitive", () => {
    expect(filterProjects(projects, { query: "بودكاست" })).toHaveLength(1);
    expect(filterProjects(projects, { query: "CLIENT" })).toHaveLength(1);
    expect(filterProjects(projects, { query: "ads" }).map((p) => p.id)).toEqual(["2"]);
  });

  it("tag filter uses OR semantics", () => {
    expect(
      filterProjects(projects, { tags: ["بودكاست", "ads"] }).map((p) => p.id),
    ).toEqual(["1", "2"]);
  });

  it("query and tags combine (AND between the two facets)", () => {
    expect(filterProjects(projects, { query: "promo", tags: ["بودكاست"] })).toHaveLength(0);
  });

  it("no filter returns everything", () => {
    expect(filterProjects(projects, {})).toHaveLength(3);
  });
});
