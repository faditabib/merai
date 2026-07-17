-- Build 9 — SaaS foundation: subscription state + webhook idempotency.
-- Billing state is NEVER client-writable: owners get read-only RLS on their
-- subscription; all writes come from the service role (webhook/actions).
-- profiles.subscription_tier stays the derived fast-read model, synced on
-- every subscription change.

create table if not exists public.subscriptions (
  id                      uuid primary key default gen_random_uuid(),
  owner_id                uuid not null unique references public.profiles (id) on delete cascade,
  stripe_customer_id      text unique,
  stripe_subscription_id  text unique,
  tier                    text not null default 'starter'
                          check (tier in ('starter', 'creator', 'pro')),
  status                  text not null default 'active',
  interval                text check (interval in ('monthly', 'annual')),
  current_period_end      timestamptz,
  cancel_at_period_end    boolean not null default false,
  trial_end               timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions: own select" on public.subscriptions;
create policy "subscriptions: own select" on public.subscriptions
  for select using (owner_id = auth.uid());
-- No insert/update/delete policies: service-role writes only.

-- Webhook idempotency ledger — event ids are unique; a replayed delivery
-- is a no-op. Service-role only (RLS on, no policies).
create table if not exists public.billing_events (
  id            uuid primary key default gen_random_uuid(),
  event_id      text not null unique,
  type          text not null,
  payload       jsonb not null default '{}'::jsonb,
  processed_at  timestamptz not null default now()
);

alter table public.billing_events enable row level security;
