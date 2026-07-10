# Build 5 — Architecture Analysis: from single-track EDL to a professional editing core

Date: 2026-07-11 · Scope: analysis before any code (Step 1 deliverable)

## 1. Current architecture (verified from source, not docs)

### 1.1 EDL v1 — the single source of truth ([edl.ts](packages/core/src/edl.ts))

```
EdlV1 {
  version: 1
  projectId, sourceUploadId          // ONE source asset, fixed at the root
  timeline: KeptSegment[]            // ordered; output = concatenation (ripple)
  removed: RemovedSegment[]          // restorable, carries reason + AI note
  aspectRatio: "9:16" | "1:1" | "16:9"
  captionStyle: string
}
KeptSegment { id, sourceInMs, sourceOutMs, wordIds? }
```

Output time is **derived**, never stored: a segment's output position is the sum
of the durations before it. Audio and video are one unit — a segment cuts both
at the same boundaries.

### 1.2 Editing operations ([edl-ops.ts](packages/core/src/edl-ops.ts))
Eight pure `EdlV1 → EdlV1` transforms (removeWords, restoreRemoved, trim,
split, reorder, rippleDelete, source↔output mapping) — validated on the way
out, all fully unit-tested. The editor's entire mutation surface.

### 1.3 Editor state ([editor-view.tsx](apps/web/src/components/editor/editor-view.tsx))
One `useState<EdlV1>` working copy + snapshot undo/redo stacks. Each UI
callback calls a core op directly and pushes the result through `apply()`.
Save = append an immutable `edl_versions` row (`source='user'`); the AI draft
(v1 row) is never modified.

### 1.4 Rendering pipeline ([export-plan.ts](packages/core/src/export-plan.ts) → [render-export.ts](apps/worker/src/handlers/render-export.ts))
`buildExportPlan(edl, words)` → one input-seeked ffmpeg run per kept segment +
`-c copy` join (the memory-bounding architecture that passed the 10-minute
stress tests, incl. production Railway: 147.7s, 954MB peak, zero failures).
Captions are **not stored in the EDL** — they are re-derived from kept words
at plan time and burned as per-segment PNG sequences.

### 1.5 Database ([init migration](supabase/migrations/20260708000000_init.sql:162))
`edl_versions.edl` is **unconstrained jsonb**; the `version` column is the
append-only row sequence (1,2,3…) — distinct from the JSON's `version`
literal, which is the schema discriminator (a Phase 0 decision anticipating
exactly this build). RLS: insert+select only, immutable rows.

## 2. Limitations blocking professional editing

| # | Limitation | Blocks |
|---|------------|--------|
| L1 | Audio and video share one segment boundary | J-cuts, L-cuts |
| L2 | Output position derived from array order; no explicit timeline placement, no overlaps, no gaps | B-roll overlays, music beds, transitions |
| L3 | One `sourceUploadId` for the whole EDL; segments can't reference other assets | B-roll, background music, SFX |
| L4 | Captions derived at render time, not an editable track | caption timing offsets, manual caption edits |
| L5 | No effects/transitions metadata anywhere in the model | fades, crossfades, color, ducking |
| L6 | Every reader blind-casts jsonb → `EdlV1` (edit page, project page, status view, render handler) | any schema evolution — a v2 row today would crash or corrupt at runtime |
| L7 | Editing ops are direct function calls from UI handlers | AI re-editing (needs a serializable command surface) |

## 3. Migration risks

1. **Old rows must stay readable forever.** Production has real `version:1`
   rows (AI drafts + user edits). Nothing may reinterpret them.
2. **The render path is production-verified.** `buildExportPlan` and the
   segment-wise handler must not change behavior for v1 input — byte-identical
   plans or the 10-min stress guarantees are void.
3. **Blind casts (L6) are the sharp edge.** If any writer starts producing v2
   before every reader is version-aware, the editor renders `undefined`
   timelines and the worker builds garbage plans. **Order of operations is the
   migration strategy: readers first, writers later.**
4. **Down-conversion is lossy by nature.** A true multi-track composition
   cannot collapse to v1. The adapter must *refuse loudly* (typed error /
   permanent job failure), never silently drop tracks.
5. **DB needs no migration** (jsonb + JSON discriminator), which also means
   the DB gives no protection — correctness lives entirely in the zod parsers
   at the boundaries.

