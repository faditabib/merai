import { buildFixture, type WordSpec } from "./build";

/**
 * Arabic fixture (~29s): creator intro with a false start, hesitation
 * fillers (يعني، اه) and a re-recorded take separated by 2s of silence —
 * exactly the material Phase 2's best-take/filler analysis must handle.
 */

// Take 1 — false start with fillers, abandoned mid-sentence.
const takeOne: WordSpec[] = [
  ["السلام", 380, 70],
  ["عليكم", 420, 250],
  ["يعني", 310, 120, 0.71], // discourse-filler use
  ["اليوم", 400, 90],
  ["رح", 220, 60],
  ["احكي", 380, 100],
  ["عن", 180, 200],
  ["اه", 260, 350, 0.55], // hesitation
  ["أدوات", 450, 90],
  ["المونتاج", 560, 2100], // abandoned here → 2.1s silence, re-record
];

// Take 2 — clean delivery of the same line, then continues.
const takeTwo: WordSpec[] = [
  ["السلام", 370, 70],
  ["عليكم", 410, 160],
  ["اليوم", 390, 80],
  ["رح", 210, 60],
  ["احكي", 370, 90],
  ["عن", 170, 70],
  ["أدوات", 440, 80],
  ["المونتاج", 550, 120],
  ["بالذكاء", 520, 70],
  ["الاصطناعي", 640, 300],
  ["وكيف", 380, 80],
  ["بتوفر", 430, 70],
  ["عليك", 350, 90],
  ["ساعات", 460, 100],
  ["من", 170, 60],
  ["الشغل", 420, 130],
  ["كل", 200, 70],
  ["أسبوع", 480, 1400], // breath pause before the closing line
  ["خلينا", 400, 80],
  ["نبدأ", 380, 60],
];

export const arabicFixture = buildFixture({
  id: "mock-transcript-ar-001",
  languageCode: "ar",
  words: [...takeOne, ...takeTwo],
  leadInMs: 900,
  leadOutMs: 1200,
});
