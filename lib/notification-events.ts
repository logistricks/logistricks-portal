/**
 * lib/notification-events.ts
 *
 * The catalogue of email notifications the portal can send: what each one is, when it fires, which
 * variables its template can use, sample data for previews, and the well-made default template.
 * Pure data — shared by the settings page (client) and the sender (server).
 */

export type NotificationGroup = "Requests" | "Carriers" | "Approvals"
export interface NVar { key: string; label: string; example: string; kind?: "text" | "block" }
export interface NVarGroup { id: string; label: string; vars: NVar[] }
export interface Recipients { roles: string[]; extra: string[] }

export interface NotificationEvent {
  key: string
  label: string
  short: string
  description: string
  when: string                 // plain-language trigger, shown on the page
  group: NotificationGroup
  icon: "inbox" | "reply" | "quote" | "alert" | "approval" | "decision"
  defaultSubject: string
  defaultHtml: string
  defaultRecipients: Recipients
  dynamicRecipients?: string   // who else is always included (explained in the UI)
  groups: NVarGroup[]          // event-specific variables (the common ones are added automatically)
}

// ── variables ────────────────────────────────────────────────────────────────

const COMMON: NVarGroup = {
  id: "common", label: "General",
  vars: [
    { key: "company_name", label: "Your company", example: "Hijazi Forwarding Co." },
    { key: "portal_url", label: "Portal link", example: "https://portal.example.com" },
    { key: "today", label: "Today's date", example: "3 Oct 2026" },
  ],
}

const REQUEST: NVarGroup = {
  id: "request", label: "Shipment request",
  vars: [
    { key: "request_ref", label: "Request reference", example: "LT-0023" },
    { key: "request_url", label: "Link to the request", example: "https://portal.example.com/requests/123" },
    { key: "sender_name", label: "Requester name", example: "Nour Abuazzam" },
    { key: "sender_first_name", label: "Requester first name", example: "Nour" },
    { key: "sender_email", label: "Requester email", example: "nour@client.example" },
    { key: "origin", label: "Origin", example: "Bangkok, Thailand" },
    { key: "destination", label: "Destination", example: "Amman, Jordan" },
    { key: "cargo_type", label: "Cargo / commodity", example: "Textiles / Fabric" },
    { key: "equipment", label: "Equipment", example: "1 x 40GP" },
    { key: "weight", label: "Weight", example: "3,155 kgs" },
    { key: "mode", label: "Mode", example: "Sea" },
    { key: "urgency", label: "Urgency", example: "Standard" },
    { key: "received_date", label: "Date received", example: "3 Oct 2026" },
    { key: "missing_fields", label: "Missing information", example: "Weight, Incoterm" },
  ],
}

const CARRIER: NVarGroup = {
  id: "carrier", label: "Carrier quote",
  vars: [
    { key: "carrier_name", label: "Carrier name", example: "Pacific International Lines" },
    { key: "carrier_email", label: "Carrier email", example: "ops@carrier.example" },
    { key: "quote_price", label: "Quoted price", example: "USD 1,600.00" },
    { key: "quote_mode", label: "Mode", example: "Sea" },
    { key: "transit_days", label: "Transit time (days)", example: "21" },
    { key: "validity_date", label: "Carrier validity", example: "31 Oct 2026" },
    { key: "quote_status", label: "Quote status", example: "Subject to equipment availability" },
    { key: "review_status", label: "Review status", example: "Needs review" },
    { key: "rfq_reference", label: "RFQ reference", example: "RFQ-1a2b3c4d-7-ab12cd" },
    { key: "quote_url", label: "Link to the quote", example: "https://portal.example.com/requests/123" },
    { key: "email_subject", label: "Carrier's email subject", example: "RE: Rate request - INBLR 40GP" },
  ],
}

const ATTENTION: NVarGroup = {
  id: "attention", label: "What needs attention",
  vars: [
    { key: "attention_title", label: "Short headline", example: "Quote needs review" },
    { key: "attention_reason", label: "Reason (one sentence)", example: "The charge lines add up to 1,700 but the carrier states 1,600." },
    { key: "flags_list", label: "All flags (bullet list)", example: "", kind: "block" },
  ],
}

