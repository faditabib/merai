# Production Hardening Pass — 2026-07-17

Scope: reliability, stability, production readiness ONLY. No features.
Companion to [PRODUCT_REVIEW_2026_07.md](PRODUCT_REVIEW_2026_07.md).

## Production log review (Railway worker, full history)

Exactly ONE error family found: job `82eb42fb` (render_export) — the
0-segment EDL export observed during the 7.5 E2E — failed the concat join
identically on 3 attempts before permanent failure. No other error classes
in the live logs (every other job in history completed on attempt 1). The
alert webhook path fired correctly (log-only, `ALERT_WEBHOOK_URL` unset —
still an owner action).

## Fixes shipped (each with a regression test where testable)

1. **Empty-edit exports rejected at three layers**
   - Export panel: start disabled + translated explanation when the
     timeline is empty (the creator learns WHY, before the click).
   - `requestExportRender`: server gate reads the pinned EDL version and
     refuses (`empty-edl`) — defense in depth against stale clients.
   - Worker `render-export`: a 0-segment EDL is a `PermanentJobError`
     (deterministic — no retry burn). *Test: PGlite, rejects instance.*

2. **Stitch failures are visible and recoverable** (was: a dead stitch
   stranded the project in `uploading` forever, invisibly)
   - Runner `surfacePermanentFailure` now includes `stitch` → project
     `error` (the status view's existing retry surface appears).
     *Test: PGlite drive of `processOne` — job failed + project error.*
   - `retryProcessing` requeues a FAILED stitch job (attempts reset, locks
     cleared, project back to `uploading`) instead of wrongly enqueueing a
     transcribe against the never-created stitched source.

3. **Mock billing can never engage implicitly in production**
   (was: a keyless production deployment would hand out FREE tier upgrades
   through the mock's instant-activation checkout)
   - `createBillingProvider` in production requires either
     `STRIPE_SECRET_KEY` or an explicit `BILLING_PROVIDER=mock` opt-in;
     otherwise checkout fails loudly (`checkout-failed` surface, translated).

## Loading / empty / failure states — audit result

Audited across dashboard, recorder, editor, billing, onboarding, exports
(details in the review doc §2). All error surfaces are translated; the two
weak recovery paths found are FIXED above (stitch) or ranked #4 in the
review backlog (recorder upload-error recovery — a UX change, deferred to
the approved polish sprint, not silently smuggled into hardening).

## Critical-flow resilience check

- Upload → transcribe → analyze: retryable end-to-end (existing `retry`
  action; permanent failures surface on the project).
- Scenes → stitch: NOW surfaces + retries (fix 2).
- Export: cancel checkpoints, part-split fallback, cap/malformed-snapshot
  permanent classification, and now empty-EDL classification.
- Billing: webhook idempotent + signature-verified + replay-windowed;
  entitlement unknowns degrade DOWN (never upward); prod misconfiguration
  fails loudly (fix 3).
- Queue: dedupe keys on every producer; backoff verified in suite.

## Verification

269 → **271 tests green** (118 core + 81 worker + 72 web) · typecheck ✓ ·
`next build` ✓ · parity 546 = 546 · deployed: web (Vercel) + worker
(Railway — runner + render-export changed).

## Remaining production blockers (owner actions, unchanged)

`STRIPE_*` keys + Prices · `ALERT_WEBHOOK_URL` · Vercel SSO toggle /
merai.studio domain · Supabase Pro (part-split fallback covers meanwhile).
