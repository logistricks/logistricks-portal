import { NextResponse, type NextRequest } from "next/server"
import { activeLead, logEvent } from "@/lib/trial-server"

export const runtime = "nodejs"
const ALLOWED = new Set(["locked_click", "cta_click", "reply_copied", "email_copied", "excel_exported", "pdf_downloaded", "page_opened", "theme_switched", "roi_used"])

export async function POST(req: NextRequest) {
  const a = await activeLead(req)
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status })
  const b = await req.json().catch(() => ({}))
  const type = String(b.type ?? "")
  if (!ALLOWED.has(type)) return NextResponse.json({ error: "Unknown event" }, { status: 400 })
  const meta = b.feature ? { feature: String(b.feature).slice(0, 80) } : {}
  await logEvent(a.admin, a.lead.id, type, meta, b.run_id ? String(b.run_id) : null)
  return NextResponse.json({ ok: true })
}
