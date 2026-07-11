# Merai Product Audit — from Developer Tool to Premium Creator Platform

Date: 2026-07-11 · Scope: UX gaps vs. competitors (Descript, Tella, OpusClip, CapCut)
No code changes. Analysis only. Findings and recommendations for Build 6+.

---

## 1. First-Time User Journey

### Current state
- **Landing page** (Arabic/English, clean hero)
- **Immediate sign-up wall** — users land → login/signup required to see anything
- **No trial or demo** — can't try before committing to an account
- **No value prop clarity** — landing page copy exists but doesn't answer "why should I care?"
- **No onboarding flow** — post-signup, users land on an empty dashboard with one call-to-action: "Upload video"

### Competitor benchmarks
- **Descript**: "Auto-transcribed videos you can edit like a doc" — immediate, specific, solves a pain
- **Tella**: "Record your screen in one click" — zero friction, no signup to try
- **OpusClip**: "Turn long videos into viral shorts" — concrete output, immediately aspirational
- **CapCut**: "Create. Share. Inspire." — brand-first, but then immediately shows **template gallery** — users see what's possible before committing

### Audit findings
- ⚠️ **No public demo or guest mode** — a creator can't preview the editor or see a rendered export without signing up
- ⚠️ **No templates or example projects** — unlike CapCut/Descript, users don't see "what finished looks like"
- ⚠️ **No onboarding tooltips or in-app guidance** — landing on a blank dashboard after signup is disorienting
- ⚠️ **No clear value hierarchy** — is Merai for podcasters? YouTubers? TikTok creators? The landing page is generic
- ⚠️ **No social proof** — no testimonials, creator quotes, or "X projects edited this month"

### Recommendations
1. **Add a 30-second video demo on the landing page** (native on desktop, GIF on mobile) showing the key workflow: upload → editor → export
2. **Offer guest/trial mode** — let users upload a sample clip (30 seconds max) and see the editor/export without signing up
3. **Create 3–4 example projects** (podcast highlight, YouTube clip, TikTok vertical) that appear in the dashboard post-signup as "getting started" templates
4. **Add in-app onboarding tooltips** — on first upload and first editor visit, highlight the key actions (transcript click to seek, drag timeline, click to delete word)
5. **Clarify positioning: "AI video editor for creators"** + show use cases inline (podcasts, YouTube, TikTok, LinkedIn)

---

## 2. Upload Experience

### Current state
- **Drag-drop zone** with file input
- **tus resumable uploads** (pause/resume work)
- **Progress bar** shows % uploaded
- **No client-side preview** — user drags a file, has no idea what the duration is until upload completes
- **No file-size warning** — users don't know the 10-min cap or 2GB limit until they hit it
- **No upload time estimate** — progress % alone doesn't tell a creator "this will take 2 minutes"
- **Spinny loading state** with "Uploading…" and no indication of *what's happening next*

### Competitor benchmarks
- **Descript**: Shows file size, duration, estimated processing time before upload; progress bar + time remaining
- **Tella**: Instant browser recording (no upload); one-click start/stop
- **OpusClip**: Drag a YouTube link, Vimeo link, or upload file; shows metadata (duration, size, availability)
- **CapCut**: Preview thumbnail grid, duration detection, quality warning for low-res

### Audit findings
- ⚠️ **No pre-upload validation UI** — users don't see "10 min max, you've got 8:32" until after clicking upload
- ⚠️ **No duration/size display** — the browser can read video metadata (duration) before sending bytes; we show nothing
- ⚠️ **No time-to-complete estimate** — "3% uploaded" means nothing without context ("~3 min remaining")
- ⚠️ **No cancel/retry affordance** — upload fails? Users see an error but no obvious "try again" button
- ⚠️ **Silent after upload completes** — file goes into "Uploading…" state; next phase (transcription) is opaque
- ⚠️ **No re-upload suggestion** — if a user has already uploaded this file (same SHA), no dedup or "use existing file?" prompt

### Recommendations
1. **Probe video metadata before upload** — show duration/size in the dropzone UI ("09:32 · 127 MB · within limits ✓")
2. **Display time-to-complete** — once upload starts, show "Uploading… ~2 min remaining" (based on speed)
3. **Add a clear cancel button** during upload (pause + clear, or full retry)
4. **After upload completes, name the transition** — "✓ Upload complete · Next: Transcription (est. 30 sec)"
5. **Suggest file alternatives** — if file is slow-mo or 60fps, offer to re-encode to 30fps for faster processing
6. **Add upload retry with exponential backoff** — network drop? Auto-retry up to 3 times before asking user to intervene

