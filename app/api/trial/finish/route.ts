import { NextResponse, type NextRequest } from "next/server"
import { activeLead, logEvent } from "@/lib/trial-server"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const a = await activeLead(req)
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status })
  const { lead, admin } = a
  const b = await req.json().catch(() => ({}))
  const { data: run } = await admin.from("trial_runs").select("*").eq("id", String(b.run_id ?? "")).eq("lead_id", lead.id).maybeSingle()
  if (!run || !run.parse2_ok) return NextResponse.json({ error: "Read the carrier quote first." }, { status: 409 })
  if (!run.finished_at) {
    const wall = Date.now() - Date.parse(run.started_at)
    const act = Number(b.active_ms)
    const dur = Number.isFinite(act) && act > 0 ? Math.min(act, wall) : wall
    await admin.from("trial_runs").update({ finished_at: new Date().toISOString(), duration_ms: dur }).eq("id", run.id)
    await logEvent(admin, lead.id, "try_finished", { try_no: run.try_no, duration_ms: dur }, run.id)
    return NextResponse.json({ ok: true, durationMs: dur, triesUsed: lead.tries_used, triesTotal: lead.tries_total })
  }
  return NextResponse.json({ ok: true, durationMs: run.duration_ms, triesUsed: lead.tries_used, triesTotal: lead.tries_total })
}
