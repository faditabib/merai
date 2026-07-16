# Graph Report - Merai app  (2026-07-16)

## Corpus Check
- 215 files · ~133,559 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1568 nodes · 2591 edges · 154 communities (97 shown, 57 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `dbadea57`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- EDL Domain & Editing Ops
- Web Upload & Project UI
- Worker Job Queue Core
- Web Package Manifest
- Server Render Pipeline
- AI Analysis & EDL Builder
- Transcription Providers
- Worker Package Manifest
- Web TypeScript Config
- Decisions & Phase History
- Database Schema & RLS
- Resumable Upload (tus)
- Core Package Manifest
- Root Workspace Manifest
- i18n Routing & Proxy
- Worker TypeScript Config
- Core TypeScript Config
- Next.js 16 Conventions Docs
- Next Config
- ESLint Config
- Next Env Types
- PostCSS Config
- Graphify Workflow Docs
- Analysis Migration
- Server Rendering Migration
- Enum-as-Text Decision
- Merai — Architectural Decisions
- 1. Current architecture (verified from source, not docs)
- What You Must Do When Invoked
- edl-v2.ts
- graphify reference: extra exports and benchmark
- railway.json
- graphify reference: query, path, explain
- Merai (مِيراي)
- README.md
- graphify reference: add a URL and watch a folder
- graphify reference: commit hook and native CLAUDE.md integration
- graphify reference: incremental update and cluster-only
- vercel.json
- graphify reference: GitHub clone and cross-repo merge
- graphify reference: transcribe video and audio
- AGENTS.md
- apply-migration.ts
- CLAUDE.md
- CLAUDE.md
- extraction-spec.md
- 20260710120000_export_parts.sql
- apps/web CLAUDE.md includes AGENTS.md
- apps/web README (stock create-next-app boilerplate)
- Graphify Knowledge Graph Workflow
- Exported captions rasterized by the browser, never ffmpeg
- Brand terms: custom_spelling adopted, word_boost rejected
- EDL: versioned, immutable, append-only JSON (v1 single-track)
- Export resolution: 720-class per aspect ratio
- Export: single-threaded ffmpeg.wasm core, self-hosted
- i18n: next-intl, Arabic default at root path
- Typography: IBM Plex Sans Arabic single family
- Browser locale detection disabled
- Monorepo via npm workspaces
- Next.js 16 conventions (proxy.ts, async params)
- DB-level tests on PGlite applying real migrations
- Job queue: Postgres with FOR UPDATE SKIP LOCKED
- Pipeline status on projects.status; frontend polls
- Retention windows: raw 30 days, exports 90 days
- Export renders SEGMENT-WISE; single filter graphs banned for cuts
- Storage layout: owner-uuid-prefixed paths in private buckets
- Auth: Supabase email+password
- 10-minute cap enforced in three layers, no ffprobe
- Timeline direction: LTR always, even in RTL UI
- Transcription behind a provider interface; mock keyless default
- Transcripts: normalized words + raw provider payload
- Resumable uploads: tus-js-client, 6 MiB chunks
- Worker runs TypeScript directly via tsx
- Phase 0 — Project scaffolding & architecture
- Phase 1 — Upload & transcription pipeline (live-verified)
- Phase 2 — AI analysis layer (Haiku engine, EDL builder)
- Phase 3 — Review & text-based editing UI
- Phase 4 — Export pipeline, ffmpeg.wasm (live-verified)
- Phase 4 — 10-minute export stress test (resolved segment-wise)
- Merai Ground Rules (i18n strings, logical CSS, Haiku-only, signed URLs, no tracking)
- Merai — AI Video Editing OS for Arabic Creators
- Merai Product Audit — from Developer Tool to Premium Creator Platform
- Build 6A Report — Creator Experience Layer
- routing.ts
- RenderRequest
- Build 6B.2 Analysis — Caption Studio + Creator Presets
- storage.ts
- runner.ts
- createClient
- projects.ts
- project-status-view.tsx
- Build 6C Analysis — Creator Experience Layer
- editor-view.tsx
- Build 5.5 Analysis — AI Editing Brain v1
- Build 6A — Visual QA Report
- Production Alignment Report
- 20260711130000_ai_suggestions.sql
- TranscriptWord
- Build 5.6 Analysis — AI Brain UX Polish + Feedback Loop
- 20260711160000_ai_feedback_prefs.sql
- edl-ops.ts
- caption-studio.tsx
- export-plan.ts
- upload-flow.tsx
- brand-kit-form.tsx
- Build 6B.1 Report — Creator Identity Layer
- Build 6B Analysis — Creator Productization
- export-panel.tsx
- 7. Implementation plan (feature build order)
- Phase 4 — Export pipeline, ffmpeg.wasm (BUILT, live-verified 2026-07-09)
- 8. Risk mitigation
- Phase 3 — Review & text-based editing UI (BUILT, live-verified 2026-07-09)
- 6. Files to modify / create
- 1. What was built
- 2. Strategic features for Build 6B
- 9. Success metrics (post-build)
- 20260711200000_brand_kits.sql
- Phase A — Production hardening + first deploys (2026-07-10)
- 20260712120000_caption_studio.sql
- Phase 2 — AI analysis layer (BUILT, live-verified 2026-07-08)
- Phase 1 — Upload & transcription pipeline (overnight 2026-07-08, mock-verified)
- Phase 0 — Project scaffolding & architecture (2026-07-08)
- Phase 4.5 — Server-side rendering pivot (BUILT + live-verified 2026-07-10)
- logger.ts
- render-export.test.ts
- generate-edl.test.ts
- transcribe.ts
- Build 6C.1 Report — Tajawal UI + Creator Dashboard + Thumbnails
- Build 6C.1 Analysis — Tajawal UI + Creator Dashboard + Thumbnails
- Build 6C.2 Analysis — Creator Styles System
- Build 6C.2 Report — Creator Styles System
- brand-kit-form.tsx
- logger.ts
- limits.ts
- Railway worker deploy + production render test (2026-07-11)
- fillers.ts
- EdlV1
- creator-styles.ts
- edl.ts
- generate-edl.test.ts
- Build 7.2 Analysis — Screen + Camera Recording, PiP, Preferences
- Build 7.1 Report — Recording Foundation (Creator Studio)
- Build 7.3 Analysis — Teleprompter, Speaker Notes, Countdown Controls
- Build 7.2 Report — Screen + Camera Recording, PiP, Preferences
- Build 7.3 Report — Teleprompter, Speaker Notes, Countdown Controls
- edl.ts

## God Nodes (most connected - your core abstractions)
1. `Merai — Architectural Decisions` - 42 edges
2. `TranscriptWord` - 38 edges
3. `EdlV1` - 29 edges
4. `Merai — Progress Log` - 26 edges
5. `createClient()` - 23 edges
6. `getDb()` - 22 edges
7. `log` - 21 edges
8. `createClient()` - 20 edges
9. `CaptionStyleSpec` - 18 edges
10. `compilerOptions` - 16 edges

## Surprising Connections (you probably didn't know these)
- `CreatorStylePreviewProps` --references--> `CreatorStyle`  [EXTRACTED]
  apps/web/src/components/creator-style-preview.tsx → packages/core/src/creator-styles.ts
- `EditorView()` --indirect_call--> `seconds()`  [INFERRED]
  apps/web/src/components/editor/editor-view.tsx → packages/core/src/export-plan.ts
- `CreatorStylesProps` --references--> `CreatorStyle`  [EXTRACTED]
  apps/web/src/components/creator-styles.tsx → packages/core/src/creator-styles.ts
- `CaptionOverlayProps` --references--> `EdlV1`  [EXTRACTED]
  apps/web/src/components/editor/caption-overlay.tsx → packages/core/src/edl.ts
- `CaptionOverlayProps` --references--> `TranscriptWord`  [EXTRACTED]
  apps/web/src/components/editor/caption-overlay.tsx → packages/core/src/transcript.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Client-side Export Rendering System (ffmpeg.wasm)** — decisions_ffmpeg_wasm_single_thread, decisions_browser_rasterized_captions, decisions_segment_wise_rendering, decisions_export_resolution_720, progress_phase4_export_pipeline, progress_phase4_stress_test [EXTRACTED 1.00]
- **AssemblyAI Transcription Pipeline Decisions** — decisions_transcription_provider_interface, decisions_arabic_auto_detection, decisions_custom_spelling_brand_terms, decisions_ten_minute_cap, decisions_transcripts_normalized_plus_raw [EXTRACTED 1.00]
- **Arabic-first RTL Design System** — decisions_i18n_next_intl_arabic_default, decisions_locale_detection_disabled, decisions_ibm_plex_sans_arabic, decisions_timeline_ltr [INFERRED 0.85]

## Communities (154 total, 57 thin omitted)

### Community 0 - "EDL Domain & Editing Ops"
Cohesion: 0.06
Nodes (32): 10. Backward-compatibility guarantees (explicit), 1. Current state (after Build 6B.2), 2. UX gaps (what makes this "developer feature," not "studio"), 3.1 An 8-preset creator catalog (core data), 3.2 One shared preview renderer (kills U6), 3.3 Live controls (kills U2), 3.4 Default preference (kills nothing new to DB except one column), 3.5 Export "your video style" card (kills U5) (+24 more)

### Community 1 - "Web Upload & Project UI"
Cohesion: 0.12
Nodes (11): UploadFlow(), UploadFlowProps, UploadState, probeVideoDurationSeconds(), createResumableUpload(), ResumableUploadHandle, ResumableUploadOptions, supabaseTusEndpoint() (+3 more)

### Community 2 - "Worker Job Queue Core"
Cohesion: 0.18
Nodes (8): 1. Deployment summary, 2. Live E2E — method, 3. Live E2E — results, 4. Live finding (fixed same session) — caption/lower-third collision, 5. Final state, 6. What is NOT done (out of scope for 6B.1, unchanged), 7. Follow-ups worth noting, Build 6B.1 Production Report — Creator Identity Layer, Deployed & Verified

### Community 3 - "Web Package Manifest"
Cohesion: 0.04
Nodes (48): dependencies, @merai/core, next, next-intl, react, react-dom, @supabase/ssr, @supabase/supabase-js (+40 more)

### Community 4 - "Server Render Pipeline"
Cohesion: 0.15
Nodes (16): images, line, renderBrandImages(), renderGradientImage(), renderLogoImage(), renderLowerThirdImage(), rgba(), captionSpecAboveLowerThird() (+8 more)

### Community 5 - "AI Analysis & EDL Builder"
Cohesion: 0.08
Nodes (33): ANALYSIS_TOOL, HaikuAnalysisEngine, MessageCreator, renderTranscript(), HeuristicAnalysisEngine, createAnalysisEngine(), AnalysisEngine, AnalysisInput (+25 more)

### Community 6 - "Transcription Providers"
Cohesion: 0.09
Nodes (26): enqueueAnalyze(), ProjectRow, transcribe(), transcribeWithProvider(), UploadRow, AssemblyAIProvider, AssemblyAIProviderOptions, CUSTOM_SPELLING (+18 more)

### Community 7 - "Worker Package Manifest"
Cohesion: 0.06
Nodes (34): @anthropic-ai/sdk, dependencies, @anthropic-ai/sdk, dotenv, @merai/core, @napi-rs/canvas, pg, @supabase/supabase-js (+26 more)

### Community 8 - "Web TypeScript Config"
Cohesion: 0.06
Nodes (30): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+22 more)