const APPROVAL: NVarGroup = {
  id: "approval", label: "Approval",
  vars: [
    { key: "approval_step", label: "Step number", example: "2" },
    { key: "approval_mode", label: "Review type", example: "Approval required" },
    { key: "submitted_by", label: "Submitted by", example: "osama" },
    { key: "approval_url", label: "Link to approvals", example: "https://portal.example.com/approvals" },
    { key: "decision", label: "Decision", example: "Approved" },
    { key: "decided_by", label: "Decided by", example: "abdulaziz" },
    { key: "decision_notes", label: "Notes / rejection reason", example: "Price too high, please re-quote." },
  ],
}

const REPLY: NVarGroup = {
  id: "reply", label: "Requester's reply",
  vars: [
    { key: "updated_fields", label: "Information they provided", example: "weight, incoterm" },
    { key: "reply_excerpt", label: "Start of their message", example: "Hi, the cargo weighs 3,155 kg and it is FOB." },
  ],
}

// ── default template design ─────────────────────────────────────────────────

const NAVY = "#0D1B2A", ACCENT = "#E8821A", INK = "#0f172a", MUTED = "#64748b", LINE = "#e2e8f0"

function row(label: string, value: string): string {
  return `<tr><td style="padding:9px 0;border-bottom:1px solid #f1f5f9;color:${MUTED};font-size:13px;width:36%;vertical-align:top">${label}</td><td style="padding:9px 0;border-bottom:1px solid #f1f5f9;color:${INK};font-size:13px;font-weight:600;vertical-align:top">${value}</td></tr>`
}

function design(o: { eyebrow: string; title: string; intro: string; rows?: string[]; extra?: string; button?: { label: string; url: string }; accent?: string; foot?: string }): string {
  const accent = o.accent ?? ACCENT
  const rows = o.rows?.length ? `<tr><td style="padding:6px 28px 4px 28px"><table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-top:1px solid ${LINE}">${o.rows.join("")}</table></td></tr>` : ""
  const extra = o.extra ? `<tr><td style="padding:12px 28px 0 28px;font-size:14px;line-height:1.6;color:${INK}">${o.extra}</td></tr>` : ""
  const btn = o.button ? `<tr><td style="padding:22px 28px 28px 28px"><a href="${o.button.url}" style="display:inline-block;background:${accent};color:#ffffff;padding:12px 24px;border-radius:6px;font-weight:700;font-size:14px;text-decoration:none">${o.button.label}</a></td></tr>` : `<tr><td style="padding:12px"></td></tr>`
  return `<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;border-collapse:collapse;background:#ffffff;border:1px solid ${LINE}">
<tr><td style="background:${NAVY};padding:18px 28px;color:#ffffff;font-size:15px;font-weight:700;letter-spacing:0.3px">{{company_name|Logistricks}}</td></tr>
<tr><td style="height:4px;background:${accent};font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:28px 28px 8px 28px"><p style="margin:0 0 8px 0;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${accent};font-weight:700">${o.eyebrow}</p><h2 style="margin:0 0 12px 0;font-size:21px;line-height:1.3;color:${NAVY}">${o.title}</h2><p style="margin:0;font-size:14px;line-height:1.6;color:#334155">${o.intro}</p></td></tr>
${rows}
${extra}
${btn}
<tr><td style="background:#f8fafc;padding:14px 28px;border-top:1px solid ${LINE};font-size:11px;line-height:1.5;color:#94a3b8">${o.foot ?? "This is an automatic notification from the {{company_name|Logistricks}} portal."}</td></tr>
</table>`
}

const REQ_ROWS = [
  row("Reference", "{{request_ref}}"), row("From", `{{sender_name}} <span style="color:${MUTED};font-weight:400">{{sender_email}}</span>`), row("Route", "{{origin}} → {{destination}}"),
  row("Cargo", "{{cargo_type}}"), row("Equipment", "{{equipment}}"), row("Weight", "{{weight}}"), row("Mode", "{{mode}}"), row("Urgency", "{{urgency}}"),
]

// ── the events ───────────────────────────────────────────────────────────────

