/** Server-only helpers for the lead trial portal (try.logistricks.net). */
import { createHash, createHmac, timingSafeEqual } from "crypto"
import type { NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"

export const TRIAL_COOKIE = "trial_session"
export const RETENTION_DAYS = 5
export const RESUME_HOURS = 48
const SESSION_HOURS = 12

const secret = () => "trial:" + process.env.SUPABASE_SERVICE_ROLE_KEY!
const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url")

export function signTrial(leadId: string): string {
  const payload = Buffer.from(JSON.stringify({ leadId, exp: Date.now() + SESSION_HOURS * 3600_000 })).toString("base64url")
  return `${payload}.${sign(payload)}`
}
export function trialSession(req: NextRequest): { leadId: string } | null {
  try {
    const c = req.cookies.get(TRIAL_COOKIE)?.value
    if (!c) return null
    const i = c.lastIndexOf(".")
    const payload = c.slice(0, i), sig = c.slice(i + 1)
    const exp = sign(payload)
    if (exp.length !== sig.length || !timingSafeEqual(Buffer.from(exp), Buffer.from(sig))) return null
    const d = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
    if (!d.leadId || Date.now() > d.exp) return null
    return { leadId: String(d.leadId) }
  } catch { return null }
}
export const hashPassword = (p: string) => createHash("sha256").update(p).digest("hex")

export interface Lead {
  id: string; company: string; contact_name: string | null; code: string; tries_total: number; tries_used: number
  expires_at: string; status: string
}
/** The signed-in lead if the login is still valid (not disabled, not expired). */
export async function activeLead(req: NextRequest): Promise<{ lead: Lead; admin: any } | { error: string; status: number }> {
  const s = trialSession(req)
  if (!s) return { error: "Please sign in.", status: 401 }
  const admin = adminClient()
  const { data } = await admin.from("trial_leads").select("*").eq("id", s.leadId).maybeSingle()
  if (!data) return { error: "Please sign in.", status: 401 }
  if (data.status !== "active") return { error: "This trial login is switched off.", status: 403 }
  if (Date.now() > Date.parse(data.expires_at)) return { error: "This trial login has expired.", status: 403 }
  return { lead: data as Lead, admin }
}

export async function logEvent(admin: any, leadId: string, type: string, meta: Record<string, unknown> = {}, runId?: string | null) {
  try {
    await admin.from("trial_events").insert({ lead_id: leadId, run_id: runId ?? null, type, meta })
    await admin.from("trial_leads").update({ last_active_at: new Date().toISOString() }).eq("id", leadId)
    if (runId) await admin.from("trial_runs").update({ last_active_at: new Date().toISOString() }).eq("id", runId)
  } catch { /* logging never breaks the trial */ }
}

/** Deletes parsed content 5 days after the lead's last activity. Only non-content metadata and events remain. */
export async function purgeTrialData(admin: any) {
  try {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400_000).toISOString()
    await admin.from("trial_runs")
      .update({ data: null, route_from: null, route_to: null, cargo: null, data_purged_at: new Date().toISOString() })
      .lt("last_active_at", cutoff).not("data", "is", null)
  } catch { /* best effort */ }
}

/** First 2 letters of the part before @, then the domain kept (owner decision). Never stored. */
export function maskEmail(e: string | null | undefined): string | null {
  const m = /^([^@\s<>]+)@([^@\s<>]+\.[^@\s<>]+)$/.exec((e ?? "").trim())
  return m ? m[1].slice(0, 2) + "*****@" + m[2] : null
}
export function findEmail(text: string): string | null {
  const m = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/.exec(text)
  return m ? m[0] : null
}

export async function callN8n(kind: "request" | "quote", body: unknown): Promise<{ ok: boolean; status: number; json: any }> {
  const url = kind === "request" ? process.env.N8N_TRIAL_REQUEST_WEBHOOK_URL : process.env.N8N_TRIAL_QUOTE_WEBHOOK_URL
  if (!url) return { ok: false, status: 500, json: { error: "The trial reader is not set up yet." } }
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Portal-Secret": process.env.PORTAL_WEBHOOK_SECRET ?? "" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(100_000),
    })
    const json = await r.json().catch(() => ({}))
    return { ok: r.ok, status: r.status, json }
  } catch (e) {
    return { ok: false, status: 502, json: { error: "The reader did not answer. Please try again." } }
  }
}

