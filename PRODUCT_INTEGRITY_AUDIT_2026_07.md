# Merai — Product Integrity Verification (2026-07-17)

Production reality check. **Nothing here is taken from prior reports** — every
claim below was re-verified against running code, live infrastructure, and
database records during this audit. Where I ran a live test, the evidence is
quoted.

## Overall integrity score: 8.0 / 10

Merai is a **genuinely real, functioning product** — the AI core (the hardest
thing to fake and the heart of the value proposition) is unambiguously live
and producing real edit decisions in production. One **critical infrastructure
blocker** (storage size ceiling) breaks realistic-size uploads, and one core
CRUD gap (no project delete/rename) is missing. Neither is "fake code"; both
are honest, fixable gaps.

---

## 1. What is genuinely working (verified live this session)

### AI Brain #1 — first-draft editing (`transcribe` → `analyze`)
**REAL, end-to-end, in production.** I generated a 17.3s MP4 with actual
spoken fillers (Windows TTS), uploaded it to live storage, and enqueued it on
the production queue. The **Railway production worker** processed it:
```
transcribe: upload 921e2a49… completed (29 words, lang=en, provider=assemblyai)
analyze: project 660272f8… ready — 7 kept segments, 7 removals (engine=haiku)
```
DB records confirm: `transcripts.provider=assemblyai`, 29 real words
("Hello and welcome. Um, so today, uh, I want to show you this product…"),
`analysis.engine=haiku`, and `edl_versions v1` with **7 removals: 6 × filler +
1 × silence** — the AI removed exactly the "um/uh" hesitations it detected.
Real STT → real Claude → real cuts.

### AI Brain #2 — re-editing assistant (`generate_edl`)
**REAL.** Seeded an `ai_suggestions` row + enqueued; production Haiku returned
`status=ready`, `goal=make-shorter-remove-hesitations`, **5 validated commands**
(`remove-words`×4, `ripple-delete-segment`×1) and a human explanation. The
command allowlist + validation path is exercised in production.

### Provider configuration
Production worker env (names only) carries **`ANTHROPIC_API_KEY` +
`ASSEMBLYAI_API_KEY`**, no `TRANSCRIPTION_PROVIDER`/`ANALYSIS_ENGINE`
overrides. Per the selection code, both resolve to the **real** providers, not
mocks. Worker is alive: registered for all 6 job types.

### Recording system — REAL, not mocked
`recorder.ts` uses `new MediaRecorder(opts.stream)`; `record-flow.tsx` uses
real `getUserMedia`/`getDisplayMedia`. No fake/synthetic stream in app code
(the synthetic devices used in E2E were injected test-side, never shipped).
Pause/resume/stop → real Blob → real `File` → real tus upload (verified live
earlier this session: a recorded blob created a real project).

### Upload pipeline — real tus resumable
`tus-uploader.ts` targets Supabase's real resumable endpoint, 6 MiB chunks,
pause/resume/cancel, localStorage fingerprint resume across tab close. Real
storage objects + DB rows created. **(But see the critical blocker below.)**

### Worker queue — real Postgres queue
`FOR UPDATE SKIP LOCKED`, dedupe keys, exponential backoff, permanent-failure
classification, project-status surfacing (incl. the 2026-07-17 stitch fix).
All jobs in the live test completed on **attempt 1**.

### Database — no fake data paths
All 14 tables are written by real flows: profiles, projects, video_uploads,
transcripts, edl_versions, exports, usage_ledger, jobs, ai_suggestions,
ai_preferences, brand_kits, subscriptions, billing_events, + `projects.tags`.
The only client-only state (device/prompter/record prefs in localStorage) is
legitimately device-scoped preference, not backend data in disguise. RLS is
deny-by-default owner-scoped and does **not** block real workflows (worker =
service role; app = owner-scoped client) — proven by the live pipeline running
clean.

### SaaS — quota enforcement is real
`usageGate` in the project actions sums the cycle's `usage_ledger` against
`TIER_LIMITS`; verified live earlier (an exhausted 60/60 starter quota blocked
a real upload). Subscription state syncs to `profiles.subscription_tier`
(verified creator/active). The mock billing provider is now guarded from
implicit production use.

---

## 2. Partially implemented

| Feature | Current behavior | Expected | Root cause | Severity |
|---|---|---|---|---|
| **Stripe billing** | Wired against the documented REST API; keyless mock is the active provider | Live charges | No `STRIPE_*` keys/Prices yet (owner action) | Medium — pre-launch |
| **Ops alerting** | Permanent-failure alerts are log-only | Slack/Discord webhook | `ALERT_WEBHOOK_URL` unset (owner action) | Low |

---

## 3. Mocked or incomplete (but honest — not deceptive)