### Community 10 - "Database Schema & RLS"
Cohesion: 0.21
Nodes (18): exports_set_updated_at, jobs_set_updated_at, on_auth_user_created, profiles_set_updated_at, projects_set_updated_at, public.claim_next_job(), public.edl_versions, public.exports (+10 more)

### Community 11 - "Resumable Upload (tus)"
Cohesion: 0.08
Nodes (44): Phase, RecordFlow(), SetupError, Take, TeleprompterOverlay(), TeleprompterOverlayProps, attachVideo(), clampPipWidth() (+36 more)

### Community 12 - "Core Package Manifest"
Cohesion: 0.11
Nodes (17): dependencies, zod, description, devDependencies, typescript, vitest, exports, typescript (+9 more)

### Community 13 - "Root Workspace Manifest"
Cohesion: 0.12
Nodes (16): description, engines, node, name, private, scripts, build, dev (+8 more)

### Community 14 - "i18n Routing & Proxy"
Cohesion: 0.11
Nodes (18): Build 5.5 — AI Editing Brain v1 (2026-07-11), Build 5.6 — AI Brain UX polish + feedback loop (2026-07-11), Build 5 — Professional editing core: EDL v2 foundation (2026-07-11), Build 6A.1 — Visual QA fixes + production redeploy (2026-07-11), Build 6A — Creator experience layer (2026-07-11), Build 6B.1 — Creator Identity Layer (2026-07-11), Build 6B.2 — Caption Studio (2026-07-12), Build 6B.3 — Caption Studio UX (2026-07-12) (+10 more)

