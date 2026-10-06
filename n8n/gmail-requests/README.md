# Gmail requests workflow — "is this a reply?" upgrade

See the chat message for the click-by-click steps. Files here:
- `normalize-email.js` — Code node "Normalize Email" (provider-independent email object)
- `decide-reply.js`    — Code node "Decide Reply" (portal resolve result + AI shortlist decision)

Portal endpoints (auth `X-Portal-Secret` = PORTAL_WEBHOOK_SECRET):
- `POST /api/inbound/resolve` — returns decision: reply | new | undetermined | carrier_reply | duplicate | unknown_mailbox
- `POST /api/inbound/record`  — stores the email row (inbound_emails) and stamps subject / message_id on new requests

## Filters (Core workflow)
- `filter-new-request.js` → paste into **Filter Code** (new-request path). Drops automated mail, then scores freight content with whole-word matching (needs score ≥ 3, or ≥ 2 with a PDF/Excel/Word attachment). Dropped emails (`intake_source = manual`) always pass.
- `filter-reply.js` → paste into **Filter Code1** (reply path). Only drops automated mail (no keyword test; replies are already linked).
- `normalize-email.js` now outputs `auto_submitted`, `precedence`, `list_unsubscribe` for these filters. Re-paste it into the Gmail doorway's **Normalize Email** node.
