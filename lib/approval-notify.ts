/**
 * lib/approval-notify.ts — per-workflow notification settings, kept in client_settings (key "approval_notifications"):
 *   { [cycleId]: { remind_enabled, remind_every_h, requester_approved, requester_rejected, members: { "<username>": { approved, rejected } } } }
 * No database change needed. Shared by the builder (client) and the senders (server).
 */
export interface MemberNotify { approved: boolean; rejected: boolean }
export interface CycleNotify {
  remind_enabled: boolean
  remind_every_h: number
  requester_approved: boolean
  requester_rejected: boolean
  members: Record<string, MemberNotify>
}
export const DEFAULT_CYCLE_NOTIFY: CycleNotify = { remind_enabled: false, remind_every_h: 24, requester_approved: true, requester_rejected: true, members: {} }

export function cleanCycleNotify(v: any): CycleNotify {
  const o: CycleNotify = { ...DEFAULT_CYCLE_NOTIFY, members: {} }
  if (!v || typeof v !== "object") return o
  if (typeof v.remind_enabled === "boolean") o.remind_enabled = v.remind_enabled
  const h = Number(v.remind_every_h); if (Number.isFinite(h) && h >= 1 && h <= 720) o.remind_every_h = Math.round(h * 10) / 10
  if (typeof v.requester_approved === "boolean") o.requester_approved = v.requester_approved
  if (typeof v.requester_rejected === "boolean") o.requester_rejected = v.requester_rejected
  if (v.members && typeof v.members === "object") {
    for (const [k, m] of Object.entries(v.members as Record<string, any>)) {
      if (!/^[\w.@-]{1,80}$/.test(k)) continue
      const a = !!m?.approved, r = !!m?.rejected
      if (a || r) o.members[k] = { approved: a, rejected: r }
    }
  }
  return o
}

export async function loadAllCycleNotify(admin: any, clientCode: string): Promise<Record<string, CycleNotify>> {
  try {
    const { data } = await admin.from("client_settings").select("value").eq("client_code", clientCode).eq("key", "approval_notifications").maybeSingle()
    const out: Record<string, CycleNotify> = {}
    for (const [id, v] of Object.entries((data?.value ?? {}) as Record<string, unknown>)) out[id] = cleanCycleNotify(v)
    return out
  } catch { return {} }
}

export async function loadCycleNotify(admin: any, clientCode: string, cycleId: string | null | undefined): Promise<CycleNotify> {
  if (!cycleId) return { ...DEFAULT_CYCLE_NOTIFY, members: {} }
  return (await loadAllCycleNotify(admin, clientCode))[cycleId] ?? { ...DEFAULT_CYCLE_NOTIFY, members: {} }
}

export async function saveCycleNotify(admin: any, clientCode: string, cycleId: string, value: CycleNotify): Promise<string | null> {
  const all = await loadAllCycleNotify(admin, clientCode)
  all[cycleId] = value
  const { error } = await admin.from("client_settings").upsert({ client_code: clientCode, key: "approval_notifications", value: all, updated_at: new Date().toISOString() }, { onConflict: "client_code,key" })
  return error ? error.message : null
}
