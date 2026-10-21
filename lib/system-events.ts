/**
 * lib/system-events.ts  (server only)
 * logEvent: records something that went wrong. Never throws and never blocks the work that failed.
 * The same problem (same client, kind, workflow, node and title) while still open is ONE row with a count.
 * A NEW problem of severity "error" is also sent to the owner's alert webhook (OWNER_ALERT_WEBHOOK_URL, for example an n8n webhook
 * that emails or messages you), so repeats do not flood it.
 */
import { createHash } from "node:crypto"

export interface EventInput {
  clientCode?: string | null
  source?: "portal" | "n8n"
  kind: string
  severity?: "error" | "warning"
  title: string
  message?: string | null
  workflow?: string | null
  node?: string | null
  executionId?: string | null
  requestId?: string | null
  context?: Record<string, unknown> | null
}

const clip = (v: unknown, n: number) => (v == null ? null : String(v).slice(0, n))

export async function logEvent(admin: any, e: EventInput): Promise<void> {
  try {
    const client = e.clientCode ? String(e.clientCode).toLowerCase() : null
    const fp = createHash("sha1").update([client ?? "", e.source ?? "portal", e.kind, e.workflow ?? "", e.node ?? "", e.title].join("|")).digest("hex")
    const now = new Date().toISOString()
    const { data: open } = await admin.from("system_events").select("id, count").eq("fingerprint", fp).eq("status", "open").limit(1).maybeSingle()
    if (open) {
      await admin.from("system_events").update({ count: (open.count ?? 1) + 1, last_seen: now, message: clip(e.message, 1500), execution_id: clip(e.executionId, 100), context: e.context ?? null }).eq("id", open.id)
      return
    }
    const { error } = await admin.from("system_events").insert({
      client_code: client, source: e.source ?? "portal", kind: e.kind, severity: e.severity ?? "error", title: clip(e.title, 200),
      message: clip(e.message, 1500), workflow: clip(e.workflow, 200), node: clip(e.node, 200), execution_id: clip(e.executionId, 100),
      request_id: e.requestId ?? null, context: e.context ?? null, fingerprint: fp,
    })
    if (error) { console.error("[system-events] insert", error.message); return }
    const hook = process.env.OWNER_ALERT_WEBHOOK_URL
    if (hook && (e.severity ?? "error") === "error") {
      await fetch(hook, {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(8000),
        body: JSON.stringify({ text: `Logistricks ${client ? `(${client}) ` : ""}${e.kind}: ${e.title}${e.message ? ` — ${String(e.message).slice(0, 300)}` : ""}`, client_code: client, kind: e.kind, title: e.title, message: e.message ?? null, workflow: e.workflow ?? null, node: e.node ?? null }),
      }).catch(() => {})
    }
  } catch (err) { console.error("[system-events]", (err as Error).message) }
}

/** The client a workflow name belongs to: a client code that appears as a word in the workflow's name. */
export async function clientFromWorkflowName(admin: any, name: string): Promise<string | null> {
  try {
    const { data } = await admin.from("clients").select("client_code")
    const words = new Set(String(name).toLowerCase().split(/[^a-z0-9_-]+/).filter(Boolean))
    const hit = ((data ?? []) as { client_code: string }[]).find((c) => words.has(String(c.client_code).toLowerCase()))
    return hit ? String(hit.client_code).toLowerCase() : null
  } catch { return null }
}
