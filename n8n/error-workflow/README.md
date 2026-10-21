# Shared error workflow → portal "Needs attention"

One workflow reports every failed n8n execution to the portal (Needs attention in the sidebar). Same problem repeating = one line with a count; new errors also go to your alert webhook.

## Set up (once)
1. Run migration 088 (system_events). In Vercel set `PORTAL_WEBHOOK_SECRET` (already there) and optionally:
   - `OWNER_ALERT_WEBHOOK_URL` — an n8n webhook (or Slack/Telegram URL) that gets `{ text, client_code, kind, title, message, workflow, node }` for every NEW error. Make it send you an email or message.
   - `OWNER_CLIENT_CODE` — your own company code: that company sees every company's events (and the unassigned ones) in Needs attention.
2. Import `shared-error-workflow.json`, paste the portal secret into the HTTP node, activate it. Do not add a trigger other than Error Trigger.
3. Open each workflow → Settings → **Error Workflow** → choose "Shared error handler (reports to the portal)". (New client copies: do this step as part of onboarding.)

## Which client an n8n error belongs to
The portal looks for a company code **as a word in the workflow name** (for example `30 · Carrier quote intake · demo1`). Name each client's copy of a workflow that way and the error lands in that client's list. No match = "unassigned": it still alerts you and shows for the owner company.

## Catching silent failures (lookups that quietly find nothing)
Add an IF node after a key lookup (for example "Get carrier", "Find request"): when nothing was found, add an HTTP Request node on the false branch:

POST https://logistricks-portal.vercel.app/api/system-events   header `X-Portal-Secret`
```json
{ "kind": "silent_noop", "workflow_name": "{{$workflow.name}}", "node": "Find request", "message": "No request found for reference {{$json.reference}}", "client_code": "demo1" }
```
It shows as a warning ("Nothing found") and repeats count up instead of piling up.

## Where continue-on-error / "Always output data" matter
In nodes where a failure must not be swallowed (sending to the portal, saving a quote), switch off "Continue on error" and "Always output data", so the execution fails and this workflow reports it. Keep them on only where an empty result is normal (and then use the silent_noop check above).
