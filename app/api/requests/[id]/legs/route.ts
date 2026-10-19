/**
 * POST /api/requests/:id/legs   (extra quoted legs of a mixed-mode request; leg 1 is the request itself)
 *   { action: "add",    shipment_type, alt?: true }     alt = an ALTERNATIVE destination for the same cargo (starts with leg 1's route and type)
 *   { action: "kind",   index, alt: boolean }            switch a leg between "further leg" and "alternative destination"
 *   { action: "update", index, fields: { origin_city: "...", ... } }     index = leg number - 1 (1 = leg 2)
 *   { action: "type",   index, shipment_type }
 *   { action: "remove", index }
 * Stored in freight_requests.legs (jsonb). The missing-fields list is recomputed for every leg. Undo-able.
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { sessionWithRole } from "@/lib/api-admin"
import { logActivity } from "@/lib/log-activity"
import { restoreRows, saveUndo, snapshot } from "@/lib/undo"
import { loadCriticalConfig } from "@/lib/critical-config"
import { extraLegs, isAltLeg, isShipmentType, LEG_COLUMNS, typedMissing, TYPE_LABEL, type LegData } from "@/lib/shipment-types"
import { chargeableWeight } from "@/lib/shipment-calc"

export const dynamic = "force-dynamic"
const MAX_LEGS = 5 // leg 1 + 4 extra

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (s.role === "viewer") return NextResponse.json({ error: "Your role cannot change requests." }, { status: 403 })
  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  const admin = adminClient()
  const { data: row } = await admin.from("freight_requests").select("*").eq("id", id).ilike("client_code", s.session.clientCode).maybeSingle()
  if (!row) return NextResponse.json({ error: "Request not found" }, { status: 404 })
  if (!isShipmentType(row.shipment_type)) return NextResponse.json({ error: "Set the type of leg 1 first." }, { status: 409 })

  const legs: LegData[] = extraLegs(row).map((l) => ({ ...l }))
  const idx = Number(body.index) - 1 // index in the legs array (leg number - 2 + 1)
  let what = ""

  if (body.action === "add" && body.alt === true) {
    if (legs.length + 1 >= MAX_LEGS) return NextResponse.json({ error: `A request can have up to ${MAX_LEGS} options.` }, { status: 400 })
    // another destination for the same goods: only the destination is its own, everything else follows leg 1
    legs.push({ shipment_type: row.shipment_type, alt: true } as LegData)
    what = `Option ${legs.length + 1} added`
  } else if (body.action === "add") {
    if (!isShipmentType(body.shipment_type)) return NextResponse.json({ error: "shipment_type must be air, sea_fcl, sea_lcl or land" }, { status: 400 })
    if (legs.length + 1 >= MAX_LEGS) return NextResponse.json({ error: `A request can have up to ${MAX_LEGS} legs.` }, { status: 400 })
    // the new leg starts blank, only the commodity carries over (the goods are the same)
    legs.push({ shipment_type: body.shipment_type, ...(row.cargo_type ? { cargo_type: row.cargo_type } : {}) })
    what = `Leg ${legs.length + 1} added (${TYPE_LABEL[body.shipment_type as keyof typeof TYPE_LABEL]})`
  } else if (body.action === "update" || body.action === "type" || body.action === "remove" || body.action === "kind") {
    if (!Number.isInteger(idx) || idx < 0 || idx >= legs.length) return NextResponse.json({ error: "No such leg" }, { status: 404 })
    if (body.action === "remove") { legs.splice(idx, 1); what = `Leg ${idx + 2} removed` }
    else if (body.action === "kind") {
      const alt = body.alt === true
      if (alt) {
        // becoming an option: it shares leg 1's cargo, so drop the cargo fields it held of its own and keep only the route
        const keep = ["origin_city", "origin_country", "destination_city", "destination_country", "incoterm", "pickup_address"]
        const cur = legs[idx] as Record<string, unknown>
        for (const c of LEG_COLUMNS) if (!keep.includes(c)) delete cur[c]
        cur.alt = true
      } else delete (legs[idx] as Record<string, unknown>).alt
      what = `Leg ${idx + 2} is now ${alt ? "an alternative destination (option)" : "a further leg"}`
    }
    else if (body.action === "type") {
      if (!isShipmentType(body.shipment_type)) return NextResponse.json({ error: "shipment_type must be air, sea_fcl, sea_lcl or land" }, { status: 400 })
      legs[idx].shipment_type = body.shipment_type; what = `Leg ${idx + 2} set to ${TYPE_LABEL[body.shipment_type as keyof typeof TYPE_LABEL]}`
    } else {
      const f = body.fields && typeof body.fields === "object" ? body.fields as Record<string, unknown> : {}
      const prev = { ...legs[idx] } as Record<string, unknown>
      for (const [k, v] of Object.entries(f)) {
        if (LEG_COLUMNS.includes(k) && k !== "bl_type" && typeof v === "string") { const t = v.trim(); if (t) (legs[idx] as Record<string, unknown>)[k] = t; else delete (legs[idx] as Record<string, unknown>)[k] }
      }
      // air: keep the calculated chargeable weight in step, unless typed in by hand (same rule as leg 1)
      const cur = legs[idx] as Record<string, unknown>
      if (cur.shipment_type === "air" && !(typeof f.chargeable_weight === "string" && f.chargeable_weight.trim())) {
        const stored = (cur.chargeable_weight as string | undefined) ?? null
        if (!stored || stored === chargeableWeight(prev)) { const next = chargeableWeight(cur); if (next) cur.chargeable_weight = next; else delete cur.chargeable_weight }
      }
      what = `Leg ${idx + 2} fields edited: ${Object.keys(f).join(", ")}`
    }
  } else return NextResponse.json({ error: "Unknown action" }, { status: 400 })

  const before = await snapshot(admin, "freight_requests", { id, client_code: row.client_code }, "id,client_code,legs,missing_fields")
  const missing = typedMissing({ ...row, legs }, await loadCriticalConfig(admin, s.session.clientCode))
  const patch = { legs: legs.length ? legs : null, ...(missing ? { missing_fields: missing } : {}) }
  const { error } = await admin.from("freight_requests").update(patch).eq("id", id).eq("client_code", row.client_code)
  if (error) {
    const noColumn = /legs/.test(error.message) && /column|schema/i.test(error.message)
    return NextResponse.json({ error: noColumn ? "Run migration 074 in Supabase first." : "Database error" }, { status: noColumn ? 409 : 500 })
  }
  void logActivity({ clientCode: row.client_code, eventType: "request_field_edited", actor: s.session.username, requestId: id, description: what, meta: { action: body.action } })
  const undo = await saveUndo(admin, s.session, "Request legs changed", restoreRows("freight_requests", before))
  return NextResponse.json({ ok: true, legs, missing_fields: missing ?? [] }, { headers: undo })
}
