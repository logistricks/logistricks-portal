/**
 * lib/undo.ts  (server only)
 *
 * "Undo" support. A route that changes something takes a before-image, saves it with saveUndo() and returns the
 * result as response headers (undoHeaders). The portal shows an "… [Undo]" popup for 10 s; pressing it calls
 * POST /api/undo, which replays the stored operations. Never throws — a failure here must not break the change.
 */
export type UndoOp =
  | { k: "update"; table: string; where: Record<string, unknown>; values: Record<string, unknown> }
  | { k: "insert"; table: string; rows: Record<string, unknown>[] }
  | { k: "remove"; table: string; where: Record<string, unknown> }

/** Tables an undo may touch (all carry client_code, which the undo route enforces). */
export const UNDO_TABLES = new Set([
  "freight_requests", "templates", "quotation_templates", "notification_templates", "client_settings", "clients",
  "carriers", "task_state", "smtp_settings", "carrier_quotes", "client_whatsapp_numbers", "client_receiver_emails", "email_sources",
])

export const UNDO_WINDOW_MS = 120_000

type Who = { clientCode: string; username: string }

/** Rows as they are now (before the change). */
export async function snapshot(admin: any, table: string, where: Record<string, unknown>, cols = "*"): Promise<any[]> {
  try {
    let q = admin.from(table).select(cols)
    for (const [k, v] of Object.entries(where)) q = q.eq(k, v)
    const { data } = await q
    return (data ?? []) as any[]
  } catch { return [] }
}

/** Ops that put the given rows back as they were (matched by key). */
export const restoreRows = (table: string, rows: any[], key: string[] = ["id"]): UndoOp[] =>
  rows.map((r) => ({ k: "update" as const, table, where: Object.fromEntries(key.map((c) => [c, r[c]])), values: r }))

export const reinsertRows = (table: string, rows: any[]): UndoOp[] => (rows.length ? [{ k: "insert", table, rows }] : [])

/** Saves the ops and returns response headers for the popup ({} when nothing was saved). */
export async function saveUndo(admin: any, who: Who, label: string, ops: UndoOp[]): Promise<Record<string, string>> {
  try {
    if (!ops.length) return {}
    const { data, error } = await admin.from("undo_log")
      .insert({ client_code: who.clientCode, username: who.username, label, ops }).select("id").single()
    if (error || !data) return {}
    if (Math.random() < 0.05) void admin.from("undo_log").delete().lt("created_at", new Date(Date.now() - 86_400_000).toISOString()).then(() => {}, () => {})
    return { "x-undo-id": data.id, "x-undo-label": encodeURIComponent(label), "access-control-expose-headers": "x-undo-id,x-undo-label" }
  } catch { return {} }
}
