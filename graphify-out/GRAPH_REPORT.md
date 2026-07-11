# Graph Report - Merai app  (2026-07-11)

## Corpus Check
- 154 files · ~74,254 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 997 nodes · 1677 edges · 103 communities (49 shown, 54 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `32b41691`
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
- render-export.test.ts
- storage.ts
- runner.ts
- createClient
- projects.ts
- project-status-view.tsx
- validate.ts
- export-panel.tsx
- Build 5.5 Analysis — AI Editing Brain v1
- Build 6A — Visual QA Report
- Production Alignment Report
- 20260711130000_ai_suggestions.sql

## God Nodes (most connected - your core abstractions)
1. `TranscriptWord` - 36 edges
2. `Merai — Architectural Decisions` - 30 edges
3. `EdlV1` - 27 edges
4. `getDb()` - 22 edges
5. `log` - 21 edges
6. `createClient()` - 17 edges
7. `compilerOptions` - 16 edges
8. `createClient()` - 14 edges
9. `Merai — Progress Log` - 14 edges
10. `edlOutputDurationMs()` - 13 edges

## Surprising Connections (you probably didn't know these)
- `CaptionOverlayProps` --references--> `TranscriptWord`  [EXTRACTED]
  apps/web/src/components/editor/caption-overlay.tsx → packages/core/src/transcript.ts
- `EditorViewProps` --references--> `TranscriptWord`  [EXTRACTED]
  apps/web/src/components/editor/editor-view.tsx → packages/core/src/transcript.ts
- `EditorView()` --indirect_call--> `seconds()`  [INFERRED]
  apps/web/src/components/editor/editor-view.tsx → packages/core/src/export-plan.ts
- `ExportPanelProps` --references--> `EdlV1`  [EXTRACTED]
  apps/web/src/components/editor/export-panel.tsx → packages/core/src/edl.ts
- `TimelineProps` --references--> `TranscriptWord`  [EXTRACTED]
  apps/web/src/components/editor/timeline.tsx → packages/core/src/transcript.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Client-side Export Rendering System (ffmpeg.wasm)** — decisions_ffmpeg_wasm_single_thread, decisions_browser_rasterized_captions, decisions_segment_wise_rendering, decisions_export_resolution_720, progress_phase4_export_pipeline, progress_phase4_stress_test [EXTRACTED 1.00]
- **AssemblyAI Transcription Pipeline Decisions** — decisions_transcription_provider_interface, decisions_arabic_auto_detection, decisions_custom_spelling_brand_terms, decisions_ten_minute_cap, decisions_transcripts_normalized_plus_raw [EXTRACTED 1.00]
- **Arabic-first RTL Design System** — decisions_i18n_next_intl_arabic_default, decisions_locale_detection_disabled, decisions_ibm_plex_sans_arabic, decisions_timeline_ltr [INFERRED 0.85]

## Communities (103 total, 54 thin omitted)

### Community 0 - "EDL Domain & Editing Ops"
Cohesion: 0.06
Nodes (57): AiDecisionCard(), CaptionOverlay(), CaptionOverlayProps, EditorView(), EditorViewProps, ShortcutsHelp(), ReorderDrag, Timeline() (+49 more)

### Community 1 - "Web Upload & Project UI"
Cohesion: 0.19
Nodes (6): NewProjectPage(), AppHeader(), AuthForm(), LocaleSwitcher(), SignOutButton(), { Link, redirect, usePathname, useRouter, getPathname }

### Community 2 - "Worker Job Queue Core"
Cohesion: 0.13
Nodes (15): cleanupExpired(), handlers, JobHandler, AnalyzePayload, analyzePayloadSchema, cleanupExpiredPayloadSchema, GenerateEdlPayload, JobRow (+7 more)

### Community 3 - "Web Package Manifest"
Cohesion: 0.04
Nodes (48): dependencies, @merai/core, next, next-intl, react, react-dom, @supabase/ssr, @supabase/supabase-js (+40 more)

### Community 4 - "Server Render Pipeline"
Cohesion: 0.10
Nodes (27): images, line, requireEnv(), defaultDeps, OutputTooLargeError, renderExport(), RenderExportDeps, renderExportWithEngine() (+19 more)

### Community 5 - "AI Analysis & EDL Builder"
Cohesion: 0.08
Nodes (36): ANALYSIS_TOOL, HaikuAnalysisEngine, MessageCreator, renderTranscript(), HeuristicAnalysisEngine, createAnalysisEngine(), AnalysisEngine, AnalysisInput (+28 more)

### Community 6 - "Transcription Providers"
Cohesion: 0.08
Nodes (29): enqueueAnalyze(), ProjectRow, transcribe(), transcribeWithProvider(), UploadRow, Level, log, write() (+21 more)

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
Cohesion: 0.13
Nodes (10): UploadFlow(), UploadState, probeVideoDurationSeconds(), createResumableUpload(), ResumableUploadHandle, ResumableUploadOptions, supabaseTusEndpoint(), startTusServer() (+2 more)

### Community 12 - "Core Package Manifest"
Cohesion: 0.11
Nodes (17): dependencies, zod, description, devDependencies, typescript, vitest, exports, typescript (+9 more)

### Community 13 - "Root Workspace Manifest"
Cohesion: 0.12
Nodes (16): description, engines, node, name, private, scripts, build, dev (+8 more)

### Community 14 - "i18n Routing & Proxy"
Cohesion: 0.05
Nodes (43): Blockers needing owner action, Build 5 — Professional editing core: EDL v2 foundation (2026-07-11), Build 6A.1 — Visual QA fixes + production redeploy (2026-07-11), Build 6A — Creator experience layer (2026-07-11), Deferred, Deferred, Deferred, Deferred / known issues (+35 more)

### Community 15 - "Worker TypeScript Config"
Cohesion: 0.12
Nodes (15): compilerOptions, isolatedModules, lib, module, moduleResolution, noEmit, noUncheckedIndexedAccess, skipLibCheck (+7 more)

### Community 16 - "Core TypeScript Config"
Cohesion: 0.14
Nodes (13): compilerOptions, isolatedModules, lib, module, moduleResolution, noEmit, noUncheckedIndexedAccess, skipLibCheck (+5 more)

### Community 31 - "Merai — Architectural Decisions"
Cohesion: 0.06
Nodes (30): 2026-07-08 — 10-minute cap enforced in three layers, no ffprobe infra, 2026-07-08 — Arabic language handling: keep auto-detection, no pin, 2026-07-08 — Auth: Supabase email+password to start, 2026-07-08 — Brand terms: AssemblyAI custom_spelling adopted, word_boost rejected, 2026-07-08 — Browser locale detection disabled, 2026-07-08 — DB-level tests run on PGlite applying the real migrations, 2026-07-08 — EDL is versioned, immutable, append-only JSON (v1 single-track), 2026-07-08 — Enum-like columns are text + CHECK constraints, not Postgres enums (+22 more)

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
Cohesion: 0.21
Nodes (9): LocaleLayout(), plexArabic, dirFor(), Locale, routing, updateSession(), config, handleI18nRouting (+1 more)

### Community 90 - "RenderRequest"
Cohesion: 0.11
Nodes (18): EditBrain, EditBrainInput, HaikuEditBrain, MessageCreator, PLAN_TOOL, renderState(), AI_EDIT_COMMAND_TYPES, AiEditCommandType (+10 more)

### Community 91 - "render-export.test.ts"
Cohesion: 0.31
Nodes (5): createEditBrain(), PermanentJobError, generateEdl(), validateAiEditPlan(), generateEdlPayloadSchema

### Community 92 - "storage.ts"
Cohesion: 0.13
Nodes (7): Db, setDb(), env, WORDS, createTestDb(), MIGRATIONS_DIR, TestDb

### Community 93 - "runner.ts"
Cohesion: 0.37
Nodes (11): sendAlert(), getDb(), main(), claimNextJob(), completeJob(), failJob(), failJobPermanently(), reapStaleJobs() (+3 more)

### Community 94 - "createClient"
Cohesion: 0.22
Nodes (10): STATUS_STYLES, AiAssistantPanel(), PRESET_KEYS, SuggestionRow, OnboardingCallout(), STEP_KEYS, WorkflowSteps(), createClient() (+2 more)

### Community 95 - "projects.ts"
Cohesion: 0.31
Nodes (9): completeUpload(), CreateUploadResult, requestAiEdit(), requestExportRender(), retryProcessing(), GET(), DashboardPage(), createAdminClient() (+1 more)

### Community 96 - "project-status-view.tsx"
Cohesion: 0.33
Nodes (8): EditorPage(), ProjectPage(), ProjectSnapshot, ProjectStatusView(), REMOVAL_STAT_KEYS, STEPS, TranscriptSnapshot, edlV1ViewOf()

### Community 97 - "validate.ts"
Cohesion: 0.36
Nodes (6): createProjectWithUpload(), ALLOWED_VIDEO_MIME_TYPES, safeExtension(), UploadValidationError, validateVideoFile(), valid

### Community 98 - "export-panel.tsx"
Cohesion: 0.39
Nodes (7): ACTIVE_STATUSES, ASPECT_RATIOS, ExportPanel(), ExportPanelProps, ExportRow, ExportRow, AspectRatio

### Community 99 - "Build 5.5 Analysis — AI Editing Brain v1"
Cohesion: 0.25
Nodes (7): 1. Existing EDL v2 architecture (Build 5), 2. Existing edit-command system (Build 5 — built for exactly this), 3. Current AI analysis pipeline (integration template), 4. Where the Brain integrates (chosen design), 5. Database/storage impact, 6. Risks, Build 5.5 Analysis — AI Editing Brain v1

### Community 100 - "Build 6A — Visual QA Report"
Cohesion: 0.25
Nodes (7): Bugs 🐞, Build 6A — Visual QA Report, Coverage notes, Inconsistencies ⚠️, Polish opportunities ✨, Suggested fix order (when implementation resumes), Verified working ✅

### Community 101 - "Production Alignment Report"
Cohesion: 0.29
Nodes (6): 1. Deployment versions (verified, not assumed), 2. Environment variables (names verified, values never displayed), 3. Production smoke test — full creator flow, 4. Blockers / owner actions, 5. Conclusion, Production Alignment Report

## Knowledge Gaps
- **436 isolated node(s):** `eslintConfig`, `withNextIntl`, `nextConfig`, `name`, `version` (+431 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **54 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `TranscriptWord` connect `AI Analysis & EDL Builder` to `project-status-view.tsx`, `EDL Domain & Editing Ops`, `edl-v2.ts`, `Transcription Providers`, `RenderRequest`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Why does `EdlV1` connect `EDL Domain & Editing Ops` to `project-status-view.tsx`, `export-panel.tsx`, `edl-v2.ts`, `Server Render Pipeline`, `AI Analysis & EDL Builder`, `RenderRequest`, `storage.ts`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **Why does `log` connect `Transcription Providers` to `Worker Job Queue Core`, `Server Render Pipeline`, `AI Analysis & EDL Builder`, `RenderRequest`, `render-export.test.ts`, `runner.ts`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `NOTE: This file should not be edited`, `withNextIntl` to the rest of the system?**
  _464 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `EDL Domain & Editing Ops` be split into smaller, more focused modules?**
  _Cohesion score 0.0645045045045045 - nodes in this community are weakly interconnected._
- **Should `Worker Job Queue Core` be split into smaller, more focused modules?**
  _Cohesion score 0.13071895424836602 - nodes in this community are weakly interconnected._
- **Should `Web Package Manifest` be split into smaller, more focused modules?**
  _Cohesion score 0.04081632653061224 - nodes in this community are weakly interconnected._