# Gmail requests workflow — "is this a reply?" upgrade

See the chat message for the click-by-click steps. Files here:
- `normalize-email.js` — Code node "Normalize Email" (provider-independent email object)
- `decide-reply.js`    — Code node "Decide Reply" (portal resolve result + AI shortlist decision)

Portal endpoints (auth `X-Portal-Secret` = PORTAL_WEBHOOK_SECRET):
- `POST /api/inbound/resolve` — returns decision: reply | new | undetermined | carrier_reply | duplicate | unknown_mailbox
- `POST /api/inbound/record`  — stores the email row (inbound_emails) and stamps subject / message_id on new requests
