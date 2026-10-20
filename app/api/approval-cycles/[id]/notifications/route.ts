/** PUT /api/approval-cycles/[id]/notifications — save a workflow's notification settings (admin). */
import { NextResponse, type NextRequest } from "next/server"
import { adminOnly } from "@/lib/api-admin"
import { adminClient, getSession } from "@/lib/api-session"
import { cleanCycleNotify, saveCycleNotify } from "@/lib/approval-notify"

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  { const denied = await adminOnly(req); if (denied) return denied }
  const c = req.cookies.get("portal_session")?.value
  const session = c ? getSession(c) : null
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  const admin = adminClient()
  const { data: cycle } = await admin.from("approval_cycles").select("id").eq("id", id).eq("client_code", session.clientCode).maybeSingle()
  if (!cycle) return NextResponse.json({ error: "Workflow not found" }, { status: 404 })
  const value = cleanCycleNotify(body)
  const err = await saveCycleNotify(admin, session.clientCode, id, value)
  if (err) return NextResponse.json({ error: err }, { status: 500 })
  return NextResponse.json(value)
}
