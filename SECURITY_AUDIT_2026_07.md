# Merai — Security, Reliability & Production Audit (2026-07-17)

Auditor role: Senior Security Engineer / AppSec Auditor / Production
Reliability Engineer. Method: Graphify architecture mapping → full source
review of auth, RLS, storage, worker, API routes, and infra config → **live
exploit testing** against the production Supabase project with throwaway
users. Findings that were exploitable were proven live, then fixed and
re-tested.

---

## 1. Executive summary

Merai's security architecture is **fundamentally sound**: deny-by-default
RLS on every table, owner-namespaced private storage buckets with folder-
scoped policies, service-role isolation for privileged writes, signature-
verified idempotent billing webhook, `execFile` (no shell) for all ffmpeg
invocation, no `dangerouslySetInnerHTML`/`eval` anywhere, and the service-
role key correctly kept out of the client bundle.

The audit found **one CRITICAL vulnerability** — a column-level privilege
gap that let any signed-in user grant themselves a paid subscription tier
(billing bypass). It was **confirmed by live exploit, fixed via a column-
privilege migration, and re-verified closed**. One genuine LOW open-redirect
was also fixed. Tenant isolation itself (cross-user data access) was tested
and is **intact** — a user sees zero of another user's rows or files.

The main remaining risk is **operational, not code**: the free-tier Supabase
50 MB per-file storage cap is the root cause of the 700 MB upload failure,
and there is no request rate limiting or error observability yet. These are
owner/infra actions, documented below.

## 2. Security score

**7.5 / 10** before this audit's fixes · **8.5 / 10** after.

Deductions remaining: no rate limiting (−0.5), no observability/alerting wired
(−0.5), storage plan cap causing a broken core flow (−0.5).

---

## 3. CRITICAL vulnerabilities

### C-1 — Subscription-tier privilege escalation (billing bypass) — FIXED ✅
- **Severity:** Critical (billing bypass / privilege escalation).
- **Location:** `supabase/migrations/20260708000000_init.sql:335` — the
  `profiles: own update` RLS policy; exploited via `profiles.subscription_tier`.
- **Risk:** RLS is row-level, not column-level. `authenticated` held table-
  wide UPDATE, so any signed-in user could run
  `supabase.from('profiles').update({ subscription_tier: 'pro' }).eq('id', me)`
  straight from the browser and grant themselves Pro quotas — the usage gate
  (`usageGate` in `app/actions/projects.ts`) reads `profiles.subscription_tier`,
  so this fully bypasses Build 9 billing. **Proven live**: the update returned
  `{subscription_tier:"pro"}` and persisted.
- **Fix (applied + live-verified):** migration
  `20260717150000_profiles_tier_lockdown.sql` revokes table-wide UPDATE from
  `authenticated`/`anon` and re-grants only `(display_name, locale)`.
  `subscription_tier` is now service-role-only (webhook/provider unaffected).
  Re-test: self-upgrade → `permission denied` (tier stays `starter`);
  display_name self-edit still works; service-role tier sync still works.

## 4. HIGH priority issues

### H-1 — 700 MB upload failure: free-tier storage cap (production blocker)
- **Severity:** High (core flow broken for real videos).
- **Location:** infra — Supabase project storage limit; surfaced at
  `apps/web/src/lib/upload/tus-uploader.ts` `onError` →
  `upload.errors.upload-failed` ("تعذّر إكمال الرفع…").
- **Root cause (confirmed):** all three buckets have `file_size_limit: null`
  (queried live), so they inherit the **project global limit — 50 MB on the
  free tier**. Client validation (`validate.ts`) permits up to
  `MAX_RAW_UPLOAD_BYTES` = 2 GiB / 10 min, so the browser accepts a 700 MB
  file, uploads until it crosses 50 MB, and Supabase Storage rejects the
  resumable transfer → tus `onError` → the generic failure message. Exports
  already work around this with a 45 MB part-split fallback; **raw ingestion
  has no such fallback**, so any real-world video fails.
