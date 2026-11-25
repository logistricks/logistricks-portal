# Security audit: Logistricks portal

Branch `security-hardening`. Scope: this repo only. Everything below was checked in code; **nothing was tested against the live Supabase, Vercel, n8n or Gemini** (the sandbox cannot reach them). Items marked UNVERIFIED need a check there.

## Findings

| ID | Severity | Where | Problem | Fix | Status |
|---|---|---|---|---|---|
| S1 | Critical (UNVERIFIED live) | migration 008, policy `login_lookup` | The anon role can `SELECT … USING (true)` on `portal_users`, including `password_hash`. Anyone with the public anon key could read every hash. | `supabase/migrations/078_security_hardening.sql` drops the policy and revokes anon. **Not applied.** | Open: decision D1 |
| S2 | High | `portal_users.password_hash` | Unsalted SHA-256, compared as plain strings. | `lib/password.ts`: salted scrypt. Old hashes still work and are upgraded at next login. | Fixed in code |
| S3 | High | `/api/auth/login` | No lockout or throttling. | 8 failures per account and 30 per IP in 15 min give 429. Needs table `auth_attempts` (in 078); falls back to memory without it. | Fixed in code, needs 078 |
| S4 | High (dependency) | `next` and others | `npm audit` reported 1 critical, 7 high. | `npm audit fix`: Next.js 15.5.29, zod, sharp, puppeteer-core and others updated. | Fixed |
| S5 | Medium | Session cookie | Signed with the Supabase service-role key. | `SESSION_SECRET` is used when set. | Fixed in code, needs D3 |
| S6 | Medium | 17 webhook/cron routes, 16 session verifiers | Secrets and HMAC signatures compared with `===`. | `safeEqual` (timing-safe) everywhere. | Fixed |
| S7 | Medium | Admin checks | A deactivated user's cookie kept working up to 8 hours. | `requireAdmin` and role checks now re-read `is_active` per request. | Fixed for role-checked routes. Plain session routes: open (D4) |
| S8 | Medium | Settings → WhatsApp numbers | Browser used the anon Supabase client directly. | Moved to the session-checked API `/api/settings/numbers`. | Fixed |
| S9 | Medium | Email-source and SMTP hosts | Admin-supplied hosts let the server connect to internal addresses (SSRF). | `lib/net-guard.ts` blocks loopback, private, link-local and metadata ranges, checked after DNS lookup, in IMAP test and fetch and in SMTP send. | Fixed |
| S10 | Medium | All responses | No security headers. | HSTS, nosniff, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy, a conservative CSP (no framing, objects, base or foreign forms). Script CSP not enforced: Next inline bootstrap needs nonces. | Fixed (partial CSP) |
| S11 | Low | `next.config.mjs` | `typescript.ignoreBuildErrors: true` hides 22 type errors. Two config files existed. | Duplicate `next.config.ts` removed. Flag left on (D5). | Partly fixed |
| S12 | Low | Anon policies 011, 012, 010 | `anon_lookup` on receiver emails and WhatsApp numbers and the `active_client_by_email` view are readable by anon. n8n may rely on them. | Left commented in 078. | Open: D2 |
| S13 | Low | `nodemailer` 6.10.1 | Two advisories (envelope.size SMTP injection, domain interpretation). The portal never passes user input as `envelope.size`. Upgrading to 8 added 6 type errors. | Not changed. | Open: D6 |
| S14 | Low | `next` (via postcss), `exceljs` (uuid) | Remaining audit items are moderate and fix only with breaking changes. | Not changed. | Open |
| S15 | Info | Tenancy | Isolation is per-query `.eq("client_code", …)` because the service role bypasses RLS. Triaged the id-only updates: approval-cycles, undo, carrier-quotes (disregard, move) all check ownership first. No cross-tenant hole found in what was read. About 80 other scan hits were **not individually reviewed**. | None. Recommend a second pass. | Partial |

## Checked, no issue found
- Secrets: no `.env`, keys or tokens in the tree or the last 200 commits (patterns for JWTs, `sk-`, Google, GitHub, AWS, Slack, private keys). `service_role` hits are RLS policy names.
- `dangerouslySetInnerHTML`: two uses in `app/layout.tsx`, both fixed strings with no user data.
- Trial uploads: 10 MB file cap, 20,000 character text cap, try and failure limits per lead.
- `/api/service/trial-leads`: timing-safe bearer check.

## Not done or not testable here
- `next build` fails in the sandbox only because Google Fonts cannot be fetched. Type check was used instead (22 errors, same as before).
- No live test of login, lockout, RLS or n8n flows.
- LLM and prompt-injection exposure (n8n, Gemini) was not reviewed in depth.
- Inbound webhook payloads (`/api/inbound/*`) trust `client_code` from the n8n caller, by design, behind the shared secret.
- Rate limits on public endpoints other than login and trial login were not added.

## Decisions needed
- **D1** Apply migration 078 in Supabase (first confirm the live policy with `select * from pg_policies where tablename='portal_users'`).
- **D2** Does n8n use the anon key for receiver emails, WhatsApp numbers or `active_client_by_email`? If not, uncomment those lines in 078.
- **D3** Set `SESSION_SECRET` in Vercel (long random string). All users are signed out once.
- **D4** Should deactivation or role change end sessions at once on every route (adds a database read per request)?
- **D5** Turn off `ignoreBuildErrors` after fixing the 22 type errors?
- **D6** Upgrade nodemailer to 8 (needs small type fixes and a send test).

## Manual follow-ups
1. Run `npm run test:security` after every change to auth code.
2. After 078, log in as an existing user and as a wrong-password user 9 times to see the 429.
3. Rotate the seeded demo admin passwords from migration 008 if they exist in production.
4. Add the same checks to the Leads app: its `ld_*` tables use RLS with the service role.
