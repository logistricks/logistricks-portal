import { NextResponse, type NextRequest } from "next/server"
import { activeLead } from "@/lib/trial-server"
import { renderTrialQuotation } from "@/lib/trial-docs"

export const runtime = "nodejs"

/** The quotation as the portal's default template renders it, for the on-screen preview (same code as the PDF). */
export async function POST(req: NextRequest) {
  const a = await activeLead(req)
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status })
  const { lead, admin } = a
  const b = await req.json().catch(() => ({}))
  const { data: run } = await admin.from("trial_runs").select("*").eq("id", String(b.run_id ?? "")).eq("lead_id", lead.id).maybeSingle()
  if (!run?.data?.quote || !run.data.request) return NextResponse.json({ error: "Nothing to show yet." }, { status: 409 })
  const type = b.markup_type === "flat" ? "flat" : "percent"
  const value = Math.min(Math.max(Number(b.markup_value) || 0, 0), type === "percent" ? 500 : 1_000_000)
  try {
    const r = renderTrialQuotation({ company: lead.company, contact: lead.contact_name ?? "", code: lead.code, tryNo: run.try_no, raw: run.data.raw, req: run.data.request, quote: run.data.quote, markupType: type, markupValue: value })
    return NextResponse.json({ subject: r.subject, text: r.text, document: r.document })
  } catch (e) {
    console.error("[trial] quotation-html", e)
    return NextResponse.json({ error: "Could not build the preview." }, { status: 500 })
  }
}
