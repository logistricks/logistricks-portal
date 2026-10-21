/**
 * lib/carrier-emails.ts  (client-safe)
 * The emails the portal writes to carriers by itself. One default template each; edited under Templates → Carrier emails.
 * Stored per company in client_settings, key "carrier_emails".
 */
import { DEFAULT_ASK_BODY } from "@/lib/quote-rules"

export interface CarrierEmailDef { key: "quote_fix"; title: string; hint: string; vars: { key: string; label: string }[] }
export const CARRIER_EMAILS: CarrierEmailDef[] = [
  { key: "quote_fix", title: "Ask a carrier to fix a quote",
    hint: "Sent when a carrier's quote has a problem (Settings → Rules decides which), automatically or with one click on the quote. The subject is built for you: it continues the carrier's own email thread and carries the RFQ reference, so the corrected quote links back to the same request.",
    vars: [
      { key: "contact_name", label: "Contact name" }, { key: "carrier_name", label: "Carrier name" }, { key: "request_ref", label: "Request number" },
      { key: "sender_name", label: "Your name" }, { key: "issues", label: "List of problems (required)" },
    ] },
]

export type CarrierEmails = { quote_fix: string }
export const DEFAULT_CARRIER_EMAILS: CarrierEmails = { quote_fix: DEFAULT_ASK_BODY }

export function cleanCarrierEmails(v: any): CarrierEmails {
  const out = { ...DEFAULT_CARRIER_EMAILS }
  if (v && typeof v === "object" && typeof v.quote_fix === "string" && v.quote_fix.trim()) out.quote_fix = v.quote_fix.slice(0, 4000)
  return out
}
