# Build 5.5 Report — AI Editing Brain v1

Date: 2026-07-11 · 105 tests green (43 core + 50 worker + 12 web; was 94) ·
`next build` ✓ · ar/en parity 190=190 · live E2E through the production
Railway worker PASSED. Analysis that preceded the code:
[BUILD_5_5_ANALYSIS.md](BUILD_5_5_ANALYSIS.md).

## What shipped

The first AI Editing Brain: the creator states a goal in plain language
("اجعله أقصر", "Create a TikTok version"), the Brain answers with a
validated edit-command plan and a creator-facing explanation, and nothing
touches the edit until the creator clicks Apply. The mandated flow is
exactly what runs:

```
User intent → Brain (Haiku, worker) → validated EditCommands
  → command dispatcher (Build 5) → EDL mutation (browser) → preview → export
```

### Core ([ai-edit.ts](packages/core/src/ai-edit.ts))
- `aiEditPlanSchema` — goal slug + commands + explanation (≤40 commands,
  instruction ≤500 chars).
- **v1 command allowlist** (conservative by design): `remove-words`,
  `ripple-delete-segment`, `restore-removed`, `set-caption-style`,
  `set-aspect-ratio`. Trim/split/reorder are excluded until per-op
  guardrails exist — a hallucinated millisecond is a subtle bad edit; a
  hallucinated id is caught.
- `validateAiEditPlan` — the gate every plan must pass before the editor
  sees it: type allowlist → referential checks (ids/tokens must exist in
  the base EDL) → **full dry-run through `applyEditCommands`**
  (all-or-nothing). Returns the normalized command batch the dry-run
  actually applied; that is what gets stored and replayed.

### Data ([migration 7](supabase/migrations/20260711130000_ai_suggestions.sql), applied live)
`ai_suggestions`: pending → processing → ready | failed → applied |
dismissed, owner-scoped RLS, pinned to the `edl_versions` row the plan was
computed against. The Brain writes ONLY here — it cannot mutate EDLs.

### Worker ([brain.ts](apps/worker/src/ai-edit/brain.ts), [generate-edl.ts](apps/worker/src/handlers/generate-edl.ts))
- The reserved `generate_edl` stub became the Brain job. `HaikuEditBrain`
  follows every analysis-engine cost rule: **Haiku only, ONE forced
  tool-use call per request, temperature 0**, injectable message creator
  for hermetic tests. Prompt context: instruction, timeline/removed
  segments with ids, per-word kept/REMOVED status, prior analysis notes,
  caption/aspect vocab; explanation required in the transcript's language.
- Outcome semantics: user-facing failures (`ai-unavailable`,
  `invalid-plan:*`) mark the suggestion failed and complete the job (temp
  0 — retries can't help and never re-bill); missing rows are
  `PermanentJobError`; transient API errors retry; terminal suggestions
  converge without calling the model.

### Editor ([ai-assistant-panel.tsx](apps/web/src/components/editor/ai-assistant-panel.tsx))
Preset goals (أقصر / أكثر جاذبية / تيك توك) + free instruction; requests
auto-save first and pin the saved version (export panel's
`ensureSavedVersion` pattern); polls the row; shows the explanation +
command count; **Apply routes the batch through the Build 5 dispatcher as
ONE undo snapshot**; a staleness guard disables Apply if the edit moved
past the pinned version; dismiss/applied statuses persist. Server action
`requestAiEdit` mirrors the export enqueue (RLS ownership proof →
service-role job upsert, deduped).

## Live E2E (production Railway worker, real Haiku, through the UI)
- First run **found a real robustness bug**: Haiku asked to remove filler
  words the first draft had already removed → strict validator rejected
  the whole plan (`invalid-plan:unknown-word`). Fixed in two layers
  (commit `1a2fd7d`): the prompt now marks each word kept/REMOVED, and the
  validator drops already-satisfied intents (deduplication) while still
  hard-rejecting ids that exist nowhere (hallucinations).
- Second run passed end-to-end: TikTok preset → suggestion ready in ~15s →
  **Arabic explanation** ("غيّرت نمط الكتابة إلى karaoke-highlight لتكون
  أكثر جاذبية على تيك توك. الفيديو بالفعل بصيغة 9:16 والمحتوى مشدود وبدون
  حشو…" — honest: the clip was already vertical and tight, so the model
  changed only what improved it) → Apply switched the caption style live
  (karaoke highlight visible on the video, screenshot-verified) → **one
  Undo reverted the whole plan**. Cost: 2,068 in / 240 out tokens ≈ $0.003.

## Decisions
1. The Brain is a worker job (the AI key exists only there) in the
   reserved `generate_edl` slot; the web only reads/writes suggestion rows.
2. Refuse-and-normalize: hallucinated references reject the whole plan;
   already-satisfied intents are deduplicated — the stored commands are
   exactly the dry-run's batch.
3. Human in control is structural, not policy: the Brain has no code path
   that can touch `edl_versions`, the working EDL, or exports.

## Deferred
- Trim/split/reorder commands for the Brain (need range guardrails).
- Suggestion history UI (rows persist; only the active one is shown).
- Confidence on plans; feedback loop ("this cut was wrong").
- Brain over EDL v2 multi-track (arrives with the multi-track editor).

## Known limitations
- One suggestion at a time in the panel; a stale suggestion requires a
  fresh request (no auto-rebase of plans onto new versions — deliberate).
- The Brain sees the transcript, not the pixels: "more engaging" operates
  on pacing/words/captions, not visual content.
- Vercel production still needs a redeploy to carry the panel (worker side
  is already live on Railway).
