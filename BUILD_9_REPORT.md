# Build 9 Report — SaaS Foundation (Stripe billing, tiers, metering)

Date: 2026-07-17 · Analysis: [BUILD_9_ANALYSIS.md](BUILD_9_ANALYSIS.md).
The final roadmap build — Merai now has production billing rails.

## 1. What was built

- **Core billing math** (`billing.ts`, pure): plans catalog (creator/pro ×
  monthly/annual, 7-day trials, Stripe Price **lookup keys** — no hardcoded
  price ids), status schema tolerant of future provider statuses (unknown →
  canceled → starter), `tierForSubscription` (trialing/active/past_due keep
  the paid tier), quota math over the existing `TIER_LIMITS`, and the pure
  webhook mapping `subscriptionRowFromStripe` (unknown lookup keys → null,
  never a guessed tier).
- **Provider interface** (the house pattern): `StripeBillingProvider` wired
  against Stripe's documented REST API via fetch — Checkout Sessions
  (subscription mode, trials, owner_id in metadata), Billing Portal, prices
  by lookup key; `MockBillingProvider` (keyless default) activates
  immediately through the same service-role upsert + tier sync the webhook
  performs. Selection by `STRIPE_SECRET_KEY` / `BILLING_PROVIDER`.
- **Webhook** (`/api/stripe/webhook`): HMAC signature verification (pure,
  tested, replay-window enforced), `billing_events` idempotency (unique
  event_id — replays are 200 no-ops), subscription upsert + `profiles.
  subscription_tier` sync; 503 when unconfigured (never accepts
  unverifiable events).
- **Migration** (applied live, PGlite-validated): `subscriptions` (one per
  owner, owner READ-ONLY RLS — billing state is never client-writable) +
  `billing_events` (service-role only).
- **Tier enforcement** (server-authoritative): `createProjectWithUpload` and
  `createProjectWithScenes` gate raw minutes (cycle usage + new duration vs
  tier); `requestExportRender` gates export minutes. Translated
  `quota-exceeded` error pointing to the billing page.
- **`/dashboard/billing`**: current plan (status, renewal/trial/cancel-at-
  period-end), usage meters (raw + export vs entitled tier), plan grid with
  monthly/annual toggle + trial badges → checkout, "manage subscription" →
  portal (upgrades/downgrades/cancel/resume live there). AppHeader link.
- **Enterprise-ready by data**: a new tier = one `TIER_LIMITS` entry + one
  plan row + a Price lookup key.

## 2. Tests (252 → 269)

Core `billing.test.ts` (12): plan catalog/resolvers, status→tier matrix
incl. unknown-status degradation, quota boundary math, webhook mapping
(active/canceled/trialing/unknown-plan). Web `billing-signature.test.ts`
(5): valid, tampered body, wrong secret, replay window (both directions),
malformed headers. Full suites green: **118 core + 79 worker + 72 web =
269**. Typecheck ✓, `next build` ✓ (routes `ƒ /[locale]/dashboard/billing`,
`ƒ /api/stripe/webhook`), parity **545 = 545**.

## 3. Verification (live backend, mock provider — the full loop)

Throwaway starter user with the raw quota EXHAUSTED (seeded 60/60):

| Step | Result |
|---|---|
| Billing page | tier المجانية, meter **60/60** (full, red), plans + trials ✓ |
| Enforcement | real recorded take → upload BLOCKED: "وصلت إلى حد دقائق خطتك لهذا الشهر…" ✓ |
| Subscribe (mock checkout) | one click → back with `checkout=success` ✓ |
| After | tier **المبدع · نشط**, renewal date, meters **60/300** and 0/90, creator card = "خطتك الحالية", manage button ✓ |
| DB | `subscriptions` {creator, active, monthly, mock_cus_…} + `profiles.subscription_tier=creator` (what the gate reads) ✓ |
| Cleanup | user + rows deleted, 0 leftovers |

## 4. Owner actions for LIVE Stripe (the declared blocker)

1. Create the Stripe account; add `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`
   to Vercel env (the provider flips on with zero code changes).
2. Create 4 Prices with lookup keys `creator-monthly`, `creator-annual`,
   `pro-monthly`, `pro-annual`.
3. Point a webhook endpoint at `/api/stripe/webhook` (subscription events).
The Stripe path is wired to the documented API but **UNVERIFIED until the
first live call** — the Phase 1 AssemblyAI playbook, flagged explicitly.

## 5. Production

Migration applied live; web deployed via this build's Vercel push (worker
unchanged).
