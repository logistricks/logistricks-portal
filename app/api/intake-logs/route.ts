/**
 * app/api/intake-logs/route.ts — the log of manual email intake runs (what was sent to n8n and what came back).
 * GET            -> { logs: [...latest 60 for the signed-in client, without the big raw response], running, failed24h }
 * GET ?id=<uuid> -> { log } the full row, including the raw n8n response.
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { sessionWithRole } from "@/lib/api-admin"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const admin = adminClient()
  const code = s.session.clientCode
  const id = req.nextUrl.searchParams.get("id")
  if (id) {
    const { data, error } = await admin.from("intake_logs").select("*").eq("client_code", code).eq("id", id).maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ log: data })
  }
  const cols = "id, kind, source, filename, from_email, subject, status, stage, http_status, error, result, freight_request_id, created_by, started_at, finished_at, duration_ms"
  const { data, error } = await admin.from("intake_logs").select(cols).eq("client_code", code).order("started_at", { ascending: false }).limit(60)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const logs = data ?? []
  const dayAgo = Date.now() - 86_400_000
  return NextResponse.json({
    logs,
    running: logs.filter((l: any) => l.status === "running").length,
    failed24h: logs.filter((l: any) => (l.status === "failed" || l.status === "unconfirmed") && Date.parse(l.started_at) > dayAgo).length,
  })
}
