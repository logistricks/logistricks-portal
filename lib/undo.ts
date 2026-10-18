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
  /** Put an approval cycle (steps, members) back as it was; before = null removes it. Initiator links are restored for the whole client. */
  | { k: "cycle"; id: string; before: CycleSnap | null; initiators: { cycle_id: string; username: string }[] }

export type CycleSnap = { row: Record<string, unknown>; steps: (Record<string, unknown> & { members: string[] })[] }

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


/** An approval cycle with its steps and members, as it is now. */
export async function snapshotCycle(admin: any, clientCode: string, id: string): Promise<CycleSnap | null> {
  try {
    const { data: row } = await admin.from("approval_cycles").select("*").eq("id", id).ilike("client_code", clientCode).maybeSingle()
    if (!row) return null
    const { data: steps } = await admin.from("approval_cycle_steps").select("*").eq("cycle_id", id)
    const ids = (steps ?? []).map((x: any) => x.id)
    const { data: mem } = ids.length ? await admin.from("approval_cycle_step_members").select("step_id, username").in("step_id", ids) : { data: [] as any[] }
    return { row, steps: (steps ?? []).map((x: any) => ({ ...x, members: (mem ?? []).filter((m: any) => m.step_id === x.id).map((m: any) => m.username) })) }
  } catch { return null }
}

/** Every initiator link of the client (a user belongs to one cycle at a time). */
export async function snapshotInitiators(admin: any, clientCode: string): Promise<{ cycle_id: string; username: string }[]> {
  try {
    const { data } = await admin.from("approval_cycle_initiators").select("cycle_id, username").ilike("client_code", clientCode)
    return (data ?? []) as any[]
  } catch { return [] }
}

/** Runs a "cycle" undo op. Throws on failure. */
export async function restoreCycle(admin: any, clientCode: string, op: Extract<UndoOp, { k: "cycle" }>) {
  if (!op.before) {
    const { error } = await admin.from("approval_cycles").delete().eq("id", op.id).ilike("client_code", clientCode)
    if (error) throw error
  } else {
    const { row, steps } = op.before
    const { error: e1 } = await admin.from("approval_cycles").upsert({ ...row, client_code: clientCode }, { onConflict: "id" })
    if (e1) throw e1
    await admin.from("approval_cycle_steps").delete().eq("cycle_id", op.id)
    if (steps.length) {
      const { error: e2 } = await admin.from("approval_cycle_steps").insert(steps.map(({ members: _m, ...st }) => st))
      if (e2) throw e2
      const mem = steps.flatMap((st) => st.members.map((username) => ({ step_id: st.id, username })))
      if (mem.length) { const { error: e3 } = await admin.from("approval_cycle_step_members").insert(mem); if (e3) throw e3 }
    }
  }
  // initiators: back to exactly what they were (links to cycles that no longer exist are skipped)
  await admin.from("approval_cycle_initiators").delete().ilike("client_code", clientCode)
  const { data: alive } = await admin.from("approval_cycles").select("id").ilike("client_code", clientCode)
  const ok = new Set((alive ?? []).map((c: any) => c.id))
  const rows = op.initiators.filter((i) => ok.has(i.cycle_id)).map((i) => ({ ...i, client_code: clientCode }))
  if (rows.length) await admin.from("approval_cycle_initiators").insert(rows)
}
