/**
 * app/api/notification-templates/route.ts — one email template per notification event.
 *
 * GET    → { rows: saved templates, smtp: { configured, enabled }, log: recent sends }
 * PUT    { event_key, enabled, subject, body_html, recipients }   save (admin)
 * DELETE ?event_key=…                                              reset to the built-in default (admin)
 * POST   { action:"test", event_key, subject, body_html, to? }     send a sample email (admin)
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { sessionWithRole } from "@/lib/api-admin"
import { sanitizeQuotationHtml } from "@/lib/quotation-html"
import { findVariables } from "@/lib/quotation-render"
import { EVENT_BY_KEY, eventVarKeys, normalizeRecipients, sampleBlocks, sampleValues } from "@/lib/notification-events"
import { loadSmtp, renderEmail, sendMail, smtpError } from "@/lib/notify"

const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/
const missingTable = (e: any) => !!e && (e.code === "42P01" || e.code === "PGRST205" || /notification_templates|notification_log/.test(e.message ?? ""))

export async function GET(req: NextRequest) {
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const admin = adminClient()
  const code = s.session.clientCode
  const [tpl, log, smtp] = await Promise.all([
    admin.from("notification_templates").select("event_key, enabled, subject, body_html, recipients, updated_at, updated_by").ilike("client_code", code),
    admin.from("notification_log").select("id, event_key, to_emails, subject, status, error, created_at").ilike("client_code", code).order("created_at", { ascending: false }).limit(30),
    loadSmtp(admin, code),
  ])
  return NextResponse.json({
    rows: tpl.data ?? [], log: log.data ?? [], migrated: !missingTable(tpl.error),
    smtp: { configured: !!smtp, enabled: !!smtp?.enabled }, role: s.role,
  })
}

export async function PUT(req: NextRequest) {
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (s.role !== "admin") return NextResponse.json({ error: "Only admins can edit notification templates." }, { status: 403 })
  const b = await req.json().catch(() => null)
  const ev = b && EVENT_BY_KEY[String(b.event_key)]
  if (!b || !ev) return NextResponse.json({ error: "Unknown notification" }, { status: 400 })

  const subject = String(b.subject ?? "").slice(0, 300)
  const html = sanitizeQuotationHtml(String(b.body_html ?? "")).slice(0, 60_000)
  if (!subject.trim()) return NextResponse.json({ error: "The email needs a subject." }, { status: 400 })
  if (!html.replace(/<[^>]*>/g, "").trim()) return NextResponse.json({ error: "The email body is empty." }, { status: 400 })
  const rec = normalizeRecipients(b.recipients, ev.defaultRecipients)
  const bad = Array.isArray(b.recipients?.extra) ? (b.recipients.extra as unknown[]).map((x) => String(x).trim()).filter((x) => x && !EMAIL_RE.test(x)) : []
  if (bad.length) return NextResponse.json({ error: `These aren't valid email addresses: ${bad.join(", ")}` }, { status: 400 })

  const { error } = await adminClient().from("notification_templates").upsert({
    client_code: s.session.clientCode, event_key: ev.key, enabled: b.enabled !== false, subject, body_html: html,
    recipients: rec, updated_by: s.session.username, updated_at: new Date().toISOString(),
  }, { onConflict: "client_code,event_key" })
  if (error) return NextResponse.json({ error: missingTable(error) ? "The database update for email notifications (migration 046) hasn't been run yet." : error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (s.role !== "admin") return NextResponse.json({ error: "Only admins can reset notification templates." }, { status: 403 })
  const key = new URL(req.url).searchParams.get("event_key")
  if (!key || !EVENT_BY_KEY[key]) return NextResponse.json({ error: "Unknown notification" }, { status: 400 })
  const { error } = await adminClient().from("notification_templates").delete().ilike("client_code", s.session.clientCode).eq("event_key", key)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest) {
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (s.role !== "admin") return NextResponse.json({ error: "Only admins can send test emails." }, { status: 403 })
  const b = await req.json().catch(() => null)
  const ev = b && EVENT_BY_KEY[String(b.event_key)]
  if (!b || b.action !== "test" || !ev) return NextResponse.json({ error: "Unknown action" }, { status: 400 })

  const admin = adminClient()
  const cfg = await loadSmtp(admin, s.session.clientCode)
  if (!cfg) return NextResponse.json({ ok: false, error: "Set up the email server first (Setup → Email Server)." }, { status: 400 })
  const to = String(b.to ?? "").trim() || s.email || ""
  if (!EMAIL_RE.test(to)) return NextResponse.json({ ok: false, error: "Enter a valid address to send the test to." }, { status: 400 })

  const html = sanitizeQuotationHtml(String(b.body_html ?? ""))
  const { unknown } = findVariables(String(b.subject ?? ""), html)
  const known = eventVarKeys(ev)
  const { data: company } = await admin.from("clients").select("company_name").ilike("client_code", s.session.clientCode).maybeSingle()
  const values = { ...sampleValues(ev), ...(company?.company_name ? { company_name: company.company_name } : {}) }
  const mail = renderEmail(ev, { subject: String(b.subject ?? ""), body_html: html }, values, sampleBlocks(ev))
  try {
    await sendMail(cfg, { to: [to], subject: `[Test] ${mail.subject}`, html: mail.html, text: mail.text })
    return NextResponse.json({ ok: true, to, unknown: unknown.filter((u) => !known.has(u)) })
  } catch (e) {
    return NextResponse.json({ ok: false, error: smtpError(e) })
  }
}
