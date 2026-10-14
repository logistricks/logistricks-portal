/** POST /api/tasks/state { key, action: "snooze" | "dismiss" | "restore", until?, reason? } — snooze or dismiss a task (undo-able). */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient, getSession } from "@/lib/api-session"
import { restoreRows, saveUndo, snapshot } from "@/lib/undo"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const cookie = req.cookies.get("portal_session")?.value
  const session = cookie ? getSession(cookie) : null
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const b = await req.json().catch(() => null)
  const key = String(b?.key ?? "")
  if (!key || key.length > 200) return NextResponse.json({ error: "key required" }, { status: 400 })
  const action = b.action
  const patch: Record<string, unknown> = { updated_by: session.username, updated_at: new Date().toISOString(), reason: typeof b.reason === "string" ? b.reason.slice(0, 300) : null }
  let label = ""
  if (action === "snooze") {
    const until = Date.parse(String(b.until))
    if (isNaN(until) || until <= Date.now()) return NextResponse.json({ error: "Pick a time in the future" }, { status: 400 })
    patch.snoozed_until = new Date(until).toISOString(); patch.dismissed = false; label = "Task snoozed"
  } else if (action === "dismiss") { patch.dismissed = true; patch.snoozed_until = null; label = "Marked not needed" }
  else if (action === "restore") { patch.dismissed = false; patch.snoozed_until = null; label = "Task restored" }
  else return NextResponse.json({ error: "Unknown action" }, { status: 400 })

  const admin = adminClient()
  const before = await snapshot(admin, "task_state", { client_code: session.clientCode, task_key: key })
  const { error } = await admin.from("task_state").upsert({ client_code: session.clientCode, task_key: key, ...patch }, { onConflict: "client_code,task_key" })
  if (error) return NextResponse.json({ error: /task_state/.test(error.message) ? "Run migration 072 in Supabase first." : error.message }, { status: 500 })
  const undo = await saveUndo(admin, session, label,
    before.length ? restoreRows("task_state", before) : [{ k: "remove", table: "task_state", where: { client_code: session.clientCode, task_key: key } }])
  return NextResponse.json({ ok: true }, { headers: undo })
}
