-- Security hardening (2026-07-17 audit) — CRITICAL: privilege-escalation fix.
--
-- The "profiles: own update" RLS policy scopes updates to the owner's row,
-- but RLS is ROW-level, not COLUMN-level. With table-wide UPDATE granted to
-- `authenticated`, a signed-in user could update ANY column of their own
-- profiles row from the browser — including `subscription_tier`, granting
-- themselves Pro-tier quotas and bypassing billing entirely (the usage gate
-- reads profiles.subscription_tier). Verified exploitable in the live audit.
--
-- Fix: remove table-wide UPDATE from authenticated/anon and re-grant only the
-- self-editable columns. `subscription_tier` becomes service-role-only (the
-- Stripe webhook / billing provider already write it via the service role,
-- which is unaffected by these grants). The row-scoping RLS policy stays.

revoke update on public.profiles from authenticated;
revoke update on public.profiles from anon;

-- Re-grant only the columns a user may legitimately edit about themselves.
grant update (display_name, locale) on public.profiles to authenticated;
