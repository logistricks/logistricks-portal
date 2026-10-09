/** Reads what a lead sends to the trial: pasted text, or a dropped email file (.eml/.msg/PDF/text). */
import type { NextRequest } from "next/server"
import { parseEmailFile, type ParsedAttachment } from "@/lib/email-parse"
import { findEmail, maskEmail } from "@/lib/trial-server"

export const MAX_TEXT = 20000
export const MAX_FILE = 10 * 1024 * 1024
export interface TrialInput {
  text: string; attachments: ParsedAttachment[]; sender: string; fromName: string; source: "paste" | "file"; declared: string; runId: string | null; error?: string
}
export async function readTrialInput(req: NextRequest): Promise<TrialInput> {
  const empty: TrialInput = { text: "", attachments: [], sender: "Typed by you", fromName: "", source: "paste", declared: "", runId: null }
  const ct = req.headers.get("content-type") || ""
  try {
    if (ct.includes("multipart/form-data")) {
      const form = await req.formData()
      const out = { ...empty, runId: String(form.get("run_id") ?? "") || null, declared: String(form.get("source") ?? "") }
      out.text = String(form.get("text") ?? "").slice(0, MAX_TEXT)
      const f = form.get("file")
      if (f instanceof File && f.size) {
        if (f.size > MAX_FILE) return { ...out, error: "That file is larger than 10 MB." }
        const buf = Buffer.from(await f.arrayBuffer())
        out.source = "file"
        if (/\.(eml|msg)$/i.test(f.name)) {
          const m = await parseEmailFile(f.name, buf)
          out.text = [m.subject ? "Subject: " + m.subject : "", m.body_text].filter(Boolean).join("\n\n").slice(0, MAX_TEXT)
          out.attachments = m.attachments.slice(0, 4)
          out.fromName = m.from_name || ""
          out.sender = maskEmail(m.from_email) || "From your file"
        } else if (/\.pdf$/i.test(f.name)) {
          out.attachments = [{ filename: f.name, mime_type: "application/pdf", data_base64: buf.toString("base64"), size: buf.length }]
          out.sender = "From your file"
        } else if (/\.(txt)$/i.test(f.name)) {
          out.text = buf.toString("utf8").slice(0, MAX_TEXT); out.sender = maskEmail(findEmail(out.text)) || "From your file"
        } else return { ...out, error: "Use an .eml, .msg, PDF or text file." }
      } else if (out.text) out.sender = maskEmail(findEmail(out.text)) || "Typed by you"
      return out
    }
    const j = await req.json().catch(() => ({}))
    const text = String(j.text ?? "").slice(0, MAX_TEXT)
    return { ...empty, text, runId: j.run_id ? String(j.run_id) : null, sender: maskEmail(findEmail(text)) || "Typed by you", declared: String(j.source ?? "") }
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message : "Could not read that." }
  }
}
