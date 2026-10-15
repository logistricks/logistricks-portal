/** GET /api/pipeline-health?from=ISO&to=ISO — the Pipeline Health score for a period. Visible to every signed-in user. */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { sessionWithRole } from "@/lib/api-admin"
import { loadLimits } from "@/lib/task-rules"
import { computeHealth } from "@/lib/pipeline-health"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const q = req.nextUrl.searchParams
  const from = Date.parse(q.get("from") ?? ""), to = Date.parse(q.get("to") ?? "")
  if (isNaN(from) || isNaN(to) || to <= from) return NextResponse.json({ error: "Bad period" }, { status: 400 })
  try {
    const admin = adminClient()
    const limits = await loadLimits(admin, s.session.clientCode)
    return NextResponse.json(await computeHealth(admin, s.session.clientCode, limits, from, Math.min(to, Date.now() + 86400_000)))
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Could not work out the score" }, { status: 500 })
  }
}
