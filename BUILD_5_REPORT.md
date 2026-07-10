# Build 5 Report — Professional Editing Core (EDL v2 foundation)

Date: 2026-07-11 · 93 tests green (36 core + 45 worker + 12 web; was 78)
Production impact: **zero** — all writers still produce EDL v1; every reader
is now version-aware. Analysis that preceded the code: [BUILD_5_ANALYSIS.md](BUILD_5_ANALYSIS.md).

## Completed changes

### 1. EDL v2 schema — [packages/core/src/edl-v2.ts](packages/core/src/edl-v2.ts) (new)
The multi-track model: `assets[]` (multiple sources — B-roll/music
groundwork), `tracks[]` of kind video/audio/caption with `clips[]` placed
explicitly at `timelineInMs` (gaps/overlaps legal), locked A/V pairs via
`linkedClipId` (a J/L-cut is simply a linked pair whose windows differ),
`gainDb` on clips, open `EffectRef`/`TransitionRef` metadata (`type` +
`params` — new effect types need no schema bump), captions as a mode
(`derived-words` today, `clips` later), and v1's `removed[]` carried over
unchanged so cut-transparency and restore keep working.

### 2. Adapters — the compatibility contract (same file)
- `upgradeEdlV1ToV2` — total, lossless, ids preserved.
- `downgradeEdlV2ToV1` — succeeds only for v1-representable compositions;
  otherwise returns a **typed refusal reason** (12 reasons enumerated:
  `multiple-video-tracks`, `av-windows-differ`, `has-effects`, …). It never
  silently flattens an edit.
- `parseEdl` — version-dispatched zod parsing; the only sanctioned jsonb
  ingestion path from now on.
- `edlV1ViewOf` — reader convenience: v1 passthrough | representable-v2
  downgrade | null.
- Round-trip law `downgrade(upgrade(v1)) ≡ v1` is a test.

### 3. Edit commands — [packages/core/src/edit-commands.ts](packages/core/src/edit-commands.ts) (new)
Serializable `EditCommand` union (8 commands) + `applyEditCommand(s)`
dispatcher routing to the existing tested ops. This is the AI re-editing
seam: a future model emits commands as data, zod validates them, and they
run through the exact code paths the UI uses. Batches apply all-or-nothing.

### 4. Version-aware readers (the blind casts are gone)
- **Worker** [render-export.ts](apps/worker/src/handlers/render-export.ts):
  parses the edl row; v1 renders as before; representable v2 is downgraded
  and renders **identically** (test-asserted same plan); true multi-track v2
  and malformed jsonb are `PermanentJobError`s — loud, no retry waste, no
  silent flattening.
- **Editor loader** [edit/page.tsx](apps/web/src/app/[locale]/dashboard/projects/[id]/edit/page.tsx):
  `edlV1ViewOf`; a non-representable row redirects to the project page
  instead of rendering a broken editor.
- **Project views** [page.tsx](apps/web/src/app/[locale]/dashboard/projects/[id]/page.tsx) +
  [project-status-view.tsx](apps/web/src/components/project-status-view.tsx):
  summary chips degrade gracefully (hidden) rather than crash.
- **Editor mutations** [editor-view.tsx](apps/web/src/components/editor/editor-view.tsx):
  every UI handler now dispatches an `EditCommand` through one `runCommand`
  path. Behavior identical (commands map 1:1 to the previous direct calls);
  undo/redo snapshots unchanged.

## Verification (Step 5)
- **All suites green:** 36 core + 45 worker + 12 web = 93 (15 new).
- **Old projects open correctly:** v1 rows flow through `parseEdl`/
  `edlV1ViewOf` untouched (identity asserted in tests); the editor refactor
  is command-routing only.
- **Current exports still work / pipeline unchanged:** the worker test
  "renders a stored EDL v2 identically via the downgrade path" plus the
  untouched v1 tests prove the planner receives the same input; the planner
  itself (`buildExportPlan`) was not modified at all — the
  production-verified render architecture (147.7s / 954MB / zero failures on
  Railway) is byte-identical for every row that exists today.
- **Production web build compiles** (`next build` ✓). Browser feel-pass not
  run (no Chrome extension session available) — behavior-preserving refactor
  is covered by tests; flagged below.

## Decisions
1. **Readers-first expand/contract migration.** v2 rows are legal only after
   every reader understands them; writers flip in a later build. No DB
   migration is needed or wanted — `edl_versions.edl` is free jsonb and the
   JSON `version` literal (a Phase 0 decision) is the discriminator.
2. **Downgrade refuses rather than flattens.** A composition that can't
   collapse to v1 fails loudly with the reason. Silently dropping a music
   track from a user's export would be corruption, not compatibility.
3. **Effects/transitions are open metadata** (`type` + free `params`), so
   the schema doesn't need a version bump per effect; renderers ignore what
   they don't know.
4. **The editor stays a v1 machine internally** until the multi-track UI
   build. Upgrading its state to v2 now would mean rewriting 8 tested ops
   with zero user-visible gain in this build.
5. **AI editing = commands, not EDL patches.** Models will emit `EditCommand`
   JSON validated by zod, reusing the tested mutation surface — never raw
   EDL JSON to trust blindly.

## Deferred (deliberately)
- Multi-track editor UI, waveforms, track headers (next build).
- v2-native export planning (overlay compositing, audio mixing, transition
  rendering) — the planner consumes v1 until then; v2-only compositions are
  permanent-failed with a clear reason.
- v2 editing ops (`edl-ops` equivalents over tracks/clips) — land with the
  UI that needs them.
- Editor writes v2 on save — flips when the above exist.
- Clip `speed`, PiP geometry — noted as v2.x fields (they fit `params`
  space or additive optional fields; no version bump anticipated).
- Browser feel-pass of the refactored editor on a real project (extension
  unavailable this session; commands are 1:1 with the previous calls).

## Risks
- **The downgrade guard is the single compatibility choke point.** If a
  future writer produces v2 rows before the renderer learns tracks, exports
  of *multi-track* compositions permanent-fail by design (correct, loud) —
  but a bug in `downgradeEdlV2ToV1` could refuse valid single-track v2 rows.
  Mitigation: the round-trip law test + 12-reason enumeration.
- **`applyEditCommand` widens the trust boundary later**: when AI-generated
  commands arrive, per-command authorization (e.g. clamping trim ranges)
  belongs in the dispatcher, not the UI. Noted for the AI-editing build.
- **Editor still trusts its initial props after load** — `edlV1ViewOf`
  guards ingestion, but a malformed v1 row (pre-Build-5 rows were never
  parse-validated on write from the worker's builder… they were: builder and
  ops zod-parse on write) is low-risk; ingestion now re-validates anyway.
