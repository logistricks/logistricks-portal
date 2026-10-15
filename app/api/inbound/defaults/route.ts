/** GET|POST /api/inbound/defaults?client_code=XXX — default port / airport for the email-processing workflow. Auth: X-Portal-Secret. */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { flatDefaults, loadDefaults } from "@/lib/default-locations"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function handle(req: NextRequest, cc: string | null) {
  const secret = process.env.PORTAL_WEBHOOK_SECRET
  if (!secret || req.headers.get("x-portal-secret") !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!cc) return NextResponse.json({ error: "client_code required" }, { status: 400 })
  return NextResponse.json(flatDefaults(await loadDefaults(adminClient(), cc)))
}
export async function GET(req: NextRequest) { return handle(req, req.nextUrl.searchParams.get("client_code")) }
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null)
  return handle(req, typeof b?.client_code === "string" ? b.client_code : req.nextUrl.searchParams.get("client_code"))
}
