/** POST /api/inbound/resolve — is this email a reply? Auth: X-Portal-Secret. See lib/inbound-match.ts. */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { resolveInbound } from "@/lib/inbound-match"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const secret = process.env.PORTAL_WEBHOOK_SECRET
  if (!secret || req.headers.get("x-portal-secret") !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const b = await req.json().catch(() => null)
  if (!b || typeof b !== "object") return NextResponse.json({ error: "Bad request" }, { status: 400 })
  try {
    return NextResponse.json(await resolveInbound(adminClient(), b))
  } catch (e: any) {
    console.error("[inbound/resolve]", e?.message ?? e)
    return NextResponse.json({ error: e?.message ?? "resolve failed" }, { status: 500 })
  }
}
