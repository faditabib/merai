# Build 8 Analysis — Skills Foundation (Merai Skills Marketplace)

Date: 2026-07-17 · Analysis before code.

## 1. What a Merai Skill IS (the foundation decision)

A Skill is a **productized AI workflow definition**: a versioned, zod-
validated bundle that drives runtimes the product already has —
- the **AI Brain** (5.5/5.6): an instruction template + intent, submitted
  through the existing suggestion flow (validated plans, human Apply);
- the **look system** (6B/6C): an optional Creator Style + format
  recommendation;
- the **persona graph** (6C.4): which creator types see it first.

The marketplace-critical property is the **contract, not the catalog**:
`skillDefinitionSchema` validates any skill at load time — first-party
today, third-party/marketplace tomorrow — and `steps` is a forward-open
array (`{type, params}`, the EDL-effects pattern) so future multi-step
pipelines (e.g. "generate chapters → cut shorts → export set") land without
a schema version bump. **Zero migrations**: skills are code-catalog data;
a marketplace `skills` table later stores the SAME validated shape.

## 2. The six launch skills

| id | Brain intent | Look | First for |
|---|---|---|---|
| `podcast-editor` | general | podcast-classic · 1:1 | podcast |
| `shorts-generator` | short-form | high-energy · 9:16 | content-creator, coach |
| `course-creator` | educational | educational-clean · 16:9 | educator |
| `business-videos` | general | luxury-minimal · 16:9 | business |
| `social-media` | short-form | high-energy · 9:16 | content-creator |
| `medical-creator` | general | medical-trust · 9:16 | doctor |

Instructions are Arabic-first (the Brain handles Arabic — proven live in
6A.1), ≤500 chars (the `ai_suggestions.instruction` CHECK), and scoped to
what the Brain's command allowlist can actually do (no overpromising).

## 3. Integration (zero worker change)

The AI assistant panel gains a **Skills row**: one tap = set the skill's
intent (visible, editable — the 5.6 explicit-preference rule) + submit its
instruction through the EXISTING `request()` flow. The Brain, validation,
Apply, feedback — all unchanged.

`recommendedSkills(creatorType)` orders the row per persona (wizard's
`creator_type` riding user_metadata → passed to the editor page).

## 4. Files

| File | Change |
|---|---|
| `packages/core/src/skills.ts` (new) + `index.ts` | schema + catalog + helpers |
| `packages/core/test/skills.test.ts` (new) | contract + referential integrity |
| `apps/web/.../ai-assistant-panel.tsx` | Skills row |
| `apps/web/.../edit/page.tsx` | pass `creatorType` from user_metadata |
| `messages/{ar,en}.json` | `editor.aiAssistant.skills.*` (ar first) |

## 5. Deferred (explicitly)
Marketplace surface (browse/install/publish), skill authoring UI, multi-step
pipeline EXECUTION (the `steps` contract ships; the executor lands with the
first real multi-step skill), paid skills (Build 9's Stripe rails).

## 6. Verification
Contract tests (schema, ids, instruction bounds, referential style/intent/
type integrity, ranking, forward-open steps) · suites/typecheck/build/
parity · live: skills row renders per persona; one-tap runs the Brain
end-to-end (existing flow).
