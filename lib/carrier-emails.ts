/**
 * lib/carrier-emails.ts  (client-safe)
 * The emails the portal writes to carriers by itself. One default template each; edited under Templates → Carrier emails.
 * Stored per company in client_settings, key "carrier_emails".
 */
import { DEFAULT_ASK_BODY } from "@/lib/quote-rules"

export interface CarrierEmailDef { key: "quote_fix" | "reminder"; title: string; hint: string; vars: { key: string; label: string }[] }
export const CARRIER_EMAILS: CarrierEmailDef[] = [
  { key: "quote_fix", title: "Ask a carrier to fix a quote",
    hint: "Sent when a carrier's quote has a problem (Settings → Rules decides which), automatically or with one click on the quote. The subject is built for you: it continues the carrier's own email thread and carries the RFQ reference, so the corrected quote links back to the same request.",
    vars: [
      { key: "contact_name", label: "Contact name" }, { key: "carrier_name", label: "Carrier name" }, { key: "request_ref", label: "Request number" },
      { key: "sender_name", label: "Your name" }, { key: "issues", label: "List of problems (required)" },
    ] },
  { key: "reminder", title: "Remind a carrier that hasn't replied",
    hint: "Sent to a carrier that hasn't answered a rate request, automatically after the time set in Settings → Rules → Carrier reminders, or with the Remind button on the request. The subject is built for you and carries the RFQ reference, so the answer links back to the same request.",
    vars: [
      { key: "contact_name", label: "Contact name" }, { key: "carrier_name", label: "Carrier name" }, { key: "request_ref", label: "Request number" },
      { key: "origin_city", label: "Origin" }, { key: "destination_city", label: "Destination" }, { key: "cargo_type", label: "Cargo" },
      { key: "sent_date", label: "Date we asked" }, { key: "sender_name", label: "Your name" },
    ] },
]

export const DEFAULT_REMINDER_BODY = `Dear {{contact_name}},

We haven't received your rate yet for {{request_ref}} ({{origin_city}} to {{destination_city}}), which we sent on {{sent_date}}.

Could you please send your quote, or let us know if you are unable to quote?

Best regards,
{{sender_name}}`

export type CarrierEmails = { quote_fix: string; reminder: string }
export const DEFAULT_CARRIER_EMAILS: CarrierEmails = { quote_fix: DEFAULT_ASK_BODY, reminder: DEFAULT_REMINDER_BODY }

export function cleanCarrierEmails(v: any): CarrierEmails {
  const out = { ...DEFAULT_CARRIER_EMAILS }
  if (v && typeof v === "object") for (const k of ["quote_fix", "reminder"] as const) if (typeof v[k] === "string" && v[k].trim()) out[k] = v[k].slice(0, 4000)
  return out
}
