# Build 9 Analysis — SaaS Foundation (Stripe billing, tiers, metering)

Date: 2026-07-17 · Analysis before code.

## 1. What already exists (Build 9 completes a loop, it doesn't start one)

- `TIER_LIMITS` (core): starter/creator/pro quotas (raw + output minutes).
- `usage_ledger`: the worker already meters `raw_minutes` (transcribe) and
  `export_minutes` per billing period.
- `profiles.subscription_tier` (CHECK starter/creator/pro): the fast-read
  denormalization every page already loads.

## 2. The provider decision (the house pattern, again)

`BillingProvider` interface with two implementations:
- **`StripeBillingProvider`** — fully wired against Stripe's documented REST
  API via fetch (form-encoded): Checkout Sessions (subscription mode, price
  by `lookup_key`, trial support), Billing Portal sessions, and webhook
  signature verification (HMAC-SHA256 of `t.payload` against the signing
  secret — the documented scheme). No SDK dependency (the VGF precedent).
  Activated by `STRIPE_SECRET_KEY` (+ `STRIPE_WEBHOOK_SECRET`); **UNVERIFIED
  until the first live call** — exactly like AssemblyAI in Phase 1. Price
  objects are referenced by lookup keys (`creator-monthly` …), so the owner
  creates them in the Stripe dashboard without code changes.
- **`MockBillingProvider`** — keyless default: checkout "succeeds"
  immediately (upserts the subscription + syncs the tier) and returns to the
  billing page; portal returns to the billing page. The entire
  subscribe → enforce → cancel loop is exercisable with zero keys (dev,
  tests, this build's E2E).

## 3. Data (one migration, additive)

`20260717120000_billing.sql`:
- `subscriptions` — one per owner (`owner_id` unique): stripe customer/
  subscription ids, tier, status, interval, `current_period_end`,
  `cancel_at_period_end`, `trial_end`. Owner **read-only** RLS; all writes
  are service-role (webhook/actions) — billing state is never client-writable.
- `billing_events` — webhook idempotency: `event_id` unique, type, payload,
  processed_at. Service-role only.
`profiles.subscription_tier` stays the derived read model, synced on every
subscription change (`tierForSubscription`: active/trialing/past_due keep
the paid tier; anything else falls back to starter).

## 4. Core `billing.ts` (pure, tested)

Plans catalog (creator/pro × monthly/annual, trial days, lookup keys),
`planForLookupKey`, `subscriptionStatusSchema`,
`ACTIVE_SUBSCRIPTION_STATUSES`, `tierForSubscription`, and quota math:
`usedThisCycle + added > limit` → `quotaExceeded(kind, tier, used, added)`.

## 5. Enforcement (server-authoritative)

- **Raw minutes**: `createProjectWithUpload` + `createProjectWithScenes`
  check the month's `usage_ledger` raw sum + the new duration against the
  owner's tier → `quota-exceeded` (translated).
- **Output minutes**: `requestExportRender` checks export minutes the same
  way. Client copy explains and links to the billing page.

## 6. Surfaces

- **`/dashboard/billing`**: current plan (status/renewal/trial/cancel-at-
  period-end), usage meters (raw + export vs tier), plan grid with
  monthly/annual toggle → checkout, "manage subscription" → portal.
  AppHeader gains the link.
- **Webhook** `app/api/stripe/webhook/route.ts`: signature verify →
  `billing_events` idempotency → subscription upsert + tier sync. The
  event→row mapping is a pure, tested function.

## 7. Enterprise-readiness (architecture note)

Tiers are data (`TIER_LIMITS` + plans catalog): an enterprise tier is one
more entry + Price lookup key; per-seat/team billing later hangs off
`subscriptions` (an `org_id` column + a members table) without reshaping
anything shipped here.

## 8. Blocker declared honestly

Live Stripe verification needs owner-created keys (`STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`) and Prices carrying the documented lookup keys.
Everything is E2E-verified through the mock provider; the Stripe path is
wired to the documented API and flips on via env — the AssemblyAI playbook.

## 9. Verification
Core plan/quota/mapping tests · webhook mapping + idempotency tests ·
PGlite migration validation · suites/typecheck/build/parity · live E2E (mock
provider): subscribe → tier flips → quota enforced → cancel state rendered.
