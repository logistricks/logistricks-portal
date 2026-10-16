/**
 * POST /api/requests/:id/shipment-type  { shipment_type: "air" | "sea_fcl" | "sea_lcl" | "land" }
 *
 * Sets (or switches) the type of a request by hand. Entered data is kept, the old is_sea / is_air / is_land flags are
 * derived from the type so carrier matching keeps working, and the missing-fields list is recomputed for the new type.
 * Undo-able (the portal shows the usual "Undo" popup).
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { sessionWithRole } from "@/lib/api-admin"
import { logActivity } from "@/lib/log-activity"
import { restoreRows, saveUndo, snapshot } from "@/lib/undo"
import { flagsForType, isShipmentType, quotableCheck, TYPE_LABEL, type ShipmentType } from "@/lib/shipment-types"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (s.role === "viewer") return NextResponse.json({ error: "Your role cannot change requests." }, { status: 403 })
  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body || !isShipmentType(body.shipment_type)) return NextResponse.json({ error: "shipment_type must be air, sea_fcl, sea_lcl or land" }, { status: 400 })
  const type: ShipmentType = body.shipment_type
  const code = s.session.clientCode
  const admin = adminClient()

  const { data: row } = await admin.from("freight_requests").select("*").eq("id", id).ilike("client_code", code).maybeSingle()
  if (!row) return NextResponse.json({ error: "Request not found" }, { status: 404 })

  const before = await snapshot(admin, "freight_requests", { id, client_code: row.client_code }, "id,client_code,shipment_type,type_source,is_sea,is_air,is_land,missing_fields")
  const patch = { shipment_type: type, type_source: "manual", ...flagsForType(type), missing_fields: quotableCheck(type, row as Record<string, unknown>).missing }
  const { error } = await admin.from("freight_requests").update(patch).eq("id", id).eq("client_code", row.client_code)
  if (error) {
    const noColumn = /shipment_type|type_source/.test(error.message) && /column|schema/i.test(error.message)
    return NextResponse.json({ error: noColumn ? "Run migration 074 in Supabase first." : "Database error" }, { status: noColumn ? 409 : 500 })
  }
  void logActivity({ clientCode: row.client_code, eventType: "request_field_edited", actor: s.session.username, requestId: id, description: `Request type set to ${TYPE_LABEL[type]}`, meta: { shipment_type: type } })
  const undo = await saveUndo(admin, s.session, "Request type changed", restoreRows("freight_requests", before))
  return NextResponse.json({ ok: true, shipment_type: type, missing_fields: patch.missing_fields }, { headers: undo })
}