export const NOTIFICATION_EVENTS: NotificationEvent[] = [
  {
    key: "new_request", label: "New request received", short: "A client request arrived", group: "Requests", icon: "inbox",
    description: "Tells your team a new shipment request has come in.",
    when: "When the mail workflow creates a new freight request (the mail workflow calls the portal's notify endpoint).",
    defaultSubject: "New request {{request_ref}} — {{origin}} to {{destination}}",
    defaultHtml: design({
      eyebrow: "New request", title: "A new request has arrived",
      intro: "{{sender_name|A client}} sent a new shipment request. Here are the details we picked up.",
      rows: REQ_ROWS.concat(row("Still missing", "{{missing_fields}}")),
      button: { label: "Open request", url: "{{request_url}}" },
    }),
    defaultRecipients: { roles: ["admin", "operator"], extra: [] },
    groups: [REQUEST],
  },
  {
    key: "sender_reply", label: "Requester replied", short: "The client sent more information", group: "Requests", icon: "reply",
    description: "Tells your team the requester replied, for example with the missing details.",
    when: "When a requester's reply is added to a request (the sender-reply workflow).",
    defaultSubject: "{{sender_name|The requester}} replied on {{request_ref}}",
    defaultHtml: design({
      eyebrow: "Reply received", title: "{{sender_name|The requester}} replied",
      intro: "A reply was added to request <strong>{{request_ref}}</strong>.",
      rows: [row("Information provided", "{{updated_fields}}"), row("Route", "{{origin}} → {{destination}}"), row("Cargo", "{{cargo_type}}")],
      extra: `{{#if reply_excerpt}}<p style="margin:6px 0 0 0;padding:12px 14px;background:#f8fafc;border-left:3px solid ${ACCENT};font-size:13px;color:#334155">{{reply_excerpt}}</p>{{/if}}`,
      button: { label: "Open request", url: "{{request_url}}" },
    }),
    defaultRecipients: { roles: ["admin", "operator"], extra: [] },
    groups: [REQUEST, REPLY],
  },
  {
    key: "carrier_quote_received", label: "Carrier quote received", short: "A clean quote was linked to a request", group: "Carriers", icon: "quote",
    description: "Tells your team a carrier's quote was read, checked and linked to its request with no problems.",
    when: "When a carrier reply is processed, matched to a request and passes every automatic check.",
    defaultSubject: "Quote from {{carrier_name}} for {{request_ref}} — {{quote_price}}",
    defaultHtml: design({
      eyebrow: "Carrier quote", title: "{{carrier_name}} sent a quote",
      intro: "A quote for request <strong>{{request_ref}}</strong> was read and added to the request. It passed all automatic checks.",
      rows: [row("Price", "{{quote_price}}"), row("Route", "{{origin}} → {{destination}}"), row("Mode", "{{quote_mode}}"), row("Transit time", "{{transit_days}} days"), row("Valid until", "{{validity_date}}"), row("Status", "{{quote_status}}")],
      button: { label: "Review quote", url: "{{quote_url}}" }, accent: "#16a34a",
    }),
    defaultRecipients: { roles: ["admin", "operator"], extra: [] },
    groups: [REQUEST, CARRIER],
  },
  {
    key: "carrier_quote_attention", label: "Attention required", short: "A quote needs a person to look at it", group: "Carriers", icon: "alert",
    description: "Tells your team a carrier reply could not be linked, failed a check, or was a decline or a question.",
    when: "When a carrier reply is not linked to a request, is flagged for review, or is a decline / information request.",
    defaultSubject: "Attention: {{attention_title}} — {{carrier_name}}",
    defaultHtml: design({
      eyebrow: "Attention required", title: "{{attention_title}}", accent: "#dc2626",
      intro: "{{attention_reason}}",
      rows: [row("Carrier", `{{carrier_name}} <span style="color:${MUTED};font-weight:400">{{carrier_email}}</span>`), row("Request", "{{request_ref}}"), row("Price", "{{quote_price}}"), row("Email subject", "{{email_subject}}")],
      extra: `{{#if flags_list}}<p style="margin:0 0 6px 0;font-weight:700;color:${NAVY}">What the system found</p>{{flags_list}}{{/if}}`,
      button: { label: "Open in portal", url: "{{quote_url}}" },
    }),
    defaultRecipients: { roles: ["admin"], extra: [] },
    groups: [REQUEST, CARRIER, ATTENTION],
  },
  {
    key: "approval_requested", label: "Approval requested", short: "Someone has to approve a request", group: "Approvals", icon: "approval",
    description: "Asks the people on the current approval step to review a request.",
    when: "When a request is submitted for approval, and each time the chain moves to the next step.",
    dynamicRecipients: "The members of the step that is now active are always included.",
    defaultSubject: "Approval needed: {{request_ref}} — {{origin}} to {{destination}}",
    defaultHtml: design({
      eyebrow: "{{approval_mode|Approval required}}", title: "{{submitted_by}} needs your review",
      intro: "Request <strong>{{request_ref}}</strong> is waiting for you at step {{approval_step}}.",
      rows: [row("Requester", "{{sender_name}}"), row("Route", "{{origin}} → {{destination}}"), row("Cargo", "{{cargo_type}}"), row("Submitted by", "{{submitted_by}}")],
      button: { label: "Review now", url: "{{approval_url}}" },
    }),
    defaultRecipients: { roles: [], extra: [] },
    groups: [REQUEST, APPROVAL],
  },
  {
    key: "approval_decided", label: "Approval decision", short: "A request was approved or rejected", group: "Approvals", icon: "decision",
    description: "Tells the person who submitted a request that it was approved or rejected.",
    when: "When the last approval step is approved, or any step rejects the request.",
    dynamicRecipients: "The person who submitted the request is always included.",
    defaultSubject: "{{request_ref}} was {{decision}}",
    defaultHtml: design({
      eyebrow: "Approval decision", title: "Request {{request_ref}} was {{decision}}",
      intro: "{{decided_by}} {{decision}} this request.",
      rows: [row("Decision", "{{decision}}"), row("Decided by", "{{decided_by}}"), row("Route", "{{origin}} → {{destination}}"), row("Notes", "{{decision_notes}}")],
      button: { label: "Open request", url: "{{request_url}}" },
    }),
    defaultRecipients: { roles: [], extra: [] },
    groups: [REQUEST, APPROVAL],
  },
]

