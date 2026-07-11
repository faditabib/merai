# Production Alignment Report

Date: 2026-07-11 · Goal: bring Vercel production up to master and verify the
whole stack end-to-end after Builds 5, 6A, and 6A.1.

## 1. Deployment versions (verified, not assumed)

| Surface | Deployment | Code | Status |
|---|---|---|---|
| Web (Vercel `merai-web`) | `dpl_3dQQGoQCkLuLMkWgPCsZahStkjcK`, created 2026-07-11 11:35 +03 | master `357fc5e` (Build 6A.1) | ● Ready, aliased to merai-web-faditabibs-projects.vercel.app + merai-web-pi.vercel.app |
| Worker (Railway `merai-worker/worker`) | `64ed8c8a`, deployed 2026-07-11 08:48 +03 | master `357fc5e` | SUCCESS, worker `worker-1d820e0b` polling |

Before this pass, Vercel production was 15h behind (Phase A commit,
missing Build 5's version-aware readers, Build 6A's creator UX, and the
QA fixes). Both surfaces now run the same commit.

## 2. Environment variables (names verified, values never displayed)

- **Vercel (Production)**: `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — all
  present, encrypted. ✓
- **Railway (worker)**: `SUPABASE_DB_URL`, `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `ASSEMBLYAI_API_KEY`, `ANTHROPIC_API_KEY`
  (+ Railway platform vars). ✓
- `ALERT_WEBHOOK_URL` is intentionally unset → alerting is log-only until
  a webhook exists (optional, noted under blockers).

## 3. Production smoke test — full creator flow

**Method.** The Vercel URL is still behind SSO deployment protection
(anonymous probe: 302 → vercel.com/sso-api), so a browser cannot exercise
the deployed URL directly. The smoke therefore ran the **same commit's
production build** (`next build` + `next start`) against the **live
production backend** — live Supabase (auth/storage/DB), the **Railway
worker** (local worker stopped, so Railway provably did all processing),
live AssemblyAI, live Haiku — driven by headless Chrome. The Vercel
deployment itself was verified as Ready + aliased + serving (the 302 is
the protection layer, upstream of the app).

**Results (fresh 16s Arabic clip, project `6c258a89…`):**

| Step | Result | Measurement |
|---|---|---|
| Auth | ✓ login → dashboard | |
| Upload (tus → Supabase) | ✓ project created | 16s clip, 229KB |
| Transcription (AssemblyAI via Railway) | ✓ attempt 1 | 141.1s job wall (provider-side variance — the same clip took 12.8s yesterday; queue claim was instant, no retries) |
| AI analysis (Haiku via Railway) | ✓ attempt 1 | 5.8s |
| Editor | ✓ video, transcript, timeline loaded | |
| AI decision card | ✓ opens unclipped, restore visible | note **in Arabic** from the new prompt: "يعني كحرف ربط تعبيري بدون معنى محدد في السياق" — the 6A.1 prompt change confirmed live in production |
| Export (render_export on Railway) | ✓ attempt 1 | 12.2s job wall; UI showed done in 14s |
| Download | ✓ signed URL opened | exports row: `uploaded`, 458,753 bytes, 11.991s output, parts=1, error=null |

Screenshots: `alignment-ai-card.png`, `alignment-export-done.png`
(session scratchpad). All three jobs completed on **attempt 1** — no
retries anywhere in the run.

## 4. Blockers / owner actions

1. **Vercel SSO deployment protection still ON** (`all_except_custom_domains`)
   — the production URL redirects anonymous visitors to Vercel SSO, which
   also blocks true in-browser testing of the deployed URL. One command
   when ready: `vercel project protection disable merai-web --sso`, or
   attach the merai.studio custom domain (bypasses protection by
   definition). Access-control change — deliberately left to the owner.
2. **`ALERT_WEBHOOK_URL` unset** — permanent-failure alerts are log-only.
   Add a Slack/Discord webhook var on Railway when available (30 seconds).
3. **Supabase Pro** still pending — the part-split fallback covers >50MB
   exports meanwhile (production-exercised earlier: 2 parts, byte-exact).
4. **Note, not a blocker:** AssemblyAI wall time varies widely (12.8s →
   141.1s for the same 16s clip). Single attempt, no errors — provider
   variance. Worth a UI expectation tweak only if creators complain.

## 5. Conclusion

Production is aligned: web and worker both run master `357fc5e`, env is
complete on both platforms, and the full creator flow — auth, upload,
transcription, AI analysis, editor, AI decision cards (Arabic notes),
export, download — passed against the live production backend with zero
retries. The only gate between the current deployment and real users is
the SSO toggle / custom domain decision.
