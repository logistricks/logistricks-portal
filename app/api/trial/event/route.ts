import { NextResponse, type NextRequest } from "next/server"
import { activeLead, logEvent } from "@/lib/trial-server"

export const runtime = "nodejs"
const ALLOWED = new Set(["locked_click", "cta_click", "reply_copied", "email_copied", "excel_exported", "pdf_downloaded", "page_opened", "theme_switched", "roi_used", "dwell", "sample_picked", "file_dropped", "tip_open", "next_click"])
const SECTIONS = new Set(["s1", "s2", "s3", "export", "what", "roi"])

export async function POST(req: NextRequest) {
  const a = await activeLead(req)
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status })
  const b = await req.json().catch(() => ({}))
  const type = String(b.type ?? "")
  if (!ALLOWED.has(type)) return NextResponse.json({ error: "Unknown event" }, { status: 400 })
  let meta: Record<string, unknown> = b.feature ? { feature: String(b.feature).slice(0, 80) } : {}
  if (type === "dwell") {
    const sec: Record<string, number> = {}
    for (const [k, v] of Object.entries(b.sections ?? {})) { const n = Math.round(Number(v)); if (SECTIONS.has(k) && n > 0) sec[k] = Math.min(n, 120) }
    if (!Object.keys(sec).length) return NextResponse.json({ ok: true })
    meta = { s: sec }
  }
  await logEvent(a.admin, a.lead.id, type, meta, b.run_id ? String(b.run_id) : null)
  return NextResponse.json({ ok: true })
}
