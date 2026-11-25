# Your checklist for tonight (portal security work)

Everything here needs your accounts. Do them in this order.

## 1. Supabase (SQL editor)
- [ ] Check the live policy first: `select policyname, roles, cmd, qual from pg_policies where tablename = 'portal_users';` If you see `login_lookup` with `true`, anyone with the public key can read password hashes. Tell me what it shows.
- [ ] Run `supabase/migrations/078_security_hardening.sql` (creates `auth_attempts`, drops the open policy on `portal_users`).
- [ ] Also run the Leads migrations you still owe: `ld_010` and any later `ld_*` files.
- [ ] Decide D2: does n8n read `client_receiver_emails`, `client_whatsapp_numbers` or `active_client_by_email` with the anon key? If not, tell me and I will lock them down too.

## 2. Vercel (portal project, Settings, Environment Variables)
- [ ] Add `SESSION_SECRET` (a long random string, 40+ characters). Everyone is signed out once.
- [ ] Confirm `PORTAL_WEBHOOK_SECRET`, `CRON_SECRET`, `TRIAL_SERVICE_KEY` (24+ characters) are set.
- [ ] Open the preview deployment of branch `security-hardening` and check login and the Settings page.

## 3. Test after the above
- [ ] Log in with a real account (old password still works, and is upgraded silently).
- [ ] Enter a wrong password 9 times: expect "too many attempts".
- [ ] Settings, WhatsApp numbers: add and remove one.
- [ ] Send one test email from Settings, Emails.
- [ ] Confirm n8n workflows still work (a test request through the full flow).

## 4. Merge
- [ ] Merge `security-hardening` into `main` only after section 3 passes.

## 5. Decisions (reply to me, no work needed)
- [ ] D4 End sessions at once everywhere when a user is deactivated (extra database read per request)?
- [ ] D5 Turn off `ignoreBuildErrors` (22 type errors to fix first)?
- [ ] D6 Upgrade nodemailer to 8?
- [ ] Which markets and countries first (decides the legal wording)?
- [ ] Will real customer data go in production now? Any payments planned?

## 6. Housekeeping
- [ ] If the demo admin accounts from migration 008 exist in production, change their passwords.
- [ ] Fill the [BRACKETS] in `legal-drafts/` and get a lawyer to review before publishing anything.
- [ ] Confirm Supabase and Vercel regions, then tell me so the privacy policy can state them.
