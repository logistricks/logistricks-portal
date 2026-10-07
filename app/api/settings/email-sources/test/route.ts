/** POST — checks an IMAP login (typed values, or the saved password when the field is left blank). */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { sessionWithRole } from "@/lib/api-admin"
import { credsOf, testImap, imapPassword } from "@/lib/imap"

export const runtime = "nodejs"
export const maxDuration = 30

export async function POST(req: NextRequest) {
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (s.role === "viewer") return NextResponse.json({ error: "Viewers cannot test mailboxes." }, { status: 403 })
  const b = await req.json().catch(() => ({})) as Record<string, any>
  let pass = String(b.imap_password ?? "")
  if (!pass && typeof b.id === "string") {
    const { data } = await adminClient().from("email_sources").select("*").eq("id", b.id).eq("client_code", s.session.clientCode).maybeSingle()
    if (data) pass = imapPassword(data)
  }
  const r = await testImap({ host: String(b.imap_host ?? "").trim(), port: Number(b.imap_port) || 993, user: String(b.imap_username ?? "").trim(), pass, tls: b.imap_tls !== false })
  return NextResponse.json(r)
}
