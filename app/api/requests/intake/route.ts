/**
 * app/api/requests/intake/route.ts — creates a freight request from an extracted email.
 * Called by the n8n "manual email intake" workflow (a dropped .eml / .msg). Auth: X-Portal-Secret.
 *
 * The request is validated the normal way: the client's mandatory ("critical") fields decide which
 * fields are missing, EXW needs a pickup address, and the team gets the new-request notification.
 * The row is stamped intake_source = "manual" so the portal can show it was added by hand.
 */
import { joinList } from "@/lib/special"
import { toStringList } from "@/lib/special"
import { NextResponse, after, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { notify, requestValues } from "@/lib/notify"
import { isExw, hasText } from "@/lib/shipment-labels"

export const runtime = "nodejs"

const LABELS: Record<string, string> = {
  cargo_type: "Cargo Type", weight: "Weight / Tonnage", dimensions: "Dimensions", equipment: "Equipment / Container",
  incoterm: "Incoterm", bl_type: "BL Type", pickup_address: "Pickup address (EXW)",
}
const s = (v: unknown, max: number) => {
  const t = joinList(v)
  return t && t.toLowerCase() !== "null" ? t.slice(0, max) : null
}
const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [])

export async function POST(req: NextRequest) {
  const secret = process.env.PORTAL_WEBHOOK_SECRET
  if (!secret || req.headers.get("x-portal-secret") !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const b = await req.json().catch(() => null)
  if (!b || typeof b.client_code !== "string" || !b.client_code.trim()) return NextResponse.json({ error: "client_code required" }, { status: 400 })

  const admin = adminClient()
  const clientCode = b.client_code.trim()
  const { data: client } = await admin.from("clients").select("client_code, require_critical_data, critical_fields").eq("client_code", clientCode).maybeSingle()
  if (!client) return NextResponse.json({ error: `unknown client ${clientCode}` }, { status: 404 })

  const modes = list(b.modes).map((m) => m.toLowerCase())
  const row: Record<string, unknown> = {
    client_code: client.client_code,
    sender_name: s(b.sender_name, 100), sender_email: s(b.sender_email, 255), sender_phone: s(b.sender_phone, 30),
    source: "Email",
    received_at: b.received_at && !Number.isNaN(Date.parse(b.received_at)) ? new Date(b.received_at).toISOString() : new Date().toISOString(),
    raw_message: s(b.raw_message, 50000),
    origin_city: s(b.origin_city, 100), origin_country: s(b.origin_country, 50),
    destination_city: s(b.destination_city, 100), destination_country: s(b.destination_country, 50),
    cargo_type: s(b.cargo_type, 100), equipment: s(b.equipment, 100), weight: s(b.weight, 50),
    quantity: s(b.quantity, 50), dimensions: s(b.dimensions, 100), incoterm: s(b.incoterm, 20),
    bl_type: s(b.bl_type, 50), preferred_carrier: s(b.preferred_carrier, 100),
    urgency: String(b.urgency).toLowerCase() === "urgent" ? "Urgent" : "Standard",
    confidence: ["High", "Medium", "Low"].find((c) => c.toLowerCase() === String(b.confidence).toLowerCase()) ?? "Medium",
    is_sea: modes.includes("sea"), is_air: modes.includes("air"), is_land: modes.includes("land"),
    status: "Pending", is_done: false,
    special_requirements: toStringList(b.special_requirements), availability_questions: toStringList(b.availability_questions),
    aog: b.aog === true, dgr: b.dgr === true,
  }

  // Mandatory-field check, same rules as the automatic flow.
  const critical: string[] = client.require_critical_data && Array.isArray(client.critical_fields) ? client.critical_fields : []
  const missing = critical.filter((f) => {
    if (f === "pickup_address") return isExw(row.incoterm as string | null) && !hasText(b.pickup_address)
    return !hasText(row[f])
  }).map((f) => LABELS[f] ?? f)
  row.missing_fields = missing
  const exwNoAddress = isExw(row.incoterm as string | null) && !hasText(b.pickup_address)

  const ext = { pickup_address: s(b.pickup_address, 500), intake_source: b.intake_source === "manual" ? "manual" : "automatic", intake_filename: s(b.intake_filename, 255) }
  let ins = await admin.from("freight_requests").insert({ ...row, ...ext }).select("id, request_ref, request_number").single()
  // Before migration 048: store without the new columns rather than failing.
  if (ins.error && /pickup_address|intake_/.test(ins.error.message)) ins = await admin.from("freight_requests").insert(row).select("id, request_ref, request_number").single()
  if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 500 })

  const id = ins.data.id as string
  after(async () => {
    const vals = await requestValues(admin, client.client_code, id)
    await notify(admin, client.client_code, "new_request", vals, { requestId: id })
  })
  return NextResponse.json({
    ok: true, id, request_ref: ins.data.request_ref ?? null, missing_fields: missing, exw_pickup_address_missing: exwNoAddress,
    needs_reply: missing.length > 0,
  })
}
