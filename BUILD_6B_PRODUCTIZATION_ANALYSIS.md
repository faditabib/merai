# Build 6B Analysis — Creator Productization

Date: 2026-07-11 · Written before any code (per build instructions).
Scope: transform Merai from AI editor into premium creator SaaS through three layers:
1. **Brand control** (Brand Kit, presets, consistent style)
2. **Caption mastery** (Caption Studio with visual presets)
3. **Premium UX** (dashboard, export, onboarding redesign)

**Out of scope:** recording suite (Build 7), multi-user collab, templates marketplace, music library, third-party integrations.

---

## 1. Current product positioning vs. competitors

| Aspect | Merai (today) | OpusClip | Submagic | Descript | CapCut | Tella |
|--------|--------------|----------|----------|----------|--------|-------|
| **Core premise** | AI understands content, edits it | AI selects best moments | Auto captions + B-roll | Transcript-first editor | All-in-one creator suite | Screen recording + AI |
| **Entry friction** | Upload video | Paste YouTube link | Auto-process | Record or upload | Import or record | Record or import |
| **AI strength** | Holistic editing (cuts, pacing, style) | Clip detection | Captions + design | Transcript reliability | Effects automation | Scene detection |
| **Captions** | Plain text overlays, no styling | Auto with motion | Heavy design | Auto synchronized | Animated, preset-heavy | Simple text |
| **Brand control** | None (no presets, no kit) | None | Templates (limited) | Fonts + colors | Preset packs | None |
| **Export parity** | One output format | Format selection | Multi-format | Multi-format | Multi-format | MP4 + GIF |
| **Creator confidence** | Medium (UI explains AI) | High (human selects moments) | High (results visible in UI) | High (see transcripts) | High (many options) | Medium (scene limits) |

**Gap diagnosis:** Merai is feature-complete on editing but lacks the *stylistic control* and *brand continuity* tools that creators expect. A creator who receives three well-edited videos but with mismatched caption styles or generic lower thirds will feel the tool is "smart but generic." Competitors succeed by combining editing with **visual presets** and **style systems**.

---

## 2. Strategic features for Build 6B

### Feature Group 1: Brand Kit (creator ownership of visual identity)

**Why now:**
- Creators want consistency across a series (subscriber recognizes the style).
- Today Merai has no captions styling, no overlays, no way to encode "this is MY channel."
- Competitors (CapCut presets, Submagic templates) win on recognition → retention.

**What it does:**
A creator fills out a **Brand Kit** once: their channel colors (primary, accent, background), caption font choice (3–4 curated Arabic-safe fonts), and lower-third template metadata (logo/name placement, animation in/out style). The AI editing brain **optionally** references these during plan generation ("make captions in the brand color," "use the channel's lower-third style"), and the renderer enforces them on export.

**Scope — minimal MVP:**
- 3 colors (primary, accent, text/background contrast-safe pair)
- 1 caption font selection (rendered server-side via canvas)
- 1 lower-third template (JSON: logo asset ID, name+title field, placement, animation tuple)
- Stored per-user in a `creator_brand_kit` table (simple upsert)
- No multi-brand orgs, no sharing, no versioning

**Non-scope:**
- 100 templates; dynamic color picker; brand asset library; AI-suggested palettes.

### Feature Group 2: Caption Studio (visual preset system)

**Why now:**
- Captions are 80% of export quality (first thing viewers see).
- Today: Merai renders plain text PNG overlays, no effects.
- Creators want 3–4 preset styles ("bold statement," "soft educational," "hype reel," "formal tutorial") and the ability to toggle between them.

**What it does:**
A **Caption Preset** is: font size/weight, text color (auto-contrast vs. brand), bg style (solid, gradient, rounded box, outline), animation (fade-in, slide-left, pop), and duration override (default is word timing; preset can extend by 0.5s for breath room). The creator picks a preset during export config, or the AI defaults one per content type. The exporter reads the preset and instructs the caption renderer to apply it per segment.

**Existing assets to reuse:**
- `@napi-rs/canvas` (Skia + HarfBuzz) already renders captions server-side with Arabic shaping.
- `CaptionStyle` schema in core (color, font, size, bg shape, animation type — partially populated).
- Export panel already allows config selection.

**Scope — minimal MVP:**
- 4 built-in presets (bold, soft, hype, formal) tuned for common video types.
- Per-user override: choose favorite preset, or let AI pick by content type hint.
- Stored on export row as `caption_preset_id` (fk to a small `caption_presets` table).
- Canvas renderer uses preset metadata; no new rendering engine.

