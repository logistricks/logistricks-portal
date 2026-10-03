# Manual email → request (webhook workflow)

Trigger: `POST {n8n}/webhook/request-intake` with header `X-Portal-Secret`. Called by the portal when someone drops an
.eml / .msg on the Requests page (`/api/inbound/email`, kind = request). Same extraction and the same portal rules as the
automatic mailbox flow; the row is stamped `intake_source = manual`.

Import `request-intake-workflow.json`, edit the Config node (portal_url, portal_secret, gemini_key), activate, then set in Vercel:

- `N8N_REQUEST_INTAKE_WEBHOOK_URL` = production URL of this webhook
- `N8N_CARRIER_REPLY_WEBHOOK_URL`  = production URL of the carrier-reply webhook (`/webhook/carrier-reply`)
- `PORTAL_WEBHOOK_SECRET` (already set)

Regenerate the JSON after editing the prompt / schema: `node build-workflow.js`.
