import { NextResponse, type NextRequest } from "next/server"
import { RESUME_HOURS, activeLead } from "@/lib/trial-server"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const a = await activeLead(req)
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status })
  const { lead, admin } = a
  // A started try can be resumed for 48 hours.
  const since = new Date(Date.now() - RESUME_HOURS * 3600_000).toISOString()
  const { data: run } = await admin.from("trial_runs").select("*").eq("lead_id", lead.id).is("finished_at", null).gte("started_at", since).not("data", "is", null).order("started_at", { ascending: false }).limit(1).maybeSingle()
  return NextResponse.json({
    lead: { company: lead.company, contact: lead.contact_name, code: lead.code, triesTotal: lead.tries_total, triesUsed: lead.tries_used, expiresAt: lead.expires_at },
    run: run ? { id: run.id, tryNo: run.try_no, request: run.data?.request ?? null, quote: run.data?.quote ?? null, markup: { type: run.markup_type ?? "percent", value: run.markup_value ?? 12 }, format: run.format ?? "pdf" } : null,
  })
}
