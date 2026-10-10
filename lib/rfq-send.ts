/**
 * lib/rfq-send.ts (server only) — helpers for sending a request to carriers from the portal.
 *  - renderRfqDraft: fills the client's RFQ template for one carrier (same rules as the n8n "Render RFQ email" node)
 *  - registerRfqRows: creates the carrier_quote_requests rows that make later carrier replies link back
 */
import { randomBytes } from "crypto"
import { applyTemplate } from "@/lib/template-render"
import { htmlToPlainText } from "@/lib/quotation-render"
import { joinList, toStringList } from "@/lib/special"
import { isExw, hasText } from "@/lib/shipment-labels"

export interface CarrierContact { id: number; carrier_id: number; carrier_name: string; person_name: string; email: string; cc: string[] }

export async function loadCarrierContacts(admin: any, clientCode: string, carrierIds: number[]): Promise<CarrierContact[]> {
  if (!carrierIds.length) return []
  const { data } = await admin.from("carriers").select("id, carrier_id, carrier_name, person_name, email, is_cc, active").ilike("client_code", clientCode).in("carrier_id", carrierIds)
  const rows = (data ?? []) as any[]
  const out: CarrierContact[] = []
  for (const r of rows.filter((x) => !x.is_cc)) {
    out.push({
      id: r.id, carrier_id: r.carrier_id, carrier_name: r.carrier_name ?? "", person_name: r.person_name ?? "", email: String(r.email ?? "").trim(),
      cc: rows.filter((x) => x.is_cc && x.carrier_id === r.carrier_id && x.email).map((x) => String(x.email).trim()),
    })
  }
  return out
}

const when = (v: unknown) => { try { return v ? new Date(String(v)).toLocaleString("en-GB", { timeZone: "Asia/Amman", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "" } catch { return "" } }

export function rfqVars(row: Record<string, any>, carrier: { carrier_name: string; person_name: string; email: string }): Record<string, string> {
  const s = (v: unknown) => (v == null ? "" : String(v))
  const list = (v: unknown) => toStringList(v).join("\n")
  const pickup = s(row.pickup_address).trim()
  const exw = isExw(row.incoterm)
  return {
    origin_city: s(row.origin_city), origin_country: s(row.origin_country), destination_city: s(row.destination_city), destination_country: s(row.destination_country),
    cargo_type: s(row.cargo_type), quantity: s(row.quantity), weight: s(row.weight), dimensions: s(row.dimensions), equipment: joinList(row.equipment) || s(row.equipment),
    incoterm: s(row.incoterm), pickup_address: exw && hasText(pickup) ? pickup : "", bl_type: s(row.bl_type), urgency: s(row.urgency),
    mode: [(row.is_sea ?? row.mode_sea) ? "Sea" : "", (row.is_air ?? row.mode_air) ? "Air" : "", (row.is_land ?? row.mode_land) ? "Land" : ""].filter(Boolean).join(", "),
    sender_name: s(row.sender_name), sender_email: s(row.sender_email), received_date: when(row.received_at), preferred_carrier: s(row.preferred_carrier),
    request_ref: s(row.request_ref), special_requirements: list(row.special_requirements), availability_questions: list(row.availability_questions), missing_fields: list(row.missing_fields),
    carrier_name: carrier.carrier_name, contact_name: carrier.person_name || "there", carrier_email: carrier.email, carrier_phone: "",
  }
}

export function renderRfqDraft(tpl: { subject?: string | null; body?: string | null }, row: Record<string, any>, carrier: { carrier_name: string; person_name: string; email: string }) {
  const vars = rfqVars(row, carrier)
  let subject = htmlToPlainText(applyTemplate(tpl.subject ?? "", vars)).replace(/\s+/g, " ").trim()
  if (!subject) subject = `Rate request ${vars.request_ref} - ${vars.origin_city} to ${vars.destination_city}`.trim()
  // carriers' replies are matched on the request number: make sure it is in the subject when the template does not show it
  if (vars.request_ref && !/request_ref/.test(`${tpl.subject ?? ""} ${tpl.body ?? ""}`) && !subject.includes(vars.request_ref)) subject = `${subject} [${vars.request_ref}]`.trim()
  const body = htmlToPlainText(applyTemplate(tpl.body ?? "", vars))
  return { subject, body }
}

export async function registerRfqRows(admin: any, requestId: string, contacts: CarrierContact[]): Promise<Record<number, string>> {
  const refs: Record<number, string> = {}
  for (const c of contacts) {
    const reference = `RFQ-${requestId.replace(/-/g, "").slice(0, 8)}-${c.carrier_id}-${randomBytes(3).toString("hex")}`
    const { error } = await admin.from("carrier_quote_requests").insert({
      freight_request_id: requestId, carrier_id: c.id, email_thread_id: reference, rfq_reference: reference, status: "sent",
    })
    if (!error) refs[c.carrier_id] = reference
  }
  return refs
}
