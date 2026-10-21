/**
 * GET /api/quotation-checks/settings → { settings, defaults, usage, canEdit }
 * PUT /api/quotation-checks/settings { enabled?, auto?, monthly_cap?, approval? }  (admins only; undo-able)
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { sessionWithRole } from "@/lib/api-admin"
import { DEFAULT_CHECK_SETTINGS, cleanCheckSettings, loadCheckSettings, usageThisMonth } from "@/lib/quotation-check"
import { restoreRows, saveUndo, snapshot, type UndoOp } from "@/lib/undo"

export const dynamic = "force-dynamic"
const KEY = "quotation_check"

export async function GET(req: NextRequest) {
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const admin = adminClient(), cc = s.session.clientCode
  return NextResponse.json({ settings: await loadCheckSettings(admin, cc), defaults: DEFAULT_CHECK_SETTINGS, usage: await usageThisMonth(admin, cc), canEdit: s.role === "admin" })
}

export async function PUT(req: NextRequest) {
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (s.role !== "admin") return NextResponse.json({ error: "Only admins can change these settings." }, { status: 403 })
  const b = await req.json().catch(() => null)
  if (!b || typeof b !== "object") return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  if (b.monthly_cap !== undefined && !(Number.isFinite(Number(b.monthly_cap)) && Number(b.monthly_cap) >= 0 && Number(b.monthly_cap) <= 100000)) return NextResponse.json({ error: "The monthly limit must be between 0 and 100000." }, { status: 400 })
  const admin = adminClient(), cc = s.session.clientCode
  const next = cleanCheckSettings({ ...(await loadCheckSettings(admin, cc)), ...b })
  const before = await snapshot(admin, "client_settings", { client_code: cc, key: KEY })
  const ops: UndoOp[] = before.length ? restoreRows("client_settings", before) : [{ k: "remove" as const, table: "client_settings", where: { client_code: cc, key: KEY } }]
  const { error } = await admin.from("client_settings").upsert({ client_code: cc, key: KEY, value: next, updated_at: new Date().toISOString() }, { onConflict: "client_code,key" })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const undo = await saveUndo(admin, s.session, "Quotation check settings saved", ops)
  return NextResponse.json({ ok: true, settings: next }, { headers: undo })
}
