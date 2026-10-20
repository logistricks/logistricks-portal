/** GET /api/approval-cycles/notifications → { [cycleId]: CycleNotify } for every workflow of the client. */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient, getSession } from "@/lib/api-session"
import { loadAllCycleNotify } from "@/lib/approval-notify"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const c = req.cookies.get("portal_session")?.value
  const session = c ? getSession(c) : null
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  return NextResponse.json(await loadAllCycleNotify(adminClient(), session.clientCode))
}
