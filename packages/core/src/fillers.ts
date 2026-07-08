/**
 * Seed filler-word lexicons (Arabic + English).
 *
 * IMPORTANT: these are candidate lists, not removal lists. Several Arabic
 * entries are context-dependent — يعني is a filler in "أنا يعني رحت" but a
 * real verb ("it means") in "هذا يعني أن...". Phase 2 sends candidates plus
 * surrounding context to Claude Haiku for classification; nothing is removed
 * by keyword match alone.
 */

export const ARABIC_FILLER_CANDIDATES = [
  "يعني",
  "إه",
  "اه",
  "آه",
  "أه",
  "امم",
  "إمم",
  "همم",
  "يلا",
  "يالله",
  "طب",
  "طيب",
  "بس",
  "مثلا",
  "شو",
  "وﷲ", // dialect discourse marker use, not the meaningful oath use
  "والله",
] as const;

export const ENGLISH_FILLER_CANDIDATES = [
  "um",
  "uh",
  "uhm",
  "erm",
  "hmm",
  "like",
  "you know",
  "i mean",
  "so",
  "actually",
  "basically",
] as const;

/** Tokens that are almost always safe to auto-remove without AI review
 *  (pure hesitation sounds with no lexical meaning). */
export const UNAMBIGUOUS_FILLERS = new Set<string>([
  "إه",
  "اه",
  "آه",
  "أه",
  "امم",
  "إمم",
  "همم",
  "um",
  "uh",
  "uhm",
  "erm",
  "hmm",
]);

/**
 * Normalize a transcript token for lexicon comparison: lowercase Latin,
 * strip punctuation, remove Arabic diacritics/tatweel, unify hamza-alef
 * forms (أإآ → ا). STT output varies in hamza spelling, so lexicon matching
 * without this misses real fillers.
 */
export function normalizeToken(token: string): string {
  return token
    .toLowerCase()
    .replace(/[ً-ْٰـ]/g, "") // harakat, dagger alef, tatweel
    .replace(/[أإآ]/g, "ا")
    .replace(/[.,!?؟،؛:"'()\[\]…]/g, "")
    .trim();
}

const NORMALIZED_UNAMBIGUOUS = new Set(
  [...UNAMBIGUOUS_FILLERS].map((t) => normalizeToken(t)),
);
const NORMALIZED_CANDIDATES = new Set(
  [...ARABIC_FILLER_CANDIDATES, ...ENGLISH_FILLER_CANDIDATES].map((t) =>
    normalizeToken(t),
  ),
);

/** Safe to remove without AI review (pure hesitation sound). */
export function isUnambiguousFiller(token: string): boolean {
  return NORMALIZED_UNAMBIGUOUS.has(normalizeToken(token));
}

/** Possibly a filler — must be confirmed in context (AI), never auto-removed. */
export function isFillerCandidate(token: string): boolean {
  return NORMALIZED_CANDIDATES.has(normalizeToken(token));
}
