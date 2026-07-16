# Merai — Progress Log

## Build 7.1 — Recording Foundation (2026-07-16)

178 tests green (81 core + 73 worker + 24 web) · next build ✓ · ar/en parity
454 = 454 · **zero migrations, no worker change** (BUILD_7_1_ANALYSIS.md +
BUILD_7_1_REPORT.md). First Build 7 sub-build — Merai records.

- /dashboard/record: camera+mic capture with mirrored preview, device pickers
  (persisted), 3·2·1 countdown, pause/resume (one continuous blob),
  10-min-cap timer with amber warning + auto-stop, per-take review, takes
  rail, one-take handoff.
- Recorder core in lib/record: injectable mime selection (vp9→vp8→webm→mp4),
  pure pause-excluding elapsed tracker — all unit-tested.
- Handoff = the existing UploadFlow via an additive externalFile prop; the
  full record → probe → validate → create → tus → transcribe pipeline was
  E2E-verified live with synthetic capture devices.
- Two live-found bugs fixed + regression-tested: codec-qualified mime vs the
  upload allowlist; Chrome MediaRecorder WebM Infinity-duration in the probe
  (also fixes user-uploaded Chrome WebM). Next: 7.2 screen + PiP.

---

## Build 6C.4 — Creator Onboarding Wizard (2026-07-16)

166 tests green (81 core + 73 worker + 12 web) · next build ✓ · ar/en parity
431 = 431 · **zero migrations, no worker change** (BUILD_6C_4_ANALYSIS.md +
BUILD_6C_4_REPORT.md). Final 6C sub-build — Build 6C complete.

- Creator Types catalog in core (6 personas → existing Creator Styles + AI
  intent seeds); pure creatorTypeDefaults resolver; no-real-names guard
  extended to type ids.
- /dashboard/onboarding wizard: type → brand basics (palette prefilled,
  optional logo) → look (recommended style chipped) → summary. Finish = one
  guided write through existing channels (creatorStyleBrandKitPatch →
  brand_kits upsert, user_metadata flags, ai_preferences intent). Skip only
  sets the completion flag.
- Dashboard: wizard as empty-state primary CTA for new creators, compact
  banner for existing ones; both disappear once completed/skipped.
- Live-verified E2E (throwaway user, cleaned up): doctor → medical-trust patch
  byte-exact in brand_kits, metadata + intent seeded, style chip live.
  Next: Build 7 (Creator Studio / recording).

---

## Build 6C.3 — Overlay Studio (2026-07-12)

160 tests green (75 core + 73 worker + 12 web) · next build ✓ · ar/en parity
384 = 384 · **zero migrations** (BUILD_6C_3_ANALYSIS.md + BUILD_6C_3_REPORT.md).
The one 6C sub-build with a render change — kept additive.

- Logo/watermark layer: the logo composites as another full-frame PNG at 0:0
  (like gradient/lower-third) — no architecture change. Worker renderLogoImage
  (decode + corner + opacity; null on SVG/corrupt); render-export resolves it
  before planning and skips gracefully on any failure. Canonical z-order now
  video → gradient → lower third → captions → logo.
- Lower Third Studio: additive position (4 corners) + shape (bar/box/none),
  honored by the rasterizer.
- Overlay Studio UI (enable/corner/opacity/size) with a preview mirroring the
  shared core logoBox geometry (preview=export). Save persists lower-third
  fields + logo_overlay pref to user_metadata; editor composes exports.brand.logo.
- Creator Styles carry lower-third/logo treatment. Migration decision: ZERO —
  exports.brand.logo + lower-third fields + user_metadata. Next: 6C.4 onboarding.

---

## Build 6C.2 — Creator Styles System (2026-07-12)

150 tests green (71 core + 67 worker + 12 web) · next build ✓ · ar/en parity
365 = 365 · **zero migrations, no worker/render change** (BUILD_6C_2_ANALYSIS.md
+ BUILD_6C_2_REPORT.md).

- Hybrid catalog: CREATOR_STYLES (6) in core — Founder Bold / Educational Clean
  / Podcast Classic / Medical Trust / Luxury Minimal / High Energy — each a real
  caption spec + colors + gradient + lower-third colors + format. Pure
  creatorStyleBrandKitPatch overwrites the look, preserves identity (lower-third
  name, logo). No-creator-names CI guard.
- One-click apply: gallery atop the Brand Kit form seeds the form's live state
  so the whole preview transforms instantly; Save persists + records
  user_metadata.creator_style. Dashboard "Your style" chip.
- Styles flow to exports through the existing kit→snapshot pipeline — no new
  render code. Next: 6C.3 Overlay Studio (logo layer).

---

## Build 6C.1 — Tajawal UI + Creator Dashboard + thumbnails (2026-07-12)

144 tests green (65 core + 67 worker + 12 web) · next build ✓ · ar/en parity
340 = 340 · **zero migrations, no worker change** (BUILD_6C_1_ANALYSIS.md +
BUILD_6C_1_REPORT.md). First sub-build of the approved Build 6C plan
(BUILD_6C_ANALYSIS.md).

- UI font → Tajawal (next/font, --font-sans/body). IBM Plex kept + pinned as
  --font-caption so the live caption preview still matches the export (worker
  rasterizes vendored Plex, unchanged).
- Creator dashboard: hero + QuickActions (New video / Brand Kit / Caption
  Studio + "Record — soon" placeholder for Build 7), data-driven
  BrandSetupNudge, responsive ProjectCard grid, empty state keeps WorkflowSteps.
- Client-side thumbnails (ProjectThumbnail): lazy IntersectionObserver →
  signed URL → first-frame canvas → cached; branded placeholder fallback. No
  backend, no thumbnails bucket.
- Two bounded dashboard reads (brand_kit + latest uploads) deduped in JS; no
  schema change. Next: 6C.2 Creator Styles.

---

## Build 6B.3 — Caption Studio UX (2026-07-12)

