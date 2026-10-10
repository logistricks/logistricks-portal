import { NextResponse, type NextRequest } from "next/server"
import { randomInt } from "crypto"
import { adminClient } from "@/lib/api-session"
import { sessionWithRole } from "@/lib/api-admin"
import { hashPassword } from "@/lib/trial-server"
import { isTrialOwner } from "@/lib/trial-owner"

export const runtime = "nodejs"
const CH = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (s.role !== "admin" || !isTrialOwner(s.session.clientCode, s.session.username)) return NextResponse.json({ error: "Trial leads are only available to the Logistricks owner." }, { status: 403 })
  const { id } = await params
  const b = await req.json().catch(() => ({}))
  const admin = adminClient()
  const { data: lead } = await admin.from("trial_leads").select("*").eq("id", id).maybeSingle()
  if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 })
  const patch: Record<string, unknown> = {}
  let password: string | undefined
  switch (b.action) {
    case "reset_tries": patch.tries_used = 0; await admin.from("trial_runs").update({ finished_at: new Date().toISOString() }).eq("lead_id", id).is("finished_at", null); break
    case "extend": patch.expires_at = new Date(Math.max(Date.now(), Date.parse(lead.expires_at)) + (Math.min(Math.max(Number(b.days) || 7, 1), 90)) * 86400000).toISOString(); break
    case "add_tries": patch.tries_total = lead.tries_total + Math.min(Math.max(Number(b.count) || 1, 1), 5); break
    case "disable": patch.status = "disabled"; break
    case "enable": patch.status = "active"; break
    case "converted": patch.converted = !!b.value; break
    case "notes": patch.notes = String(b.value ?? "").slice(0, 2000); break
    case "new_password": password = Array.from({ length: 10 }, () => CH[randomInt(CH.length)]).join(""); patch.password_hash = hashPassword(password); break
    default: return NextResponse.json({ error: "Unknown action." }, { status: 400 })
  }
  const { error } = await admin.from("trial_leads").update(patch).eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await admin.from("trial_events").insert({ lead_id: id, type: "admin_" + b.action, meta: { by: s.session.username } })
  return NextResponse.json({ ok: true, password })
}