---

## 3. Processing States (Transcribing → Analyzing → Ready)

### Current state
- **Project page polls every 2.5 seconds**
- **Status chips** show current step (uploading, transcribing, analyzing, ready, error)
- **Transcript view appears when status is ready**
- **No per-step progress** — "transcribing" gives no signal of how far along we are
- **No AI reasoning visible** — user uploads, waits, and suddenly sees the edited EDL — no explanation of what the AI did
- **Processing time opaque** — no estimate of "this usually takes 5 minutes"
- **No cancellation** — once uploaded, the job runs to completion (Phase 3 added cancel after analysis started, but limited UX)

### Competitor benchmarks
- **Descript**: Shows live transcript as it arrives (even mid-processing); displays confidence scores; offers "make a silence" or "mark as filler" inline
- **Tella**: Upload → instant preview; no async processing (recording is local)
- **OpusClip**: "Analyzing video… 40% done" + "Finding scenes…"; shows what stage AI is in
- **CapCut**: Template selection during processing keeps user engaged

### Audit findings
- ⚠️ **No per-step progress** — "Transcribing" should show % done, not just a spinner
- ⚠️ **No AI reasoning explanations** — removed words show reason + note, but not *why the AI trusted that decision*
- ⚠️ **No live confidence scores** — transcription confidence, filler confidence, retake confidence are in the data but hidden
- ⚠️ **No option to intervene during processing** — if a user sees a live transcript scrolling, they can't say "skip this word"
- ⚠️ **No engagement during wait** — user watches a spinner for 30–60 seconds; no template picker, no goal-setting, nothing
- ⚠️ **Processing time surprise** — first transcription might take 30s, analysis 5s; a creator doesn't know until it's done

### Recommendations
1. **Show per-step progress** — "Transcribing: 80% (est. 10 sec remaining)" + a live word count
2. **Display AI confidence inline** — as the transcript appears, show word-level confidence (color-coded or mini badges)
3. **Add a "live filler tagging" mode** — while transcript is arriving, users can click words to pre-mark as filler before analysis runs
4. **Estimate and display processing time** — "This usually takes ~25 seconds" based on video duration/complexity
5. **Show the AI's decision process** — "Cut because: marked as filler (uh/um), low confidence, similar word earlier"
6. **Add a skip-analysis option** — let creators skip the AI cuts and manually edit from a full transcript
7. **Use the processing wait for engagement** — show tips, templates, or preset caption styles to explore while waiting

---

## 4. Editor UX

### Current state
- **Three-panel layout**: player (left), transcript (right), timeline below
- **Transcript click-to-seek** works; shift-click selects ranges
- **Timeline shows kept (black) and removed (red ghost) segments**
- **Drag trim handles, drag reorder, split at playhead, delete segment**
- **Live caption overlay** with preset styles
- **Undo/redo, save, unsaved-changes guard**

### Gaps vs. competitors
- **No B-roll or background music** — Descript, CapCut, OpusClip all make it trivial to add overlays
- **No effects library** — no fades, crossfades, text overlays, stickers
- **No audio controls** — no ducking (music under voice), no gain, no EQ
- **No multi-track awareness** — future-proofed (Build 5 EDL v2), but editor is still single-track
- **No export presets** — users manually pick aspect ratio; no "TikTok", "YouTube Shorts", "LinkedIn" templates
- **No live video preview of cuts** — the preview skips removed segments, but caption burn is invisible until export completes
- **No keyboard shortcuts cheat sheet** — Delete/Backspace, Ctrl+Z, Space work, but users don't know until they try

### Competitor benchmarks
- **Descript**: Word-level drag-to-delete in a document-like interface; instant playhead jump on click; auto-caption with edit history
- **CapCut**: Template library with animations; one-click music sync; effects gallery with presets; mobile-optimized (vertical timeline)
- **OpusClip**: "Hook" detection and auto-highlighting; aspect ratio auto-switch (16:9 → 9:16 → 1:1)
- **Tella**: Browser recording lives in the editor; instant play (no upload step)

