# Merai — Product Review & Polish Sprint (2026-07-17)

Scope: everything shipped through Build 9, reviewed as a first-time creator.
No new features evaluated for building — this is a mirror, not a roadmap.
Method: every screen/flow was exercised live during Builds 6C.4–9 (throwaway
users, synthetic devices, real pipeline); findings below cite what was
actually observed.

---

## 1. Scores

| Dimension | Score | One-line justification |
|---|---|---|
| **Overall product** | **8.0 / 10** | A genuinely complete Arabic-first creator platform — record → AI edit → brand → export → bill — with the polish gaps of something built fast. |
| **UX** | 7.5 / 10 | Strong golden paths and honest AI transparency; weak spots are error-recovery surfaces, missing prices on billing, and un-zoomable timeline. |
| **Architecture** | 9.0 / 10 | Provider interfaces everywhere, pure tested cores, zero-migration discipline, refuse-don't-flatten adapters. The codebase teaches its own rules. |
| **Performance** | 8.0 / 10 | Segment-wise rendering is stress-proven; waveform decodes once; dashboard reads bounded. Client-side search fine at target scale. |
| **Production readiness** | 7.0 / 10 | Deployed and E2E-verified, but: mock-billing-in-prod hazard, stitch-failure retry gap, 0-segment exports, no observability, SSO/domain pending. |

## 2. Per-area review (first-time creator lens)

### Recording experience (7.1–7.3) — strong, one structural gap
- **Camera recording**: countdown → pause/resume → cap timer → take review is
  a genuinely professional loop. Mirrored preview is correct. ✅
- **Screen / screen+camera**: picker-on-gesture, stop-share-completes-take,
  PiP speaks the same placement language as the logo layer. Preview=output
  held under pixel sampling. ✅
- **Gaps**: takes live in RAM — a refresh loses everything recorded
  (documented, but a first-timer will hit it); no back/retake path once the
  upload handoff errors (e.g. quota) — the creator is stranded on an error
  panel; prompter is hidden during the countdown (speakers want the first
  line ready); no audio level meter, so silent-mic mistakes are discovered
  after recording.

### Scene workflow (7.4) — pipeline excellent, management thin
- The stitch pipeline ran attempt-1 clean live. ✅
- "Scene management" is currently *take order + delete*: no reordering of
  scenes before combine, no per-scene re-record inside the combine flow, no
  scene titles. Acceptable v1, but the label oversells slightly.
- **Reliability gap (hardening)**: a permanently failed stitch leaves the
  project in `uploading` with no retry surface — `retryProcessing` only
  knows transcribe.

### Timeline UX (7.6) — good bones
Waveforms + ruler + trim tooltip land well. Missing: zoom (10-min sources
compress hard), keyboard nudge for trim, and ruler label crowding at mobile
widths on short clips (14 labels at 375px).

### Auto Canvas (7.5) — right architecture, one UX wart
The transparency line is the right instinct. **Wart**: while Auto is on, the
aspect sync runs through the undoable command dispatcher — toggling Auto
pollutes the undo stack with `set-aspect-ratio` entries.

### Onboarding (6C.4) / Creator Styles (6C.2) / Brand Kit / Caption & Overlay Studios — the strongest area
Coherent identity system, preview=export enforced by shared code, wizard
seeds everything correctly (verified byte-exact). Nits: the wizard doesn't
offer "reopen later" affordance after skip (route exists, no discoverable
entry); Brand Kit page is long — needs section anchors on mobile.

### Teleprompter / Speaker notes (7.3) — solid
Pause-exact scrolling verified. Nits: no font/speed preview before
recording starts; script capped at 20k chars silently.

### Skills (8) — foundation is honest
Contract-validated, persona-ranked, ran a live Brain round-trip. The row
renders above the free-form box; a first-timer may not grasp Skills vs
presets vs intent — needs one line of framing copy or a merge of "presets"
into Skills (they overlap conceptually).

### Dashboard / Organization / Search / Tags (6C.1, 7.7) — good
Bulk ops verified live. Nits: no tag on the "new project" flow (tags only
exist post-hoc); no sort control (newest-only); status chips are color-only
(a11y).

### Billing & subscription UX (9) — functional, one honest gap
The subscribe→enforce loop is real and verified. **Gap**: no prices shown —
plan cards pitch minutes but not cost (price display requires the owner's
Stripe Prices; fetch-and-display should land with live keys). The
quota-exceeded message links conceptually but not literally (no <Link> to
billing). Mock provider must never masquerade in production (hardening).

### Export flow — proven, one edge
Segment-wise render production-verified since Phase 4.5. **Edge
(hardening)**: a 0-segment EDL reaches the worker and burns 3 retries.

### Empty / loading / error states
- Empty states: dashboard (excellent), organize no-matches (good), takes
  rail (none — fine).
- Loading: editor video has a labelled loading state; waveform loads
  silently (by design); **billing/dashboard have no skeletons** — server
  pages just take their time (acceptable at current latency).
- Errors: translated everywhere audited; the recorder's device errors are
  exemplary. Weakest: post-handoff upload errors (no recovery affordance)
  and stitch failure (invisible).

### Mobile / Desktop
Every 6C+ surface is grid-responsive and was spot-checked at 375px. The
**editor** is the least mobile-ready screen (timeline + transcript + panels
stack tall; trim handles now have wide hit areas which helps). Desktop is
consistently good.

### Accessibility
Good: aria-labels on ghosts/progress bars, `?`/`؟` shortcuts, logical CSS
throughout, RTL discipline. Gaps: color-only status chips, canvas waveforms
lack text alternatives (decorative — acceptable), focus states rely on
browser defaults in several custom controls, no skip-to-content link.

