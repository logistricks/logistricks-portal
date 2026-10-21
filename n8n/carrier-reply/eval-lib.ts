// Shared by eval-model.ts and capture-case.ts: runs the REAL model with the repo copy of the prompt and schema, and compares with a golden extraction.
import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
export const { prepare } = require("./prepare.js")
export const { buildBody } = require("./build-body.js")

const md = fs.readFileSync(path.join(__dirname, "extraction-prompt.md"), "utf8")
export const SYSTEM: string = md.split("```")[1].replace(/^\n/, "").trim()
export const SCHEMA = JSON.parse(fs.readFileSync(path.join(__dirname, "response-schema.json"), "utf8"))
export const PROMPT_HASH = crypto.createHash("sha1").update(SYSTEM + JSON.stringify(SCHEMA)).digest("hex").slice(0, 10)
export const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash"

/** The same user message the n8n workflow builds. */
export function userText(p: any): string {
  return "Carrier email\nFrom: " + p.from_email + "\nSubject: " + p.subject + "\nReceived: " + p.received_at + "\n\n" + p.fresh_text
    + (p.quoted_text ? "\n\n=== QUOTED EARLIER MESSAGES (find references only) ===\n" + p.quoted_text : "")
    + (p.attachments_text ? "\n\n" + p.attachments_text : "")
}

export async function extract(input: any): Promise<any> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error("Set GEMINI_API_KEY (the same key n8n uses) to run the model.")
  const p = prepare(input)
  const parts: any[] = [{ text: userText(p) }]
  for (const f of p.files ?? []) parts.push({ inline_data: { mime_type: f.mime_type, data: f.data } })
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents: [{ role: "user", parts }], generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: SCHEMA } }),
    })
    if (r.ok) {
      const j: any = await r.json()
      const t = j?.candidates?.[0]?.content?.parts?.[0]?.text
      if (t) return JSON.parse(String(t).replace(/```json|```/g, "").trim())
    } else if (r.status < 500 && r.status !== 429) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 300)}`)
    await new Promise((s) => setTimeout(s, 1500 * attempt))
  }
  throw new Error("Gemini did not answer after 3 tries")
}

const CRITICAL = ["response_type", "currency", "total_amount_stated", "validity_date", "validity_days", "mode", "charges"]
const EXACT = ["response_type", "quote_status", "mode", "service_level", "currency", "container_type", "incoterm", "origin_code", "destination_code", "validity_date", "quote_date", "direct_or_connecting", "carrier_quote_ref", "space_confirmed", "frequency"]
const NUM = ["total_amount_stated", "transit_days", "gross_weight", "volume_cbm", "validity_days", "pieces", "container_count", "free_days", "free_days_demurrage", "free_days_detention", "chargeable_weight_stated", "volumetric_divisor", "minimum_charge"]
const norm = (v: unknown) => String(v ?? "").trim().toLowerCase()
const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.005, Math.abs(b) * 0.005)

export interface FieldResult { field: string; ok: boolean; critical: boolean; got: unknown; want: unknown }

/** Compares the model's extraction with the golden one. Only fields the golden states are checked (null/absent = not tested). */
export function compare(got: any, want: any): FieldResult[] {
  const out: FieldResult[] = []
  for (const k of EXACT) if (want[k] != null) out.push({ field: k, ok: norm(got[k]) === norm(want[k]), critical: CRITICAL.includes(k), got: got[k] ?? null, want: want[k] })
  for (const k of NUM) if (want[k] != null) out.push({ field: k, ok: got[k] != null && close(Number(got[k]), Number(want[k])), critical: CRITICAL.includes(k), got: got[k] ?? null, want: want[k] })
  if (Array.isArray(want.charges) && want.charges.length) {
    const g: any[] = Array.isArray(got.charges) ? got.charges : []
    const val = (c: any) => Number(c?.amount ?? c?.unit_rate)
    const used = new Set<number>()
    const missing: string[] = []
    for (const w of want.charges) {
      const i = g.findIndex((c, ix) => !used.has(ix) && Number.isFinite(val(c)) && close(val(c), val(w)) && (!w.basis || !c.basis || norm(c.basis) === norm(w.basis)) && (!w.inclusion || norm(c.inclusion ?? "included") === norm(w.inclusion)))
      if (i >= 0) used.add(i); else missing.push(`${w.carrier_label ?? "charge"} ${val(w)}`)
    }
    const extra = g.filter((_, ix) => !used.has(ix)).map((c) => `${c.carrier_label ?? "charge"} ${val(c)}`)
    out.push({ field: "charges", ok: missing.length === 0 && extra.length === 0, critical: true, got: extra.length || missing.length ? { missing, extra } : "all matched", want: `${want.charges.length} lines` })
  }
  return out
}