// ---------------------------------------------------------------- views (what the page renders)
const MODE: Record<string, string> = { sea: "Sea", air: "Air", land: "Road" }
const CONF: Record<string, [number, string]> = { high: [92, "High"], medium: [70, "Medium"], low: [45, "Low"] }
const s = (v: unknown) => (v == null ? "" : String(v).trim())

export interface RequestView {
  mode: string; route: { from: string; fc: string; to: string; tc: string; chosen: boolean; note: string }
  fields: [string, string | null][]; special: string[]; missing: string[]
  conf: number; confL: string; reply: string | null; replyKind: string; portWarning: string | null
  sender: string; senderName: string; language: string | null; freeDaysAsked: number | null
}
export function buildRequestView(ai: any, extra: { missing: string[]; suggested_reply: string | null; port_warning: string | null; language: string | null; sender: string }): RequestView {
  const mode = MODE[(ai.modes && ai.modes[0]) || ""] || "Sea"
  const inferred: string[] = ai.inferred_fields || []
  const chosen = mode === "Sea" && (inferred.includes("origin_city") || inferred.includes("destination_city"))
  const incoterm = s(ai.incoterm).toUpperCase()
  const fields: [string, string | null][] = []
  const add = (label: string, v: unknown, core = false) => { const t = s(v); if (t || core) fields.push([label, t || null]) }
  add("Cargo", ai.cargo_type, true)
  if (mode === "Sea" || s(ai.equipment)) add("Equipment", ai.equipment, mode === "Sea")
  add("Quantity", ai.quantity)
  add("Weight", ai.weight, true)
  add("Dimensions", ai.dimensions)
  add("Incoterm", incoterm, true)
  add("Pickup address", ai.pickup_address, ["EXW", "FCA"].includes(incoterm))
  add("Urgency", ai.aog ? (s(ai.urgency) ? s(ai.urgency) + ", AOG" : "AOG, critical") : ai.urgency)
  add("Preferred carrier", ai.preferred_carrier)
  add("B/L type", ai.bl_type)
  const special: string[] = [...(ai.special_requirements || []), ...(ai.availability_questions || []).map((q: string) => "Question: " + q)]
  if (ai.dgr) special.unshift("Dangerous goods: yes")
  let free: number | null = null
  for (const x of special) { const m = /free time.*?(\d+)\s*(?:days?|d)\b/i.exec(x); if (m) { free = Number(m[1]); break } }
  const [conf, confL] = CONF[s(ai.confidence).toLowerCase()] || [70, "Medium"]
  const kind = extra.suggested_reply ? "Missing information" : "No reply needed"
  return {
    mode,
    route: {
      from: s(ai.origin_city) || "Not given", fc: s(ai.origin_country), to: s(ai.destination_city) || "Not given", tc: s(ai.destination_country), chosen,
      note: chosen ? "The email did not name the port, so the nearest suitable seaport was chosen for each end. Check them before you price." : "",
    },
    fields, special, missing: extra.missing, conf, confL, reply: extra.suggested_reply, replyKind: extra.language && extra.suggested_reply && !/english/i.test(extra.language) ? `${kind} · ${extra.language}` : kind,
    portWarning: extra.port_warning, sender: extra.sender, senderName: s(ai.sender_name), language: extra.language, freeDaysAsked: free,
  }
}