### Community 15 - "Worker TypeScript Config"
Cohesion: 0.12
Nodes (15): compilerOptions, isolatedModules, lib, module, moduleResolution, noEmit, noUncheckedIndexedAccess, skipLibCheck (+7 more)

### Community 16 - "Core TypeScript Config"
Cohesion: 0.14
Nodes (13): compilerOptions, isolatedModules, lib, module, moduleResolution, noEmit, noUncheckedIndexedAccess, skipLibCheck (+5 more)

### Community 31 - "Merai — Architectural Decisions"
Cohesion: 0.05
Nodes (42): 2026-07-08 — 10-minute cap enforced in three layers, no ffprobe infra, 2026-07-08 — Arabic language handling: keep auto-detection, no pin, 2026-07-08 — Auth: Supabase email+password to start, 2026-07-08 — Brand terms: AssemblyAI custom_spelling adopted, word_boost rejected, 2026-07-08 — Browser locale detection disabled, 2026-07-08 — DB-level tests run on PGlite applying the real migrations, 2026-07-08 — EDL is versioned, immutable, append-only JSON (v1 single-track), 2026-07-08 — Enum-like columns are text + CHECK constraints, not Postgres enums (+34 more)

### Community 32 - "1. Current architecture (verified from source, not docs)"
Cohesion: 0.07
Nodes (25): 1.1 EDL v1 — the single source of truth ([edl.ts](packages/core/src/edl.ts)), 1.2 Editing operations ([edl-ops.ts](packages/core/src/edl-ops.ts)), 1.3 Editor state ([editor-view.tsx](apps/web/src/components/editor/editor-view.tsx)), 1.4 Rendering pipeline ([export-plan.ts](packages/core/src/export-plan.ts) → [render-export.ts](apps/worker/src/handlers/render-export.ts)), 1.5 Database ([init migration](supabase/migrations/20260708000000_init.sql:162)), 1. Current architecture (verified from source, not docs), 2. Limitations blocking professional editing, 3. Migration risks (+17 more)

