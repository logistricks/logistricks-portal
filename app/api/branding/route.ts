/**
 * GET /api/branding → { displayName, logo }   (any signed-in user)
 * PUT /api/branding → { displayName?, logo? } (admin) — displayName updates clients.company_name,
 *                      logo (small PNG/JPEG/SVG data URL, or null to remove) lives in client_settings.branding.
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { sessionWithRole } from "@/lib/api-admin"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const admin = adminClient()
  const [{ data: c }, { data: b }] = await Promise.all([
    admin.from("clients").select("company_name").eq("client_code", s.session.clientCode).maybeSingle(),
    admin.from("client_settings").select("value").eq("client_code", s.session.clientCode).eq("key", "branding").maybeSingle(),
  ])
  return NextResponse.json({ displayName: c?.company_name ?? "", logo: (b?.value as any)?.logo ?? null })
}

export async function PUT(req: NextRequest) {
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (s.role !== "admin") return NextResponse.json({ error: "Admin access required" }, { status: 403 })
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "Bad request" }, { status: 400 })
  const admin = adminClient()
  const code = s.session.clientCode

  if (typeof body.displayName === "string") {
    const name = body.displayName.trim().slice(0, 100)
    if (!name) return NextResponse.json({ error: "Display name cannot be empty" }, { status: 400 })
    const { error } = await admin.from("clients").update({ company_name: name }).eq("client_code", code)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (body.logo !== undefined) {
    const logo = body.logo
    if (logo !== null && !(typeof logo === "string" && /^data:image\/(png|jpeg|jpg|svg\+xml|webp);base64,/.test(logo)))
      return NextResponse.json({ error: "Logo must be a PNG, JPEG, WebP or SVG image" }, { status: 400 })
    if (logo && logo.length > 700_000) return NextResponse.json({ error: "Logo is too large (max ~500 KB)" }, { status: 400 })
    const { error } = await admin.from("client_settings").upsert(
      { client_code: code, key: "branding", value: { logo }, updated_at: new Date().toISOString() },
      { onConflict: "client_code,key" },
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
