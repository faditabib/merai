# Graph Report - Merai app  (2026-07-11)

## Corpus Check
- 139 files · ~60,068 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 862 nodes · 1456 edges · 87 communities (34 shown, 53 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `792a9d5f`
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

## God Nodes (most connected - your core abstractions)
1. `TranscriptWord` - 32 edges
2. `Merai — Architectural Decisions` - 29 edges
3. `EdlV1` - 22 edges
4. `getDb()` - 20 edges
5. `log` - 20 edges
6. `createClient()` - 16 edges
7. `compilerOptions` - 16 edges
8. `renderExportWithEngine()` - 12 edges
9. `What You Must Do When Invoked` - 12 edges
10. `Merai — Progress Log` - 12 edges

## Surprising Connections (you probably didn't know these)
- `CaptionOverlayProps` --references--> `TranscriptWord`  [EXTRACTED]
  apps/web/src/components/editor/caption-overlay.tsx → packages/core/src/transcript.ts
- `EditorViewProps` --references--> `TranscriptWord`  [EXTRACTED]
  apps/web/src/components/editor/editor-view.tsx → packages/core/src/transcript.ts
- `EditorView()` --indirect_call--> `seconds()`  [INFERRED]
  apps/web/src/components/editor/editor-view.tsx → packages/core/src/export-plan.ts
- `TimelineProps` --references--> `TranscriptWord`  [EXTRACTED]
  apps/web/src/components/editor/timeline.tsx → packages/core/src/transcript.ts
- `TranscriptPanelProps` --references--> `TranscriptWord`  [EXTRACTED]
  apps/web/src/components/editor/transcript-panel.tsx → packages/core/src/transcript.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Client-side Export Rendering System (ffmpeg.wasm)** — decisions_ffmpeg_wasm_single_thread, decisions_browser_rasterized_captions, decisions_segment_wise_rendering, decisions_export_resolution_720, progress_phase4_export_pipeline, progress_phase4_stress_test [EXTRACTED 1.00]
- **AssemblyAI Transcription Pipeline Decisions** — decisions_transcription_provider_interface, decisions_arabic_auto_detection, decisions_custom_spelling_brand_terms, decisions_ten_minute_cap, decisions_transcripts_normalized_plus_raw [EXTRACTED 1.00]
- **Arabic-first RTL Design System** — decisions_i18n_next_intl_arabic_default, decisions_locale_detection_disabled, decisions_ibm_plex_sans_arabic, decisions_timeline_ltr [INFERRED 0.85]

## Communities (87 total, 53 thin omitted)

### Community 0 - "EDL Domain & Editing Ops"
Cohesion: 0.06
Nodes (63): CaptionOverlay(), CaptionOverlayProps, EditorView(), EditorViewProps, ACTIVE_STATUSES, ASPECT_RATIOS, ExportPanel(), ExportPanelProps (+55 more)

### Community 1 - "Web Upload & Project UI"
Cohesion: 0.06
Nodes (41): completeUpload(), createProjectWithUpload(), CreateUploadResult, requestExportRender(), retryProcessing(), GET(), NewProjectPage(), DashboardPage() (+33 more)

### Community 2 - "Worker Job Queue Core"
Cohesion: 0.07
Nodes (42): sendAlert(), Db, getDb(), setDb(), cleanupExpired(), generateEdl(), handlers, JobHandler (+34 more)

### Community 3 - "Web Package Manifest"
Cohesion: 0.04
Nodes (48): dependencies, @merai/core, next, next-intl, react, react-dom, @supabase/ssr, @supabase/supabase-js (+40 more)

### Community 4 - "Server Render Pipeline"
Cohesion: 0.08
Nodes (33): images, line, env, requireEnv(), PermanentJobError, defaultDeps, OutputTooLargeError, renderExport() (+25 more)

### Community 5 - "AI Analysis & EDL Builder"
Cohesion: 0.09
Nodes (32): ANALYSIS_TOOL, HaikuAnalysisEngine, MessageCreator, renderTranscript(), HeuristicAnalysisEngine, createAnalysisEngine(), AnalysisEngine, AnalysisInput (+24 more)

### Community 6 - "Transcription Providers"
Cohesion: 0.11
Nodes (20): AssemblyAIProvider, AssemblyAIProviderOptions, CUSTOM_SPELLING, arabicFixture, takeOne, takeTwo, buildFixture(), WordSpec (+12 more)

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
Cohesion: 0.14
Nodes (8): UploadFlow(), createResumableUpload(), ResumableUploadHandle, ResumableUploadOptions, supabaseTusEndpoint(), startTusServer(), TestTusServer, TusSession

### Community 12 - "Core Package Manifest"
Cohesion: 0.11
Nodes (17): dependencies, zod, description, devDependencies, typescript, vitest, exports, typescript (+9 more)

### Community 13 - "Root Workspace Manifest"
Cohesion: 0.12
Nodes (16): description, engines, node, name, private, scripts, build, dev (+8 more)

### Community 14 - "i18n Routing & Proxy"
Cohesion: 0.05
Nodes (41): Blockers needing owner action, Build 5 — Professional editing core: EDL v2 foundation (2026-07-11), Deferred, Deferred, Deferred, Deferred / known issues, Done, Done (44 tests passing: 32 worker + 12 web) (+33 more)

### Community 15 - "Worker TypeScript Config"
Cohesion: 0.12
Nodes (15): compilerOptions, isolatedModules, lib, module, moduleResolution, noEmit, noUncheckedIndexedAccess, skipLibCheck (+7 more)

### Community 16 - "Core TypeScript Config"
Cohesion: 0.14
Nodes (13): compilerOptions, isolatedModules, lib, module, moduleResolution, noEmit, noUncheckedIndexedAccess, skipLibCheck (+5 more)

### Community 31 - "Merai — Architectural Decisions"
Cohesion: 0.07
Nodes (29): 2026-07-08 — 10-minute cap enforced in three layers, no ffprobe infra, 2026-07-08 — Arabic language handling: keep auto-detection, no pin, 2026-07-08 — Auth: Supabase email+password to start, 2026-07-08 — Brand terms: AssemblyAI custom_spelling adopted, word_boost rejected, 2026-07-08 — Browser locale detection disabled, 2026-07-08 — DB-level tests run on PGlite applying the real migrations, 2026-07-08 — EDL is versioned, immutable, append-only JSON (v1 single-track), 2026-07-08 — Enum-like columns are text + CHECK constraints, not Postgres enums (+21 more)

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

## Knowledge Gaps
- **358 isolated node(s):** `eslintConfig`, `withNextIntl`, `nextConfig`, `name`, `version` (+353 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **53 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `TranscriptWord` connect `AI Analysis & EDL Builder` to `EDL Domain & Editing Ops`, `Web Upload & Project UI`, `Worker Job Queue Core`, `edl-v2.ts`, `Transcription Providers`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Why does `EdlV1` connect `EDL Domain & Editing Ops` to `Web Upload & Project UI`, `edl-v2.ts`, `Server Render Pipeline`, `AI Analysis & EDL Builder`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **Why does `ResumableUploadHandle` connect `Resumable Upload (tus)` to `Web Upload & Project UI`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `NOTE: This file should not be edited`, `withNextIntl` to the rest of the system?**
  _386 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `EDL Domain & Editing Ops` be split into smaller, more focused modules?**
  _Cohesion score 0.05864197530864197 - nodes in this community are weakly interconnected._
- **Should `Web Upload & Project UI` be split into smaller, more focused modules?**
  _Cohesion score 0.05985915492957746 - nodes in this community are weakly interconnected._
- **Should `Worker Job Queue Core` be split into smaller, more focused modules?**
  _Cohesion score 0.06713286713286713 - nodes in this community are weakly interconnected._