/**
 * GET /api/carrier-emails → { emails, defaults, canEdit }
 * PUT /api/carrier-emails { quote_fix? }   (admins only; undo-able)
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { sessionWithRole } from "@/lib/api-admin"
import { DEFAULT_CARRIER_EMAILS, cleanCarrierEmails } from "@/lib/carrier-emails"
import { restoreRows, saveUndo, snapshot, type UndoOp } from "@/lib/undo"

export const dynamic = "force-dynamic"
const KEY = "carrier_emails"

async function load(admin: any, cc: string) {
  const { data } = await admin.from("client_settings").select("value").eq("client_code", cc).eq("key", KEY).maybeSingle()
  return cleanCarrierEmails(data?.value)
}

export async function GET(req: NextRequest) {
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  return NextResponse.json({ emails: await load(adminClient(), s.session.clientCode), defaults: DEFAULT_CARRIER_EMAILS, canEdit: s.role === "admin" })
}

export async function PUT(req: NextRequest) {
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (s.role !== "admin") return NextResponse.json({ error: "Only admins can change these templates." }, { status: 403 })
  const b = await req.json().catch(() => null)
  if (!b || typeof b !== "object") return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  if (b.quote_fix !== undefined && !String(b.quote_fix).includes("{{issues}}"))
    return NextResponse.json({ error: "The email must contain {{issues}}, where the list of problems goes." }, { status: 400 })
  const admin = adminClient(), cc = s.session.clientCode
  const next = cleanCarrierEmails({ ...(await load(admin, cc)), ...b })
  const before = await snapshot(admin, "client_settings", { client_code: cc, key: KEY })
  const ops: UndoOp[] = before.length ? restoreRows("client_settings", before) : [{ k: "remove" as const, table: "client_settings", where: { client_code: cc, key: KEY } }]
  const { error } = await admin.from("client_settings").upsert({ client_code: cc, key: KEY, value: next, updated_at: new Date().toISOString() }, { onConflict: "client_code,key" })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const undo = await saveUndo(admin, s.session, "Carrier email saved", ops)
  return NextResponse.json({ ok: true, emails: next }, { headers: undo })
}