### Audit findings
- ⚠️ **No visual feedback on hover** — users don't know segments are draggable until they try
- ⚠️ **No discoverability of shortcuts** — keyboard shortcuts aren't discoverable (no ? menu, no tooltip)
- ⚠️ **Caption overlay is preview-only** — users see it over video, but if captions go off-screen or overlap, they don't realize until export
- ⚠️ **No aspect ratio preview** — switching 9:16 to 16:9 doesn't re-render the timeline or show what the video looks like
- ⚠️ **No export time estimate** — "click export and wait"; users don't know if it's 30 sec or 5 min
- ⚠️ **Timeline is dense** — with many segments, the timeline becomes hard to navigate; no zoom, no minimap
- ⚠️ **No "save as new version" UX** — users save once and the old version is gone; no version history browser

### Recommendations
1. **Add a keyboard shortcuts cheat sheet** (? button or Cmd+/ ) with common actions and their hotkeys
2. **Implement aspect ratio preview** — switching ratios briefly re-renders the video preview at that ratio
3. **Add visual hover states** — segment hover shows a "grab" cursor and highlights the segment
4. **Show export time estimate** — based on video duration and vCPU speed, "est. 2 min 15 sec"
5. **Add a caption editor overlay** — click caption on the timeline to open a text editor and retime the caption (Build 5.x feature)
6. **Implement timeline zoom/minimap** — for videos with many segments, allow zoom levels and a scrubber minimap
7. **Add a version history browser** — let users see and restore prior user edits without losing the current working copy

---

## 5. AI Feedback Visibility

### Current state
- **Removed words show reason + AI note** — hovering over a struck word shows "فيلر / hesitation" or "حشو / filler" + AI's verbatim note
- **Edit summary shows totals** — "Kept: 13s · Removed: 3s · Fillers: 1, Silence: 2"
- **No confidence scores visible** — transcription, filler, and retake confidence are stored but hidden
- **No "why" explanations** — the AI decided to cut; the reason is categorical (filler, silence, retake) but the confidence or triggering heuristics are opaque
- **No model version or recomputation** — if the user clicks "regenerate EDL", there's no UI for it in Phase 5 (it exists as generate_edl job, but no UI)

### Competitor benchmarks
- **Descript**: Shows confidence scores inline; "Mark as filler" and "Keep" buttons per word; "Regenerate" with tuning knobs (aggressiveness level)
- **CapCut**: "Auto-cut" shows a % aggressiveness; users can slide it 0–100% to trust the AI more or less
- **OpusClip**: "Hook score" (1–10) for each scene; "Scene importance" shown as a heat map on the timeline
- **Tella**: No AI editing; user does all cuts manually

### Audit findings
- ⚠️ **No confidence score display** — users can't see "this word is 95% filler, that one is 50%"
- ⚠️ **No regenerate/recompute UI** — the generate_edl job exists but isn't exposed; users can't ask "cut more aggressively"
- ⚠️ **No AI reasoning audit trail** — removed words show reason, but not the feature vector (silence duration, confidence combo, repeat proximity)
- ⚠️ **No model information** — users don't know which Claude model was used, when it was trained, or if a newer version is available
- ⚠️ **No feedback loop** — Descript lets users say "you shouldn't have cut that" and learns; Merai is one-shot

### Recommendations
1. **Display transcript word confidence** — color-code words 0–100% (green = high confidence, red = low) so users see data quality
2. **Add confidence scores to removed words** — "Filler (98% confident, similar word at 5:23)" gives users signal to trust or distrust the cut
3. **Implement regenerate with aggressiveness slider** — "Cut more / Cut less" 1–10, regenerate the EDL on-demand
4. **Show model metadata** — "Analyzed with Claude Haiku 4.5 on 2026-07-08" so users know freshness and can re-run if a newer model ships
5. **Add a "why?" explanation panel** — click a removed word to see the feature vector: "Silence: 850ms gap · Filler lexicon match: 'um' · Low confidence: 0.38"
6. **Implement user feedback loop** (Build 6+) — "This cut is wrong" → stores the feedback, improves future analyses for this user

---

## 6. Premium SaaS Gaps

### Current state
- **No pricing page** — no public tier structure, no clear free vs. pro
- **No usage display** — users don't see "you've used 3 of 10 monthly exports" or "3 of 10 min of processing"
- **No pro features** — every user gets the same: transcription, analysis, editing, export (all unlimited)
- **No billing/payment flow** — no Stripe, no credit card, no subscription UI
- **No team/collaboration** — all projects are single-owner
- **No API or integrations** — users can't automate or connect to YouTube, TikTok, Zapier, etc.
- **No storage/retention visible** — users don't know how long their projects/exports are kept (30-day/90-day windows exist but aren't shown)

