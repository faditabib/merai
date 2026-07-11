# Build 5.6 Analysis — AI Brain UX Polish + Feedback Loop

Date: 2026-07-11 · Written before any code. Scope: presentation, categories,
feedback, intent memory, apply preview. No new models, no dashboards.

## 1. Current AI assistant panel ([ai-assistant-panel.tsx](apps/web/src/components/editor/ai-assistant-panel.tsx))
Presets + free instruction → suggestion row → poll → ready card shows ONE
explanation paragraph + a bare command count → Apply/Dismiss. Applying
clears the panel entirely (no post-apply surface → nowhere to put
feedback), and the user never sees WHAT will change before applying beyond
the count. The panel has no access to `edl`/`words`, so it cannot describe
targets ("the 8s opening segment") — it must receive both as props for
presentation-only derivation.

## 2. Current ai_suggestions schema (migration 7)
`goal, commands (pure EditCommand[]), explanation, status, error, model` —
owner-scoped RLS with an owner UPDATE policy already in place (used for
applied/dismissed). **No per-command metadata, no feedback fields.** The
`commands` column must STAY pure dispatcher input (Build 5.5 contract:
stored commands are exactly the dry-run batch), so presentation metadata
belongs in a parallel column, not inside commands.

## 3. Existing edit command metadata
None — `EditCommand` is intentionally minimal mutation input. The Brain's
tool schema is the right place to collect per-command annotations
(title/reason/benefit/category) because the model reasons per command
anyway; annotating INLINE on each command object avoids index-alignment
hazards, then core SPLITS each annotated item into {pure command,
presentation step} so the dispatcher contract is untouched. Normalization
(Build 5.5's dedupe of already-satisfied intents) must keep steps aligned —
dropping a command drops its step.

## 4. Existing undo/version system (safety is already structural)
Apply = one snapshot on the undo stack; `edl_versions` is append-only
immutable (insert+select RLS only — nothing CAN overwrite the original);
the worker's Brain job has no code path to EDLs. Feature 5's "Original
version remains safe" is therefore a TRUE statement to surface, not new
machinery. New test obligation: assert the Brain handler leaves
`edl_versions` untouched (apply-safety regression guard).

## 5. Best place for feedback storage
**Columns on ai_suggestions** (`feedback`, `feedback_reason`), not a new
table: feedback is 1:1 with a suggestion, per-owner by construction
(suggestions are owner-scoped), covered by the existing owner-update RLS,
and queryable later for prompt tuning without any join. A separate table
would add RLS surface for zero modeling gain. Reasons are a fixed enum
(prefer-original / misunderstood-context / wrong-cut / other) via CHECK.

## 6. Intent memory without hidden profiling
New tiny table `ai_preferences (owner_id pk, intent, updated_at)` with
intent ∈ auto | short-form | educational | general:
- **Visible + editable**: a selector in the assistant panel (RLS
  owner-all), defaulting to `auto`.
- **Privacy-friendly**: in `auto` mode nothing derived is ever STORED —
  the worker derives a hint at request time from the user's recent
  APPLIED suggestion goals (an explicit signal the user created) and
  passes it to the prompt; the stored row only ever contains the user's
  own explicit choice. No hidden profile accumulates.
- Isolation test: PGlite with `set role authenticated` + the auth.uid()
  stub proves cross-user reads/writes fail (grants added in test setup,
  mirroring Supabase's defaults).

## 7. UX wins with zero architecture change
- Apply preview (Feature 5) is pure client derivation from the stored
  commands: count cuts / style / aspect changes; "Review changes" expands
  the per-step cards (Feature 1) — action label from the command type
  (i18n), target derived from edl+words (segment duration, word text),
  reason/benefit/category from the model's annotations. **No invented
  numbers: durations come from the EDL, everything qualitative comes from
  the model, and missing annotations degrade to the plain row** (old rows
  keep working — Feature 2 backward compatibility).
- Post-apply state: keep a compact applied card (instead of clearing) —
  the natural home for 👍/👎.
- Categories are a closed enum (hook/pacing/clarity/style/platform) with
  localized labels; unknown/absent category = no chip (back-compat).

## Plan of record
Migration 8: `ai_suggestions` + `steps jsonb`, `feedback`,
`feedback_reason`; new `ai_preferences`. Core: annotation schema + 
`parseAnnotatedPlan` (split annotated items) + validation returning aligned
{commands, steps}. Worker: tool schema + prompt rules (annotations in the
transcript's language, honest benefits, never invented metrics) + intent
context + store steps. Web: recommendation cards, apply preview, feedback,
preference selector. Tests per the build spec; live E2E; deploy both
surfaces.

## Risks
1. Annotation quality/language drift → prompt rule + length caps; UI
   degrades gracefully when absent.
2. Output tokens roughly double (~240 → ~500-700) → still ≈$0.004-0.006
   per request on Haiku; measured in the live E2E and reported.
3. Steps/commands misalignment after normalization → single code path
   drops/keeps both together; unit-tested.
4. Feedback UI nudging bias (asking while "applied" glow is fresh) —
   acceptable for v1; no dashboards built on it yet.