**Non-scope:**
- Custom preset creation UI; per-video preset mix; per-caption style overrides; keyframe animation.

### Feature Group 3: Gradient Video Overlays + Lower Thirds

**Why now:**
- Visual polish: competitors (CapCut, Submagic) ship animated overlays out-of-the-box.
- Use case: intro/outro gradient, mid-roll lower third with creator name, section divider.
- Merai exports already support transitions/effects in the EDL; this is UI + renderer instruction.

**What it does:**
Two overlay types, both optional and template-based:

1. **Gradient Overlays** — a semi-transparent linear or radial gradient (start/end colors from Brand Kit) placed on-screen for N frames (intro/outro default 24 frames, fade-in/out). E.g., "blue-to-transparent bottom 30%."
2. **Lower Thirds** — created from Brand Kit (logo + creator name + optional title), animated in (slide up 0.3s) and out (slide down 0.3s), pinned to 3-second default duration on mid-roll segment. E.g., "Jordan | Video Creator" with channel logo and brand colors.

Both are **optional suggestions** from the AI brain (when planning a section introduction or outro), and the UI toggles them on/off before export.

**Existing assets:**
- EDL v2 supports effects metadata (`effectsSchema` JSONB).
- FFmpeg renderer already chains overlays (captions, watermarks).
- Canvas can render gradient + text (logo is a storage asset).

**Scope — minimal MVP:**
- 3 gradient presets (bottom-fade, full-blend, accent-bar).
- 1 lower-third template per Brand Kit (static placement, auto-fit name).
- Durations fixed (intro 24 frames, lower-third 3s, outro 24 frames).
- Togglable on export config; AI suggests but doesn't force.

**Non-scope:**
- Custom gradient UI; multi-template library; animated logo; keyframe effects; per-segment lower-third customization.

---

## 3. Creator onboarding & dashboard redesign

### Feature Group 4: Premium Onboarding Flow

**Current state:** Build 6A added a dismissible 4-step callout; creator lands on an empty dashboard with "Upload your first video."

**Problem:** New creators don't know the workflow end-to-end; no context on what "AI edits" means; no urgency or sense of capability.

**What it does:**
A **multi-step guided onboarding wizard** (modal or slide sequence) that:
1. Sets channel name + avatar (stored in `auth.user_metadata`).
2. Invites Brand Kit setup (3 colors, caption font, lower-third name) — can skip, but strongly encouraged.
3. Shows example: "Here's what Merai edits: cuts, pacing, caption placement" + screenshot carousel.
4. Uploads their first video with **auto-detect category** (podcast, tutorial, short-form reel, vlog, lecture) to suggest AI intent.
5. Confirms preferences (style intent from 6A, caption preset default).
6. Lands on the editor with a "First edit incoming" status and a tip panel.

**Scope:**
- 5-screen modal flow, ~5 min to complete.
- Brand Kit form inline (not a separate "Settings → Brand Kit" buried page).
- Category selector (autocomplete, optional; AI infers from content).
- Persisted state in `auth.user_metadata` (onboarding_complete_at, channel_name, avatar_url).

**Non-scope:**
- Video tutorial embeds; template picker; sample video library; growth metrics tracking.

### Feature Group 5: Dashboard Redesign

**Current state:** Empty state has 4-step workflow callout; project grid shows status chips.

**What we need:**
A dashboard that tells the creator: **"Here's what you've created, what's happening now, and what's next."**

**Layout (new):**
```
┌─────────────────────────────────────────────┐
│ "Ready to make magic?" + [Upload Video CTA] │  ← hero/empty state
├─────────────────────────────────────────────┤
│ Quick stats:  📊 3 videos  ⏱ 12.5 hours    │  ← summary (if projects exist)
├─────────────────────────────────────────────┤
│ Recent projects:                            │
│ ┌──────────────────────────────────────────┐│
│ │ Podcast Ep. 3                            ││  ← 4-card grid, sortable
│ │ Status: Ready to export  [Export] [Edit] ││
│ └──────────────────────────────────────────┘│
├─────────────────────────────────────────────┤
│ [Settings] [Brand Kit] [Caption Presets]    │  ← one-click access
└─────────────────────────────────────────────┘
```

**Cards show:**
- Thumbnail (first frame of video).
- Title (editable inline).
- Status + action CTA (if ready, [Export]; if processing, progress; if errored, [Retry]).
- Quick stats (duration, cuts made, captions count).
- Edit/export shortcuts.

