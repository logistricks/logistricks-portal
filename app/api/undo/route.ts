/** POST /api/undo { id } — reverts a change saved with saveUndo(). Own changes only, within 2 minutes, once. */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient, getSession } from "@/lib/api-session"
import { UNDO_TABLES, UNDO_WINDOW_MS, type UndoOp } from "@/lib/undo"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const cookie = req.cookies.get("portal_session")?.value
  const session = cookie ? getSession(cookie) : null
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = (await req.json().catch(() => ({}))) as { id?: string }
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const admin = adminClient()
  const { data: row } = await admin.from("undo_log").select("*").eq("id", id).maybeSingle()
  if (!row || String(row.client_code).toLowerCase() !== session.clientCode.toLowerCase() || row.username !== session.username)
    return NextResponse.json({ error: "Nothing to undo" }, { status: 404 })
  if (row.used_at) return NextResponse.json({ error: "Already undone" }, { status: 409 })
  if (Date.now() - Date.parse(row.created_at) > UNDO_WINDOW_MS) return NextResponse.json({ error: "Too late to undo this" }, { status: 410 })

  // claim it first so a double click can't run twice
  const { data: claimed } = await admin.from("undo_log").update({ used_at: new Date().toISOString() }).eq("id", id).is("used_at", null).select("id")
  if (!claimed?.length) return NextResponse.json({ error: "Already undone" }, { status: 409 })

  const cc = session.clientCode
  try {
    for (const op of row.ops as UndoOp[]) {
      if (!UNDO_TABLES.has(op.table)) throw new Error(`Cannot undo changes to ${op.table}`)
      if (op.k === "insert") {
        const rows = op.rows.map((r) => ({ ...r, client_code: cc }))
        const { error } = await admin.from(op.table).insert(rows)
        if (error) throw error
      } else {
        let q = op.k === "update" ? admin.from(op.table).update(Object.fromEntries(Object.entries(op.values).filter(([k]) => k !== "client_code" && !(k in op.where)))) : admin.from(op.table).delete()
        for (const [k, v] of Object.entries(op.where)) q = q.eq(k, v)
        const { error } = await q.ilike("client_code", cc)
        if (error) throw error
      }
    }
  } catch (e: any) {
    console.error("[api/undo]", e?.message ?? e)
    return NextResponse.json({ error: "Could not undo — something changed in the meantime" }, { status: 500 })
  }
  return NextResponse.json({ ok: true, label: row.label })
}
