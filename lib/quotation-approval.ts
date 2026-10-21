/**
 * lib/quotation-approval.ts  (server only)
 *
 * Approval of a generated quotation before it goes to the requester. It uses the same approval cycles as requests
 * (same steps and approvers) with two extra options on the cycle:
 *   quotation_approval:       off | always | warnings (only when the AI review of the quotation found something, or it was not reviewed)
 *   quotation_after_approval: manual (a person sends it) | auto (the portal sends it after the last approval)
 * The cycle that applies is the one of the person who sends. A person without a cycle does not need approval.
 * An approval belongs to the exact quotation text (hash): editing a quotation afterwards voids it.
 */
import { randomUUID } from "node:crypto"
import { contentHash } from "@/lib/quotation-check"
import { notifyApprovalRequested, notifyApprovalDecided } from "@/lib/notify-hooks"
import { sendQuotationToRequester } from "@/lib/quotation-send"
import { after } from "next/server"
import { logEvent } from "@/lib/system-events"

export type ApprovalStatus = "pending" | "approved" | "rejected" | null
export interface CycleInfo { id: string; name: string; quotation_approval: "off" | "always" | "warnings"; quotation_after_approval: "manual" | "auto"; steps: { sort_order: number; committee_mode: string; usernames: string[] }[] }

export async function cycleForUser(admin: any, code: string, username: string): Promise<CycleInfo | null> {
  try {
    const { data: ini } = await admin.from("approval_cycle_initiators").select("cycle_id").ilike("client_code", code).eq("username", username).maybeSingle()
    if (!ini) return null
    const { data: c } = await admin.from("approval_cycles").select("id, name, quotation_approval, quotation_after_approval, approval_cycle_steps ( sort_order, committee_mode, assigned_to, approval_cycle_step_members ( username ) )").eq("id", ini.cycle_id).maybeSingle()
    if (!c) return null
    return {
      id: c.id, name: c.name, quotation_approval: c.quotation_approval ?? "off", quotation_after_approval: c.quotation_after_approval ?? "manual",
      steps: (c.approval_cycle_steps ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order).map((s: any) => {
        const m = (s.approval_cycle_step_members ?? []).map((x: any) => x.username)
        return { sort_order: s.sort_order, committee_mode: s.committee_mode, usernames: m.length ? m : s.assigned_to ? [s.assigned_to] : [] }
      }),
    }
  } catch { return null }   // columns missing (migration 087 not run): no approval
}

export interface Requirement { needed: boolean; required: boolean; status: ApprovalStatus; stale: boolean; cycle: CycleInfo | null }

/** Does sending this quotation (by this person) need an approval it doesn't have yet? */
export async function approvalRequirement(admin: any, code: string, q: any, username: string): Promise<Requirement> {
  const cycle = await cycleForUser(admin, code, username)
  const hash = contentHash(q)
  const approvedNow = q.approval_status === "approved" && q.approval_hash === hash
  const stale = (q.approval_status === "approved" || q.approval_status === "pending") && q.approval_hash !== hash
  const status: ApprovalStatus = stale ? null : (q.approval_status ?? null)
  if (!cycle || cycle.quotation_approval === "off") return { needed: false, required: false, status, stale, cycle }
  let required = true
  if (cycle.quotation_approval === "warnings") {
    const { data: chk } = await admin.from("quotation_checks").select("verdict, content_hash").eq("quotation_id", q.id).order("created_at", { ascending: false }).limit(1).maybeSingle()
    required = !(chk && chk.content_hash === hash && chk.verdict === "ok")
  }
  return { needed: required && !approvedNow, required, status, stale, cycle }
}

const NAMES = (u: string[]) => u.join(", ")

