# Compliance gaps (draft, not legal advice)

Based on the code only. Markets, real customer data and payments were not confirmed, so treat this as a checklist to discuss with a lawyer.

- **Personal data held:** names, business emails, phone numbers (WhatsApp), carrier contacts, email bodies and attachments, login names, password hashes, IP addresses (login attempts), push subscriptions. Sub-processors seen in code: Supabase, Vercel, n8n, Google (Gemini, Gmail).
- **Missing:** privacy policy, terms of service, data processing agreement for forwarders, cookie notice (only a session cookie and localStorage theme are used, so a short notice is enough), sub-processor list, breach procedure.
- **Retention and deletion:** trial data is purged after 5 days. Production emails, requests and logs have no retention rule or customer export or delete function (already an open to-do).
- **AI use:** requests and attachments are sent to Gemini. Say so in the privacy policy and check the provider's data-use terms.
- **Backups and access:** backups are an open to-do. Admin access to customer data should be logged (Activity log exists for user actions only).
- **Payments:** none in code. If added, use a hosted checkout so card data never touches this app.
- **Third-party licenses:** run `npx license-checker --summary` before any customer-facing release (not run here).


## Data inventory (from the database migrations)

| Group | Tables | Personal data | Who can see it | Retention today |
|---|---|---|---|---|
| Users and login | `portal_users`, `login_log`, `auth_attempts`, `profiles`, `push_subscriptions` | name, username, email, password hash, IP address, device push endpoint | Client admins (their own users), Logistricks | No rule. `auth_attempts` is short-lived by design |
| Requests and quotes | `freight_requests`, `quotations`, `quotation_checks`, `carrier_quotes`, `carrier_quote_*` | customer names, emails, cargo details, rates | Users of that client | No rule |
| Email content | `inbound_emails`, `outbound_emails`, `auto_reply_logs`, `intake_logs`, `outreach_log`, `task_email_log`, `approval_drafts` | full email bodies, sender and recipient addresses, attachments' text | Users of that client | No rule |
| Carriers | `carriers` | carrier contact names and emails | Users of that client | No rule |
| Settings and secrets | `smtp_settings`, `email_sources`, `client_settings`, `client_receiver_emails`, `client_whatsapp_numbers` | mailbox passwords (encrypted), phone numbers | Admins | Until deleted |
| Audit and system | `activity_log`, `user_action_log`, `system_events`, `webhook_log`, `notification*`, `undo_log` | usernames, actions, some request references | Admins | `undo_log` cleaned after 1 day. Others no rule |
| Trial | `trial_leads`, `trial_runs`, `trial_events`, `trial_admins`, `trial_prompts` | lead name and company, pasted request content | Logistricks | Parsed content deleted 5 days after last activity |
| Website | `site_leads` | name, email, company | Logistricks | No rule |

**Recipients and sub-processors seen in code:** Supabase (database), Vercel (hosting), n8n (workflows), Google Gemini (AI extraction and review), the client's own mail servers (SMTP/IMAP) and Microsoft 365 (OAuth mailboxes), web-push providers (notifications).

**Cross-border transfer:** hosting and database regions were not confirmed in the repo. Confirm them before promising anything about where data is stored.

## Licenses
Production dependencies are mostly MIT, Apache-2.0, ISC and BSD. Items to look at: two LGPL-3.0 packages (the image library's native binaries, normally fine when used as shipped), `buffers@0.1.1` (custom licence text, tiny, pulled in by a transitive dependency), and one dual-licensed `MIT OR GPL-3.0-or-later` package (use under MIT). No licence blocks selling the portal as a hosted service. Re-run `npx license-checker --production --summary` before release.