### Community 33 - "What You Must Do When Invoked"
Cohesion: 0.07
Nodes (26): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+18 more)

### Community 34 - "edl-v2.ts"
Cohesion: 0.08
Nodes (24): Asset, assetSchema, CaptionsMode, captionsModeSchema, clipSchema, ClipV2, DowngradeRefusalReason, DowngradeResult (+16 more)

### Community 35 - "graphify reference: extra exports and benchmark"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 36 - "railway.json"
Cohesion: 0.25
Nodes (7): build, builder, dockerfilePath, deploy, restartPolicyMaxRetries, restartPolicyType, $schema

### Community 37 - "graphify reference: query, path, explain"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 38 - "Merai (مِيراي)"
Cohesion: 0.33
Nodes (5): Deployment, Getting started, Ground rules (see PRD + DECISIONS.md), Merai (مِيراي), Repository layout

### Community 39 - "README.md"
Cohesion: 0.50
Nodes (3): Deploy on Vercel, Getting Started, Learn More

### Community 40 - "graphify reference: add a URL and watch a folder"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 41 - "graphify reference: commit hook and native CLAUDE.md integration"
Cohesion: 0.50
Nodes (3): For git commit hook, For native CLAUDE.md integration, graphify reference: commit hook and native CLAUDE.md integration

### Community 42 - "graphify reference: incremental update and cluster-only"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

### Community 87 - "Merai Product Audit — from Developer Tool to Premium Creator Platform"
Cohesion: 0.05
Nodes (37): 1. First-Time User Journey, 2. Upload Experience, 3. Processing States (Transcribing → Analyzing → Ready), 4. Editor UX, 5. AI Feedback Visibility, 6. Premium SaaS Gaps, Audit findings, Audit findings (+29 more)

### Community 88 - "Build 6A Report — Creator Experience Layer"
Cohesion: 0.10
Nodes (18): 1. Current UX problems (verified in source), 2. Existing reusable assets, 3. Files to modify, 4. Implementation plan, 5. Risks, Build 6A Analysis — Creator Experience Layer, 1. Features implemented, 2. Files changed (+10 more)

### Community 89 - "routing.ts"
Cohesion: 0.19
Nodes (10): LocaleLayout(), plexArabic, tajawal, dirFor(), Locale, routing, updateSession(), config (+2 more)

### Community 90 - "RenderRequest"
Cohesion: 0.10
Nodes (24): AiAssistantPanel(), FEEDBACK_REASONS, INTENTS, PRESET_KEYS, SuggestionRow, AI_EDIT_CATEGORIES, AI_EDIT_COMMAND_TYPES, AI_FEEDBACK_REASONS (+16 more)

### Community 91 - "Build 6B.2 Analysis — Caption Studio + Creator Presets"
Cohesion: 0.07
Nodes (27): 10. Backward-compatibility guarantees (explicit), 1. Current caption pipeline (verified in source), 2. Existing style tokens, 3. Brand Kit integration (today vs. target), 4. Database needs, 5. Proposed scope, 6. UX flow, 7. Files to touch (+19 more)

### Community 92 - "storage.ts"
Cohesion: 0.06
Nodes (29): 1. Current pipeline audit, 2.1 Logo / watermark layer (the core new capability), 2.2 Lower Third Studio (modest expansion), 2.3 Overlay Studio + Lower Third Studio UI (Brand Kit), 2.4 Layer order (align to the approved canonical order), 2.5 Creator Styles integration, 2. Required changes, 3. Export parity (no fake preview) (+21 more)

### Community 94 - "createClient"
Cohesion: 0.15
Nodes (14): DashboardPage(), ProjectRow, BrandSetupNudge(), ProjectCard(), ProjectCardProps, STATUS_STYLES, cache, ProjectThumbnail() (+6 more)

### Community 95 - "projects.ts"
Cohesion: 0.17
Nodes (10): GET(), BrandKitPage(), NewProjectPage(), OnboardingPage(), RecordPage(), AppHeader(), BrandKitForm(), SignOutButton() (+2 more)

### Community 96 - "project-status-view.tsx"
Cohesion: 0.33
Nodes (9): ACTIVE_STATUSES, ASPECT_RATIOS, ExportPanel(), ExportPanelProps, ExportRow, ExportRow, BrandExportConfig, hueName() (+1 more)

