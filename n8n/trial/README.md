# Trial workflows (lead trial portal)

The trial page (`try.logistricks.net`) reads emails through n8n. Nothing is saved by these workflows.

| Workflow in n8n | Webhook | What it does |
|---|---|---|
| `40 · Trial · Request email` (`40-trial-request-email.json`) | `POST /webhook/trial-request` | Step 1: the same extraction prompt as `20 · Core · Request intake` (shipment type, CBM, package and truck type, temperature, ready date, legs and alternative destinations, notes, suggested reply). Step 2 (`rfq-prompt.md`): port check and the carrier RFQ email. |
| `30 · Carrier · Quote intake` | `POST /webhook/trial-quote` | The trial quote door of the live carrier workflow. Same prompt as production, saves nothing. |

Both check the `Portal secret` header on the webhook. Gemini calls go through `00 · Shared · Gemini call`.

## Updating the request reader
The step 1 prompt is copied from workflow 20 (`node-build-extraction.js`): when the live prompt changes, copy its node code over this file (keep the trial changes: no default location, built-in required fields, the TRIAL FIELDS addendum, `Prepare` input).
Then `node build-40.js` and import the JSON over workflow 40 in n8n.

The portal turns the answer into what the page shows in `buildRequestView` (`lib/trial-server.ts`): required fields come from `lib/shipment-types.ts`, so the "missing" list matches the portal.

## AI writer (Generate with AI)
`41 · Trial · AI writer` (`41-trial-ai-writer.json`, `POST /webhook/trial-generate`) writes the sample emails and carrier replies and checks the keywords. It calls `00 · Shared · Gemini call`, so the Gemini key lives only in n8n.
Set `N8N_TRIAL_GENERATE_WEBHOOK_URL` in Vercel to its production URL (without it the portal falls back to `GEMINI_API_KEY`). The shared workflow runs at its own fixed temperature, so the portal adds a random variation code to each prompt to keep the examples different.
