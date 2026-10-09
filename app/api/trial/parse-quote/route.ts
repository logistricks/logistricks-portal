import { NextResponse, type NextRequest } from "next/server"
import { activeLead, buildQuoteView, callN8n, logEvent } from "@/lib/trial-server"
import { readTrialInput } from "@/lib/trial-input"

export const runtime = "nodejs"
export const maxDuration = 120

export async function POST(req: NextRequest) {
  const a = await activeLead(req)
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status })
  const { lead, admin } = a
  const inp = await readTrialInput(req)
  if (inp.error) return NextResponse.json({ error: inp.error }, { status: 400 })
  if (!inp.runId) return NextResponse.json({ error: "Read the request email first." }, { status: 400 })
  if (!inp.text.trim() && !inp.attachments.length) return NextResponse.json({ error: "Add the carrier's email first." }, { status: 400 })
  const { data: run } = await admin.from("trial_runs").select("*").eq("id", inp.runId).eq("lead_id", lead.id).is("finished_at", null).maybeSingle()
  if (!run || !run.data?.request) return NextResponse.json({ error: "Read the request email first." }, { status: 409 })
  const { count } = await admin.from("trial_events").select("id", { count: "exact", head: true }).eq("run_id", run.id).eq("type", "quote_failed")
  if ((count ?? 0) >= 5) return NextResponse.json({ error: "Too many unreadable quotes in this try." }, { status: 429 })

  const r = await callN8n("quote", { body_text: inp.text, subject: "", attachments: inp.attachments.map((x) => ({ filename: x.filename, mime_type: x.mime_type, data_base64: x.data_base64 })) })
  if (!r.ok || !r.json?.ok || !r.json.extraction) {
    await logEvent(admin, lead.id, "quote_failed", { status: r.status }, run.id)
    return NextResponse.json({ error: r.json?.error || "We could not read a quote in that email.", free: true }, { status: r.status === 502 ? 502 : 422 })
  }
  const quote = buildQuoteView(r.json.extraction, run.data.request, inp.fromName)
  if (!quote.lines.length) {
    await logEvent(admin, lead.id, "quote_failed", { reason: "no prices" }, run.id)
    return NextResponse.json({ error: "We could not find prices in that email.", free: true }, { status: 422 })
  }
  await admin.from("trial_runs").update({ parse2_ok: true, currency: quote.currency, data: { ...run.data, quote }, last_active_at: new Date().toISOString() }).eq("id", run.id)
  await logEvent(admin, lead.id, "quote_read", { charges: quote.lines.length, currency: quote.currency, flags: quote.flags.filter((f) => f[0] === "warn").length }, run.id)
  return NextResponse.json({ quote })
}
