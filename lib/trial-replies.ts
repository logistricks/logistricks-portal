/**
 * The automatic reply the portal sends when a request arrives, as the trial shows it: the portal's own template engine
 * (applyTemplate, same {{variables}}), one template for a request that is missing something and one for a complete request.
 * A client of the full system writes these templates themselves in Settings; these are the built-in wording.
 */
import { applyTemplate } from "@/lib/template-render"
import { translateReply } from "@/lib/trial-gen"
import type { RequestView } from "@/lib/trial-server"

export const MISSING_REPLY = `Dear {{sender_name}},

Thank you for your request{{route_phrase}}. We would be glad to quote it, but before we can price it we still need the following: {{missing_fields}}.

Please reply to this email with these details and we will come back to you with a quotation.

Best regards,
{{company_name}}`

export const COMPLETE_REPLY = `Dear {{sender_name}},

Thank you for your request{{route_phrase}}. We have received it with everything we need and we are preparing your quotation now.

We will come back to you shortly. If anything changes in the meantime, just reply to this email.

Best regards,
{{company_name}}`

export async function buildReply(v: RequestView, company: string): Promise<{ kind: string; body: string }> {
  const f = (k: string) => v.fields.find((x) => x[0] === k)?.[1] ?? ""
  const place = (c: string, k: string) => [c, k].filter((x) => x && x !== "Not given").join(", ")
  const from = place(v.route.from, v.route.fc), to = place(v.route.to, v.route.tc)
  const missing = v.missing.length > 0
  const vars: Record<string, string> = {
    sender_name: v.senderName || "Sir/Madam", company_name: company,
    route_phrase: from && to ? ` from ${from} to ${to}` : "",
    origin_city: v.route.from, destination_city: v.route.to, cargo_type: f("Cargo"), equipment: f("Equipment"), weight: f("Weight"), incoterm: f("Incoterm"),
    missing_fields: v.missing.join(", "),
  }
  let body = applyTemplate(missing ? MISSING_REPLY : COMPLETE_REPLY, vars).trim()
  const lang = (v.language || "").trim()
  const foreign = lang && !/^en/i.test(lang)
  if (foreign) body = await translateReply(body, lang)
  const kind = missing ? "Missing information" : "Request confirmed"
  return { kind: foreign ? `${kind} \u00b7 ${lang}` : kind, body }
}
