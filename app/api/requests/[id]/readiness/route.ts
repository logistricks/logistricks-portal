/**
 * GET /api/requests/[id]/readiness
 *   What is still missing before this request can be quoted, and whether the sender was already emailed about it.
 *   Used by the confirmation pop-up shown before sending to a carrier or adding a carrier quote to the request.
 *   → { missing: string[], sender_name, sender_email, source, asked: { at, kind, answered, answered_at } | null }
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { sessionWithRole } from "@/lib/api-admin"
import { loadCriticalConfig } from "@/lib/critical-config"
import { typedMissing } from "@/lib/shipment-types"

export const dynamic = "force-dynamic"

function toList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean)
  if (typeof v === "string") {
    const t = v.trim()
    if (!t) return []
    try { const a = JSON.parse(t); if (Array.isArray(a)) return toList(a) } catch { /* plain text */ }
    return t.split(/\s*,\s*/).filter(Boolean)
  }
  return []
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const admin = adminClient()
  const { data: row } = await admin.from("freight_requests").select("*").eq("id", id).ilike("client_code", s.session.clientCode).maybeSingle()
  if (!row) return NextResponse.json({ error: "Request not found" }, { status: 404 })

  const cfg = await loadCriticalConfig(admin, s.session.clientCode)
  let missing = typedMissing(row as Record<string, unknown>, cfg)
  if (!missing) {
    // older request without a type: the list saved when it was read (equipment / BL type only matter for sea)
    const sea = row.is_sea === true
    missing = toList(row.missing_fields).filter((f) => sea || !/equipment|container|bl[ _]?type/i.test(f))
  }

  const conv: { role?: string; type?: string; sent_at?: string }[] = Array.isArray(row.conversation) ? row.conversation : []
  let asked: { at: string; kind: string; answered: boolean; answered_at: string | null } | null = null
  for (let i = conv.length - 1; i >= 0; i--) {
    if (conv[i]?.role === "system" && conv[i].sent_at) {
      const reply = conv.slice(i + 1).find((m) => m?.role === "sender")
      asked = { at: conv[i].sent_at as string, kind: String(conv[i].type ?? "reply"), answered: !!reply, answered_at: reply?.sent_at ?? null }
      break
    }
  }
  if (!asked && row.replied_at && row.reply_sent_type) asked = { at: row.replied_at, kind: String(row.reply_sent_type), answered: false, answered_at: null }

  return NextResponse.json({ missing, sender_name: row.sender_name ?? "", sender_email: row.sender_email ?? "", source: row.source ?? "Email", asked })
}
