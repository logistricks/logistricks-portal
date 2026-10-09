import { NextResponse, type NextRequest } from "next/server"
import { activeLead, logEvent, pricing } from "@/lib/trial-server"

export const runtime = "nodejs"

/** Saves the lead's choices (markup, format, template) on a try. The price is worked out here, never trusted from the page. */
export async function POST(req: NextRequest) {
  const a = await activeLead(req)
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status })
  const { lead, admin } = a
  const b = await req.json().catch(() => ({}))
  const { data: run } = await admin.from("trial_runs").select("*").eq("id", String(b.run_id ?? "")).eq("lead_id", lead.id).maybeSingle()
  if (!run?.data?.quote) return NextResponse.json({ error: "Nothing to save yet." }, { status: 409 })
  const type = b.markup_type === "flat" ? "flat" : "percent"
  const value = Math.min(Math.max(Number(b.markup_value) || 0, 0), type === "percent" ? 500 : 1_000_000)
  const p = pricing(run.data.quote.lines, type, value)
  const patch: Record<string, unknown> = { markup_type: type, markup_value: value, final_price: p.final }
  if (b.format === "pdf" || b.format === "mail") patch.format = b.format
  await admin.from("trial_runs").update(patch).eq("id", run.id)
  if (b.event === "markup_set") await logEvent(admin, lead.id, "markup_set", { type, value }, run.id)
  if (b.event === "format_switched") await logEvent(admin, lead.id, "format_switched", { format: patch.format }, run.id)
  return NextResponse.json({ ok: true, final: p.final })
}