**Scope:**
- Grid layout (responsive 1–4 columns).
- Sort by date, alphabetical, status.
- Inline title edit (click-to-edit, blur-to-save).
- One-click Brand Kit editor on dashboard (modal).
- Caption Preset picker in export panel (new).

**Non-scope:**
- Collaboration/sharing; export history; analytics dashboard; team workspace.

---

## 4. Export experience redesign

**Current state:** Export panel shows format (MP4/WebM) and renders asynchronously; success is a download button.

**Problem:** Creators don't see the *brand effect* until after download; they can't preview how their Brand Kit colors + Caption Preset looks.

**What it does:**

**Export Preview (new):**
Before committing the export, show a 3-second clip preview:
- 1s of the edited video (sampled from the middle segment).
- Captions in the selected preset + brand colors.
- Gradient overlay or lower-third (if enabled).
- Label: "Your export will look like this."

This is a **browser-side preview** (re-use the editor's video + canvas rendering) showing exactly what the server will produce.

**Export config flow (revised):**
1. Choose format (MP4, WebM).
2. Pick caption preset (visual selector: 4 cards showing sample text in each style).
3. Toggle overlays (checkbox: "Intro/outro gradient," "Add lower third").
4. [Preview] — shows the 3-second clip in a modal.
5. [Export] — triggers the render job.
6. Panel shows progress + [Download] when ready.

**Post-export receipt:**
After export succeeds, show a **share-ready card:**
```
┌──────────────────────────────────────────┐
│ ✓ Your video is ready!                   │
├──────────────────────────────────────────┤
│ [Download] [Copy link] [Share to Twitter]│
├──────────────────────────────────────────┤
│ Stats: 5m 22s | 340 captions | 8 cuts    │
└──────────────────────────────────────────┘
```

**Scope:**
- Canvas-based preview using existing caption + overlay renderer.
- Share link (signed URL, expiring).
- Social meta tags (Twitter/OG) with thumbnail.
- Stats persisted on export row.

**Non-scope:**
- Per-platform (YouTube, TikTok, Instagram) export profiles; custom watermarks; advanced color grading; codec selection.

---

## 5. Competitive differentiation strategy

### How Merai wins

| Feature | Merai differentiator | Why it matters |
|---------|---------------------|----------------|
| **AI planning** | Holistic intent (not just B-roll or best moments); edits pacing, not just clips | Results in publish-ready output, not template-fill |
| **Brand control** | Kit is compact but *required* first step; forces creators to think about identity | Consistency → channel recognition → growth |
| **Caption Studio** | Presets are AI-aware; the AI suggests preset by content type, not generic | "This tutorial gets the formal preset" vs. random |
| **Export preview** | See final result before committing | Confidence + no re-renders on disappointment |
| **Arabic-first** | Native RTL, Arabic-optimized fonts (IBM Plex), shaping via HarfBuzz | OpusClip/CapCut still default to broken RTL; Descript ignores Arabic; Submagic is weak on MENA |
| **Cost + speed** | Server-side rendering (no wasm complexity); exports in ~1 min vs. 15+ in browser | Creators don't abandon the tool mid-export |

### Weaknesses vs. competitors

| Competitor | Their strength | Our response |
|------------|----------------|--------------|
| **CapCut** | Massive preset library, recording built-in, mobile-first | We don't try; focus on *precision* editing, not template churn |
| **OpusClip** | Human selects moments (more trustable than AI), YouTube-first | Our AI edits *pacing* not just selects; appeals to podcast/long-form creators |
| **Submagic** | B-roll + auto-color-grade + templates | We embed brand control, not templates; AI respects creator intent |
| **Descript** | Transcript-as-interface (text editing = video editing) | Our SDN: video→AI reasoning→commands; appealing to visual-first creators |
| **Tella** | Screen recording + scenes + re-record | Build 7 future; for now, we stay web-native, focus on long-form polish |

**Market position post-Build 6B:** "AI editor that understands your content and produces branded, publish-ready videos — without the template churn."

---

## 6. Files to modify / create

### Core (types)

| File | Change | Why |
|------|--------|-----|
| `packages/core/src/edl.ts` | Add `overlayType` enum (gradient, lower-third) and `overlaySegment` schema | Represent overlays in the EDL |
| `packages/core/src/caption-styles.ts` | Expand `CaptionStyle` schema (preset_id fk, animation, duration_override) | Preset metadata in renderer instructions |

### Database (migrations)

| Migration | Tables | Why |
|-----------|--------|-----|
| `migration_9_brand_kit.sql` | `creator_brand_kit` (user_id pk, primary_color, accent_color, font_id, lower_third_template_json) | Per-user brand settings |
| `migration_10_presets.sql` | `caption_presets` (id, name, font_size, weight, bg_style, animation, duration_ms) | 4 built-in presets + user favorites |
| `migration_11_export_config.sql` | `exports.caption_preset_id`, `exports.gradient_enabled`, `exports.lower_third_enabled`, `exports.stats_json` | Export options + receipt data |

### Web UI

| Component | File | Purpose |
|-----------|------|---------|
| **Onboarding** | New: `components/onboarding-wizard.tsx` | 5-step guided setup (name, Brand Kit, category, preferences) |
| **Brand Kit** | New: `components/brand-kit-form.tsx` + modal in dashboard | Color picker (3), font selector (4), lower-third preview |
| **Caption Studio** | New: `components/caption-preset-picker.tsx` | 4-card visual selector for presets |
| **Export Preview** | New: `components/export-preview.tsx` | Canvas-based 3s clip preview |
| **Dashboard** | Modify: `app/[locale]/dashboard/page.tsx` | Grid + stats + Brand Kit one-click access |
| **Export panel** | Modify: `components/export-panel.tsx` | Config flow (format → preset → overlays → preview → export) |
| **Project card** | Modify: `components/project-card.tsx` | Show thumbnail, inline title edit, stats |

### i18n

| Keys | Scope | Count |
|------|-------|-------|
| `onboarding.*` | Wizard screens (5 steps) | 20+ keys |
| `brand_kit.*` | Form labels, help text | 15+ keys |
| `caption_presets.*` | Preset names, descriptions | 10+ keys |
| `export.*` | Config labels, preview, receipt | 15+ keys |
| `dashboard.*` | Stats, empty state, menu | 10+ keys |

All in `messages/{ar,en}.json` (Arabic first per house rule).

### Worker

| File | Change | Why |
|------|--------|-----|
| `apps/worker/src/jobs/render-export.ts` | Read Brand Kit + presets + overlay flags; pass to renderer | Enforce style during render |
| `apps/worker/src/render/caption-renderer.ts` | Use preset metadata; apply animation/color from Brand Kit | Preset-aware caption rendering |
| `apps/worker/src/render/overlay-renderer.ts` | New: render gradients + lower-thirds | Overlay generation |

---

## 7. Implementation plan (feature build order)

### Phase 1: Database + core types
1. Create migrations (Brand Kit, presets, export config).
2. Expand EDL + caption schemas.
3. Add core tests (round-trip, schema validation).

### Phase 2: Brand Kit UX (creator ownership)
1. Build `BrandKitForm` (color picker, font selector, preview).
2. Integrate into dashboard (one-click modal).
3. Add i18n keys (ar/en).
4. Test: form submit → DB persist → read on export config.

### Phase 3: Caption presets + export config
1. Build `CaptionPresetPicker` (4-card visual selector).
2. Integrate into export panel (flow: format → preset → overlays).
3. Add i18n.
4. Test: preset selection → stored on export row.

### Phase 4: Export preview + receipt
1. Build `ExportPreview` (canvas-based 3s clip).
2. Integrate into export panel (preview modal).
3. Add receipt card (stats, share options).
4. Test: preview renders correctly; receipt shows on export success.

### Phase 5: Dashboard + onboarding
1. Redesign dashboard (grid, stats, Brand Kit access).
2. Build `OnboardingWizard` (5 steps, Brand Kit inline).
3. Add i18n.
4. Test: first-time user flow → wizard → Brand Kit set → dashboard.

### Phase 6: Renderer updates (worker)
1. Update caption renderer (read preset, apply style).
2. Add overlay renderer (gradients, lower-thirds).
3. Update export job to read config + apply.
4. Test: E2E export with presets + overlays.

### Phase 7: Verification + polish
1. Full test suite (core, web, worker).
2. `next build` + RTL check.
3. Live E2E (create project → set Brand Kit → export with preset + overlays).

---

## 8. Risk mitigation

### Risk 1: Color picker accessibility + Arabic RTL
**Problem:** Color pickers often have LTR-only UIs; Arabic users expect logical placement.
**Mitigation:**
- Use a library-neutral swatch grid (6×6 colors) with logical flexbox.
- Custom color input: label-first (rtl-safe), value in a text input.
- Test with screen readers + Arabic keyboard.

### Risk 2: Font rendering variance (server vs. browser preview)
**Problem:** Canvas fonts may render differently than the browser's text.
**Mitigation:**
- Preview canvas uses the same @napi-rs/canvas instance as the server.
- Both use IBM Plex Sans Arabic (vendored TTF).
- Add a test: export → download → hash → compare to preview canvas output.

### Risk 3: Preset overload (AI suggestions conflict with user choice)
**Problem:** If AI suggests preset A but creator prefers preset B, who wins?
**Decision:** User choice always wins. AI suggests on first export; user can override.
**Mitigation:** Export flow: preset picker shows *all* 4, highlights AI suggestion, but allows override.

### Risk 4: Lower-third logo asset management
**Problem:** Creator uploads a logo; what if they delete it? What if it's too small/wrong ratio?
**Mitigation:**
- Logo is optional; lower-third works without it.
- Stored as `lower_third_template.logo_asset_id` (fk to `storage` object).
- Renderer validates asset exists before render; if missing, renders without logo + logs.
- Creator gets a warning: "Logo not found; lower third will render without it."

### Risk 5: Export config explosion (too many toggle states)
**Problem:** Format × Preset × Gradient × LowerThird = 4×2×2×2 = 32 combos; UI gets complex.
**Mitigation:**
- Start with MVP: format + preset + (gradient + lower-third as a single toggle).
- A/B test: does separating the toggles improve UX, or is one "visual effects" toggle enough?
- Deferred: per-segment overlay customization (Build 6C+).

### Risk 6: i18n key drift (ar/en mismatch)
**Problem:** 70+ new keys; one omission breaks the app.
**Mitigation:**
- Both files edited in same commit.
- Pre-commit: jq key diff (ar keys count = en keys count).
- Test: render a component in both locales; missing key throws.

---

## 9. Success metrics (post-build)

### Product metrics
- **Time to first export:** < 8 min from signup (onboarding + upload + export).
- **Export preview engagement:** 70%+ of creators use the preview before exporting.
- **Brand Kit adoption:** 80%+ of returning creators complete a Brand Kit.
- **Caption preset diversity:** presets used roughly evenly (no one dominates).

### Quality metrics
- **RTL coverage:** 100% of new UI tested in Arabic (accessibility audit).
- **Export consistency:** preview canvas output ≈ server render (spot-check 10 exports).
- **i18n parity:** ar/en key counts equal; no untranslated strings.

### System metrics
- **Export time:** ≤ 90s (render + caption + overlay + encoding, 5-min video).
- **Dashboard load:** < 1.5s (stats computed server-side, no N+1).
- **Onboarding completion:** 85%+ of new users reach "Ready to export" state.

---

## 10. Deferred ideas (Build 6C+)

- **AI caption tuning:** collect preset feedback → fine-tune prompt per creator style.
- **Custom preset creation:** UI to save creator's own preset (duration, color, animation combo).
- **Multi-language caption export:** auto-translate captions to Spanish/French/German.
- **Advanced overlays:** per-segment lower-thirds, keyframed animations, 3D text effects.
- **Export profiles:** one-click YouTube / TikTok / Instagram optimization (aspect ratio, captions position, etc.).
- **Performance tuning:** parallel caption + overlay rendering to reduce export time.
- **Analytics dashboard:** views per export, retention per video style, preset adoption trends.

---

## 11. Competitive positioning summary

**Pre-Build 6B:** Merai is a smart editor but visually generic.
**Post-Build 6B:** Merai is "the Arabic-first AI editor for creators who want control over their brand."

Key unlock:
- **Brand Kit** → creators own the visual identity.
- **Caption Presets** → results are immediately polished (not generic overlays).
- **Export preview** → trust before committing.
- **Streamlined dashboard** → onboarding to export in one session.

This positions Merai as the choice for:
- **Arabic-speaking creators** who need RTL-native tools + Arabic font shaping.
- **Podcast/long-form editors** who want AI pacing, not just clip selection.
- **Repeat creators** who value brand consistency (not template churn).

---

## 12. Building in order (strict dependencies)

1. **Must precede everything:** Migrations (Brand Kit, presets, export config).
2. **Can parallelize (1-2 sprints):**
   - Brand Kit form + dashboard integration.
   - Caption preset picker + export flow update.
   - Onboarding wizard.
3. **Depends on (2):** Export preview (uses preset data).
4. **Final (depends on 3):** Renderer updates + live E2E.

**Estimated effort:** 3–4 weeks (one engineer, daily PR cycle, live E2E at the end per Build pattern).