- **Recommended fix (OWNER action — not a code change):**
  1. Upgrade Supabase to Pro.
  2. Raise the project storage upload limit, and set an explicit bucket
     `file_size_limit` on `raw-uploads` aligned to the product cap (e.g. the
     bitrate ceiling for 10 min).
  3. **Then** align the client `MAX_RAW_UPLOAD_BYTES` to that real limit so
     the browser rejects over-cap files up front with a clear message instead
     of failing mid-transfer. *(Deliberately NOT changed here — lowering the
     cap is a product decision, and raising storage is an owner action.)*

### H-2 — No request rate limiting on server actions / webhook
- **Severity:** High (cost-abuse / DoS exposure).
- **Location:** all server actions (`requestAiEdit`, `requestExportRender`,
  `createProjectWithUpload`, `startCheckout`) and `/api/stripe/webhook`.
- **Risk:** Nothing throttles request volume. The tier quota gate caps
  raw/export *minutes* per billing cycle (a real backstop against the most
  expensive abuse), but a user can still hammer AI-edit/export enqueues or
  the webhook endpoint. At beta scale this is low-likelihood; at public scale
  it invites cost-abuse and provider-quota exhaustion.
- **Recommended fix:** add per-user/IP rate limiting (Upstash Ratelimit or a
  Postgres token-bucket) on the mutating actions and the webhook. *(Not
  implemented — it is new middleware, outside "critical fix only" scope.)*

## 5. MEDIUM priority issues

### M-1 — Open redirect in the email-confirm callback — FIXED ✅
- **Severity:** Medium→Low (phishing redirect after confirm).
- **Location:** `apps/web/src/app/auth/confirm/route.ts`.
- **Risk:** `next` came from the query string and fed
  `NextResponse.redirect(new URL(next, base))`; `next=//evil.com` or an
  absolute URL redirects to an external origin post-confirmation.
- **Fix (applied):** `next` is accepted only when it is a same-site relative
  path (`startsWith("/")` and not `"//"`), else defaults to `/dashboard`.

### M-2 — `exports` / `projects` / `video_uploads` allow full-row self-update
- **Severity:** Medium (integrity, not confidentiality).
- **Location:** owner UPDATE policies in `init.sql`.
- **Risk:** these policies are column-wide (same class as C-1) but scoped to
  the user's OWN row with `check (owner_id = auth.uid())`. A user can flip
  their own `exports.status`/`storage_path` or `projects.status`, but storage
  RLS still blocks reading any folder but their own, so there is **no cross-
  tenant path** — only self-inflicted UI/state inconsistency. Not exploitable
  for data theft.
- **Recommended fix (defence-in-depth, deferred — not a blocker):** narrow
  these to service-role for worker-owned columns (`status`, `progress`,
  `storage_path`, `parts`, `size_bytes`) the same way C-1 was fixed.

### M-3 — `ALERT_WEBHOOK_URL` unset — permanent failures are log-only
- **Severity:** Medium (operational blindness).
- **Location:** worker `alert.ts`; env not set on Railway.
- **Risk:** permanent job failures (and the empty-export class fixed in the
  hardening sprint) fire alerts to a no-op sink; no one is paged.
- **Recommended fix (owner):** set `ALERT_WEBHOOK_URL` (Slack/Discord) on the
  worker. 30 seconds.

## 6. LOW priority issues

- **L-1 — No security response headers** (CSP, X-Frame-Options,
  Referrer-Policy, HSTS is Vercel-default). Low XSS blast-radius given no
  innerHTML, but a CSP would harden defence-in-depth. *(Config, not a bug.)*
- **L-2 — No app-level observability** (Sentry). Errors are `console.error`
  only; production issues are invisible until a user reports them. Ranked #6
  in the product review; recommended before public launch.
- **L-3 — Verbose provider errors in worker logs** (ffmpeg command lines).
  Not user-facing and not secret-bearing, but noisy; fine for beta.

## 7. Reliability issues (verified during the hardening sprint + this audit)

- **R-1 — 0-segment EDL exports** — FIXED in the hardening sprint (rejected
  at panel/action/worker; `PermanentJobError`). Re-confirmed present in code.
