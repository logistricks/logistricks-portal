import { NextResponse, type NextRequest } from "next/server"
import { activeLead, logEvent } from "@/lib/trial-server"
import { LEVELS, checkKeywords, cleanTerms, loadPrompts, requestSummary, writeCarrierReply, writeRequestEmail, type Level } from "@/lib/trial-gen"

export const runtime = "nodejs"
export const maxDuration = 90
const DAILY_CAP = 12

/** AI-written demo input for step 1 (a client request) or step 2 (a carrier reply that matches the request just read). */
export async function POST(req: NextRequest) {
  const a = await activeLead(req)
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status })
  const { lead, admin } = a
  const b = await req.json().catch(() => ({}))
  const kind = b.kind === "quote" ? "quote" : b.kind === "request" ? "request" : null
  const level = LEVELS.includes(b.level) ? (b.level as Level) : null
  if (!kind || !level) return NextResponse.json({ error: "Choose a level first." }, { status: 400 })

  const day = new Date(Date.now() - 86400_000).toISOString()
  const { count } = await admin.from("trial_events").select("id", { count: "exact", head: true }).eq("lead_id", lead.id).eq("type", "generated").gte("created_at", day)
  if ((count ?? 0) >= DAILY_CAP) return NextResponse.json({ error: "You have reached today's limit for AI-written examples. You can still type or drop your own." }, { status: 429 })

  const prompts = await loadPrompts(admin)
  try {
    if (kind === "request") {
      const terms = cleanTerms(b.keywords)
      const kw = await checkKeywords(terms, prompts.kw_guard.body)
      const mail = await writeRequestEmail(prompts.gen_request.body, level, kw.used)
      await logEvent(admin, lead.id, "generated", { kind, level, kw_used: kw.used.length, kw_dropped: kw.dropped.length, kw_text: kw.used.join(", ").slice(0, 200) })
      return NextResponse.json({ subject: mail.subject, text: mail.body, keywords: kw })
    }
    const runId = String(b.run_id ?? "")
    const { data: run } = await admin.from("trial_runs").select("data").eq("id", runId).eq("lead_id", lead.id).maybeSingle()
    if (!run?.data?.request) return NextResponse.json({ error: "Read the request first." }, { status: 409 })
    const text = await writeCarrierReply(prompts.gen_quote.body, level, requestSummary(run.data.request))
    await logEvent(admin, lead.id, "generated", { kind, level }, runId)
    return NextResponse.json({ text })
  } catch (e: any) {
    const nc = String(e?.message) === "not_configured"
    return NextResponse.json({ error: nc ? "AI examples are not switched on yet. You can type or drop your own." : "We could not write an example just now. Please try again." }, { status: nc ? 503 : 502 })
  }
}