### Community 97 - "Build 6C Analysis — Creator Experience Layer"
Cohesion: 0.15
Nodes (13): 10. Risks & mitigations, 11. Explicit scope boundaries for 6C, 12. Open decisions for approval, 1. Current-state audit (after 6B.3), 2. Feature area A — Creator Onboarding Wizard, 3. Feature area B — Creator Presets ("Creator Styles"), 4. Feature area C — Overlay Studio, 5. Feature area D — Tella-style Recording (architecture ONLY, do not build) (+5 more)

### Community 98 - "editor-view.tsx"
Cohesion: 0.23
Nodes (12): AiDecisionCard(), EditorView(), ShortcutsHelp(), ReorderDrag, Timeline(), TrimDrag, applyEditCommands(), edlOutputDurationMs() (+4 more)

### Community 99 - "Build 5.5 Analysis — AI Editing Brain v1"
Cohesion: 0.11
Nodes (17): 1. Existing EDL v2 architecture (Build 5), 2. Existing edit-command system (Build 5 — built for exactly this), 3. Current AI analysis pipeline (integration template), 4. Where the Brain integrates (chosen design), 5. Database/storage impact, 6. Risks, Build 5.5 Analysis — AI Editing Brain v1, Build 5.5 Report — AI Editing Brain v1 (+9 more)

### Community 100 - "Build 6A — Visual QA Report"
Cohesion: 0.25
Nodes (7): Bugs 🐞, Build 6A — Visual QA Report, Coverage notes, Inconsistencies ⚠️, Polish opportunities ✨, Suggested fix order (when implementation resumes), Verified working ✅

### Community 101 - "Production Alignment Report"
Cohesion: 0.29
Nodes (6): 1. Deployment versions (verified, not assumed), 2. Environment variables (names verified, values never displayed), 3. Production smoke test — full creator flow, 4. Blockers / owner actions, 5. Conclusion, Production Alignment Report

### Community 103 - "TranscriptWord"
Cohesion: 0.13
Nodes (28): CaptionPreview(), CaptionPreviewProps, captionSpanStyle(), anchorToPosition(), CaptionStudio(), CaptionStudioProps, DEFAULT_OUTLINE, Position (+20 more)

### Community 104 - "Build 5.6 Analysis — AI Brain UX Polish + Feedback Loop"
Cohesion: 0.10
Nodes (18): 1. Current AI assistant panel ([ai-assistant-panel.tsx](apps/web/src/components/editor/ai-assistant-panel.tsx)), 2. Current ai_suggestions schema (migration 7), 3. Existing edit command metadata, 4. Existing undo/version system (safety is already structural), 5. Best place for feedback storage, 6. Intent memory without hidden profiling, 7. UX wins with zero architecture change, Build 5.6 Analysis — AI Brain UX Polish + Feedback Loop (+10 more)

### Community 105 - "20260711160000_ai_feedback_prefs.sql"
Cohesion: 0.50
Nodes (3): ai_preferences_set_updated_at, public.ai_preferences, public.ai_suggestions

### Community 106 - "edl-ops.ts"
Cohesion: 0.29
Nodes (13): applyEditCommand(), nextSegmentId(), outputToSourceMs(), removeWords(), reorderSegment(), restoreRemoved(), rippleDeleteSegment(), splitSegmentAt() (+5 more)

### Community 107 - "caption-studio.tsx"
Cohesion: 0.16
Nodes (18): LOGO_TYPES, OnboardingWizard(), TYPE_ICONS, AI_INTENTS, AiIntent, hexColorSchema, captionStyleSpecSchema, CREATOR_STYLE_IDS (+10 more)

### Community 108 - "export-plan.ts"
Cohesion: 0.20
Nodes (11): CaptionLine, buildExportPlan(), CaptionOverlayPlan, CaptionSequenceEntry, ENCODE_ARGS, EXPORT_RESOLUTIONS, ffconcatScript(), seconds() (+3 more)

### Community 109 - "upload-flow.tsx"
Cohesion: 0.12
Nodes (6): Db, OutputTooLargeError, createTestDb(), MIGRATIONS_DIR, TestDb, render()

### Community 110 - "brand-kit-form.tsx"
Cohesion: 0.12
Nodes (18): Box, brandExportConfigSchema, GradientOverlayConfig, gradientOverlayConfigSchema, HexColor, logoOverlayConfigSchema, LowerThirdConfig, lowerThirdConfigSchema (+10 more)

### Community 111 - "Build 6B.1 Report — Creator Identity Layer"
Cohesion: 0.25
Nodes (8): 2. Architecture decisions, 3. Database changes (migration 9 — `20260711200000_brand_kits.sql`), 4. Tests (113 → 129), 5. Verification, 6. Deferred (deliberately), 7. Production impact, 8. Not done in this session (needs owner action), Build 6B.1 Report — Creator Identity Layer

