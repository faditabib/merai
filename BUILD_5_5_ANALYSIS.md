# Build 5.5 Analysis — AI Editing Brain v1

Date: 2026-07-11 · Written before any code. Scope: the AI Re-Edit Assistant
(user intent → validated edit commands → existing dispatcher). The Brain
never touches video or EDLs directly.

## 1. Existing EDL v2 architecture (Build 5)

`edl_versions.edl` is version-discriminated jsonb; every reader goes through
`parseEdl`/`edlV1ViewOf`. The editor's working state is **EDL v1** (the
multi-track UI hasn't landed), and all writers still write v1. Consequence
for the Brain: it should reason over and mutate the **v1 view** the editor
holds — exactly what the command system already operates on. Nothing about
v2 blocks or changes this build; the commands remain valid when the editor
later upgrades internally, because the dispatcher is the abstraction.

## 2. Existing edit-command system (Build 5 — built for exactly this)

`@merai/core/edit-commands.ts`: a serializable 8-command discriminated union
+ `applyEditCommand(s)` routing to the tested pure ops; batches are
all-or-nothing; every editor mutation already flows through the editor's
`runCommand`. The Build 5 decision anticipated this build verbatim: *"AI
edits are commands, not EDL patches — models emit EditCommand JSON,
zod-validated, routed through the same tested ops."*

**v1 command subset for the Brain** (conservative on purpose):
`remove-words`, `ripple-delete-segment`, `restore-removed`,
`set-caption-style`, `set-aspect-ratio`. Excluded from v1: `trim-segment`,
`split-segment`, `reorder-segment` — millisecond/ index arguments are easy
for a model to hallucinate and hard to sanity-check; they join once per-op
guardrails exist.

## 3. Current AI analysis pipeline (integration template)

- All model calls live in the WORKER (`ANTHROPIC_API_KEY` exists only
  there; Vercel has no AI key — so the Brain must be a worker job, not a
  server action).
- `HaikuAnalysisEngine`: one call per video, temperature 0, forced
  tool-use JSON, injectable `MessageCreator` for hermetic tests, result
  persisted so retries never re-bill.
- The **`generate_edl` job type is a reserved stub** ("reserved for
  user-triggered regeneration") that currently throws. Nothing enqueues
  it; its payload schema is a placeholder alias. It is the natural slot
  for the Brain.
- Analysis context available for prompting: `transcripts.analysis`
  (engine name + fillers/falseStarts/retakes with notes), transcript
  words with timings/confidence, and the current EDL (kept/removed with
  reasons).
- Enqueue pattern (export precedent): client inserts the domain row under
  RLS → server action proves ownership via RLS select → service-role
  upsert into `jobs` with a `dedupe_key` (users cannot write jobs).

## 4. Where the Brain integrates (chosen design)

```
Editor panel (instruction / preset goal)
  → client INSERT ai_suggestions row (status 'pending', RLS)
  → server action requestAiEdit: RLS ownership check → service-role
    upsert jobs {type: generate_edl, dedupe ai-edit:{suggestionId}}
  → worker generateEdl handler:
      load suggestion + transcript(+analysis) + saved EDL (edlV1ViewOf)
      → HaikuEditBrain: ONE forced-tool-use call → {goal, commands[], explanation}
      → validate: zod per command → referential checks → DRY-RUN
        applyEditCommands on the base EDL (must produce a valid EDL)
      → suggestion row := ready {commands, explanation} (or failed + reason)
  → editor polls the row (2.5s house pattern), shows explanation +
    command summary
  → user clicks Apply → runCommand batch (ONE undo snapshot) → preview
  → user saves/exports through the untouched existing paths
```

Human-in-control properties: the Brain writes ONLY a suggestion row; the
EDL changes exclusively in the browser when the user applies; apply is one
undoable step; save still appends an immutable `edl_versions` row; export
is untouched.

Idempotency/cost: handler converges if the suggestion is already
ready/failed (retries never re-bill — same rule as analysis); the dedupe
key makes double-enqueues no-ops; one Haiku call per suggestion
(~$0.002–0.04 depending on transcript length); instruction capped (500
chars) to bound tokens.

## 5. Database/storage impact

One new table (migration 7), mirroring the exports-row lifecycle:

```
ai_suggestions (
  id uuid pk, project_id fk, owner_id fk, edl_version_id fk,  -- base version
  instruction text (≤500), goal text null,
  commands jsonb null, explanation text null,
  status text check in ('pending','processing','ready','failed',
                        'applied','dismissed') default 'pending',
  error text null, model text null,
  created_at/updated_at
)
```
RLS: owner select/insert/update (update restricted client-side to marking
applied/dismissed; worker uses the service role). No changes to existing
tables, EDLs, exports, or the render path. Applied live via the existing
`apply-migration.ts`.

## 6. Risks

1. **Model output quality** — mitigated in layers: constrained tool schema
   (enum of 5 command types), zod parse, referential validation (segment/
   word ids must exist in the base EDL, style/aspect tokens must be legal),
   and a full dry-run through `applyEditCommands` before the suggestion is
   ever marked ready. An invalid plan → suggestion `failed`, never a
   half-applied edit.
2. **Stale base EDL** — the user may edit between requesting and applying.
   The suggestion pins `edl_version_id`; the panel warns and disables Apply
   if the editor's version has moved past it (v1: conservative).
3. **Old worker in production** — the deployed `generate_edl` stub THROWS;
   enqueuing before deploying the new worker would burn retries. Order:
   implement → test → deploy worker → only then live E2E.
4. **Cost creep** — one call per explicit user request, no auto-retriggers,
   persisted results, Haiku only (house rule).
5. **Prompt-injection via instruction** — the instruction is user data
   inside a forced-tool-use call; the schema constrains output to the 5
   command types regardless of what the instruction says, and validation
   runs downstream of the model. The blast radius of a "jailbroken"
   suggestion is a syntactically valid but silly edit the user must still
   click Apply on.
6. **Scope discipline** — no autonomy: the Brain never auto-applies, never
   saves versions, never renders. TikTok-style goals map to commands the
   system already has (aspect 9:16 + caption style + cuts), not new
   features.