- **R-2 — Stitch permanent-failure surfacing + retry** — FIXED in hardening
  (runner marks project `error`; `retryProcessing` requeues the stitch).
- **R-3 — Mock billing in production** — FIXED in hardening (`createBilling
  Provider` requires explicit opt-in or `STRIPE_SECRET_KEY` in prod).
- **R-4 — Raw-upload ingestion has no over-cap fallback** (see H-1) — the
  one remaining reliability gap on a core flow; owner/infra fix.
- **Auth-gating audit:** every protected page (`dashboard`, `billing`,
  `record`, `onboarding`, `brand-kit`, project view/edit) calls `getUser()`
  (validated, not `getSession()`) and redirects to `/login` when absent. No
  dead/unprotected routes found. The proxy refreshes sessions with `getUser()`.
- **Queue integrity:** `jobs` has a read-only owner policy (no client
  insert/update/delete); all enqueues go through the service role; dedupe
  keys on every producer; `claim_next_job`/`complete_job`/`fail_job` execute
  is revoked from `public`/`anon`/`authenticated`.

## 8. Recommended fixes ranked by impact

| # | Issue | Severity | Action | Status |
|---|---|---|---|---|
| 1 | C-1 subscription-tier escalation | Critical | column-privilege migration | **FIXED + re-verified** |
| 2 | H-1 700 MB upload (50 MB cap) | High | Supabase Pro + bucket limit + align client cap | **Owner action** (root cause proven) |
| 3 | M-1 open redirect | Medium | relative-path guard | **FIXED** |
| 4 | H-2 rate limiting | High | Upstash/PG token bucket on mutations | Deferred (new middleware) |
| 5 | M-3 alert webhook unset | Medium | set `ALERT_WEBHOOK_URL` | Owner action |
| 6 | L-2 observability (Sentry) | Low | wire web+worker | Recommend pre-launch |
| 7 | M-2 broad self-update policies | Medium | narrow to service-role columns | Deferred (defence-in-depth) |
| 8 | L-1 security headers / CSP | Low | `next.config` headers | Deferred |

## 9. What was tested and found SAFE

- **Tenant isolation**: a signed-in user reading `projects`/uploads/exports
  with `.neq('owner_id', me)` returned **0 rows**; storage folder policies
  block cross-user file access. Isolation is intact.
- **Privilege boundaries** post-fix: `subscriptions`/`usage_ledger`/`jobs`
  are read-only to users (no insert/update/delete policies) — quota and
  billing state cannot be forged client-side.
- **Injection**: all ffmpeg calls use `execFile` with array args (no shell);
  filenames fed to ffmpeg are worker-generated, not user-controlled.
- **XSS**: no `dangerouslySetInnerHTML`, `innerHTML`, `eval`, or `new
  Function` in the codebase; all rendering goes through React escaping.
- **Secrets**: only `NEXT_PUBLIC_SUPABASE_URL` + anon key are public (by
  design); `SUPABASE_SERVICE_ROLE_KEY` and all provider keys are server/
  worker-only with no `NEXT_PUBLIC_` prefix; no secrets logged.
- **Webhook**: HMAC signature-verified with a replay window, idempotent via
  `billing_events`, unknown statuses/plans degrade DOWN, 503 when unconfigured.

## 10. Production-readiness testing

271 tests green (118 core + 81 worker + 72 web) · typecheck ✓ · `next build`
✓ · new migration validated through the worker's PGlite suite (which applies
every migration) · the C-1 fix and M-1 fix re-verified by live exploit replay.

---

## Owner action checklist (blocks public launch, not beta code)

1. **Supabase Pro** + raise storage upload limit + set `raw-uploads`
   `file_size_limit` (fixes H-1 / the 700 MB failure).
2. `ALERT_WEBHOOK_URL` on Railway (M-3).
3. `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` + Prices (Build 9 go-live).
4. Consider rate limiting (H-2) and Sentry (L-2) before opening signups
   broadly.