### Community 112 - "Build 6B Analysis — Creator Productization"
Cohesion: 0.17
Nodes (12): 10. Deferred ideas (Build 6C+), 11. Competitive positioning summary, 12. Building in order (strict dependencies), 1. Current product positioning vs. competitors, 3. Creator onboarding & dashboard redesign, 4. Export experience redesign, 5. Competitive differentiation strategy, Build 6B Analysis — Creator Productization (+4 more)

### Community 113 - "export-panel.tsx"
Cohesion: 0.18
Nodes (11): 1. Current state (what 7.1 plugs into), 2.1 Recorder core (`apps/web/src/lib/record/recorder.ts` — pure + thin wrapper), 2.2 Record page (`/dashboard/record`, `RecordFlow` client component), 2.3 Entry point, 2. Design, 3. Database / worker impact, 4. Files to touch, 5. Risks & mitigations (+3 more)

### Community 114 - "7. Implementation plan (feature build order)"
Cohesion: 0.25
Nodes (8): 7. Implementation plan (feature build order), Phase 1: Database + core types, Phase 2: Brand Kit UX (creator ownership), Phase 3: Caption presets + export config, Phase 4: Export preview + receipt, Phase 5: Dashboard + onboarding, Phase 6: Renderer updates (worker), Phase 7: Verification + polish

### Community 115 - "Phase 4 — Export pipeline, ffmpeg.wasm (BUILT, live-verified 2026-07-09)"
Cohesion: 0.33
Nodes (6): Deferred, Done (55 tests: 16 core + 20 worker + 19 web), Live verification (real browser, real storage), Original plan (kept for reference), Phase 4 — Export pipeline, ffmpeg.wasm (BUILT, live-verified 2026-07-09), Unknowns from the plan — outcomes

### Community 116 - "8. Risk mitigation"
Cohesion: 0.29
Nodes (7): 8. Risk mitigation, Risk 1: Color picker accessibility + Arabic RTL, Risk 2: Font rendering variance (server vs. browser preview), Risk 3: Preset overload (AI suggestions conflict with user choice), Risk 4: Lower-third logo asset management, Risk 5: Export config explosion (too many toggle states), Risk 6: i18n key drift (ar/en mismatch)

### Community 117 - "Phase 3 — Review & text-based editing UI (BUILT, live-verified 2026-07-09)"
Cohesion: 0.33
Nodes (6): Deferred, Done (48 tests passing: 16 core + 20 worker* + 12 web; *includes prior suites), Live verification (real retake project, real browser), Original plan (kept for reference), Phase 3 — Review & text-based editing UI (BUILT, live-verified 2026-07-09), Unknowns from the plan — outcomes

### Community 118 - "6. Files to modify / create"
Cohesion: 0.33
Nodes (6): 6. Files to modify / create, Core (types), Database (migrations), i18n, Web UI, Worker

### Community 119 - "1. What was built"
Cohesion: 0.40
Nodes (5): 1. What was built, Brand Kit (creator identity), Brand overlays (rendering foundation), Caption Studio (visual preset system), Export flow

### Community 120 - "2. Strategic features for Build 6B"
Cohesion: 0.50
Nodes (4): 2. Strategic features for Build 6B, Feature Group 1: Brand Kit (creator ownership of visual identity), Feature Group 2: Caption Studio (visual preset system), Feature Group 3: Gradient Video Overlays + Lower Thirds

### Community 121 - "9. Success metrics (post-build)"
Cohesion: 0.50
Nodes (4): 9. Success metrics (post-build), Product metrics, Quality metrics, System metrics

### Community 122 - "20260711200000_brand_kits.sql"
Cohesion: 0.50
Nodes (3): brand_kits_set_updated_at, public.brand_kits, public.exports

### Community 123 - "Phase A — Production hardening + first deploys (2026-07-10)"
Cohesion: 0.40
Nodes (5): Blockers needing owner action, Done (78 tests: 24 core + 42 worker + 12 web), Full-flow smoke test (production build `next start` + live Supabase +, live AssemblyAI + live Haiku + worker, driven by headless Chrome), Phase A — Production hardening + first deploys (2026-07-10)

### Community 125 - "Phase 2 — AI analysis layer (BUILT, live-verified 2026-07-08)"
Cohesion: 0.40
Nodes (5): Deferred, Done (44 tests passing: 32 worker + 12 web), Haiku engine LIVE-VERIFIED (2026-07-08, key added), Original plan (kept for reference), Phase 2 — AI analysis layer (BUILT, live-verified 2026-07-08)

### Community 126 - "Phase 1 — Upload & transcription pipeline (overnight 2026-07-08, mock-verified)"
Cohesion: 0.40
Nodes (5): Fully built and tested (31 tests passing: 19 worker + 12 web), Judgment calls / deferred, Needs the live account (deliberately not simulated), Phase 1 — Upload & transcription pipeline (overnight 2026-07-08, mock-verified), Tomorrow: mock → live (exact steps)