144 tests green (65 core + 67 worker + 12 web) · next build ✓ · ar/en parity
330 = 330 · migration 11 (BUILD_6B_3_ANALYSIS.md + BUILD_6B_3_REPORT.md).
UX-only build within the hard constraints (no EDL/AI Brain/render-arch, no
saved preset library).

- 8 creator presets (Viral/Podcast/Educational/Medical/Luxury/Minimal/
  High Energy/Professional) in a gallery with thumbnail + animation label +
  use case; old developer tokens stay resolvable but hidden.
- One shared CaptionPreview renderer (mirrors the worker rasterizer) → preview
  = export by construction; reused by gallery, live preview, editor overlay.
- Live controls: position, font scale, text/brand color, outline, box.
- Single default preference in new nullable brand_kits.caption_default_config
  ("set as default"); NOT a preset library.
- Export "your video style" card (caption / brand + color word / format);
  working spec snapshotted to exports.caption_config (6B.2 channel).
- Worker UNCHANGED (already renders caption_config from 6B.2). Decision:
  animation is a label (static export); karaoke/motion export still deferred.

---

## Build 6B.2 — Caption Studio (2026-07-12)

141 tests green (62 core + 67 worker + 12 web) · next build ✓ · ar/en parity
278 = 278 · migration 10 written (BUILD_6B_2_ANALYSIS.md + BUILD_6B_2_REPORT.md).
Scope: brand-aware caption presets, no saved custom presets (→ 6B.3).

- Captions become a brand-aware preset system, within the hard constraints
  (no EDL, no AI Brain, no render architecture).
- 4 new tokens (bold-impact, outline-clean, brand-box, brand-accent);
  CaptionStyleSpec gains outline / fontScale / useBrandColor (additive-optional).
- captionConfigForExport resolves brand-color presets to a concrete spec,
  snapshotted to a nullable exports.caption_config (null = token path,
  byte-identical to pre-6B.2). Rasterizer + live preview both honor the new
  fields (preview/export parity, gap G4).
- Decision: caption_config snapshot not an EDL field; dropped the
  caption_style_default CHECK (app zod validates); renderer stays dumb.
- Deferred: saved custom presets + Caption Studio tab (6B.3); karaoke export
  (needs render architecture); auto keyword highlighting (needs AI Brain).

---

## Build 6B.1 — Creator Identity Layer (2026-07-11)

129 tests green (56 core + 61 worker + 12 web) · next build ✓ · ar/en parity
274 = 274 · migration 9 written (not yet applied live)
(BUILD_6B_PRODUCTIZATION_ANALYSIS.md + BUILD_6B_1_REPORT.md). Backend
committed first (`0ca6b47`); this build finished web + i18n + tests + docs.

- Brand Kit: one kit per creator (`brand_kits`, owner-only RLS) — colors,
  logo, default caption preset, gradient + lower-third defaults. Settings
  page + header nav + live preview; RTL-first.
- Caption Studio: new `professional-clean` preset (4th token) + visual
  `CaptionStylePicker` (real-color mini frames) in the editor and Brand Kit.
- Brand overlays foundation: gradient readability band + static RTL-aware
  lower third, rasterized on the caption canvas, composited in binding order
  video → gradient → captions → lower third.
- Export: "Apply my branding" snapshots the kit into `exports.brand` (null =
  unbranded, byte-identical to before); malformed snapshot → PermanentJobError.
- Decision: branding is an export-row snapshot, NOT an EDL field (downgrade
  refuses effects); brand PNGs ride the caption channel so no engine changed.
- Deferred: logo compositing, overlay animation, AI preset suggestion, export
  preview/receipt, dashboard redesign.
- **Production (2026-07-12):** migration 9 applied live; Railway worker +
  Vercel web deployed; live E2E through the deployed worker PASSED (branded +
  unbranded, frames visually verified — captions/gradient/lower-third render,
  unbranded unchanged). Live finding fixed same session (`504a3be`): captions
  overprinted the lower third → `captionSpecAboveLowerThird` lifts bottom
  captions above it. 133 tests (56 core + 65 worker + 12 web).
  See BUILD_6B_1_PRODUCTION_REPORT.md.

---

## Build 5.6 — AI Brain UX polish + feedback loop (2026-07-11)

113 tests green (47 core + 54 worker + 12 web) · next build ✓ · migration 8
live · live E2E on production Railway worker PASSED with DB-verified
persistence (BUILD_5_6_ANALYSIS.md + BUILD_5_6_REPORT.md).

- Recommendation cards: per-change title/action/target/why/benefit —
  numbers derived from the EDL, qualitative text from the model in the
  transcript's language; 5-category enum chips (hook/pacing/clarity/
  style/platform), backward compatible.
- Apply preview: real derived counts + "original stays safe" note +
  Apply/Review/Dismiss; post-apply card keeps feedback available.
- Feedback: 👍/👎 + 4 optional reasons on the suggestion row (existing
  owner RLS); real RLS enforcement now unit-tested via role switching.
- Intent memory without profiling: explicit visible preference stored;
  auto derives per-request from APPLIED goals, stores nothing.
- Live finding #2 fixed: model re-proposing existing edits (segments) —
  normalization absorbs the whole already-satisfied class now.
- Cost: ~$0.005/suggestion measured (2,444in/551out, Haiku only).

---

## Build 5.5 — AI Editing Brain v1 (2026-07-11)

105 tests green (43 core + 50 worker + 12 web) · next build ✓ · migration 7
live · live E2E through the production Railway worker PASSED (details:
BUILD_5_5_ANALYSIS.md + BUILD_5_5_REPORT.md).

- Intent → plan: HaikuEditBrain (one forced tool-use call, temp 0) turns a
  creator instruction into an edit-command plan + explanation in the
  transcript's language; runs in the reserved generate_edl worker slot.
- The gate: type allowlist (5 safe commands) → referential checks → full
  dry-run through applyEditCommands; ready suggestions store the
  normalized batch the dry-run applied. Brain writes ai_suggestions ONLY.
