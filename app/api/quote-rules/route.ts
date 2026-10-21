/**
 * GET /api/quote-rules → { rules, defaults, canEdit }   (everyone signed in)
 * PUT /api/quote-rules { actions?, max_asks?, ask_body? }   (admins only; undo-able)
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { sessionWithRole } from "@/lib/api-admin"
import { loadQuoteRules } from "@/lib/carrier-ask"
import { DEFAULT_RULES, RULES, cleanRules } from "@/lib/quote-rules"
import { restoreRows, saveUndo, snapshot, type UndoOp } from "@/lib/undo"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const rules = await loadQuoteRules(adminClient(), s.session.clientCode)
  return NextResponse.json({ rules, defaults: DEFAULT_RULES, catalog: RULES.map(({ code, label, hint, askable }) => ({ code, label, hint, askable })), canEdit: s.role === "admin" })
}

export async function PUT(req: NextRequest) {
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (s.role !== "admin") return NextResponse.json({ error: "Only admins can change these rules." }, { status: 403 })
  const b = await req.json().catch(() => null)
  if (!b || typeof b !== "object") return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  const n = Number(b.max_asks)
  if (b.max_asks !== undefined && !(Number.isFinite(n) && n >= 1 && n <= 5)) return NextResponse.json({ error: "Maximum asks must be between 1 and 5." }, { status: 400 })
  if (b.ask_body !== undefined && !String(b.ask_body).includes("{{issues}}")) return NextResponse.json({ error: "The email must contain {{issues}}, where the list of problems goes." }, { status: 400 })

  const admin = adminClient(), cc = s.session.clientCode
  const current = await loadQuoteRules(admin, cc)
  const next = cleanRules({ ...current, ...b, actions: { ...current.actions, ...(b.actions ?? {}) } })
  const before = await snapshot(admin, "client_settings", { client_code: cc, key: "quote_rules" })
  const ops: UndoOp[] = before.length ? restoreRows("client_settings", before) : [{ k: "remove" as const, table: "client_settings", where: { client_code: cc, key: "quote_rules" } }]
  const { error } = await admin.from("client_settings").upsert({ client_code: cc, key: "quote_rules", value: next, updated_at: new Date().toISOString() }, { onConflict: "client_code,key" })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const undo = await saveUndo(admin, s.session, "Quote rules saved", ops)
  return NextResponse.json({ ok: true, rules: next }, { headers: undo })
}
