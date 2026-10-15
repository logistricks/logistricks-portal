/**
 * GET /api/default-locations → { value, canEdit }   (everyone)
 * PUT /api/default-locations { port:{name,country}, airport:{name,country} }   (admins only; undo-able)
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { sessionWithRole } from "@/lib/api-admin"
import { cleanDefaults, loadDefaults } from "@/lib/default-locations"
import { restoreRows, saveUndo, snapshot, type UndoOp } from "@/lib/undo"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  return NextResponse.json({ value: await loadDefaults(adminClient(), s.session.clientCode), canEdit: s.role === "admin" })
}

export async function PUT(req: NextRequest) {
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (s.role !== "admin") return NextResponse.json({ error: "Only admins can change the default port and airport." }, { status: 403 })
  const b = await req.json().catch(() => null)
  if (!b) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  const admin = adminClient(), cc = s.session.clientCode
  const value = cleanDefaults(b)
  const before = await snapshot(admin, "client_settings", { client_code: cc, key: "default_locations" })
  const ops: UndoOp[] = before.length ? restoreRows("client_settings", before) : [{ k: "remove", table: "client_settings", where: { client_code: cc, key: "default_locations" } }]
  const { error } = await admin.from("client_settings").upsert({ client_code: cc, key: "default_locations", value, updated_at: new Date().toISOString() }, { onConflict: "client_code,key" })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const undo = await saveUndo(admin, s.session, "Default port and airport saved", ops)
  return NextResponse.json({ ok: true, value }, { headers: undo })
}
