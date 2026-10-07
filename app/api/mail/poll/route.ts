/**
 * app/api/mail/poll/route.ts — the portal reads the clients' IMAP mailboxes; the workflow tool only asks "anything new?".
 * Auth: X-Portal-Secret.   Passwords stay inside the portal (stored encrypted).
 *
 * POST { action: "fetch", client_code?: string }
 *   -> { emails: [...same shape as the Gmail intake...], sources: [{ id, name, ok, fetched, baselined?, error? }] }
 * POST { action: "ack", source_id: string, uid: number }
 *   -> { ok: true }   (call it after an email was handled; unacknowledged emails are returned again on the next poll,
 *                      the workflow's duplicate check makes that safe)
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { fetchNew, imapError, imapPassword, type ImapSource } from "@/lib/imap"
import { encryptSecret } from "@/lib/secret-box"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const envSecret = process.env.PORTAL_WEBHOOK_SECRET
  if (!envSecret || req.headers.get("x-portal-secret") !== envSecret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const admin = adminClient()

  if (body.action === "ack") {
    const id = String(body.source_id ?? ""), uid = Number(body.uid)
    if (!id || !Number.isFinite(uid)) return NextResponse.json({ error: "source_id and uid required" }, { status: 400 })
    const { data } = await admin.from("email_sources").select("imap_last_uid").eq("id", id).maybeSingle()
    const cur = data?.imap_last_uid == null ? 0 : Number(data.imap_last_uid)
    if (uid > cur) await admin.from("email_sources").update({ imap_last_uid: uid }).eq("id", id)
    return NextResponse.json({ ok: true })
  }

  let q = admin.from("email_sources").select("*").eq("provider", "imap").eq("active", true)
  if (typeof body.client_code === "string" && body.client_code) q = q.eq("client_code", body.client_code)
  const { data: rows, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const emails: Record<string, unknown>[] = []
  const sources: Record<string, unknown>[] = []
  for (const s of (rows ?? []) as (ImapSource & Record<string, any>)[]) {
    if (!s.imap_host || !s.imap_username || !imapPassword(s)) { sources.push({ id: s.id, name: s.name, ok: false, fetched: 0, error: "Host, username or password missing" }); continue }
    // move an old plain-text password into the encrypted column
    if (!s.imap_password_enc && s.imap_password) {
      await admin.from("email_sources").update({ imap_password_enc: encryptSecret(String(s.imap_password)), imap_password: null }).eq("id", s.id)
    }
    try {
      const r = await fetchNew(s)
      const patch: Record<string, unknown> = { imap_last_checked_at: new Date().toISOString(), imap_last_error: null }
      if (r.baselined) { patch.imap_last_uid = r.lastUid; patch.imap_uidvalidity = r.uidvalidity }
      await admin.from("email_sources").update(patch).eq("id", s.id)
      emails.push(...r.items.map((i) => ({ ...i, client_code: s.client_code })))
      sources.push({ id: s.id, name: s.name, ok: true, fetched: r.items.length, baselined: r.baselined || undefined, more: r.more || undefined })
    } catch (e) {
      const msg = imapError(e)
      await admin.from("email_sources").update({ imap_last_checked_at: new Date().toISOString(), imap_last_error: msg }).eq("id", s.id)
      sources.push({ id: s.id, name: s.name, ok: false, fetched: 0, error: msg })
    }
  }
  return NextResponse.json({ emails, sources })
}
