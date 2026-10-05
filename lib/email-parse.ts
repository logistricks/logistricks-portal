// Parses a dropped email file (.eml or Outlook .msg) into one plain structure.
import { simpleParser } from "mailparser"

export interface ParsedAttachment { filename: string; mime_type: string; data_base64: string; size: number }
export interface ParsedEmail {
  from_email: string
  from_name: string
  to: string[]
  cc: string[]
  /** Every address on the mail (To, Cc, Bcc, Delivered-To, X-Original-To), lower-case, unique. */
  recipients: string[]
  subject: string
  date: string | null
  message_id: string | null
  in_reply_to: string | null
  references: string[]
  body_text: string
  attachments: ParsedAttachment[]
}

const ADDR = /[^\s<>,;"'()]+@[^\s<>,;"'()]+\.[^\s<>,;"'()]+/g
const addrs = (v: unknown): string[] => Array.from(new Set((String(v ?? "").match(ADDR) || []).map((a) => a.toLowerCase())))
const htmlToText = (h: string) =>
  h.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, "")
   .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
   .replace(/<[^>]+>/g, "")
   .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
   .replace(/\n{3,}/g, "\n\n").trim()

const MAX_ATT = 12 * 1024 * 1024

export async function parseEmailFile(name: string, buf: Buffer): Promise<ParsedEmail> {
  const lower = name.toLowerCase()
  if (lower.endsWith(".msg")) return parseMsg(buf)
  if (lower.endsWith(".eml") || lower.endsWith(".txt") || !lower.includes(".")) return parseEml(buf)
  throw new Error("Unsupported file type. Drop an .eml or .msg email file.")
}

async function parseEml(buf: Buffer): Promise<ParsedEmail> {
  const m = await simpleParser(buf)
  const fromV = Array.isArray(m.from) ? m.from[0] : m.from
  const fromAddr = fromV?.value?.[0]
  const toList = ([] as any[]).concat(m.to ?? []).flatMap((x: any) => x.value ?? []).map((v: any) => String(v.address || "").toLowerCase()).filter(Boolean)
  const ccList = ([] as any[]).concat(m.cc ?? []).flatMap((x: any) => x.value ?? []).map((v: any) => String(v.address || "").toLowerCase()).filter(Boolean)
  const extra = [m.headers.get("delivered-to"), m.headers.get("x-original-to"), m.headers.get("bcc")].flatMap((h) => addrs(typeof h === "object" ? JSON.stringify(h) : h))
  return {
    from_email: String(fromAddr?.address || "").toLowerCase(),
    from_name: String(fromAddr?.name || ""),
    to: toList, cc: ccList,
    recipients: Array.from(new Set([...toList, ...ccList, ...extra])),
    subject: m.subject || "",
    date: m.date ? m.date.toISOString() : null,
    message_id: m.messageId || null,
    in_reply_to: m.inReplyTo || null,
    references: ([] as string[]).concat((m.references as any) ?? []).map(String),
    body_text: (m.text || (m.html ? htmlToText(String(m.html)) : "")).trim(),
    attachments: (m.attachments || [])
      .filter((a) => a.content && a.size <= MAX_ATT && !a.related)
      .map((a) => ({ filename: a.filename || "attachment", mime_type: a.contentType || "application/octet-stream", data_base64: a.content.toString("base64"), size: a.size })),
  }
}

async function parseMsg(buf: Buffer): Promise<ParsedEmail> {
  const mod: any = await import("@kenjiuno/msgreader")
  const MsgReader = mod.default?.default ?? mod.default ?? mod
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  const rd = new MsgReader(ab)
  const d: any = rd.getFileData()
  const rec: any[] = d.recipients || []
  const to = rec.filter((r) => r.recipType !== "cc").map((r) => String(r.smtpAddress || r.email || "").toLowerCase()).filter(Boolean)
  const cc = rec.filter((r) => r.recipType === "cc").map((r) => String(r.smtpAddress || r.email || "").toLowerCase()).filter(Boolean)
  const headerAddrs = addrs(d.headers || "")
  const attachments: ParsedAttachment[] = []
  for (const att of d.attachments || []) {
    if (att.attachmentHidden || att.pidAttachmentFlags === 4) continue
    const f = rd.getAttachment(att)
    if (!f?.content || f.content.length > MAX_ATT) continue
    const fn = String(f.fileName || att.fileName || "attachment")
    attachments.push({ filename: fn, mime_type: mimeFor(fn), data_base64: Buffer.from(f.content).toString("base64"), size: f.content.length })
  }
  const fromEmail = String(d.senderSmtpAddress || d.senderEmail || "").toLowerCase()
  return {
    from_email: ADDR.test(fromEmail) ? fromEmail : addrs(d.senderEmail)[0] || "",
    from_name: String(d.senderName || ""),
    to, cc,
    recipients: Array.from(new Set([...to, ...cc, ...headerAddrs.filter((a) => a !== fromEmail)])),
    subject: String(d.subject || ""),
    date: d.messageDeliveryTime ? new Date(d.messageDeliveryTime).toISOString() : d.clientSubmitTime ? new Date(d.clientSubmitTime).toISOString() : null,
    message_id: (String(d.headers || "").match(/^Message-ID:\s*(<[^>]+>)/im) || [])[1] || null,
    in_reply_to: (String(d.headers || "").match(/^In-Reply-To:\s*(<[^>]+>)/im) || [])[1] || null,
    references: (String(d.headers || "").match(/^References:\s*((?:[^\r\n]|\r?\n[ \t])+)/im)?.[1].match(/<[^>]+>/g)) || [],
    body_text: String(d.body || (d.bodyHtml ? htmlToText(String(d.bodyHtml)) : "")).trim(),
    attachments,
  }
}

function mimeFor(fn: string): string {
  const e = fn.toLowerCase().split(".").pop()
  return ({ pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    csv: "text/csv", txt: "text/plain" } as Record<string, string>)[e || ""] || "application/octet-stream"
}
