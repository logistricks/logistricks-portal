# Trial workflows (lead trial portal)

Two webhook workflows used by `try.logistricks.com` through the portal (`/api/trial/parse-request`, `/api/trial/parse-quote`).
They answer the portal directly and write nothing to the portal database.

| Workflow | Path | Prompts |
|---|---|---|
| `trial-request-workflow.json` | `POST /webhook/trial-request` | Step 1: the request extraction prompt and schema from `../request-intake`, **unchanged**. Step 2: `reply-prompt.md` (new): missing items, `suggested_reply`, `port_warning`, `language`. |
| `trial-quote-workflow.json` | `POST /webhook/trial-quote` | The carrier extraction prompt and schema from `../carrier-reply`, **unchanged**. |

The request extraction prompt has no reply or port-check output, so those come from the second, separate step.

## Set up
1. Import both JSON files into n8n.
2. Edit the **Config** node in each: `portal_secret` (same value as `PORTAL_WEBHOOK_SECRET` in Vercel), `gemini_key`, `gemini_model`.
3. Activate both, then set in Vercel:
   - `N8N_TRIAL_REQUEST_WEBHOOK_URL` = production URL of `/webhook/trial-request`
   - `N8N_TRIAL_QUOTE_WEBHOOK_URL` = production URL of `/webhook/trial-quote`
   - `CRON_SECRET` (any random string; Vercel Cron sends it to `/api/trial/purge`)
   - `TRIAL_ADMIN_USER` and `TRIAL_ADMIN_PASSWORD_HASH` = login for the separate owner console at `try.logistricks.com/admin`. It has nothing to do with the client portal login. The hash is SHA-256 hex: `echo -n 'your-password' | shasum -a 256`. Unset means the console stays closed.
   - optional `TRIAL_URL` (default `https://try.logistricks.com`)
4. Run migration `060_trial_portal.sql`.
5. Add the domain `try.logistricks.com` to the same Vercel project and a CNAME in Cloudflare.

Regenerate after editing a prompt: `node build-workflow.js`.
