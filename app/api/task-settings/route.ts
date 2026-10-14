/**
 * GET /api/task-settings → { limits, reminders, defaults }   (everyone: the portal needs them)
 * PUT /api/task-settings { limits?, reminders? }              (admins only; undo-able)
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { sessionWithRole } from "@/lib/api-admin"
import { DEFAULT_LIMITS, DEFAULT_REMINDERS, cleanReminders, loadLimits, loadReminders } from "@/lib/task-rules"
import { restoreRows, saveUndo, snapshot, type UndoOp } from "@/lib/undo"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const admin = adminClient()
  const [limits, reminders] = await Promise.all([loadLimits(admin, s.session.clientCode), loadReminders(admin, s.session.clientCode)])
  return NextResponse.json({ limits, reminders, defaults: { limits: DEFAULT_LIMITS, reminders: DEFAULT_REMINDERS }, canEdit: s.role === "admin" })
}

export async function PUT(req: NextRequest) {
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (s.role !== "admin") return NextResponse.json({ error: "Only admins can change task settings." }, { status: 403 })
  const b = await req.json().catch(() => null)
  if (!b) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  const admin = adminClient()
  const cc = s.session.clientCode
  const ops: UndoOp[] = []

  async function save(key: string, value: unknown) {
    const before = await snapshot(admin, "client_settings", { client_code: cc, key })
    ops.push(...(before.length ? restoreRows("client_settings", before) : [{ k: "remove" as const, table: "client_settings", where: { client_code: cc, key } }]))
    const { error } = await admin.from("client_settings").upsert({ client_code: cc, key, value, updated_at: new Date().toISOString() }, { onConflict: "client_code,key" })
    if (error) throw new Error(error.message)
  }
  try {
    if (b.limits && typeof b.limits === "object") {
      const out: Record<string, number> = {}
      for (const k of Object.keys(DEFAULT_LIMITS)) {
        const n = Number(b.limits[k])
        if (!Number.isFinite(n) || n <= 0 || n > (k === "daily_goal" ? 500 : 24 * 60)) return NextResponse.json({ error: `"${k}" must be a positive number${k === "daily_goal" ? " up to 500" : " of hours (max 1440)"}.` }, { status: 400 })
        out[k] = k === "daily_goal" ? Math.round(n) : Math.round(n * 100) / 100
      }
      await save("task_limits", out)
    }
    if (b.reminders && typeof b.reminders === "object") await save("task_reminders", cleanReminders(b.reminders))
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
  const undo = await saveUndo(admin, s.session, "Task settings saved", ops)
  const [limits, reminders] = await Promise.all([loadLimits(admin, cc), loadReminders(admin, cc)])
  return NextResponse.json({ ok: true, limits, reminders }, { headers: undo })
}