export interface Line { label: string; basis: string; qty: number; unit: number; amount: number; note?: string }
export interface QuoteView {
  name: string; ref: string; currency: string; lines: Line[]; excluded: Line[]; statedTotal: number | null
  transit: string; free: string; validUntil: string | null; validDays: number | null; quoteValid: string; status: string | null; flags: [string, string][]; equip: string
}
const r2 = (n: number) => Math.round(n * 100) / 100
export function buildQuoteView(ai: any, req: RequestView | null, carrierName: string): QuoteView {
  const q = buildQuoteViewRaw(ai, req, carrierName)
  q.quoteValid = validity(q)
  return q
}
function buildQuoteViewRaw(ai: any, req: RequestView | null, carrierName: string): QuoteView {
  const currency = (s(ai.currency) || "USD").toUpperCase()
  const lines: Line[] = [], excluded: Line[] = []
  for (const c of ai.charges || []) {
    const qty = Number(c.quantity) > 0 ? Number(c.quantity) : 1
    const unit = Number(c.unit_rate) || 0
    const amount = r2(c.amount != null ? Number(c.amount) : unit * qty)
    if (!(amount > 0)) continue
    const l: Line = { label: s(c.carrier_label) || "Charge", basis: s(c.basis) || "", qty, unit: unit || r2(amount / qty), amount, note: s(c.condition_note) || undefined }
    if (c.inclusion && c.inclusion !== "included") excluded.push(l); else lines.push(l)
  }
  const stated = ai.total_amount_stated != null && Number(ai.total_amount_stated) > 0 ? Number(ai.total_amount_stated) : null
  if (!lines.length && stated) lines.push({ label: "Total as stated by the carrier", basis: "all in", qty: 1, unit: stated, amount: stated })
  const sum = r2(lines.reduce((t, l) => t + l.amount, 0))
  const flags: [string, string][] = []
  const today = new Date().toISOString().slice(0, 10)
  const validUntil = s(ai.validity_date) || null
  let validDays: number | null = null
  if (validUntil) {
    validDays = Math.round((Date.parse(validUntil) - Date.parse(today)) / 86400000)
    if (validDays < 0) flags.push(["warn", `This quote expired on ${validUntil}.`])
    else if (validDays <= 7) flags.push(["warn", `This rate is valid for ${validDays} day${validDays === 1 ? "" : "s"} only.`])
  } else flags.push(["info", "The carrier did not state a validity date."])
  const free = ai.free_days ?? ai.free_days_demurrage
  if (req?.freeDaysAsked != null && free != null) {
    flags.push(Number(free) < req.freeDaysAsked ? ["warn", `Free time is ${free} days. The client asked for ${req.freeDaysAsked} days.`] : ["ok", `Free time of ${free} days meets the ${req.freeDaysAsked} days asked.`])
  } else if (free != null) flags.push(["ok", `Free time of ${free} days is stated.`])
  if (ai.subject_to_conditions) flags.push(["info", `Subject to: ${s(ai.subject_to_conditions)}`])
  else if (ai.quote_status && /subject/.test(ai.quote_status)) flags.push(["info", "The carrier states the rate is subject to " + (ai.quote_status === "subject_to_space" ? "space." : "equipment availability.")])
  if (stated && lines.length && !(lines.length === 1 && lines[0].label.startsWith("Total as stated"))) {
    flags.push(Math.abs(sum - stated) <= Math.max(1, stated * 0.005) ? ["ok", "The charge lines add up to the carrier's stated total."] : ["warn", `The charge lines add up to ${currency} ${sum.toFixed(2)}, but the carrier states ${currency} ${stated.toFixed(2)}.`])
  }
  if (excluded.length) flags.push(["info", `${excluded.length} charge${excluded.length === 1 ? " is" : "s are"} excluded or optional and not counted: ${excluded.map((e) => e.label).join(", ")}.`])
  if (currency !== "USD") flags.push(["info", `Prices are in ${currency}. The trial does not convert currencies.`])
  if (ai.chargeable_weight_stated) flags.push(["info", `Chargeable weight stated by the carrier: ${ai.chargeable_weight_stated} ${s(ai.weight_unit) || "kg"}.`])
  const eq = [ai.container_count && ai.container_type ? `${ai.container_count} x ${ai.container_type}` : s(ai.container_type), s(ai.equipment_type)].filter(Boolean)[0] || ""
  return {
    name: carrierName || "Carrier", ref: s(ai.carrier_quote_ref) || "—", currency, lines, excluded, statedTotal: stated,
    transit: ai.transit_days != null ? `${ai.transit_days} days` : "Not stated", free: free != null ? `${free} days` : "Not stated",
    validUntil, validDays, quoteValid: "", status: ai.quote_status ?? null, flags, equip: String(eq),
  }
}

// ---------------------------------------------------------------- pricing (mirrors the page)
export function pricing(lines: Line[], type: string, value: number) {
  const base = r2(lines.reduce((t, l) => t + r2(l.amount), 0))
  const v = Number.isFinite(value) && value > 0 ? value : 0
  const markup = r2(type === "flat" ? v : base * v / 100)
  const final = r2(base + markup)
  const k = base > 0 ? final / base : 1
  let acc = 0
  const out = lines.map((l, i) => {
    let a = r2(l.amount * k)
    if (i < lines.length - 1) acc += a; else a = r2(final - acc)
    return { ...l, price: a }
  })
  return { base, markup, final, lines: out, margin: final ? markup / final * 100 : 0 }
}
export const quoteNumber = (code: string, tryNo: number) => `QT-${code.replace(/[^A-Z0-9]/gi, "").slice(0, 6).toUpperCase()}-${String(tryNo).padStart(2, "0")}`
export const money = (n: number, cur: string) => `${cur} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
export function validity(q: QuoteView): string {
  const d = q.validUntil && Date.parse(q.validUntil) > Date.now() ? q.validUntil : new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  return d
}
