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