- **Dolby / Pixabay env vars** (`dolbyAppKey`, `dolbyAppSecret`,
  `pixabayApiKey`): declared in `env.ts`, **referenced by zero code paths**
  (grep-confirmed). Dead declarations from abandoned ideas — NOT a half-wired
  feature pretending to work. *Recommend deleting to avoid confusion.*
- **MockTranscriptionProvider / MockBillingProvider / HeuristicAnalysisEngine**:
  legitimate keyless fallbacks, env-selected, and honestly surfaced (the
  project status view shows a "mock data" badge when the mock provider ran).
  Not deceptive.

---

## 4. Critical broken flow / production blocker

### 🔴 CRITICAL — Upload size ceiling breaks realistic videos
- **Feature:** Raw video upload.
- **Current behavior:** Frontend `validateVideoFile` allows up to
  **`MAX_RAW_UPLOAD_BYTES` = 2 GiB** and only caps *duration* (≤10 min).
  Empirically, **a 60 MB upload is REJECTED** by storage:
  *"The object exceeded the maximum allowed size"* (I tested this directly
  against production storage). The Supabase project is on the free-tier
  **50 MB global file-size limit** (bucket-level limit is `null`; the export
  part-split fallback exists precisely because of this cap).
- **Expected behavior:** A creator's 10-minute recording (realistically
  100–500 MB at 720p) uploads successfully.
- **Root cause:** **Infrastructure** — the Supabase free-tier 50 MB storage
  limit, combined with a frontend that advertises and validates 2 GiB. Any
  upload past ~50 MB fails **mid-transfer**, and the surfaced error is the
  misleading *"تعذّر إكمال الرفع. تحقق من اتصالك…"* ("check your connection"),
  which blames the network for a size rejection. **This is the exact
  "700 MB upload failure."**
- **Severity:** CRITICAL. The core capture→upload flow is broken for
  realistic file sizes on the current plan. No code change fixes this — the
  ceiling is a storage-plan limit.
- **Recommended fix (owner action — I cannot perform billing changes):**
  1. Upgrade **Supabase to Pro** (raises the global limit to 50 GB).
  2. Then set `MAX_RAW_UPLOAD_BYTES` to match the chosen plan, and
  3. Surface size-limit rejections with an honest message (distinct from
     network errors). *(Deferred deliberately — implementing an accurate
     limit before the plan decision would either lie in the other direction
     or cripple the product; this must follow the infra decision.)*

---

## 5. Missing core operations (functional gap, non-blocking)

### 🟠 HIGH — No project delete / rename / archive
- **Feature:** Project management.
- **Current behavior:** Only `create` (+ retry / export / ai-edit / tag)
  server actions exist. The two `projects.delete()` calls are **rollback
  cleanups** inside the create actions, not user operations. `projects.status`
  does not even model `'archived'`. There is **no UI and no server action** to
  delete, rename, or archive a project.
- **Expected behavior:** A creator can delete a test/mistake project and rename
  projects.
- **Root cause:** Never built — the roadmap prioritized the pipeline. RLS
  already grants `projects: own update`/`own delete`, so the backend is ready.
- **Severity:** HIGH for real usage (beta creators WILL accumulate junk they
  can't remove), but **not a production blocker** — the product functions
  without it.
- **Recommended fix:** A small follow-up build (delete + rename actions + card
  affordances). Out of scope for this verification-only pass.

---

## 6. Frontend ↔ backend alignment

No dead buttons or placeholder pages found. All quick actions, billing
buttons, editor actions, and nav links resolve to real routes/actions
(verified across this session's live tests). One minor IA note (not a bug):
the "Caption Studio" quick action links into the Brand Kit page (where the
studio lives) rather than a dedicated route — functional, slightly
label-vs-destination mismatch.

---

## 7. Recommended fix priority

| # | Item | Severity | Owner |
|---|---|---|---|
| 1 | Supabase Pro upgrade → then align `MAX_RAW_UPLOAD_BYTES` + honest size error | CRITICAL | **Owner** (billing) |
| 2 | Project delete / rename actions + UI | HIGH | Dev (next cycle) |
| 3 | `STRIPE_*` keys + Prices → verify live billing | Medium | **Owner** |
| 4 | Delete dead Dolby/Pixabay env declarations | Low | Dev (trivial) |
| 5 | `ALERT_WEBHOOK_URL` for ops alerting | Low | **Owner** |

---

## Verdict

**Merai is a real, functioning product, not a facade.** The AI editing brain —
transcription, first-draft cuts, and the re-editing assistant — is genuinely
live in production and produced correct, real edit decisions on real speech
during this audit. The single critical blocker is an **infrastructure storage
limit** (an owner billing action, not broken code), and the main functional
gap is **project management CRUD**. No code was changed in this pass — the one
critical blocker is not code-fixable, and per the audit's own rule, nothing
cosmetic was touched.
