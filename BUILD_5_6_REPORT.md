# Build 5.6 Report — AI Brain UX Polish + Feedback Loop

Date: 2026-07-11 · 113 tests green (47 core + 54 worker + 12 web; was 105) ·
`next build` ✓ · ar/en parity 227=227 · live E2E through the production
Railway worker PASSED with DB-verified persistence. Analysis first:
[BUILD_5_6_ANALYSIS.md](BUILD_5_6_ANALYSIS.md).

## 1. UX improvements

- **Recommendation cards (F1)** — "Review changes" expands one card per
  change: headline title, action chip, **target derived from real data**
  (word text/counts, segment duration from the EDL — the app computes
  numbers, the model never invents them), then "Why" and "Benefit" written
  by the model in the transcript's language.
- **Categories (F2)** — closed enum hook/pacing/clarity/style/platform,
  localized chips; absent/unknown category renders nothing (old rows keep
  working — backward compatible).
- **Feedback loop (F3)** — 👍 مفيد / 👎 غير مفيد on both the ready and the
  post-apply card; 👎 offers the four optional reasons; stored on the
  suggestion row. No dashboards.
- **Intent memory (F4)** — a visible "أسلوبك المفضّل" selector
  (auto/short-form/educational/general). Explicit choice is the ONLY thing
  stored; in auto mode the worker derives a hint per-request from goals the
  user chose to APPLY and stores nothing — no hidden profile can
  accumulate. The instruction always beats the preference (prompt rule).
- **Apply preview (F5)** — "سيجري محرّرك الذكي: ✓ …" with real derived
  counts (cuts/restores/style/aspect), the "original stays safe" note, and
  [Apply] [Review changes] [Dismiss]. Post-apply keeps a compact card (undo
  reminder + feedback) instead of vanishing.

## 2. Architecture decisions

1. **Annotations ride inline on commands, then split.** The Brain annotates
   each command object (title/reason/benefit/category); `parseAnnotatedPlan`
   separates pure commands (dispatcher contract untouched) from
   presentation steps — no index-alignment hazards, and a malformed
   annotation can never sink a valid command (presentation is best-effort,
   mutation stays strict).
2. **Steps travel with commands through normalization** — dropped together,
   kept together (unit-tested).
3. **Feedback lives on ai_suggestions** (1:1, existing owner-update RLS),
   not a new table. **Preferences** are a one-row-per-user table with only
   the explicit choice.
4. **Safety unchanged and now regression-guarded**: the Brain job cannot
   write `edl_versions` (asserted by test); apply remains one undo
   snapshot; versions remain append-only immutable.

## 3. Database changes (migration 8, applied live)
`ai_suggestions` + `steps jsonb`, `feedback` (helpful|not-useful),
`feedback_reason` (prefer-original|misunderstood-context|wrong-cut|other);
new `ai_preferences` (owner pk, intent, owner-scoped RLS).

## 4. Tests (105 → 113)
- Core: annotation splitting, malformed-annotation tolerance, bad-category
  degradation, steps/commands alignment through normalization, segment
  intent dedupe (live finding).
- Worker: aligned steps stored; **apply safety** (edl_versions count
  unchanged by the Brain job); `resolveIntentHint` explicit-wins + derives
  only from the owner's applied goals (isolation); **real RLS enforcement**
  via `set role authenticated`: feedback persists for the owner, a
  stranger's write matches zero rows, and ai_preferences rejects foreign
  inserts and hides foreign rows.

## 5. Cost impact (measured, Haiku only — no new models)
Annotations roughly double output tokens: 2,444 in / 551 out ≈ **$0.005
per suggestion** (was ~$0.003). One call per explicit request, unchanged;
terminal suggestions still converge without re-billing.

## 6. Live E2E (production Railway worker, through the UI)
Run 1 **found live finding #2**: the model ripple-deleted an
already-removed segment → whole plan rejected. Fixed the same way as
5.5's word finding (commit `b919d04`): delete-removed / restore-kept
intents are satisfied → dropped; ids in neither list still reject the
plan; failed rows now store the offending id. Run 2 passed fully:
preference set → engaging preset → summary + safety note → review card
(title "تحويل الكتابات لنمط ديناميكي", category الأسلوب, reason/benefit in
Arabic) → Apply → applied card → 👎 + "القصّة غير صحيحة" → thanks → single
undo reverted. DB-verified: `feedback=not-useful`,
`feedback_reason=wrong-cut`, 1 command + 1 aligned step,
`ai_preferences.intent=short-form`. Screenshots in the session scratchpad.

## 7. Deferred ideas
- Using accumulated feedback to tune the Brain prompt (needs volume).
- Per-step accept/reject (apply a subset of the plan).
- Suggestion history browser; feedback on individual steps.
- Derived-intent transparency line in the panel ("based on your recent
  edits") when auto kicks in.

A pattern worth naming after two live findings: **the model's most common
failure is re-proposing edits that already exist** — normalization now
absorbs that whole class (words + segments) instead of failing plans.