/** Starts the approval chain for a quotation. Replaces an earlier pending chain. */
export async function submitQuotationForApproval(admin: any, code: string, username: string, q: any): Promise<{ ok: true; status: "pending" | "approved" } | { ok: false; error: string; status?: number }> {
  if (q.status === "sent") return { ok: false, error: "This quotation was already sent.", status: 400 }
  const req = await approvalRequirement(admin, code, q, username)
  if (!req.cycle) return { ok: false, error: "No approval cycle is assigned to your account.", status: 403 }
  if (!req.required) return { ok: false, error: "This quotation does not need approval.", status: 400 }
  if (req.status === "pending" && !req.stale) return { ok: false, error: "This quotation is already waiting for approval.", status: 409 }
  const steps = req.cycle.steps.filter((s) => s.usernames.length > 0)
  if (!steps.length) return { ok: false, error: "The approval cycle has no approvers.", status: 400 }
  const hash = contentHash(q), batch = randomUUID()
  await admin.from("quotation_approvals").update({ step_status: "skipped" }).eq("quotation_id", q.id).in("step_status", ["waiting", "active"])
  const rows = steps.map((s, i) => ({
    client_code: code, quotation_id: q.id, freight_request_id: q.freight_request_id, cycle_id: req.cycle!.id, batch_id: batch, sort_order: s.sort_order,
    assigned_usernames: s.usernames, committee_mode: s.committee_mode, step_status: i === 0 ? "active" : "waiting", submitted_by: username, content_hash: hash,
  }))
  const { error } = await admin.from("quotation_approvals").insert(rows)
  if (error) return { ok: false, error: /quotation_approvals/.test(error.message) ? "Run migration 087 (quotation approvals) first." : error.message, status: 500 }
  await admin.from("quotations").update({ approval_status: "pending", approval_hash: hash, approved_by: null, approved_at: null }).eq("id", q.id).ilike("client_code", code)
  const progressed = await advance(admin, code, q, batch, req.cycle, username)
  return { ok: true, status: progressed }
}

/** Activates the first waiting step (notify-only steps pass by themselves); completes the approval when none is left. */
async function advance(admin: any, code: string, q: any, batch: string, cycle: CycleInfo, submitter: string): Promise<"pending" | "approved"> {
  for (let guard = 0; guard < 20; guard++) {
    const { data: rows } = await admin.from("quotation_approvals").select("*").eq("batch_id", batch).order("sort_order", { ascending: true })
    const list = (rows ?? []) as any[]
    let act = list.find((r) => r.step_status === "active")
    if (!act) {
      const next = list.find((r) => r.step_status === "waiting")
      if (!next) { await complete(admin, code, q, cycle, submitter, list.filter((r) => r.decided_by).slice(-1)[0]?.decided_by ?? null); return "approved" }
      await admin.from("quotation_approvals").update({ step_status: "active" }).eq("id", next.id)
      act = { ...next, step_status: "active" }
    }
    const names: string[] = act.assigned_usernames ?? []
    if (names.length) {
      await admin.from("notifications").insert(names.map((username) => ({
        client_code: code, username, type: act.committee_mode === "notify_only" ? "approval_notification" : "approval_required",
        title: "Quotation approval", body: `${submitter} sent quotation ${q.quotation_number ?? q.id} ${act.committee_mode === "notify_only" ? "for your information" : "for your approval"}`, request_id: q.freight_request_id,
      })))
      after(() => notifyApprovalRequested(admin, { clientCode: code, requestId: q.freight_request_id, usernames: names, step: act.sort_order, submittedBy: submitter, mode: act.committee_mode, label: "Quotation approval required" }))
    }
    if (act.committee_mode !== "notify_only") return "pending"
    await admin.from("quotation_approvals").update({ step_status: "approved", decided_by: "(notified)", decided_at: new Date().toISOString() }).eq("id", act.id)
  }
  return "pending"
}

async function complete(admin: any, code: string, q: any, cycle: CycleInfo, submitter: string, by: string | null) {
  const hash = contentHash(q)
  await admin.from("quotations").update({ approval_status: "approved", approval_hash: hash, approved_by: by && by !== "(notified)" ? by : null, approved_at: new Date().toISOString() }).eq("id", q.id).ilike("client_code", code)
  await admin.from("notifications").insert({ client_code: code, username: submitter, type: "approval_complete", title: "Quotation approved", body: cycle.quotation_after_approval === "auto" ? `Quotation ${q.quotation_number ?? q.id} was approved and is being sent` : `Quotation ${q.quotation_number ?? q.id} was approved. You can send it now.`, request_id: q.freight_request_id })
  if (cycle.quotation_after_approval === "auto") {
    after(async () => {
      try {
        const r = await sendQuotationToRequester(admin, code, submitter, q.id, { manual: false, confirmExpired: true, confirmChecks: true, skipApproval: true })
        if (r.status >= 300) await logEvent(admin, { clientCode: code, kind: "auto_send_failed", title: "An approved quotation could not be sent automatically", message: `${q.quotation_number ?? q.id}: ${String(r.json?.error ?? "unknown error")}`, requestId: q.freight_request_id })
        if (r.status >= 300) await admin.from("notifications").insert({ client_code: code, username: submitter, type: "approval_complete", title: "Approved, but the send failed", body: String(r.json?.error ?? "Open the request and send it from the quotation."), request_id: q.freight_request_id })
        else await admin.from("notifications").insert({ client_code: code, username: submitter, type: "approval_complete", title: "Quotation sent", body: `Quotation ${q.quotation_number ?? q.id} was sent to ${r.json?.to ?? "the requester"}`, request_id: q.freight_request_id })
      } catch (e) { console.error("[quotation-approval] auto send", (e as Error).message) }
    })
  }
}