## 4. Recommended EDL v2 design

### 4.1 Model

```
EdlV2 {
  version: 2
  projectId
  assets: Asset[]                       // A1: multiple sources
    Asset { id, kind: "source-upload" | "upload" | "generated",
            uploadId?, storagePath?, durationMs? }
  tracks: Track[]                       // A2: explicit tracks, render order = array order
    Track { id, kind: "video" | "audio" | "caption",
            name?, muted?, locked?, effects: EffectRef[], clips: Clip[] }
    Clip  { id, assetId,
            timelineInMs,               // explicit output placement (gaps/overlaps legal)
            sourceInMs, sourceOutMs,    // window into the asset
            linkedClipId?,              // A/V lock pairing (J/L = unlink + retime)
            gainDb?,                    // music/ducking groundwork
            wordIds?,                   // transcript ↔ clip mapping survives
            effects: EffectRef[],
            transitionIn?, transitionOut?: TransitionRef }
    EffectRef     { type: string, params: Record<string, unknown> }   // forward-open
    TransitionRef { type: string, durationMs, params? }
  captions: { mode: "derived-words" } | { mode: "clips" }   // A3: captions become a track kind
  removed: RemovedSegment[]             // unchanged — review UI/restore/AI transparency intact
  aspectRatio, captionStyle             // unchanged
}
```

Design choices:
- **Explicit `timelineInMs`** replaces order-derived positioning — the single
  change that unlocks B-roll (video track 2 overlapping track 1), music beds
  (audio clip spanning many video clips), and gaps.
- **J/L cuts are not a feature, they're a consequence**: a linked audio clip
  whose `sourceInMs/timelineInMs` differ from its video twin *is* the J-cut.
- **Effects/transitions are open metadata** (`type` + `params`), so new effect
  types don't need schema migrations; renderers ignore unknown types.
- **`removed` and `wordIds` survive** — text-based editing and the
  cut-transparency popover (an accepted design commitment) work identically.

### 4.2 Adapters (the compatibility contract)

- `upgradeEdlV1ToV2(v1)` — total, lossless, deterministic: one video track +
  one linked audio track with clips at cumulative positions (ids preserved),
  captions `{mode:"derived-words"}`, one `source-upload` asset.
- `downgradeEdlV2ToV1(v2)` — partial: succeeds only for **v1-representable**
  compositions (single linked A/V track pair, contiguous from 0, one asset,
  no effects/transitions/gain). Otherwise returns a typed refusal with the
  specific reason. Round-trip law: `downgrade(upgrade(v1)) ≡ v1` (tested).
- `parseEdl(unknown)` — version-dispatched union parser; the ONLY way readers
  ingest jsonb from now on.
- `edlV1ViewOf(unknown)` — convenience for today's readers: parse → v1 as-is,
  or downgrade a representable v2, or null.

### 4.3 Rollout order (expand/contract)

1. **This build (expand):** v2 schema + adapters exist and are tested; ALL
   readers become version-aware (editor loader, project views, render
   handler); **all writers keep writing v1** — production data is unchanged,
   exports byte-identical.
2. **Multi-track UI build:** editor state moves to v2 internally (v1 rows
   upgraded on load), save writes v2; planner learns overlay/music tracks.
3. **Never:** backfilling old rows — v1 stays parseable forever via the
   upgrade adapter.

### 4.4 AI-editing seam
A serializable `EditCommand` union (`remove-words`, `restore`, `trim`,
`split`, `reorder`, `ripple-delete`, `set-caption-style`, `set-aspect-ratio`)
with one dispatcher `applyEditCommand(edl, words, command)` that routes to the
existing tested ops. The editor UI and a future AI re-editor share the same
entry point; AI output becomes "a list of commands", validated by zod before
touching the EDL. No UI redesign required now.

## 5. What Build 5 deliberately does NOT do
- No multi-track UI, no new editor controls (Step 4 constraint).
- No renderer support for multiple tracks — the planner still consumes v1;
  non-representable v2 fails the job *permanently and loudly*.
- No billing, collaboration, marketplace, analytics.
- No speed/PiP-geometry clip properties yet (noted as v2.x additions — the
  open `EffectRef` space and `params` records are where they land without a
  version bump).
