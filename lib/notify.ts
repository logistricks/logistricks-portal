/**
 * lib/notify.ts  (server only)
 *
 * Sends the portal's email notifications: loads the client's SMTP server, the template for the event
 * (their saved one, else the built-in default), works out the recipients, renders and sends.
 * A failure is logged and returned — it never throws, so a mail problem can't break the action that triggered it.
 */
import nodemailer from "nodemailer"
import { decryptSecret } from "@/lib/secret-box"
import { sanitizeQuotationHtml } from "@/lib/quotation-html"
import { htmlToPlainText, renderTemplate, fmtDate, type RenderCtx } from "@/lib/quotation-render"
import { mapDbToRequest } from "@/lib/supabase-queries"
import { EVENT_BY_KEY, emailDocument, normalizeRecipients, type NotificationEvent } from "@/lib/notification-events"

export interface SmtpConfig {
  host: string; port: number; security: "ssl" | "starttls" | "none"
  username: string; password: string; from_name: string; from_email: string; reply_to: string | null; enabled: boolean
  auth_method?: "password" | "oauth2_microsoft"; ms_tenant_id?: string; ms_client_id?: string; ms_client_secret?: string
}

const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/

export function portalBaseUrl(): string {
  const v = process.env.PORTAL_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "")
    || "https://logistricks-portal.vercel.app"
  return v.replace(/\/+$/, "")
}

/** Refuses obviously internal hosts so the SMTP form can't be used to probe the server's own network. */
export function badSmtpHost(host: string): string | null {
  const h = host.trim().toLowerCase()
  if (!h || !/^[a-z0-9.-]+$/.test(h)) return "Enter a valid server name, e.g. smtp.gmail.com"
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || /^(127|10|0)\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h))
    return "That address is internal and can't be used as an email server."
  return null
}

export async function loadSmtp(admin: any, clientCode: string): Promise<SmtpConfig | null> {
  const { data } = await admin.from("smtp_settings").select("*").ilike("client_code", clientCode).maybeSingle()
  if (!data || !data.host || !data.from_email) return null
  return {
    host: data.host, port: Number(data.port) || 587,
    security: data.security === "ssl" || data.security === "none" ? data.security : "starttls",
    username: data.username || "", password: decryptSecret(data.password_enc),
    from_name: data.from_name || "", from_email: data.from_email, reply_to: data.reply_to || null, enabled: data.enabled !== false,
    auth_method: data.auth_method === "oauth2_microsoft" ? "oauth2_microsoft" : "password",
    ms_tenant_id: data.ms_tenant_id || "", ms_client_id: data.ms_client_id || "", ms_client_secret: decryptSecret(data.ms_client_secret_enc),
  }
}

/** Microsoft 365 modern authentication: an app-only access token for Exchange Online SMTP (client-credentials flow). */
async function microsoftToken(cfg: SmtpConfig): Promise<string> {
  if (!cfg.ms_tenant_id || !cfg.ms_client_id || !cfg.ms_client_secret) throw Object.assign(new Error("Enter the tenant ID, application (client) ID and client secret."), { code: "EAUTHCFG" })
  const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(cfg.ms_tenant_id)}/oauth2/v2.0/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: cfg.ms_client_id, client_secret: cfg.ms_client_secret, scope: "https://outlook.office365.com/.default", grant_type: "client_credentials" }),
    signal: AbortSignal.timeout(15_000),
  })
  const d = await res.json().catch(() => ({})) as { access_token?: string; error_description?: string }
  if (!res.ok || !d.access_token) throw Object.assign(new Error(String(d.error_description ?? `Microsoft sign-in failed (${res.status})`).split("\r\n")[0].slice(0, 260)), { code: "EMSTOKEN" })
  return d.access_token
}

export async function transport(cfg: SmtpConfig) {
  const oauth = cfg.auth_method === "oauth2_microsoft"
  return nodemailer.createTransport({
    host: cfg.host, port: cfg.port,
    secure: cfg.security === "ssl",
    requireTLS: cfg.security === "starttls",
    ignoreTLS: cfg.security === "none",
    auth: oauth
      ? { type: "OAuth2", user: cfg.username || cfg.from_email, accessToken: await microsoftToken(cfg) }
      : cfg.username ? { user: cfg.username, pass: cfg.password } : undefined,
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
  })
}

