/**
 * lib/imap.ts (server only) — reads a client's IMAP mailbox for the portal (no mail provider API needed).
 * Passwords are stored encrypted (lib/secret-box) and never leave the portal.
 */
import { ImapFlow } from "imapflow"
import { simpleParser } from "mailparser"
import { decryptSecret } from "@/lib/secret-box"

export interface ImapSource {
  id: string; client_code: string; name: string
  imap_host: string | null; imap_port: number | null; imap_username: string | null; imap_tls: boolean | null
  imap_password?: string | null; imap_password_enc?: string | null
  imap_last_uid?: number | string | null; imap_uidvalidity?: number | string | null
}

export const imapPassword = (s: Pick<ImapSource, "imap_password" | "imap_password_enc">) =>
  s.imap_password_enc ? decryptSecret(s.imap_password_enc) : String(s.imap_password ?? "")

export interface ImapCreds { host: string; port: number; user: string; pass: string; tls: boolean }

export const credsOf = (s: ImapSource): ImapCreds => ({
  host: String(s.imap_host ?? "").trim(), port: Number(s.imap_port) || 993, user: String(s.imap_username ?? "").trim(),
  pass: imapPassword(s), tls: s.imap_tls !== false,
})

function client(c: ImapCreds) {
  return new ImapFlow({
    host: c.host, port: c.port, secure: c.tls && c.port !== 143, auth: { user: c.user, pass: c.pass },
    logger: false, socketTimeout: 25_000, greetingTimeout: 12_000, connectionTimeout: 12_000,
  })
}

/** Friendly message for the settings page (never includes the password). */
export function imapError(e: unknown): string {
  const x = e as { responseText?: string; message?: string; code?: string; authenticationFailed?: boolean }
  if (x?.authenticationFailed) return "The server refused the username or password (some providers need an app password and IMAP switched on)."
  if (x?.code === "ENOTFOUND" || x?.code === "EAI_AGAIN") return "Host not found. Check the IMAP host name."
  if (x?.code === "ECONNREFUSED" || x?.code === "ETIMEDOUT") return "Could not connect. Check the host and port."
  return String(x?.responseText || x?.message || "Could not read the mailbox").slice(0, 200)
}

export async function testImap(c: ImapCreds): Promise<{ ok: true; messages: number } | { ok: false; error: string }> {
  if (!c.host || !c.user || !c.pass) return { ok: false, error: "Host, username and password are required." }
  const cl = client(c)
  cl.on("error", () => {})
  try {
    await cl.connect()
    const box = await cl.mailboxOpen("INBOX", { readOnly: true })
    const messages = Number(box.exists ?? 0)
    await cl.logout()
    return { ok: true, messages }
  } catch (e) {
    try { cl.close() } catch { /* */ }
    return { ok: false, error: imapError(e) }
  }
}

const htmlText = (h: string) => h.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, "").replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\n{3,}/g, "\n\n").trim()
const hv = (m: any, k: string) => { const v = m.headers?.get(k); return v == null ? "" : typeof v === "string" ? v : String(v?.text ?? v) }

export interface FetchResult { baselined: boolean; items: Record<string, unknown>[]; lastUid: number | null; uidvalidity: number | null; more: boolean }

/**
 * Fetches the mails that arrived after the saved cursor. The first run only records "now" (old mail is not imported).
 * The cursor is NOT advanced here: the caller acknowledges each uid after the workflow handled it.
 */
