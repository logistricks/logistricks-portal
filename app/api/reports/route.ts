/**
 * GET /api/reports?id=<report>&from=ISO&to=ISO&tz=min&<filter keys>   → report result
 * GET /api/reports?options=1                                           → dynamic filter options (carriers, statuses)
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient, getSession } from "@/lib/api-session"
import { reportById } from "@/lib/reports/catalog"
import { runReport } from "@/lib/reports/run"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get("portal_session")?.value
  const session = cookie ? getSession(cookie) : null
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const admin = adminClient()
  const sp = req.nextUrl.searchParams

  if (sp.get("options")) {
    const [{ data: cs }, { data: st }] = await Promise.all([
      admin.from("carriers").select("id, carrier_name").eq("client_code", session.clientCode).order("carrier_name"),
      admin.from("freight_requests").select("status").eq("client_code", session.clientCode).limit(5000),
    ])
    return NextResponse.json({
      carriers: (cs ?? []).map((c: any) => ({ value: String(c.id), label: c.carrier_name })),
      statuses: Array.from(new Set((st ?? []).map((r: any) => r.status).filter(Boolean))).sort().map((s) => ({ value: s, label: s })),
    })
  }

  const id = sp.get("id") ?? ""
  if (!reportById(id)) return NextResponse.json({ error: "Unknown report" }, { status: 404 })
  const now = Date.now()
  let to = Date.parse(sp.get("to") ?? ""); let from = Date.parse(sp.get("from") ?? "")
  if (isNaN(to)) to = now + 1
  if (isNaN(from) || from >= to) from = to - 30 * 86400_000
  const f: Record<string, string> = {}
  sp.forEach((v, k) => { if (!["id", "from", "to", "tz"].includes(k) && v) f[k] = v })
  try {
    const result = await runReport(admin, session.clientCode, id, { from, to, tz: Number(sp.get("tz") ?? 0) || 0, f })
    return NextResponse.json(result)
  } catch (e: any) {
    console.error("[api/reports]", id, e?.message ?? e)
    return NextResponse.json({ error: e?.message ?? "Report failed" }, { status: 500 })
  }
}