- Editor assistant panel: presets + free text, pins the saved version
  (auto-save first), polls, Apply = one undo snapshot via the Build 5
  dispatcher, staleness guard, dismiss/applied persisted.
- Live finding fixed same-day: model re-removing already-cut fillers →
  prompt marks words kept/REMOVED + validator dedupes satisfied intents
  (hallucinated ids still reject the whole plan).
- E2E: TikTok preset → Arabic explanation → Apply switched caption style
  (screenshot) → single Undo reverted. ~$0.003/request measured.

---

## Build 6A.1 — Visual QA fixes + production redeploy (2026-07-11)

All BUILD_6A_VISUAL_QA.md bugs fixed and re-verified by the same
headless-Chrome screenshot method (94 tests green, next build ✓):
- AI decision card viewport-pinned (was clipped by the transcript's
  overflow — restore button unreachable); closes on scroll/resize.
- Shortcut help also matches physical Shift+Slash (Arabic layouts);
  both event shapes probe-verified.
- Greeting uses the mailbox name; delete button hides the (0); timeline
  ghost tap target ~20px (visual unchanged).
- Haiku notes now written in the transcript's language (prompt rule 7) —
  live probe: 3/3 Arabic notes, 1,728in/207out tokens. Old stored
  analyses keep English notes until re-analyzed.
- Numeric interpolations moved to ICU {n, number}: digit style is now
  locale-driven from one point; ar currently renders Latin digits
  (runtime default) — flipping to nu-arab is an owner taste decision.
- Redeployed: worker → Railway (Build 5+6A.1 code), web → Vercel.

---

## Build 6A — Creator experience layer (2026-07-11)

94 tests green (37 core + 45 worker + 12 web) · next build ✓ · ar/en key
parity script-verified (172 = 172). Docs: BUILD_6A_ANALYSIS.md + REPORT.
No worker/migration/pipeline changes.

- **AI decision card** (shared by transcript popover + timeline ghosts):
  localized reason + plain-language explainer + real cut duration + engine
  note + restore. `RemovedSegment.confidence` added as an optional schema
  hook — rendered only when present, engines emit later (no fake scores).
- **Creator-voice processing**: `project.working.*` lines under the stepper
  ("نُصغي إلى صوتك…" / "Understanding your voice…"), export/upload copy
  re-voiced; chips stay short and factual.
- **Onboarding**: 4-step dismissible callout + the same steps as the
  dashboard empty state; per-user via auth user_metadata (no migration).
- **Shortcut discovery**: ?/؟ (Arabic layouts) or header button opens a
  dialog listing the six existing shortcuts; Esc closes. No new bindings.
- **Premium empty/error states**: warmer dashboard empty state with the
  workflow story, reassuring error recovery copy, actionable video-error.
- Deferred: engine-emitted confidence, aggressiveness regenerate, per-step
  numeric progress, browser feel-pass (extension unavailable this session).

---

## Build 5 — Professional editing core: EDL v2 foundation (2026-07-11)

93 tests green (36 core + 45 worker + 12 web; was 78). Zero production
impact: writers still produce v1; every reader is now version-aware.
Full detail: BUILD_5_ANALYSIS.md (pre-code) + BUILD_5_REPORT.md (post).

- **EDL v2 schema** (`@merai/core/edl-v2.ts`): explicit clip placement
  (`timelineInMs` — gaps/overlaps legal), video/audio/caption tracks,
  locked A/V pairs (J/L-cut = linked pair with differing windows), multiple
  assets (B-roll/music groundwork), `gainDb`, open effects/transitions
  metadata, captions as mode (derived-words | clips), v1 `removed` intact.
- **Adapters**: lossless `upgradeEdlV1ToV2`; `downgradeEdlV2ToV1` with 12
  typed refusal reasons (never silently flattens); `parseEdl` version
  dispatch; `edlV1ViewOf` reader view. Round-trip law tested.
- **Edit commands** (`edit-commands.ts`): serializable 8-command union +
  dispatcher over the existing ops — the shared UI/AI mutation entry point;
  editor-view now routes ALL mutations through it (behavior identical).
- **Blind casts eliminated**: render handler (v2 downgrade path renders
  identically — test-asserted; multi-track/malformed → PermanentJobError),
  editor loader (graceful redirect), project views (chips degrade, not crash).
- Verified: full suites + `next build` ✓; render planner untouched.

---

## Railway worker deploy + production render test (2026-07-11)

Worker deployed: project **merai-worker**, service **worker** (Dockerfile
build via railway.json, env vars set from apps/worker/.env — 5 vars).
Deploy built and started first try; queue polling live against Supabase.

### Production render test (9.6-min stress clip, 13 segments, on Railway)
- **Wall time: 147.7s queue-claim → job-done** (encode sum 110.4s; the
  462.9s mega-segment took 86.4s). ≈ 3.9× faster than realtime — a 10-min
  video renders in ~2.5 min on a shared Railway vCPU (desktop: 55s;
  browser wasm was 1,030s).
- **Memory: 954MB container peak** (cgroup v2 `memory.peak`, includes the
  ffmpeg children — instrumentation added to LocalFfmpegEngine). Well
  within Railway's limits; sets the worker's sizing floor.
- **Failures: zero.** The 55.8MB output exceeded the storage 50MB cap and
  the part-split fallback handled it on the SAME attempt (2 parts, no
  retry, no failed job) — first production exercise of the Phase A
  fallback. Both parts verified: signed-URL downloads HTTP 200, byte sum
  exactly equals size_bytes (58,459,479).

Remaining owner actions: Vercel SSO protection toggle (or merai.studio
domain), Supabase Pro (removes the part-split path for ≤1080p exports).

---

## Phase A — Production hardening + first deploys (2026-07-10)

### Done (78 tests: 24 core + 42 worker + 12 web)
- **Permanent error classification**: `PermanentJobError` short-circuits queue
  retries (missing rows, storage cap); runner surfaces + alerts. New
  `failJobPermanently` + runner short-circuit covered by queue tests.
