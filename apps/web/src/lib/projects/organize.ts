/**
 * Project organization (Build 7.7) — pure, tested helpers. Tags are the
 * organization primitive: a "collection" is a tag filter, search matches
 * title OR tags, bulk ops are add/remove over a selection.
 */

export const TAG_MAX_LENGTH = 24;
export const TAGS_PER_PROJECT_MAX = 12;

/** Trim + collapse inner whitespace + cap length. Empty → null. */
export function normalizeTag(raw: string): string | null {
  const tag = raw.trim().replace(/\s+/g, " ").slice(0, TAG_MAX_LENGTH).trim();
  return tag.length > 0 ? tag : null;
}

/** Case-insensitive membership (Arabic-safe via toLocaleLowerCase). */
function hasTag(tags: readonly string[], tag: string): boolean {
  const needle = tag.toLocaleLowerCase();
  return tags.some((t) => t.toLocaleLowerCase() === needle);
}

/** Add (normalized, deduped case-insensitively, capped). Returns the same
 *  array when nothing changes — memo/state friendly. */
export function addTag(tags: readonly string[], raw: string): readonly string[] {
  const tag = normalizeTag(raw);
  if (!tag || hasTag(tags, tag) || tags.length >= TAGS_PER_PROJECT_MAX) {
    return tags;
  }
  return [...tags, tag];
}

export function removeTag(tags: readonly string[], tag: string): readonly string[] {
  const needle = tag.toLocaleLowerCase();
  const next = tags.filter((t) => t.toLocaleLowerCase() !== needle);
  return next.length === tags.length ? tags : next;
}

export interface OrganizableProject {
  id: string;
  title: string;
  tags: readonly string[];
}

/** Distinct tags across projects, case-insensitively deduped (first spelling
 *  wins), locale-sorted. */
export function allTags(projects: readonly OrganizableProject[]): string[] {
  const seen = new Map<string, string>();
  for (const project of projects) {
    for (const tag of project.tags) {
      const key = tag.toLocaleLowerCase();
      if (!seen.has(key)) seen.set(key, tag);
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/**
 * Search + tag filtering. Query matches title OR any tag (case-insensitive
 * substring). Active tags use OR semantics (any match keeps the project).
 */
export function filterProjects<P extends OrganizableProject>(
  projects: readonly P[],
  filter: { query?: string; tags?: readonly string[] },
): P[] {
  const query = filter.query?.trim().toLocaleLowerCase() ?? "";
  const activeTags = (filter.tags ?? []).map((t) => t.toLocaleLowerCase());
  return projects.filter((project) => {
    if (query) {
      const inTitle = project.title.toLocaleLowerCase().includes(query);
      const inTags = project.tags.some((t) => t.toLocaleLowerCase().includes(query));
      if (!inTitle && !inTags) return false;
    }
    if (activeTags.length > 0) {
      const projectTags = project.tags.map((t) => t.toLocaleLowerCase());
      if (!activeTags.some((t) => projectTags.includes(t))) return false;
    }
    return true;
  });
}