### Community 127 - "Phase 0 — Project scaffolding & architecture (2026-07-08)"
Cohesion: 0.50
Nodes (4): Deferred / known issues, Done, Next (Phase 1 — awaiting schema/architecture confirmation), Phase 0 — Project scaffolding & architecture (2026-07-08)

### Community 128 - "Phase 4.5 — Server-side rendering pivot (BUILT + live-verified 2026-07-10)"
Cohesion: 0.50
Nodes (4): Done (73 tests: 24 core + 37 worker + 12 web), Live E2E (same 9.6-min stress clip, through the UI), Phase 4.5 — Server-side rendering pivot (BUILT + live-verified 2026-07-10), Remaining blockers for MVP

### Community 129 - "logger.ts"
Cohesion: 0.17
Nodes (12): 1. Current state (what the wizard composes — nothing new to invent), 2.1 Creator types (core catalog — the one new pure piece), 2.2 Wizard UX (4 steps, skippable, ~60–90s), 2.3 Writes (on Finish — all existing channels), 2.4 Visibility (backward compatible), 2. Design, 3. Database impact, 4. Files to touch (+4 more)

### Community 130 - "render-export.test.ts"
Cohesion: 0.35
Nodes (12): sendAlert(), getDb(), setDb(), main(), claimNextJob(), completeJob(), failJob(), failJobPermanently() (+4 more)

### Community 131 - "generate-edl.test.ts"
Cohesion: 0.12
Nodes (16): cleanupExpired(), handlers, JobHandler, AnalyzePayload, analyzePayloadSchema, cleanupExpiredPayloadSchema, GenerateEdlPayload, generateEdlPayloadSchema (+8 more)

### Community 132 - "transcribe.ts"
Cohesion: 0.26
Nodes (12): completeUpload(), createProjectWithUpload(), CreateUploadResult, requestAiEdit(), requestExportRender(), retryProcessing(), createAdminClient(), createClient() (+4 more)

### Community 133 - "Build 6C.1 Report — Tajawal UI + Creator Dashboard + Thumbnails"
Cohesion: 0.17
Nodes (12): 1. What was built, 2. Architecture decisions, 3. Database & worker, 4. Verification, 5. Mobile & RTL, 6. Backward compatibility, 7. Deferred (later 6C sub-builds / Build 7), 8. Production — deployed & verified (2026-07-12) (+4 more)

### Community 134 - "Build 6C.1 Analysis — Tajawal UI + Creator Dashboard + Thumbnails"
Cohesion: 0.18
Nodes (11): 10. Risks (summary), 1. Current state (relevant slices), 2. Feature 1 — Tajawal UI font migration, 3. Feature 2 — Creator Dashboard, 4. Feature 3 — Client-side thumbnails, 5. Files to touch, 6. i18n (Arabic-first), 7. Mobile-first & RTL (+3 more)

### Community 135 - "Build 6C.2 Analysis — Creator Styles System"
Cohesion: 0.18
Nodes (11): 10. Open decisions for approval, 1. Current infrastructure it reuses (nothing new to invent), 2. Architecture — HYBRID (approved), refined, 3. The six styles → concrete mapping, 4. Application flow (no hidden profiles), 5. Dashboard / onboarding integration, 6. Technical impact, 7. Implementation plan (order) (+3 more)

### Community 136 - "Build 6C.2 Report — Creator Styles System"
Cohesion: 0.18
Nodes (11): 1. What was built, 2. Architecture decisions, 3. Database & worker, 4. Tests (144 → 150), 5. Verification, 6. Backward compatibility, 7. Deferred, 8. Production — deployed & verified (2026-07-12) (+3 more)

### Community 137 - "brand-kit-form.tsx"
Cohesion: 0.22
Nodes (9): 1. What was built, 2. Architecture decisions, 3. Database & worker, 4. Tests (160 → 166), 5. Verification (live backend, dev server, throwaway user), 6. Backward compatibility, 7. Deferred, 8. Production (+1 more)

### Community 138 - "logger.ts"
Cohesion: 0.20
Nodes (12): env, Level, log, write(), cgroupMemoryMb(), execFileAsync, LocalFfmpegEngine, RenderAbortedError (+4 more)

### Community 140 - "limits.ts"
Cohesion: 0.24
Nodes (12): requireEnv(), defaultDeps, renderExport(), RenderExportDeps, renderExportWithEngine(), renderBlankImage(), createRenderEngine(), createSignedMediaUrl() (+4 more)

### Community 142 - "fillers.ts"
Cohesion: 0.33
Nodes (8): EditorPage(), ProjectPage(), ProjectSnapshot, ProjectStatusView(), REMOVAL_STAT_KEYS, STEPS, TranscriptSnapshot, edlV1ViewOf()

### Community 143 - "EdlV1"
Cohesion: 0.12
Nodes (19): EditorViewProps, TimelineProps, anchorFor(), CardAnchor, TranscriptPanel(), TranscriptPanelProps, EditBrainInput, HaikuEditBrain (+11 more)