- **Over-cap download fallback**: outputs rejected by the storage per-file
  cap are stored as 45MB `.partN` objects (migration 6: `exports.parts`,
  applied live) and reassembled into one file by the browser on download.
  Covered by handler tests (2-part split + cap-below-part-size permanent).
- **Alerting**: `ALERT_WEBHOOK_URL` webhook (Slack/Discord payload) on
  permanent failures and db-pool errors; log-only when unset.
- **Vercel deploy LIVE**: project `merai-web`, rootDirectory `apps/web`,
  env vars set (values never echoed). Deployed and verified serving the
  real app (/, /signup, /login — RTL Arabic) via authenticated probes.
- `railway.json` + `apps/web/vercel.json` config-as-code;
  `apps/worker/scripts/apply-migration.ts` migration applier.

### Full-flow smoke test (production build `next start` + live Supabase +
### live AssemblyAI + live Haiku + worker, driven by headless Chrome)
login → tus upload (16s Arabic clip) → transcribe 12.8s (23 words, ar) →
analyze 4.5s → project ready → editor → export → render_export 8.1s →
exports row uploaded (459KB, 11.99s output — AI cuts applied) → download
HTTP 200 video/mp4. Signup page exercised live (renders, submits, surfaces
provider errors); happy-path signup needs a real inbox for the confirm
email — see blockers.

### Blockers needing owner action
1. **Vercel SSO deployment protection is ON for all URLs**
   (`all_except_custom_domains`): the production URL redirects anonymous
   visitors to Vercel SSO. Toggling it (or adding the merai.studio custom
   domain, which bypasses it by definition) is an access-control decision —
   deliberately left to the owner. One command:
   `vercel project protection disable merai-web --sso` (or add the domain).
2. **Railway deploy blocked on login**: no Railway CLI session on this
   machine and login is browser-interactive. After `railway login`:
   `railway init` + `railway up` (railway.json handles the Dockerfile), set
   env vars from `apps/worker/.env.example`.
3. Supabase Pro upgrade (per Phase 4.5) still pending — the part-split
   fallback now covers >50MB exports in the meantime.

---

## Phase 4.5 — Server-side rendering pivot (BUILT + live-verified 2026-07-10)

ffmpeg.wasm fully removed (owner decision — see DECISIONS.md). Exports are now
`render_export` jobs on the Railway worker; the panel is request + poll.

### Done (73 tests: 24 core + 37 worker + 12 web)
- Planner moved unchanged to @merai/core; `render_export` job contract added.
- Migration 5 (exports.progress, cancel_requested, 'cancelled' status) — live.
- RenderEngine pattern: **LocalFfmpegEngine default** (native ffmpeg on the
  worker, zero marginal cost) ↔ **VeryGoodFfmpegEngine** via
  VERYGOODFFMPEG_API_KEY (documented REST; unverified until a key exists).
- Server caption rasterization: @napi-rs/canvas + vendored IBM Plex Arabic —
  shaping visually verified (connected RTL) before adoption.
- Handler: idempotent, progress checkpoints to exports.progress, cancel via
  cancel_requested polled between segments; runner marks exports failed on
  retry exhaustion (project untouched). 5 new handler tests (stub engine).
- Web: wasm/renderer/caption-images/core-copy script/@ffmpeg deps deleted;
  panel = insert pending row → enqueue → poll status+progress → cancel →
  signed-URL download. "Don't close the tab" replaced with "you can leave".

### Live E2E (same 9.6-min stress clip, through the UI)
- Request → queue → claim in 2s → **all 13 segments rendered in ~55s wall**
  (encode sum 35.9s; vs 1,030s browser wasm — ~15×). Engine: local ffmpeg.
- Upload hit the known Supabase free-tier 50MB cap (53.7MB output) → job
  retried → **cancel clicked in the UI stopped the retry loop live**: worker
  marked the row 'cancelled', panel showed أُلغي. Cancel loop verified.
- Output correctness: byte-equivalent commands were ffprobe-verified in the
  native run (h264/aac, 720×1280, 576.8s).

### Remaining blockers for MVP
1. **Supabase free-tier 50MB per-file cap** — renders complete; >50MB outputs
   can't be stored. Fix: Supabase Pro ($25/mo) + raise the file-size limit in
   dashboard settings (10-min/720p ≈ 55MB; headroom for future 1080p).
   Owner/billing action.
2. Railway deploy of the new worker (Dockerfile installs ffmpeg + fonts) not
   yet exercised; shared-vCPU render timing TBD.
3. Renders serialize with transcription on the single worker loop — fine for
   MVP, split workers when contention appears.
4. Minor: a deterministic upload-cap failure re-renders through 3 attempts
   before failing (bounded waste; classify permanent errors later).

---

## Phase 4 — 10-minute export stress test (RESOLVED 2026-07-09, segment-wise)

Full pipeline on a 575s / 41.5MB / 1280×720 Arabic clip (994 words, 137
caption lines, 13 kept segments): upload 30s → AssemblyAI 17s → Haiku 21s
($0.029) → export.

**Three single-command render architectures failed in NATIVE ffmpeg** (32GB
machine): 139 per-caption overlays; N-branch trim+concat cuts; single-pass
select/aselect. All "Cannot allocate memory" — filter graphs buffer
unboundedly on long inputs. A plain full-length encode passed, isolating the
graphs as the cause.

**Fix: segment-wise rendering** (see DECISIONS.md): one input-seeked ffmpeg
run per kept segment (only that window decoded; captions as one
concat-demuxer PNG sequence clipped to the segment), then a -c copy join.
Results on the stress clip:
- **Native: 36s total** (13 segments + 0.3s join), output verified by
  ffprobe (h264/aac, 720×1280, 576.8s — matches plan within rounding).
