import { NextResponse, type NextRequest } from "next/server"
import { RESUME_HOURS, activeLead, buildRequestView, callN8n, logEvent, purgeTrialData } from "@/lib/trial-server"
import { readTrialInput } from "@/lib/trial-input"

export const runtime = "nodejs"
export const maxDuration = 120

export async function POST(req: NextRequest) {
  const a = await activeLead(req)
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status })
  const { lead, admin } = a
  const inp = await readTrialInput(req)
  if (inp.error) return NextResponse.json({ error: inp.error }, { status: 400 })
  if (!inp.text.trim() && !inp.attachments.length) return NextResponse.json({ error: "Add the email first." }, { status: 400 })

  // Which try is this? An unfinished try inside its 48 hours is reused; otherwise a new one is needed.
  const since = new Date(Date.now() - RESUME_HOURS * 3600_000).toISOString()
  const { data: open } = await admin.from("trial_runs").select("*").eq("lead_id", lead.id).is("finished_at", null).gte("started_at", since).order("started_at", { ascending: false }).limit(1).maybeSingle()
  if (open && open.parse_calls >= 3) return NextResponse.json({ error: "This try has reached its 3 reads. Finish it to start the next one." }, { status: 429 })
  if (!open && lead.tries_used >= lead.tries_total) return NextResponse.json({ error: "Both of your tries are used." }, { status: 403 })
  const day = new Date(Date.now() - 86400_000).toISOString()
  const { count: fails } = await admin.from("trial_events").select("id", { count: "exact", head: true }).eq("lead_id", lead.id).eq("type", "parse_failed").gte("created_at", day)
  if ((fails ?? 0) >= 20) return NextResponse.json({ error: "Too many unreadable emails today. Please try again tomorrow." }, { status: 429 })

  const r = await callN8n("request", { body_text: inp.text, subject: "", attachments: inp.attachments.map((x) => ({ filename: x.filename, mime_type: x.mime_type, data_base64: x.data_base64 })) })
  if (!r.ok || !r.json?.ok || !r.json.extraction) {
    await logEvent(admin, lead.id, "parse_failed", { step: 1, status: r.status })
    const msg = r.status === 422 ? "That does not look like a freight rate request. It was not counted as a try." : (r.json?.error || "We could not read that email. It was not counted as a try.")
    return NextResponse.json({ error: msg, free: true }, { status: r.status === 422 ? 422 : 502 })
  }
  const view = buildRequestView(r.json.extraction, {
    missing: r.json.missing || [], suggested_reply: r.json.suggested_reply || null, port_warning: r.json.port_warning || null, language: r.json.language || null, sender: inp.sender,
  })
  const base = { input_source: ["sample", "paste", "file"].includes(inp.declared) ? inp.declared : inp.source, mode: view.mode, route_from: view.route.from, route_to: view.route.to, cargo: view.fields.find((f) => f[0] === "Cargo")?.[1] ?? null, parse1_ok: true, last_active_at: new Date().toISOString() }
  let runId: string, tryNo: number, used = lead.tries_used
  if (open) {
    runId = open.id; tryNo = open.try_no
    await admin.from("trial_runs").update({ ...base, parse_calls: open.parse_calls + 1, parse2_ok: false, markup_type: null, markup_value: null, final_price: null, data: { request: view } }).eq("id", runId)
  } else {
    const { data: ins, error } = await admin.from("trial_runs").insert({ lead_id: lead.id, try_no: lead.tries_used + 1, ...base, data: { request: view } }).select("id, try_no").single()
    if (error || !ins) return NextResponse.json({ error: "Could not start the try. Please try again." }, { status: 500 })
    runId = ins.id; tryNo = ins.try_no
    const up = await admin.from("trial_leads").update({ tries_used: lead.tries_used + 1 }).eq("id", lead.id).eq("tries_used", lead.tries_used)
    used = lead.tries_used + 1
    await logEvent(admin, lead.id, "try_start", { try_no: tryNo, mode: view.mode, source: base.input_source }, runId)
    void up
  }
  await logEvent(admin, lead.id, "request_read", { mode: view.mode, missing: view.missing.length, source: base.input_source }, runId)
  void purgeTrialData(admin)
  return NextResponse.json({ runId, tryNo, triesUsed: used, triesTotal: lead.tries_total, view })
}