export async function sendMail(cfg: SmtpConfig, m: { to: string[]; subject: string; html: string; text: string }) {
  await (await transport(cfg)).sendMail({
    from: cfg.from_name ? { name: cfg.from_name, address: cfg.from_email } : cfg.from_email,
    to: m.to, replyTo: cfg.reply_to || undefined, subject: m.subject, html: m.html, text: m.text,
  })
}

/** A short, readable reason for an SMTP failure. */
export function smtpError(e: unknown): string {
  const err = e as { code?: string; responseCode?: number; message?: string }
  if (err.code === "EMSTOKEN" || err.code === "EAUTHCFG") return String(err.message)
  if (err.code === "EAUTH" && /SmtpClientAuthentication|5\.7\.3|disabled/i.test(String(err.message))) return "Microsoft rejected the sign-in: SMTP AUTH or the app's mailbox permission isn't enabled for this mailbox. See the setup steps on this page."
  if (err.code === "EAUTH" || err.responseCode === 535) return "The server rejected the username or password. For Gmail / Microsoft 365 use an app password."
  if (err.code === "ECONNECTION" || err.code === "ESOCKET" || err.code === "ECONNREFUSED") return "Couldn't connect to the server. Check the server name, port and security setting."
  if (err.code === "ETIMEDOUT" || err.code === "ECONNECTION_TIMEOUT") return "The server didn't answer in time. Check the server name and port."
  if (err.code === "EDNS" || err.code === "ENOTFOUND") return "The server name wasn't found."
  return String(err.message || "Sending failed").slice(0, 300)
}

// ── recipients ───────────────────────────────────────────────────────────────

const usable = (e: string | null | undefined) => !!e && EMAIL_RE.test(e) && !/\.portal$/i.test(e)

export async function emailsForUsernames(admin: any, clientCode: string, usernames: string[]): Promise<string[]> {
  const names = Array.from(new Set(usernames.filter(Boolean)))
  if (!names.length) return []
  const { data } = await admin.from("portal_users").select("auth_email").ilike("client_code", clientCode).eq("is_active", true).in("username", names)
  return (data ?? []).map((r: { auth_email: string }) => r.auth_email).filter(usable)
}

async function emailsForRoles(admin: any, clientCode: string, roles: string[]): Promise<string[]> {
  if (!roles.length) return []
  const { data } = await admin.from("portal_users").select("auth_email").ilike("client_code", clientCode).eq("is_active", true).in("role", roles)
  return (data ?? []).map((r: { auth_email: string }) => r.auth_email).filter(usable)
}

// ── values ───────────────────────────────────────────────────────────────────

export async function requestValues(admin: any, clientCode: string, requestId: string | null | undefined): Promise<Record<string, string>> {
  if (!requestId) return {}
  const { data } = await admin.from("freight_requests").select("*").eq("id", requestId).ilike("client_code", clientCode).maybeSingle()
  if (!data) return {}
  const r = mapDbToRequest(data)
  const dash = (s: string) => (s && s !== "—" ? s : "")
  const join = (a: string, b: string) => [dash(a), dash(b)].filter(Boolean).join(", ")
  return {
    request_ref: r.requestRef ?? "", request_url: `${portalBaseUrl()}/requests/${r.id}`,
    sender_name: dash(r.senderName) === "Unknown" ? "" : dash(r.senderName), sender_first_name: dash(r.senderName).split(/\s+/)[0] === "Unknown" ? "" : dash(r.senderName).split(/\s+/)[0] ?? "",
    sender_email: r.senderEmail ?? "", origin: join(r.originCity, r.originCountry), destination: join(r.destinationCity, r.destinationCountry),
    cargo_type: dash(r.cargoType), equipment: dash(r.equipment), weight: dash(r.weight), mode: r.modes.join(", "), urgency: r.urgency ?? "",
    received_date: fmtDate(r.receivedIso), missing_fields: (r.missingFields ?? []).join(", "),
  }
}