- **Browser (single-thread wasm): render COMPLETED — no OOM.** Wall time
  **1,030s (~17 min) for a 9.6-min video ≈ 1.8× realtime**. Observed JS
  heap flat at ~27MB throughout (caveat: worker-thread wasm memory may not
  be fully captured by performance.memory; the load-bearing evidence is
  completion + flat profile vs. yesterday's instant OOMs).
- **New finding: the upload failed, not the render** — the 53.7MB output
  exceeds the Supabase free-tier 50MB per-file cap ("The object exceeded
  the maximum allowed size"). Plan-level constraint: paid tiers raise it;
  at our bitrate the cap bites at roughly the 9-10-min ceiling.

Known follow-ups (not yet implemented):
- Keep the local download available when cloud upload fails (render
  succeeded — the user should still get their file).
- Decide the storage story for long exports: paid-tier limit raise (the
  production answer) and/or a bitrate ceiling for the free tier.
- ~17 min for a max-length export is workable-but-slow UX; the future
  speed fork remains multithreaded core (COOP/COEP) vs. server-side
  rendering — both deferred, neither blocks Phase 5.

---

## Phase 4 — Export pipeline, ffmpeg.wasm (BUILT, live-verified 2026-07-09)

### Done (55 tests: 16 core + 20 worker + 19 web)
- **Pure export planner** (7 tests): EDL → filter_complex (trim/atrim+concat
  per kept segment, frame-accurate), scale+crop per aspect ratio, caption
  overlay enable-windows computed in OUTPUT time, x264/aac/faststart args.
- **Canvas caption rasterizer**: one transparent full-frame PNG per line —
  the browser does Arabic shaping, ffmpeg never touches text.
- **Renderer**: self-hosted single-thread core (copied to public/ffmpeg at
  build), staged progress (load→download→render with % from ffmpeg→upload),
  wasm FS cleanup, instance reuse across exports.
- **Export panel in the editor**: aspect picker (persists into the EDL),
  auto-save-if-dirty before export, exports-row lifecycle
  (rendering→uploaded/failed), progress bar + tab-close guard, immediate
  blob download + previous-exports list with signed-URL re-download.

### Live verification (real browser, real storage)
Exported the user-edited retake project (EDL v2) end-to-end in the preview
browser: render completed, exports row → 'uploaded' (0.5MB). Downloaded the
file from the exports bucket and inspected it objectively:
- **ffprobe**: h264 + aac, 720×1280 (9:16), duration 12.434s — exactly
  matching the DB row and the edited output duration.
- **Extracted frame**: burned Arabic caption fully SHAPED and CONNECTED
  (RTL correct), and the word deleted in Phase 3 (أشرح) is absent — the
  user's edit flowed from editor → saved version → export.

### Unknowns from the plan — outcomes
- 16s clip rendered in well under 4 min on the single-thread core;
  **10-minute clips still need a stress test** (memory + time) before launch.
- Canvas font loading worked via document.fonts (no fallback glyphs seen).
- wasm x264/aac behaved identically to native for this clip.

### Deferred
- Karaoke word-level highlight in exports (line-level burn for now).
- Export cancel button; render-time estimate; 1080p (blocked on the
  single-thread decision).
- 10-minute stress test for wasm memory ceilings (2GB source cap risk).

### Original plan (kept for reference)

Goal: render the final MP4 **client-side** (deliberate cost decision, PRD §6)
from the saved EDL + caption style + aspect ratio; upload to the private
`exports` bucket for re-download; good progress UX.

Committed design points:

1. **Single-threaded ffmpeg core, self-hosted.** The multithreaded core needs
   SharedArrayBuffer → COOP/COEP headers, and COEP would block the
   cross-origin Supabase media URLs the editor already depends on. Slower
   render is the price; MVP accepts it. Core files copied from @ffmpeg/core
   into public/ffmpeg at build (no CDN dependency).
2. **Arabic captions are rendered by the BROWSER, not ffmpeg.** ffmpeg
   drawtext without fribidi/harfbuzz renders Arabic disconnected and
   reversed, and libass availability in the wasm core is uncertain. Instead:
   each caption line is drawn onto a transparent full-frame PNG via Canvas2D
   (native Arabic shaping, the same IBM Plex font), and ffmpeg overlays each
   PNG with enable='between(t,…)' windows computed in OUTPUT time. Correct
   shaping is guaranteed because no text ever enters ffmpeg.
3. **Karaoke style burns as line-level in MVP** — word-level burn-in would
   need a PNG per word state (thousands for 10 min). Word-level highlight
   stays preview-only; flagged as polish.
4. **Frame-accurate cuts in one pass:** filter_complex trim/atrim +
   concat per kept segment (re-encode, no keyframe fuzz — this is the
   authoritative render the preview approximates).
5. **Output resolution 720-class** (9:16→720×1280, 1:1→720×720,
   16:9→1280×720), libx264 veryfast + aac: wasm encode speed over pixels;
   margin-friendly. Revisit 1080p when wasm perf allows.
6. **Export flow:** auto-save the working EDL if dirty → insert exports row
   (status 'rendering', edl_version_id) → download source via signed URL →
   render with live progress → upload to exports/{owner}/{id}.mp4 → mark
   'uploaded'. Failures mark 'failed'. Tab-close warning during render
   (no email fallback in MVP). Previous exports listed with signed-URL
   re-download (90-day retention).
7. **Pure export planning** (segments → filter graph, caption windows,
   resolution math) lives in a testable module; only the renderer touches
   ffmpeg.

Live-verification-only unknowns:
- ffmpeg.wasm load + render time/memory in the real browser (16s clip now;
  10-min clips need a later stress test).
- Canvas font readiness (document.fonts) before caption rasterization.
- Whether aac/libx264 encode settings behave identically in the wasm build.

---

## Phase 3 — Review & text-based editing UI (BUILT, live-verified 2026-07-09)

### Done (48 tests passing: 16 core + 20 worker* + 12 web; *includes prior suites)
- **@merai/core edl-ops** (pure, 11 new tests): removeWords (ripple, midpoint
  boundaries), restoreRemoved (source-order reinsert + merge), trim (clamped,
  word-recompute), split-at-playhead, reorder, ripple-delete-segment, and
  source↔output time mapping. **@merai/core captions**: timing-gap line
  segmentation + active line/word lookups (5 new tests).
- **Editor** at /dashboard/projects/[id]/edit: signed-URL player with
  EDL-aware preview (skips removed regions), caption overlay driven by kept
  words only, 3 preset picker, transcript editor (click=seek, shift-click
  range select, Delete=ripple), undo/redo (snapshot stacks), keyboard
  shortcuts, unsaved-changes guard, save → immutable edl_version
  (source='user') — the AI draft (v1) is never modified.
- **Transparency feature (accepted design ask): every cut is explainable** —
  clicking a struck word or a red timeline ghost opens a popover with the
  localized removal reason + the AI's verbatim note and one-click restore.
- **Timeline**: LTR-pinned strip, proportional kept blocks, drag-trim handles,
  drag-reorder, split-at-playhead, per-block delete, removed ghosts.

### Live verification (real retake project, real browser)
- Popover on the cut take showed "لقطة مكررة — اختيرت لقطة أفضل" + Haiku's
  note; restore returned all 9 words (1→2 blocks), undo reverted it.
- Word deletion via selection rippled correctly; caption overlay immediately
  dropped the deleted word (captions reflect the edit, live).
- Split at playhead 2→3 blocks; word click seeked video to 13.64s (correct).
- Save produced **edl_versions v2 (source='user')** in the live DB with the
  karaoke style + user cut persisted; v1 (ai) untouched.

### Unknowns from the plan — outcomes
- Preview-skip works; seek is keyframe-fuzzy as expected (≈100ms) — fine for
  review, export (Phase 4) is authoritative.
- RTL transcript with LTR timeline reads naturally; no mixed-direction issues
  surfaced with this content. Re-check with mixed Arabic/English text later.
- DOM timeline is smooth at this scale; canvas not needed for MVP lengths.

### Deferred
- Drag-trim/reorder exercised via pointer events, not human-hand tested —
  worth a manual feel-pass.
- No automated tests for the editor React components (core ops fully
  covered); component tests when the editor stabilizes post-feedback.
- Mixed RTL/LTR transcript selection UX — revisit with real bilingual clips.

### Original plan (kept for reference)

Goal: the user reviews the AI's first-draft EDL, tweaks it via transcript or
timeline, previews captions, and saves — producing `edl_versions` v2+
(source='user'). Builds directly on the live-verified EDL system.

Committed design points:

1. **One source of truth: the EDL.** The editor holds a working `EdlV1` and
   every operation is a pure `EdlV1 → EdlV1` transform in `@merai/core`
   (`edl-ops`): remove-words (ripple via text selection), restore-removal,
   trim, split-at-playhead, reorder, ripple-delete-segment, plus
   source↔output time mapping. Word edits translate to segment transforms
   using word timings — no parallel words-vs-segments state to desync.
   Undo/redo = snapshot stack (EDLs are small). Save appends an immutable
   version (source='user'), preserving the AI draft (v1) forever.
2. **Timeline is LTR, permanently** (Phase 0 decision, now binding): time 0
   at the left even in the RTL UI; panel chrome stays RTL. Play/pause icons
   not mirrored.
3. **AI-reasoning transparency (accepted design option):** every removed
   segment carries `reason` + the AI's note — clicking a cut (transcript or
   timeline) opens a popover showing why it was removed, with one-click
   restore. Localized reason labels; the AI note shown as-is.
4. **Captions:** timing-gap segmentation (`buildCaptionLines` in core, per
   the Phase 2 decision — punctuation only as a secondary hint), 3 style
   presets from CAPTION_STYLE_SPECS rendered as a live overlay on the video;
   selected token saved into the EDL.
5. **EDL-aware preview:** the player skips removed regions (timeupdate →
   jump to next kept segment). Known limit: browser seeking is
   keyframe-fuzzy, so preview cuts are approximate (~±100ms); the ffmpeg
   export (Phase 4) is the authoritative render. Flagged in the UI copy? No —
   accepted silently for MVP, revisit if users notice.
6. **Media access:** signed URL for the raw video created client-side with
   the user's JWT (storage RLS enforces ownership) — no new server surface.

Live-verification-only unknowns (will flag results in the report):
- Seek latency/accuracy of preview-skip on real browser video.
- Transcript selection UX across RTL text with mixed LTR words.
- Timeline drag interactions (trim/reorder) feel — DOM-based first, canvas
  only if performance demands it.

---

## Phase 2 — AI analysis layer (BUILT, live-verified 2026-07-08)

### Done (44 tests passing: 32 worker + 12 web)
- **Analysis engines** behind `AnalysisEngine` (same pattern as transcription):
  `HaikuAnalysisEngine` — claude-haiku-4-5, ONE call per video, temperature 0,
  forced tool-use JSON (schema-validated), result persisted on the transcript
  so retries/regeneration never re-bill; `HeuristicAnalysisEngine` — keyless
  fallback removing only unambiguous hesitations. Factory is env-driven:
  **setting ANTHROPIC_API_KEY activates Haiku, zero code changes.**
- **EDL builder** (pure, defensive): silence detection from word gaps
  (interior > 800ms, lead/trail), 120ms padding with midpoint overlap
  resolution, filler/false-start/retake removals with reason precedence,
  invalid AI word-ranges skipped with warnings; output schema-validated.
- **Pipeline**: transcribe → enqueue analyze (deduped) → status `analyzing` →
  EDL v1 (source='ai') → `ready`. Migration 3 adds transcripts.analysis.
- **UI**: edit-summary chips (kept duration + removals by reason) and
  struck-through removed words in the transcript, ar+en.
- **Live run** (heuristic engine, real AssemblyAI): 16s Arabic clip with an
  isolated اه and a spliced 2s silence → 23 words, `analyzing` stage visible,
  EDL: 3 kept segments, حشو: 1 (آه struck through in UI), صمت: 2, kept
  duration 13s of 16s. custom_spelling confirmed live: ميراي now correct.

### Haiku engine LIVE-VERIFIED (2026-07-08, key added)
Factory picked HaikuAnalysisEngine automatically (apps/worker/src/analysis/
index.ts:24). Test clip: Arabic stumbled take (اه filler + explicit "خليني
أعيد من الأول") → 1.5s silence → clean retake → continuation. Haiku, first
attempt, ~5s: correctly classified the filler, the false start INCLUDING the
restart announcement, and the retake group — kept take 2 with sound reasoning
("second take completes the thought; first is incomplete"). Final EDL kept
exactly the clean take + continuation (13.0s of 24.3s source) and cut
trailing silence. Overlapping AI ranges (false start ∩ retake) were merged
cleanly by the builder's reason precedence.

**Cost (measured live):** 1,805 input + 389 output tokens = **$0.0037** for a
24s video at Haiku 4.5 pricing ($1/$5 per MTok). Projected ≤ ~$0.04 for a
10-minute cap video — negligible next to STT.
**Retries don't re-bill (verified live):** requeued the completed job;
attempt 2 logged "EDL v1 already exists — converging" with zero API calls.

**Observations for later prompt tuning (not changed on n=1):**
- Haiku reported the abandoned take both as a retake member AND (partially)
  as a false start — outcome correct via builder precedence, but a prompt
  rule against cross-category overlapping ranges would make output cleaner.
- AssemblyAI misheard مونتاج as منتج consistently in BOTH takes — confirming
  that consistent STT errors don't break retake matching.

### Deferred
- `generate_edl` job stays a stub — reserved for user-triggered regeneration
  (Phase 3), which will reuse the persisted analysis without re-billing.
- Haiku prompt tuning against real creator footage (retake grouping quality)
  — needs the live key + messy real recordings.

### Original plan (kept for reference)

Goal: after transcription, auto-generate a first-draft EDL with silence,
fillers, false starts and weak takes removed (project status gains the
`analyzing` step: transcribing → analyzing → ready).

Committed design points, including both gaps found in the live Arabic test:

1. **Filler detection is NOT token matching.** Candidates come from three
   sources: (a) lexicon matches (@merai/core fillers, Arabic-normalized),
   (b) **low-confidence words (< 0.6) — required because live testing showed a
   hesitation (اه) can merge into the next word (أهرفع @ conf 0.361)**,
   (c) unambiguous hesitation sounds. Candidates + context go to Claude Haiku
   for classification; only unambiguous fillers may be removed without AI.
2. **Caption segmentation is timing-gap based, not punctuation based** —
   live Arabic output arrived with NO punctuation despite punctuate:true.
   Caption lines break on inter-word gaps (with char-length caps); punctuation
   is a secondary signal used only when present. (Constants land in
   @merai/core now; the renderer consumes them in Phase 3/4.)
3. Silence detection needs no AI: interior word-timing gaps > threshold,
   with padding preserved around speech edges.
4. Best-take/false-start detection: Haiku compares repeated/aborted phrase
   groups; "strongest take" = complete + fewest fillers + confidence.
5. **Cost rules**: Haiku ONLY (claude-haiku-4-5), one analysis call per video,
   forced tool-use JSON output (no free-form parsing retries), analysis stored
   on the transcript row so EDL regeneration never re-bills the model.
6. Keyless dev fallback mirrors Phase 1: a heuristic engine (unambiguous
   fillers + silence only) runs when ANTHROPIC_API_KEY is absent; tests are
   hermetic and never call the live API.
7. Brand-name accuracy: verify AssemblyAI word_boost live for Arabic before
   adopting it in the provider (evidence first — see speech_models incident).

---

## Phase 1 — LIVE end-to-end verification (2026-07-08) ✅

Full pipeline verified against the live Supabase project + real AssemblyAI,
driven through the actual browser UI (login → upload → processing → transcript):

- Speech clip (TTS-generated English, 197 KB): tus resumable upload to live
  Storage succeeded first try (Bearer JWT + new-format publishable key — no
  vendor quirks hit); job enqueued, claimed within 2s, **AssemblyAI transcribed
  31 words in ~10s**; transcript + word timestamps landed in `transcripts`;
  project reached `ready`; UI showed the transcript with word count, no mock
  badge.
- Tone-only clip: pipeline completed with 0 words (correct), provider-measured
  duration (6s) stored, **0.1000 raw minutes metered** — exposed a missing
  empty-transcript UI state, now fixed (ar+en).
- Retry machinery proven live: first attempt failed on a real API change (see
  below), backoff requeued it, attempt 2 succeeded — project never left a
  broken state.

**Live findings & fixes:**
1. AssemblyAI deprecated `speech_model`; now `speech_models:
   ["universal-3-5-pro", "universal-2"]` (fix from the API's own error
   message; provider, fixtures and tests updated).
2. Worker tests could leak real credentials from `apps/worker/.env` via dotenv
   and silently hit the live API — vitest now pins a hermetic env
   (`TRANSCRIPTION_PROVIDER=mock`, blank keys).

Test user for manual poking: `e2e-live@merai.test` (throwaway; password in the
session scratchpad, recreate anytime with the admin API).

---

## Phase 1 — Upload & transcription pipeline (overnight 2026-07-08, mock-verified)

### Fully built and tested (31 tests passing: 19 worker + 12 web)
- **AssemblyAI provider itself is test-covered against a stubbed HTTP layer**
  (submit payload shape, raw-key auth header, language pin vs. detection,
  polling through processing, provider-error/HTTP-error/timeout paths) — the
  live-key path has been executed end-to-end minus the network.
- **Resumable upload flow**: tus-js-client wrapper (6 MiB Supabase chunks, pause/
  resume/cancel, auto-retry on dropped connections, browser fingerprint resume),
  client-side duration probe + shared validation (10-min / 2 GiB / container
  types), drag-drop upload UI with progress, pause/resume/cancel and localized
  error states (ar+en), leave-page warning while transferring.
  *Tested:* real tus-js-client against an in-memory tus server — chunked
  transfer byte-identical, pause→resume from acknowledged offset, automatic
  recovery from two killed sockets, cancel deletes the server session.
- **Server actions**: create project+upload (validation, owner-scoped RLS
  inserts, rollback on partial failure), complete upload (storage object
  existence check, idempotent, enqueues transcribe job via dedupe_key),
  retry-processing for failed pipelines.
- **Transcription provider abstraction**: `AssemblyAIProvider` fully wired
  (submit, poll, error handling, `disfluencies: true`, language hint/detect);
  `MockTranscriptionProvider` with AssemblyAI-shaped Arabic + English fixtures
  (realistic ms word timings, يعني/اه/um/uh fillers, false starts, 2s re-take
  gaps) flowing through the same normalization as the real provider.
- **Transcribe job handler**: idempotent (unique transcript per upload, ledger
  dedupe), authoritative provider-side duration rejection, raw-minutes usage
  metering per UTC month, project status transitions incl. permanent-failure
  → error.
  *Tested end-to-end on real Postgres (PGlite) applying the actual migrations:*
  enqueue → claim → mock transcription → normalized words in `transcripts` →
  ledger row → project `ready`; re-run idempotency; over-long rejection (no
  billing); retry-exhaustion → project `error`. Queue semantics (oldest-first,
  type filter, backoff, dedupe) covered separately.
- **Status UI**: dashboard project list with live status chips; project page
  status stepper polling every 2.5s until ready/error; transcript view
  (RTL/LTR by detected language, word count, amber "mock provider" badge so
  fixture data is unmistakable); error panel with retry.

### Tomorrow: mock → live (exact steps)
1. **Provision Supabase** (this never existed — no `.env.local`/`.env` files
   were present on this machine, and no Docker for a local stack, so nothing
   could run against real Supabase tonight): create the project, apply
   `supabase/migrations/*.sql` in order, then fill `apps/web/.env.local` and
   `apps/worker/.env` from the `.env.example` files.
2. **Go live on STT**: add `ASSEMBLYAI_API_KEY` to `apps/worker/.env`. That's
   the entire switch — the provider factory picks AssemblyAI automatically
   when the key is present (no flag, no code change).
   `TRANSCRIPTION_PROVIDER=mock` remains available to force fixtures.
3. Test media: `tools/fixtures/test-clip-5s.mp4` (committed);
   `tools/make-fixtures.ps1 -IncludeOverlong` generates an 11-min clip to
   verify the rejection path live.

### Needs the live account (deliberately not simulated)
- AssemblyAI pricing, rate limits, concurrency and Arabic accuracy — no
  numbers were assumed anywhere.
- Supabase's exact tus endpoint behavior (metadata quirks, upsert semantics)
  — the wire protocol is tested, the vendor specifics are not. If the first
  live upload 4xx's, check bucket-name metadata and the x-upsert header.
- Storage RLS policies execute only on live Supabase (written, unexercised).

### Judgment calls / deferred
- AssemblyAI polling (not webhooks): simpler, fine at MVP scale; revisit if
  worker dyno-time cost shows up.
- After a `duration_exceeded` rejection, retrying re-submits the same media
  to STT (bounded by the 10-min cap); acceptable waste, noted.
- Dropzone keyboard accessibility + Supabase auth error i18n → polish pass.
- Upload UI not driven in a real browser session tonight (needs live
  Supabase auth + storage); everything below the UI is test-covered.

---

## Phase 0 — Project scaffolding & architecture (2026-07-08)

### Done
- npm-workspaces monorepo: `apps/web` (Next.js 16, App Router, TS, Tailwind v4),
  `apps/worker` (Railway job consumer), `packages/core` (shared domain types).
- Full Supabase schema as SQL migration (`supabase/migrations/20260708000000_init.sql`):
  profiles, projects, video_uploads, transcripts, edl_versions, exports,
  usage_ledger, jobs — with RLS on every table, private storage buckets
  (`raw-uploads`, `exports`) with owner-scoped object policies, profile-creation
  trigger, and the Postgres job queue (`claim_next_job`/`complete_job`/`fail_job`
  with SKIP LOCKED + exponential backoff).
- i18n scaffolding with next-intl: Arabic default at `/` (RTL), English at `/en`;
  all UI strings externalized in `messages/{ar,en}.json`; IBM Plex Sans Arabic
  via next/font; Tailwind logical utilities for direction-aware layout.
- Auth: Supabase email+password (signup with locale metadata, login, sign-out,
  email-confirm callback at `/auth/confirm` supporting token_hash + PKCE code);
  session refresh chained into the Next 16 `proxy.ts` after locale routing.
- Pages: Arabic-first RTL landing page, login/signup, auth-guarded empty dashboard.
- Worker skeleton: typed job contracts (zod) shared via `@merai/core`, polling
  loop with graceful shutdown, per-type handlers (stubs for transcribe/analyze/
  generate_edl/cleanup_expired), Dockerfile for Railway.
- Env var structure for AssemblyAI / Anthropic (Haiku) / Dolby.io / Pixabay
  (`.env.example` in both apps); `DECISIONS.md` started with 12 entries.

### Deferred / known issues
- Supabase auth error messages render in English (provider strings); mapping to
  translated messages planned alongside Phase 3 polish.
- `cleanup_expired` handler is a no-op until Phase 6 (retention).
- Tier quota numbers in `@merai/core/limits.ts` are placeholders pending
  Phase 6 pricing.
- No tests yet; test harness lands with Phase 1 (first real business logic:
  upload validation + transcript normalization).
- Supabase project itself not provisioned here — migration must be applied and
  env vars set before auth works end-to-end.

### Next (Phase 1 — awaiting schema/architecture confirmation)
Resumable upload flow (Supabase resumable/tus), duration validation (client +
server), transcribe job (AssemblyAI), job-status surface for the frontend.
