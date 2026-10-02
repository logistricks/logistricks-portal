# Carrier reply → quote (n8n)

One workflow for all clients. The portal (or any mail reader) POSTs each carrier reply to the webhook; n8n extracts with Gemini and posts the structured quote to `/api/carrier-quotes`. All maths, flags and review status are computed by the portal, not the model.

## Import
1. n8n → Workflows → Import from file → `carrier-reply-workflow.json`.
2. Open the **Config** node and set `portal_secret` (same as the portal's `PORTAL_WEBHOOK_SECRET`), `gemini_key`, and check `portal_url` / `gemini_model`. (n8n blocks `$env` inside nodes by default, so settings live in this one node. Don't commit or share the workflow after filling it in.)
3. Replace the "Notify team" placeholder node with Slack / email (fires when a quote is non-linked or needs review).
4. Activate, then use the Production webhook URL: `POST /webhook/carrier-reply` with header `X-Portal-Secret`.

## Webhook input
```json
{ "client_code": "DEMO", "from_email": "ops@carrier.com", "subject": "RE: ... [RFQ-1a2b3c4d-7-ab12cd]",
  "body_text": "...", "message_id": "<...>", "thread_id": "...", "received_at": "2026-10-01T08:30:00Z",
  "attachments": [{ "filename": "rates.pdf", "mime_type": "application/pdf", "data_base64": "<base64 of the file>" },
                  { "filename": "rates.xlsx", "text": "extracted text" }] }
```
Matching: the `RFQ-xxxxxxxx-N-xxxxxx` token (from the RFQ email) is found in subject/body; the portal then falls back to request+carrier and thread id. No match → stored as a Non-linked Quote.

### Real attachments (binary)
Besides base64 in the JSON, the flow reads attachments as n8n **binary** files, exactly like the Gmail-trigger workflow: send a multipart form (`curl -F`) or put a Gmail node with `downloadAttachments` in front. PDFs and images (png/jpg/webp/heic, up to 15 MB each) are passed to the model as files.
```
curl -X POST '<webhook>' -H 'X-Portal-Secret: <secret>' -F client_code=DEMO -F from_email=ops@carrier.com -F subject='RE: ...' -F body_text='Please find our rates attached.' -F attachment=@rates.pdf
```

## Output (webhook response)
The portal's response: `{ ok, linked, link_method | reason, carrier_quote_id, review_status, validation_flags }`.

## Files
- `extraction-prompt.md`, `response-schema.json` — the model contract (v1).
- `prepare.js`, `build-body.js` — code used by the two Code nodes. After editing run `node build-workflow.js` to regenerate the workflow JSON.
- `test-emails/` — 11 emails (air, LCL, FCL, road, decline, info request, counter-offer, mismatches, unknown sender, auto-reply) with the expected extraction and results.
- `run-tests.ts` — `npx tsx n8n/carrier-reply/run-tests.ts` checks mapping + maths against the expectations (no network). To test the model itself, POST each `test-emails/*.json` `input` to the webhook and compare with `expect`.

## Not covered yet
Excel / Word attachments (pass their extracted text in `attachments[].text`). PDFs and images (png/jpg/webp, up to 4 per email) are sent as base64 and read by the model directly, a second-model cross-check, and mail intake (on hold).