### Community 144 - "creator-styles.ts"
Cohesion: 0.21
Nodes (14): BrandKitFormProps, GRADIENT_DEFAULTS, LOGO_TYPES, CreatorStyles(), CreatorStylesProps, OnboardingWizardProps, OverlayStudio(), OverlayStudioProps (+6 more)

### Community 145 - "edl.ts"
Cohesion: 0.26
Nodes (3): AuthForm(), LocaleSwitcher(), { Link, redirect, usePathname, useRouter, getPathname }

### Community 146 - "generate-edl.test.ts"
Cohesion: 0.22
Nodes (7): createEditBrain(), EditBrain, PermanentJobError, generateEdl(), resolveIntentHint(), WORDS, validateAiEditPlan()

### Community 147 - "Build 7.2 Analysis — Screen + Camera Recording, PiP, Preferences"
Cohesion: 0.20
Nodes (10): 1.1 Modes, 1.2 The composite is burned in client-side (the binding decision), 1.3 Acquisition & lifecycle, 1.4 Preferences (localStorage, device-level like 7.1 device picks), 1. Design, 2. Files, 3. Risks, 4. DB/worker impact (+2 more)

### Community 148 - "Build 7.1 Report — Recording Foundation (Creator Studio)"
Cohesion: 0.22
Nodes (9): 1. What was built, 2. Two production bugs found live by the E2E (fixed + regression-tested), 3. Database & worker, 4. Tests (166 → 178), 5. Verification (live backend, synthetic capture devices), 6. Backward compatibility, 7. Deferred (by decomposition), 8. Production (+1 more)

### Community 149 - "Build 7.3 Analysis — Teleprompter, Speaker Notes, Countdown Controls"
Cohesion: 0.22
Nodes (9): 1.1 Prompter modes, 1.2 Core (`lib/record/teleprompter.ts`, pure + tested), 1.3 UI (`components/record/teleprompter.tsx` + RecordFlow wiring), 1. Design, 2. Files, 3. DB/worker impact, 4. Risks, 5. Verification (+1 more)

### Community 150 - "Build 7.2 Report — Screen + Camera Recording, PiP, Preferences"
Cohesion: 0.25
Nodes (8): 1. What was built, 2. Bug found live by the E2E (fixed), 3. Database & worker, 4. Tests (178 → 190), 5. Verification (live backend, synthetic camera + synthetic screen), 6. Backward compatibility, 7. Production, Build 7.2 Report — Screen + Camera Recording, PiP, Preferences

### Community 151 - "Build 7.3 Report — Teleprompter, Speaker Notes, Countdown Controls"
Cohesion: 0.25
Nodes (8): 1. What was built, 2. Bug found live (fixed): compositor-throttled scroll, 3. Database & worker, 4. Tests (190 → 195), 5. Verification (live backend, synthetic camera), 6. Backward compatibility, 7. Production, Build 7.3 Report — Teleprompter, Speaker Notes, Countdown Controls

### Community 152 - "edl.ts"
Cohesion: 0.29
Nodes (6): edlV1Schema, KeptSegment, keptSegmentSchema, removalReasonSchema, removedSegmentSchema, segmentBase

## Knowledge Gaps
- **773 isolated node(s):** `eslintConfig`, `withNextIntl`, `nextConfig`, `name`, `version` (+768 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **57 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `TranscriptWord` connect `EdlV1` to `editor-view.tsx`, `edl-v2.ts`, `AI Analysis & EDL Builder`, `Transcription Providers`, `TranscriptWord`, `edl-ops.ts`, `export-plan.ts`, `fillers.ts`, `brand-kit-form.tsx`, `RenderRequest`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **Why does `EdlV1` connect `EdlV1` to `project-status-view.tsx`, `editor-view.tsx`, `edl-v2.ts`, `AI Analysis & EDL Builder`, `TranscriptWord`, `edl-ops.ts`, `limits.ts`, `upload-flow.tsx`, `fillers.ts`, `export-plan.ts`, `brand-kit-form.tsx`, `generate-edl.test.ts`, `edl.ts`, `RenderRequest`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Why does `getDb()` connect `render-export.test.ts` to `AI Analysis & EDL Builder`, `Transcription Providers`, `logger.ts`, `limits.ts`, `upload-flow.tsx`, `generate-edl.test.ts`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `NOTE: This file should not be edited`, `withNextIntl` to the rest of the system?**
  _801 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `EDL Domain & Editing Ops` be split into smaller, more focused modules?**
  _Cohesion score 0.058823529411764705 - nodes in this community are weakly interconnected._
- **Should `Web Upload & Project UI` be split into smaller, more focused modules?**
  _Cohesion score 0.12 - nodes in this community are weakly interconnected._
- **Should `Web Package Manifest` be split into smaller, more focused modules?**
  _Cohesion score 0.04081632653061224 - nodes in this community are weakly interconnected._