### Competitor benchmarks
- **Descript**: Freemium (1 hour/month processing, limited exports); Pro ($24/mo, unlimited); Team (collab); usage dashboard
- **CapCut**: Free (all features); CapCut Cloud (collab, cloud storage); watermark removal is paid (so users see "upgrade to remove" on every export)
- **OpusClip**: Free (3 shorts/mo); Pro ($50/mo, unlimited); usage meter on home page
- **Tella**: Free (unlimited recordings); Pro ($9/mo, no watermark, custom branding); very clear watermark on free exports

### Audit findings
- ⚠️ **No freemium friction** — without a usage limit or watermark, users have no incentive to upgrade
- ⚠️ **No visibility of value** — users don't see "you've saved 4 hours of editing this month" or "your 5 exports have been watched X times"
- ⚠️ **No upgrade moment** — there's no natural point where a free user bumps against a limit and sees a "Pro" option
- ⚠️ **No retention window communication** — users might assume their videos live forever; they're deleted after 90 days
- ⚠️ **No integration story** — creators want YouTube auto-publish, TikTok direct upload, Zapier automation; none exist
- ⚠️ **No social sharing** — no embed code, no public links to share exports with collaborators
- ⚠️ **No team workflow** — a creative agency can't assign projects to editors; everything is single-owner

### Recommendations (Build 6+)
1. **Launch freemium tier** with a 5–10 export/month limit (shows "X exports remaining" prominently)
2. **Add a Pro tier** ($15–20/mo): unlimited exports, premium analytics, early access to new AI features
3. **Implement a usage dashboard** — show "Exports used: 8 of 10 this month" + "Processing time used" + "Days until your projects auto-delete"
4. **Add Slack/email reminders** — "3 exports left this month" + "Upgrade to Pro for unlimited"
5. **Implement watermarking** on free exports (removable on Pro) — subtle branding that incentivizes upgrade
6. **Add a public export link** with share controls (anyone with link can view) — so creators can show work without YouTube/TikTok upload
7. **Build YouTube auto-publish** (Phase 6+) — one-click export to YouTube as unlisted, to a designated channel
8. **Add team/collaboration basics** (Phase 6+) — invite team members, assign projects, view shared exports (foundational for Pro tier)

---

## Summary: From Developer Tool to Premium Creator Platform

### Top 5 UX wins (highest impact, lowest effort)

1. **Add onboarding tooltips** (5 tooltips, 2 hours) — "Click a word to seek", "Drag to reorder", "Delete = ripple"
2. **Probe video metadata + show duration/size pre-upload** (1 hour) — builders expect this, creators expect this
3. **Display transcript confidence + cut reasons** (2 hours) — leverage existing data, builds trust in AI
4. **Add keyboard shortcuts cheat sheet** (1 hour) — ? menu with all shortcuts, massively improves discoverability
5. **Implement freemium tier** (6–8 hours, split across billing + UI) — instant monetization signal + upgrade friction

### Medium-term strategic shifts (Phase 6+)

1. **Collaborate**: team/project sharing, guest links, view-only mode (blocks Export)
2. **Integrate**: YouTube auto-publish, TikTok direct upload, Zapier webhooks
3. **Differentiate on AI**: confidence-tunable re-analysis, user feedback loop ("you're wrong"), prompt customization
4. **Mobile**: either native apps or responsive PWA for iPad editing (CapCut/Tella are mobile-first)
5. **Creator studio**: analytics dashboard (export views, watch time), trending sounds, caption templates by language

### Positioning (narrative shift)
- **Current**: "Merai: AI video editor" (generic, developer-friendly)
- **Target**: "Merai: AI editing for creators who value their time" (specific, outcome-focused)
  - Subclaim: "Record, edit, post in minutes — not hours"
  - Social proof: "Used by [X] podcasters, YouTubers, TikTokers to save [Y] hours/month"
  - Differentiation: "AI you can trust: 98% accuracy, 100% explainable"

---

## Open Questions for Product/Design Review
1. **Target creator**: podcast editor? YouTube short-maker? LinkedIn video creator? TikTok power user? (Current: unclear)
2. **Killer feature**: what does Merai do better than Descript/CapCut/OpusClip? (Current: unclear — AI editing is table-stakes now)
3. **Monetization model**: freemium (usage-based), subscription, pay-per-export, or hybrid? (Current: undefined)
4. **Mobile strategy**: web-only, PWA, or native apps? (Current: desktop web only; competitors are mobile-first)
5. **Creator network**: is there a community aspect (templates, shared projects, creator showcase)? (Current: none)
