/**
 * GET /api/carrier-reminders/settings → { settings, defaults, canEdit }
 * PUT /api/carrier-reminders/settings { enabled?, after_h?, max? }   (admins only; undo-able)
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { sessionWithRole } from "@/lib/api-admin"
import { DEFAULT_REMINDER_SETTINGS, cleanReminderSettings, loadReminderSettings } from "@/lib/carrier-reminders"
import { restoreRows, saveUndo, snapshot, type UndoOp } from "@/lib/undo"

export const dynamic = "force-dynamic"
const KEY = "carrier_reminders"

export async function GET(req: NextRequest) {
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  return NextResponse.json({ settings: await loadReminderSettings(adminClient(), s.session.clientCode), defaults: DEFAULT_REMINDER_SETTINGS, canEdit: s.role === "admin" })
}

export async function PUT(req: NextRequest) {
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (s.role !== "admin") return NextResponse.json({ error: "Only admins can change reminder settings." }, { status: 403 })
  const b = await req.json().catch(() => null)
  if (!b || typeof b !== "object") return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  const h = Number(b.after_h), m = Number(b.max)
  if (b.after_h !== undefined && !(Number.isFinite(h) && h >= 1 && h <= 720)) return NextResponse.json({ error: "Hours must be between 1 and 720." }, { status: 400 })
  if (b.max !== undefined && !(Number.isFinite(m) && m >= 1 && m <= 10)) return NextResponse.json({ error: "Reminders must be between 1 and 10." }, { status: 400 })
  const admin = adminClient(), cc = s.session.clientCode
  const next = cleanReminderSettings({ ...(await loadReminderSettings(admin, cc)), ...b })
  const before = await snapshot(admin, "client_settings", { client_code: cc, key: KEY })
  const ops: UndoOp[] = before.length ? restoreRows("client_settings", before) : [{ k: "remove" as const, table: "client_settings", where: { client_code: cc, key: KEY } }]
  const { error } = await admin.from("client_settings").upsert({ client_code: cc, key: KEY, value: next, updated_at: new Date().toISOString() }, { onConflict: "client_code,key" })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const undo = await saveUndo(admin, s.session, "Carrier reminder settings saved", ops)
  return NextResponse.json({ ok: true, settings: next }, { headers: undo })
}
