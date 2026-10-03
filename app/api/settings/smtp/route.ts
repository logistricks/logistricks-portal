/**
 * app/api/settings/smtp/route.ts — the client's outgoing email server (SMTP).
 *
 * GET  → saved settings (the password is never returned, only whether one is stored)
 * PUT  → save settings (admin). Leave `password` empty to keep the stored one.
 * POST { action: "test", to?, ...form values } → check the connection and send a test email (admin)
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { sessionWithRole } from "@/lib/api-admin"
import { encryptSecret, decryptSecret } from "@/lib/secret-box"
import { badSmtpHost, sendMail, smtpError, type SmtpConfig } from "@/lib/notify"

const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/

function publicView(d: any) {
  if (!d) return { configured: false, auth_method: "password", ms_tenant_id: "", ms_client_id: "", has_ms_secret: false, host: "", port: 587, security: "starttls", username: "", has_password: false, from_name: "", from_email: "", reply_to: "", enabled: true }
  return {
    configured: !!(d.host && d.from_email), host: d.host, port: d.port, security: d.security, username: d.username, has_password: !!d.password_enc,
    auth_method: d.auth_method === "oauth2_microsoft" ? "oauth2_microsoft" : "password", ms_tenant_id: d.ms_tenant_id ?? "", ms_client_id: d.ms_client_id ?? "", has_ms_secret: !!d.ms_client_secret_enc,
    from_name: d.from_name, from_email: d.from_email, reply_to: d.reply_to ?? "", enabled: d.enabled !== false,
    last_test_at: d.last_test_at, last_test_ok: d.last_test_ok, last_test_error: d.last_test_error,
  }
}

function clean(body: Record<string, any>) {
  const security = body.security === "ssl" || body.security === "none" ? body.security : "starttls"
  const port = Math.round(Number(body.port))
  return {
    host: String(body.host ?? "").trim(), port: Number.isFinite(port) && port > 0 && port < 65536 ? port : (security === "ssl" ? 465 : 587), security,
    username: String(body.username ?? "").trim().slice(0, 200), from_name: String(body.from_name ?? "").trim().slice(0, 120),
    from_email: String(body.from_email ?? "").trim(), reply_to: String(body.reply_to ?? "").trim(), enabled: body.enabled !== false,
    auth_method: body.auth_method === "oauth2_microsoft" ? "oauth2_microsoft" : "password",
    ms_tenant_id: String(body.ms_tenant_id ?? "").trim().slice(0, 100), ms_client_id: String(body.ms_client_id ?? "").trim().slice(0, 100),
  }
}

function problem(c: ReturnType<typeof clean>): string | null {
  const h = badSmtpHost(c.host); if (h) return h
  if (!EMAIL_RE.test(c.from_email)) return "Enter the address emails are sent from (From email)."
  if (c.reply_to && !EMAIL_RE.test(c.reply_to)) return "The reply-to address isn't valid."
  if (c.auth_method === "oauth2_microsoft") {
    if (!/^[\w.-]{3,100}$/.test(c.ms_tenant_id)) return "Enter the Directory (tenant) ID from your Microsoft app registration."
    if (!/^[0-9a-fA-F-]{36}$/.test(c.ms_client_id)) return "Enter the Application (client) ID — a 36-character ID."
  }
  return null
}

export async function GET(req: NextRequest) {
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data } = await adminClient().from("smtp_settings").select("*").ilike("client_code", s.session.clientCode).maybeSingle()
  return NextResponse.json(publicView(data))
}

export async function PUT(req: NextRequest) {
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (s.role !== "admin") return NextResponse.json({ error: "Only admins can change the email server." }, { status: 403 })
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })

  const c = clean(body)
  const bad = problem(c)
  if (bad) return NextResponse.json({ error: bad }, { status: 400 })

  const row: Record<string, unknown> = { client_code: s.session.clientCode, ...c, reply_to: c.reply_to || null, updated_at: new Date().toISOString() }
  if (typeof body.password === "string" && body.password !== "") row.password_enc = encryptSecret(body.password)
  if (typeof body.ms_client_secret === "string" && body.ms_client_secret !== "") row.ms_client_secret_enc = encryptSecret(body.ms_client_secret)
  let { error } = await adminClient().from("smtp_settings").upsert(row, { onConflict: "client_code" })
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    // Migration 047 not run: password sign-in still works, modern authentication needs it.
    if (c.auth_method === "oauth2_microsoft") return NextResponse.json({ error: "Modern authentication needs a database update first (migration 047). Run it, then save again." }, { status: 500 })
    for (const k of ["auth_method", "ms_tenant_id", "ms_client_id", "ms_client_secret_enc"]) delete row[k]
    ;({ error } = await adminClient().from("smtp_settings").upsert(row, { onConflict: "client_code" }))
  }
  if (error) {
    const missing = error.code === "42P01" || /smtp_settings/.test(error.message)
    return NextResponse.json({ error: missing ? "The database update for email notifications (migration 046) hasn't been run yet." : error.message }, { status: 500 })
  }
  const { data } = await adminClient().from("smtp_settings").select("*").ilike("client_code", s.session.clientCode).maybeSingle()
  return NextResponse.json(publicView(data))
}

export async function POST(req: NextRequest) {
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (s.role !== "admin") return NextResponse.json({ error: "Only admins can test the email server." }, { status: 403 })
  const body = await req.json().catch(() => null)
  if (!body || body.action !== "test") return NextResponse.json({ error: "Unknown action" }, { status: 400 })

  const admin = adminClient()
  const c = clean(body)
  const bad = problem(c)
  if (bad) return NextResponse.json({ ok: false, error: bad }, { status: 400 })

  const { data: saved } = await admin.from("smtp_settings").select("*").ilike("client_code", s.session.clientCode).maybeSingle()
  const password = typeof body.password === "string" && body.password !== "" ? body.password : decryptSecret(saved?.password_enc)
  const msSecret = typeof body.ms_client_secret === "string" && body.ms_client_secret !== "" ? body.ms_client_secret : decryptSecret(saved?.ms_client_secret_enc)
  const cfg: SmtpConfig = { auth_method: c.auth_method as SmtpConfig["auth_method"], ms_tenant_id: c.ms_tenant_id, ms_client_id: c.ms_client_id, ms_client_secret: msSecret, host: c.host, port: c.port, security: c.security as SmtpConfig["security"], username: c.username, password, from_name: c.from_name, from_email: c.from_email, reply_to: c.reply_to || null, enabled: true }
  const to = String(body.to ?? "").trim() || s.email || c.from_email
  if (!EMAIL_RE.test(to)) return NextResponse.json({ ok: false, error: "Enter a valid address to send the test to." }, { status: 400 })

  let ok = true, err: string | null = null
  try {
    await sendMail(cfg, {
      to: [to], subject: "Test email from your Logistricks portal",
      html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;border:1px solid #e2e8f0"><div style="background:#0D1B2A;color:#fff;padding:16px 22px;font-weight:700">Logistricks</div><div style="padding:22px;color:#0f172a;font-size:14px;line-height:1.6"><h2 style="margin:0 0 10px;color:#0D1B2A">Your email server works</h2><p style="margin:0">This test message was sent from <strong>${c.host}</strong>. Notifications from the portal will now be delivered the same way.</p></div></div>`,
      text: `Your email server works. This test message was sent from ${c.host}.`,
    })
  } catch (e) { ok = false; err = smtpError(e) }

  await admin.from("smtp_settings").update({ last_test_at: new Date().toISOString(), last_test_ok: ok, last_test_error: err }).ilike("client_code", s.session.clientCode)
  return NextResponse.json(ok ? { ok: true, to } : { ok: false, error: err })
}