export async function fetchNew(s: ImapSource, limits = { maxEmails: 10, maxBytes: 3_000_000 }): Promise<FetchResult> {
  const cl = client(credsOf(s))
  cl.on("error", () => {})
  await cl.connect()
  const lock = await cl.getMailboxLock("INBOX", { readOnly: true })
  try {
    const box: any = cl.mailbox
    const validity = Number(box.uidValidity)
    const next = Number(box.uidNext)
    const lastUid = s.imap_last_uid == null ? null : Number(s.imap_last_uid)
    const sameBox = s.imap_uidvalidity != null && Number(s.imap_uidvalidity) === validity
    if (lastUid == null || !sameBox) return { baselined: true, items: [], lastUid: next - 1, uidvalidity: validity, more: false }
    if (next - 1 <= lastUid) return { baselined: false, items: [], lastUid, uidvalidity: validity, more: false }

    const mailbox = String(s.imap_username ?? "").toLowerCase()
    const items: Record<string, unknown>[] = []
    let bytes = 0, more = false
    for await (const msg of cl.fetch(`${lastUid + 1}:*`, { uid: true, source: true }, { uid: true })) {
      if (msg.uid <= lastUid) continue
      if (items.length >= limits.maxEmails || (items.length && bytes + (msg.source?.length ?? 0) > limits.maxBytes)) { more = true; break }
      const m = await simpleParser(msg.source as Buffer)
      const f = m.from?.value?.[0]
      const to = m.to ? (Array.isArray(m.to) ? m.to.map((a) => a.text).join(", ") : m.to.text) : ""
      const cc = m.cc ? (Array.isArray(m.cc) ? m.cc.map((a) => a.text).join(", ") : m.cc.text) : ""
      const text = m.text || (m.html ? htmlText(String(m.html)) : "")
      const atts = (m.attachments ?? []).filter((a) => !a.related || a.filename).map((a) => ({ filename: a.filename || "attachment", mime_type: a.contentType, data_base64: a.content.toString("base64"), size: a.size }))
      const attBytes = atts.reduce((n, a) => n + a.size, 0)
      const keepAtts = attBytes <= limits.maxBytes
      bytes += (msg.source?.length ?? 0)
      const refs = Array.isArray(m.references) ? m.references.join(" ") : String(m.references ?? "")
      const from_email = String(f?.address ?? "").trim().toLowerCase()
      items.push({
        source: "imap", source_id: s.id, uid: msg.uid, mailbox, to, cc, from_email, from_name: String(f?.name ?? "").trim(),
        subject: m.subject ?? "", message_id: m.messageId ?? "", in_reply_to: m.inReplyTo ?? "", references: refs,
        provider_thread_id: "", received_at: (m.date ?? new Date()).toISOString(), body_text: text,
        auto_submitted: hv(m, "auto-submitted"), precedence: hv(m, "precedence"), list_unsubscribe: hv(m, "list-unsubscribe"),
        attachment_count: atts.length, attachments: keepAtts ? atts.map(({ size: _s, ...a }) => a) : [], attachments_skipped: !keepAtts,
        id: `imap:${s.id}:${msg.uid}`, threadId: "", From: f?.name ? `"${f.name}" <${from_email}>` : from_email, To: to, Subject: m.subject ?? "", snippet: text.slice(0, 200), text,
        intake_source: "automatic", intake_filename: null,
      })
    }
    return { baselined: false, items, lastUid, uidvalidity: validity, more }
  } finally {
    lock.release()
    try { await cl.logout() } catch { /* */ }
  }
}

/** An IMAP mailbox is also a receiver address: the workflow finds the client by that address. Add it if missing. */
export async function ensureReceiverEmail(admin: any, clientCode: string, address: string | null | undefined) {
  const a = String(address ?? "").trim().toLowerCase()
  if (!a.includes("@")) return
  try {
    const { data } = await admin.from("client_receiver_emails").select("id, client_code, active").ilike("r_mail", a).limit(1)
    if (data?.length) {
      if (String(data[0].client_code).toLowerCase() === clientCode.toLowerCase() && data[0].active === false) await admin.from("client_receiver_emails").update({ active: true }).eq("id", data[0].id)
      return
    }
    await admin.from("client_receiver_emails").insert({ client_code: clientCode, r_mail: a, label: "IMAP mailbox", active: true })
  } catch { /* the settings page still lets an admin add it by hand */ }
}