export const EVENT_BY_KEY: Record<string, NotificationEvent> = Object.fromEntries(NOTIFICATION_EVENTS.map((e) => [e.key, e]))

export function eventGroups(e: NotificationEvent): NVarGroup[] { return [...e.groups, COMMON] }
export function eventVarKeys(e: NotificationEvent): Set<string> { return new Set(eventGroups(e).flatMap((g) => g.vars.map((v) => v.key))) }

/** Sample values for previews and test emails. */
export function sampleValues(e: NotificationEvent): Record<string, string> {
  const v: Record<string, string> = {}
  for (const g of eventGroups(e)) for (const x of g.vars) if (x.kind !== "block") v[x.key] = x.example
  if (e.key === "approval_decided") { v.decision = "approved"; v.decision_notes = "" }
  if (e.key === "sender_reply") v.missing_fields = ""
  return v
}
export function sampleBlocks(e: NotificationEvent): Record<string, { html: string; text: string }> {
  const flags = ["Charge lines add up to 1,700.00 but the carrier states 1,600.00.", "Quote is subject to equipment availability."]
  return e.key === "carrier_quote_attention"
    ? { flags_list: { html: `<ul style="margin:0 0 0 18px;padding:0;font-size:13px;color:#334155">${flags.map((f) => `<li>${f}</li>`).join("")}</ul>`, text: flags.map((f) => `- ${f}`).join("\n") } }
    : {}
}

/** The page the email sits on, used by previews and by the sender. */
export function emailDocument(inner: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:24px 12px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif"><div style="max-width:600px;margin:0 auto">${inner}</div></body></html>`
}

export const ROLE_OPTIONS = [
  { key: "admin", label: "Admins" },
  { key: "operator", label: "Operators" },
  { key: "viewer", label: "Viewers" },
]

export function normalizeRecipients(raw: unknown, fallback: Recipients): Recipients {
  const r = (raw && typeof raw === "object" ? raw : null) as Partial<Recipients> | null
  if (!r) return fallback
  const roles = Array.isArray(r.roles) ? r.roles.filter((x) => ["admin", "operator", "viewer"].includes(String(x))).map(String) : []
  const extra = Array.isArray(r.extra)
    ? Array.from(new Set(r.extra.map((x) => String(x).trim().toLowerCase()).filter((x) => /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(x)))).slice(0, 20)
    : []
  return { roles, extra }
}
