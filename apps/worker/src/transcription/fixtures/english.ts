import { buildFixture, type WordSpec } from "./build";

/**
 * English fixture (~27s): channel intro with um/uh fillers and an explicit
 * restart ("let me start over") followed by a clean take.
 */

const takeOne: WordSpec[] = [
  ["Hey", 240, 60],
  ["guys", 320, 180],
  ["um", 280, 320, 0.52], // hesitation
  ["welcome", 380, 70],
  ["back", 260, 70],
  ["to", 120, 50],
  ["the", 130, 60],
  ["channel.", 420, 500],
  ["So", 200, 90],
  ["today", 350, 140],
  ["uh", 240, 380, 0.48], // hesitation
  ["we're", 220, 60],
  ["gonna", 240, 70],
  ["talk", 280, 70],
  ["about", 260, 90],
  ["editing", 420, 1900], // trails off → restart
];

const restart: WordSpec[] = [
  ["Actually", 460, 90, 0.9],
  ["let", 180, 50],
  ["me", 140, 60],
  ["start", 300, 70],
  ["over.", 340, 1600], // pause, then clean take
];

const takeTwo: WordSpec[] = [
  ["Today", 360, 120],
  ["we're", 210, 60],
  ["gonna", 230, 60],
  ["talk", 270, 70],
  ["about", 250, 80],
  ["editing", 410, 80],
  ["your", 200, 60],
  ["videos", 430, 90],
  ["with", 210, 70],
  ["AI", 380, 400],
  ["and", 170, 60],
  ["how", 210, 60],
  ["it", 110, 50],
  ["saves", 330, 70],
  ["you", 160, 60],
  ["hours", 420, 90],
  ["every", 290, 70],
  ["single", 320, 80],
  ["week.", 400, 200],
];

export const englishFixture = buildFixture({
  id: "mock-transcript-en-001",
  languageCode: "en_us",
  words: [...takeOne, ...restart, ...takeTwo],
  leadInMs: 700,
  leadOutMs: 900,
});