/** One approver's decision on an active step. */
export async function decideQuotationApproval(admin: any, code: string, username: string, id: string, action: "approve" | "reject", notes: string | null): Promise<{ ok: true; next: "next_step" | "approved" | "rejected" } | { ok: false; error: string; status: number }> {
  const { data: step } = await admin.from("quotation_approvals").select("*").eq("id", id).ilike("client_code", code).maybeSingle()
  if (!step) return { ok: false, error: "Not found", status: 404 }
  if (step.step_status !== "active") return { ok: false, error: "This step is not currently active", status: 409 }
  if (!(step.assigned_usernames ?? []).includes(username)) return { ok: false, error: "You are not assigned to this step", status: 403 }
  const { data: q } = await admin.from("quotations").select("*").eq("id", step.quotation_id).ilike("client_code", code).maybeSingle()
  if (!q) return { ok: false, error: "Quotation not found", status: 404 }
  if (q.status === "sent") return { ok: false, error: "This quotation was already sent.", status: 409 }
  if (contentHash(q) !== step.content_hash) {
    await admin.from("quotation_approvals").update({ step_status: "skipped" }).eq("batch_id", step.batch_id).in("step_status", ["waiting", "active"])
    await admin.from("quotations").update({ approval_status: null, approval_hash: null }).eq("id", q.id)
    return { ok: false, error: "The quotation was changed after it was submitted. It has to be sent for approval again.", status: 409 }
  }
  const now = new Date().toISOString()
  const cycle = (await admin.from("approval_cycles").select("id, name, quotation_approval, quotation_after_approval").eq("id", step.cycle_id).maybeSingle()).data
  const info: CycleInfo = { id: cycle?.id ?? step.cycle_id, name: cycle?.name ?? "", quotation_approval: cycle?.quotation_approval ?? "always", quotation_after_approval: cycle?.quotation_after_approval ?? "manual", steps: [] }
  if (action === "reject") {
    if (!notes?.trim()) return { ok: false, error: "Rejection reason required", status: 400 }
    await admin.from("quotation_approvals").update({ step_status: "rejected", decided_by: username, notes, decided_at: now }).eq("id", id)
    await admin.from("quotation_approvals").update({ step_status: "skipped" }).eq("batch_id", step.batch_id).in("step_status", ["waiting", "active"])
    await admin.from("quotations").update({ approval_status: "rejected" }).eq("id", q.id).ilike("client_code", code)
    await admin.from("notifications").insert({ client_code: code, username: step.submitted_by, type: "approval_rejected", title: "Quotation rejected", body: `Quotation ${q.quotation_number ?? q.id} was rejected: ${notes}`, request_id: q.freight_request_id })
    after(() => notifyApprovalDecided(admin, { clientCode: code, requestId: q.freight_request_id, submitter: step.submitted_by, decision: "rejected", decidedBy: username, notes: `Quotation ${q.quotation_number ?? q.id}: ${notes}`, cycleId: step.cycle_id }))
    return { ok: true, next: "rejected" }
  }
  await admin.from("quotation_approvals").update({ step_status: "approved", decided_by: username, notes: notes ?? null, decided_at: now }).eq("id", id)
  const res = await advance(admin, code, q, step.batch_id, info, step.submitted_by)
  if (res === "approved") after(() => notifyApprovalDecided(admin, { clientCode: code, requestId: q.freight_request_id, submitter: step.submitted_by, decision: "approved", decidedBy: username, notes: `Quotation ${q.quotation_number ?? q.id}`, cycleId: step.cycle_id }))
  return { ok: true, next: res === "approved" ? "approved" : "next_step" }
}

export { NAMES as approverNames }