export const money = (n: unknown, cur = "USD") => (n == null || n === "" || Number.isNaN(Number(n)) ? "" : `${cur} ${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)

export function listBlock(items: string[]): { html: string; text: string } {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  return {
    html: items.length ? `<ul style="margin:0 0 0 18px;padding:0;font-size:13px;line-height:1.6;color:#334155">${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : "",
    text: items.map((i) => `- ${i}`).join("\n"),
  }
}

// ── rendering ────────────────────────────────────────────────────────────────

export interface TemplateParts { subject: string; body_html: string }

export function renderEmail(ev: NotificationEvent, tpl: TemplateParts, values: Record<string, string>, blocks: RenderCtx["blocks"] = {}) {
  const ctx: RenderCtx = { values, blocks }
  const subject = renderTemplate(tpl.subject || ev.defaultSubject, ctx, "text").replace(/\s+/g, " ").trim().slice(0, 250)
  const inner = sanitizeQuotationHtml(renderTemplate(tpl.body_html || ev.defaultHtml, ctx, "html"))
  return { subject: subject || ev.label, html: emailDocument(inner), text: htmlToPlainText(inner) }
}

export interface NotifyResult { status: "sent" | "failed" | "skipped"; reason?: string; recipients: string[] }

export async function notify(
  admin: any, clientCode: string, eventKey: string, values: Record<string, string>,
  opts: { to?: string[]; blocks?: RenderCtx["blocks"]; requestId?: string | null } = {},
): Promise<NotifyResult> {
  const ev = EVENT_BY_KEY[eventKey]
  const log = async (status: NotifyResult["status"], recipients: string[], subject: string | null, error?: string) => {
    try { await admin.from("notification_log").insert({ client_code: clientCode, event_key: eventKey, to_emails: recipients, subject, status, error: error ?? null, request_id: opts.requestId ?? null }) } catch { /* logging is best effort */ }
  }
  try {
    if (!ev) return { status: "skipped", reason: "unknown_event", recipients: [] }
    const { data: row } = await admin.from("notification_templates").select("*").ilike("client_code", clientCode).eq("event_key", eventKey).maybeSingle()
    if (row && row.enabled === false) return { status: "skipped", reason: "template_disabled", recipients: [] }

    const cfg = await loadSmtp(admin, clientCode)
    if (!cfg || !cfg.enabled) { await log("skipped", [], null, "Email server not set up or switched off"); return { status: "skipped", reason: "smtp_not_configured", recipients: [] } }

    const rec = normalizeRecipients(row?.recipients, ev.defaultRecipients)
    const to = Array.from(new Set([...(opts.to ?? []), ...(await emailsForRoles(admin, clientCode, rec.roles)), ...rec.extra].map((e) => e.trim().toLowerCase()).filter(usable)))
    if (!to.length) { await log("skipped", [], null, "No recipients"); return { status: "skipped", reason: "no_recipients", recipients: [] } }

    const { data: company } = await admin.from("clients").select("company_name").ilike("client_code", clientCode).maybeSingle()
    const base = portalBaseUrl()
    const all = { company_name: company?.company_name ?? "", portal_url: base, today: fmtDate(new Date().toISOString()), approval_url: `${base}/approvals`, ...values }
    const { subject, html, text } = renderEmail(ev, { subject: row?.subject ?? "", body_html: row?.body_html ?? "" }, all, opts.blocks)

    try {
      await sendMail(cfg, { to, subject, html, text })
      await log("sent", to, subject)
      return { status: "sent", recipients: to }
    } catch (e) {
      const msg = smtpError(e)
      await log("failed", to, subject, msg)
      return { status: "failed", reason: msg, recipients: to }
    }
  } catch (e) {
    await log("failed", [], null, String((e as Error).message).slice(0, 300))
    return { status: "failed", reason: String((e as Error).message), recipients: [] }
  }
}
