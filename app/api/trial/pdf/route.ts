import { NextResponse, type NextRequest } from "next/server"
import { activeLead, logEvent, quoteNumber } from "@/lib/trial-server"
import { quotationHtml } from "@/lib/trial-docs"
import { renderPdf } from "@/lib/quotation-pdf-server"

export const runtime = "nodejs"
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const a = await activeLead(req)
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status })
  const { lead, admin } = a
  const { data: run } = await admin.from("trial_runs").select("*").eq("id", req.nextUrl.searchParams.get("run_id") ?? "").eq("lead_id", lead.id).maybeSingle()
  if (!run?.data?.quote || !run.data.request) return NextResponse.json({ error: "Nothing to build yet, or the data was deleted after 5 days." }, { status: 409 })
  const pdf = await renderPdf(quotationHtml({ company: lead.company, code: lead.code, tryNo: run.try_no, req: run.data.request, quote: run.data.quote, markupType: run.markup_type ?? "percent", markupValue: Number(run.markup_value ?? 0) }), "a4")
  await logEvent(admin, lead.id, "pdf_downloaded", {}, run.id)
  return new NextResponse(Buffer.from(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${quoteNumber(lead.code, run.try_no)}.pdf"`, "Cache-Control": "no-store" } })
}
