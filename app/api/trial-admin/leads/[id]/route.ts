import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { adminSession } from "@/lib/trial-admin"
import { hashPassword, newAccessCode } from "@/lib/trial-server"

export const runtime = "nodejs"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!adminSession(req)) return NextResponse.json({ error: "Please sign in." }, { status: 401 })
  const { id } = await params
  const b = await req.json().catch(() => ({}))
  const admin = adminClient()
  const { data: lead } = await admin.from("trial_leads").select("*").eq("id", id).maybeSingle()
  if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 })
  const patch: Record<string, unknown> = {}
  let code: string | undefined
  switch (b.action) {
    case "reset_tries": patch.tries_used = 0; await admin.from("trial_runs").update({ finished_at: new Date().toISOString() }).eq("lead_id", id).is("finished_at", null); break
    case "extend": patch.expires_at = new Date(Math.max(Date.now(), Date.parse(lead.expires_at)) + (Math.min(Math.max(Number(b.days) || 7, 1), 90)) * 86400000).toISOString(); break
    case "add_tries": patch.tries_total = lead.tries_total + Math.min(Math.max(Number(b.count) || 1, 1), 5); break
    case "gen_limit": { const n = Math.floor(Number(b.value)); if (!Number.isFinite(n) || n < 0 || n > 500) return NextResponse.json({ error: "Use a number from 0 to 500." }, { status: 400 }); patch.gen_limit = n; break }
    case "reads_limit": { const n = Math.floor(Number(b.value)); if (!Number.isFinite(n) || n < 1 || n > 50) return NextResponse.json({ error: "Use a number from 1 to 50." }, { status: 400 }); patch.reads_per_try = n; break }
    case "disable": patch.status = "disabled"; break
    case "enable": patch.status = "active"; break
    case "converted": patch.converted = !!b.value; break
    case "notes": patch.notes = String(b.value ?? "").slice(0, 2000); break
    case "new_code": code = newAccessCode(); patch.code = code; patch.password_hash = hashPassword(code); break
    default: return NextResponse.json({ error: "Unknown action." }, { status: 400 })
  }
  const { error } = await admin.from("trial_leads").update(patch).eq("id", id)
  if (error) return NextResponse.json({ error: /reads_per_try/.test(error.message) ? "Run migration 083 in Supabase first (it adds the reads setting)." : error.message }, { status: 500 })
  await admin.from("trial_events").insert({ lead_id: id, type: "admin_" + b.action, meta: { by: "owner" } })
  return NextResponse.json({ ok: true, code })
}