### Consistency & product feel
One design language (chips, rounded-2xl cards, accent system), one
placement language (logoBox everywhere), one preference pattern. The
product *feels* like one hand built it. Remaining inconsistency: the AI
panel's legacy "presets" row next to Skills; two different "upload
progress" visual treatments (single vs scenes).

## 3. Top 20 improvements, ranked by impact

| # | Improvement | Size |
|---|---|---|
| 1 | **Mock billing must be impossible in production** (env guard) | Quick |
| 2 | **Reject 0-segment EDL exports** (client disable + server gate + worker PermanentJobError) | Quick |
| 3 | **Stitch-failure recovery**: retryProcessing requeues a failed stitch; status view shows it | Medium |
| 4 | Recovery path on recorder upload errors (back to takes, keep the blob) | Medium |
| 5 | Show real prices on billing plan cards (needs live Stripe Prices) | Medium |
| 6 | Observability: Sentry (web+worker) + uptime ping | Medium |
| 7 | Quota-exceeded errors deep-link to /dashboard/billing | Quick |
| 8 | Auto Canvas aspect sync bypasses the undo stack | Quick |
| 9 | Audio input level meter in recorder setup | Medium |
| 10 | Timeline zoom (even 2 fixed levels) | Major |
| 11 | Scene reorder before combine (drag the takes rail) | Medium |
| 12 | Persist takes to IndexedDB (survive refresh) | Major |
| 13 | Editor mobile pass (collapsible panels, sticky player) | Major |
| 14 | Merge AI "presets" row into Skills (one concept) | Quick |
| 15 | Status chips: add icon/text shape for color-blind users | Quick |
| 16 | Wizard re-entry point (dashboard menu "إعادة الإعداد") | Quick |
| 17 | Billing/dashboard loading skeletons | Medium |
| 18 | Tag projects at creation (upload + scenes flows) | Quick |
| 19 | Ruler label thinning at narrow widths | Quick |
| 20 | Prompter visible during countdown | Quick |

## 4. Buckets

**Quick wins (<1h each):** #1, #2, #7, #8, #14, #15, #16, #18, #19, #20.
**Medium (half-day–2d):** #3, #4, #5, #6, #9, #11, #17.
**Major initiatives:** #10 (timeline zoom), #12 (IndexedDB takes), #13
(mobile editor).

## 5. Future improvements review (evaluated, NOT implemented)

| Cluster | Value | Architectural fit | Verdict |
|---|---|---|---|
| **1. AI Scene Intelligence** (metadata, per-scene edit/captions/branding) | High for multi-scene creators | Requires scene identity to SURVIVE the stitch into the EDL — today scenes dissolve into one source. This is the EDL v2 *writer* milestone in disguise. | **Later** — gate on real usage of 7.4; large. |
| **2. Intelligent Caption Presets** (type→style automation) | Medium | Trivial: wizard already maps type→style→caption; "auto-apply on new project" is one read of user_metadata. | **Next sprint candidate** — small, high perceived intelligence. |
| **3. AI Teleprompter** (script gen/rewrite/hooks/breakdown/reading speed) | High — writes into the recorder we just built | Clean: a `generate_script` job type + Haiku (key already worker-side); reading-speed = existing `estimateReadingSeconds` inverted. Scene breakdown pairs with cluster 1. | **Strong next-sprint candidate** (script gen + rewrite only). |
| **4. Recording Presets** (YouTube/Podcast/Course/Shorts/Medical/SaaS demo) | Medium-high, cheap | Pure data over existing prefs (mode, PiP, countdown, prompter, target aspect) — the Creator-Styles pattern applied to the recorder. | **Next sprint candidate** — small. |
| **5. Auto Canvas v2** (face detection, smarter zones) | Medium | Face detection = first client-ML dependency or worker CV step; real render change (crop centering). | **Later** — after creators actually fight the current crop. |
| **6. Skills Evolution** (marketplace, community, premium) | High long-term | The Build 8 contract was designed for exactly this; premium skills need Build 9's rails + a review pipeline. | **Later** — needs users first; foundation is ready. |
| **7. AI One-Click Workflows** (end-to-end create/publish) | Very high ceiling | = Skills `steps` executor (worker runner over the jobs queue) + publishing integrations (new external surface area, OAuth). | **Later** — executor first, publishing last. |
| **8. Smart Organization** (AI tags, semantic search) | Medium | Embeddings infra (pgvector) — new dependency; transcripts make it natural. | **Later** — current search is fine at current scale. |
| **9. Production Hardening** | Immediate | — | **THIS sprint** (below). |

## 6. Recommended next-cycle sprint backlog (post user-testing)

1. **Sprint P0 — Hardening** (this sprint, below): items #1–#3 + log review.
2. **Sprint P1 — First-session polish** (before inviting beta creators):
   quick wins #7, #8, #14, #15, #16, #18, #19, #20 + medium #4 (recorder
   recovery) + #17 (skeletons). One week.
3. **Sprint P2 — Trust & money** (with owner's Stripe keys): live Stripe
   verification, prices on cards (#5), Sentry (#6), SSO-off + domain.
4. **Sprint P3 — Recorder intelligence** (first post-feedback feature work,
   pending approval): Recording Presets (cluster 4) + AI Teleprompter
   script gen/rewrite (cluster 3) + caption auto-apply (cluster 2) — all
   small, all compound the recorder.
5. **Hold for signal**: timeline zoom (#10), mobile editor (#13), scene
   intelligence (cluster 1), marketplace (cluster 6) — sequence by what
   beta creators actually hit.

---

*Hardening pass findings and fixes are recorded in
[PRODUCTION_HARDENING_2026_07.md](PRODUCTION_HARDENING_2026_07.md).*
