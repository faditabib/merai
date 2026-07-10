# Graph Report - .  (2026-07-10)

## Corpus Check
- 136 files · ~51,596 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 626 nodes · 1232 edges · 31 communities (23 shown, 8 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 16 edges (avg confidence: 0.85)
- Token cost: 67,557 input · 0 output

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

## God Nodes (most connected - your core abstractions)
1. `TranscriptWord` - 30 edges
2. `EdlV1` - 21 edges
3. `log` - 19 edges
4. `getDb()` - 18 edges
5. `createClient()` - 16 edges
6. `compilerOptions` - 16 edges
7. `EditorView()` - 14 edges
8. `compilerOptions` - 11 edges
9. `edlOutputDurationMs()` - 11 edges
10. `createClient()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `Merai — AI Video Editing OS for Arabic Creators` --conceptually_related_to--> `Phase 4 — Export pipeline, ffmpeg.wasm (live-verified)`  [INFERRED]
  README.md → PROGRESS.md
- `Phase 2 — AI analysis layer (Haiku engine, EDL builder)` --conceptually_related_to--> `Transcripts: normalized words + raw provider payload`  [INFERRED]
  PROGRESS.md → DECISIONS.md
- `EditorView()` --indirect_call--> `seconds()`  [INFERRED]
  apps/web/src/components/editor/editor-view.tsx → packages/core/src/export-plan.ts
- `ExportPanelProps` --references--> `EdlV1`  [EXTRACTED]
  apps/web/src/components/editor/export-panel.tsx → packages/core/src/edl.ts
- `TranscriptSnapshot` --references--> `TranscriptWord`  [EXTRACTED]
  apps/web/src/components/project-status-view.tsx → packages/core/src/transcript.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Client-side Export Rendering System (ffmpeg.wasm)** — decisions_ffmpeg_wasm_single_thread, decisions_browser_rasterized_captions, decisions_segment_wise_rendering, decisions_export_resolution_720, progress_phase4_export_pipeline, progress_phase4_stress_test [EXTRACTED 1.00]
- **AssemblyAI Transcription Pipeline Decisions** — decisions_transcription_provider_interface, decisions_arabic_auto_detection, decisions_custom_spelling_brand_terms, decisions_ten_minute_cap, decisions_transcripts_normalized_plus_raw [EXTRACTED 1.00]
- **Arabic-first RTL Design System** — decisions_i18n_next_intl_arabic_default, decisions_locale_detection_disabled, decisions_ibm_plex_sans_arabic, decisions_timeline_ltr [INFERRED 0.85]

## Communities (31 total, 8 thin omitted)

### Community 0 - "EDL Domain & Editing Ops"
Cohesion: 0.07
Nodes (55): CaptionOverlay(), CaptionOverlayProps, EditorView(), EditorViewProps, ReorderDrag, Timeline(), TimelineProps, TrimDrag (+47 more)

### Community 1 - "Web Upload & Project UI"
Cohesion: 0.07
Nodes (38): completeUpload(), createProjectWithUpload(), CreateUploadResult, requestExportRender(), retryProcessing(), GET(), NewProjectPage(), DashboardPage() (+30 more)

### Community 2 - "Worker Job Queue Core"
Cohesion: 0.07
Nodes (39): Db, getDb(), setDb(), cleanupExpired(), generateEdl(), handlers, JobHandler, enqueueAnalyze() (+31 more)

### Community 3 - "Web Package Manifest"
Cohesion: 0.04
Nodes (48): dependencies, @merai/core, next, next-intl, react, react-dom, @supabase/ssr, @supabase/supabase-js (+40 more)

### Community 4 - "Server Render Pipeline"
Cohesion: 0.10
Nodes (27): images, line, env, requireEnv(), defaultDeps, renderExport(), RenderExportDeps, renderExportWithEngine() (+19 more)

### Community 5 - "AI Analysis & EDL Builder"
Cohesion: 0.09
Nodes (30): ANALYSIS_TOOL, HaikuAnalysisEngine, MessageCreator, renderTranscript(), HeuristicAnalysisEngine, createAnalysisEngine(), AnalysisEngine, AnalysisInput (+22 more)

### Community 6 - "Transcription Providers"
Cohesion: 0.11
Nodes (20): AssemblyAIProvider, AssemblyAIProviderOptions, CUSTOM_SPELLING, arabicFixture, takeOne, takeTwo, buildFixture(), WordSpec (+12 more)

### Community 7 - "Worker Package Manifest"
Cohesion: 0.06
Nodes (34): @anthropic-ai/sdk, dependencies, @anthropic-ai/sdk, dotenv, @merai/core, @napi-rs/canvas, pg, @supabase/supabase-js (+26 more)

### Community 8 - "Web TypeScript Config"
Cohesion: 0.06
Nodes (30): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+22 more)

### Community 9 - "Decisions & Phase History"
Cohesion: 0.10
Nodes (31): Arabic language handling: keep auto-detection, no pin, Exported captions rasterized by the browser, never ffmpeg, Brand terms: custom_spelling adopted, word_boost rejected, EDL: versioned, immutable, append-only JSON (v1 single-track), Export resolution: 720-class per aspect ratio, Export: single-threaded ffmpeg.wasm core, self-hosted, i18n: next-intl, Arabic default at root path, Typography: IBM Plex Sans Arabic single family (+23 more)

### Community 10 - "Database Schema & RLS"
Cohesion: 0.21
Nodes (18): exports_set_updated_at, jobs_set_updated_at, on_auth_user_created, profiles_set_updated_at, projects_set_updated_at, public.claim_next_job(), public.edl_versions, public.exports (+10 more)

### Community 11 - "Resumable Upload (tus)"
Cohesion: 0.14
Nodes (8): UploadFlow(), createResumableUpload(), ResumableUploadHandle, ResumableUploadOptions, supabaseTusEndpoint(), startTusServer(), TestTusServer, TusSession

### Community 12 - "Core Package Manifest"
Cohesion: 0.11
Nodes (17): dependencies, zod, description, devDependencies, typescript, vitest, exports, typescript (+9 more)

### Community 13 - "Root Workspace Manifest"
Cohesion: 0.12
Nodes (16): description, engines, node, name, private, scripts, build, dev (+8 more)

### Community 14 - "i18n Routing & Proxy"
Cohesion: 0.19
Nodes (9): LocaleLayout(), plexArabic, dirFor(), Locale, routing, updateSession(), config, handleI18nRouting (+1 more)

### Community 15 - "Worker TypeScript Config"
Cohesion: 0.12
Nodes (15): compilerOptions, isolatedModules, lib, module, moduleResolution, noEmit, noUncheckedIndexedAccess, skipLibCheck (+7 more)

### Community 16 - "Core TypeScript Config"
Cohesion: 0.14
Nodes (13): compilerOptions, isolatedModules, lib, module, moduleResolution, noEmit, noUncheckedIndexedAccess, skipLibCheck (+5 more)

### Community 17 - "Next.js 16 Conventions Docs"
Cohesion: 0.50
Nodes (4): Next.js 16 breaking-changes agent rule (read bundled docs first), apps/web CLAUDE.md includes AGENTS.md, apps/web README (stock create-next-app boilerplate), Next.js 16 conventions (proxy.ts, async params)

## Knowledge Gaps
- **190 isolated node(s):** `eslintConfig`, `withNextIntl`, `nextConfig`, `name`, `version` (+185 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `TranscriptWord` connect `EDL Domain & Editing Ops` to `Web Upload & Project UI`, `Worker Job Queue Core`, `AI Analysis & EDL Builder`, `Transcription Providers`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **Why does `EdlV1` connect `EDL Domain & Editing Ops` to `Web Upload & Project UI`, `Server Render Pipeline`, `AI Analysis & EDL Builder`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Why does `ResumableUploadHandle` connect `Resumable Upload (tus)` to `Web Upload & Project UI`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `NOTE: This file should not be edited`, `withNextIntl` to the rest of the system?**
  _199 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `EDL Domain & Editing Ops` be split into smaller, more focused modules?**
  _Cohesion score 0.07203219315895372 - nodes in this community are weakly interconnected._
- **Should `Web Upload & Project UI` be split into smaller, more focused modules?**
  _Cohesion score 0.0689484126984127 - nodes in this community are weakly interconnected._
- **Should `Worker Job Queue Core` be split into smaller, more focused modules?**
  _Cohesion score 0.06758832565284179 - nodes in this community are weakly interconnected._