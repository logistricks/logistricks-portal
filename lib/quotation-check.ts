/**
 * lib/quotation-check.ts  (server only)
 *
 * Checks a generated quotation before it goes to the requester: does it say what the request asked for and what the carrier quoted?
 *  1. Fixed checks in code (price, validity, leftover placeholders, markup below cost, route)
 *  2. The AI compares the quotation text with the request and the carrier's reply and lists differences
 * The AI never produces numbers that are used: a suggested fix is only kept when the text it replaces is really in the quotation
 * and every number in the replacement is a number that exists in the request, the carrier's reply or the quotation's own figures.
 * A check belongs to the exact quotation text (content_hash); after an edit it is "stale".
 */
import { createHash } from "node:crypto"
import { gemini, aiConfigured } from "@/lib/trial-gen"
import { cleanFx } from "@/lib/fx"
import { carrierBaseDetail } from "@/lib/quotation-render"

export interface QuotationCheckSettings { enabled: boolean; auto: boolean; monthly_cap: number; approval: "off" | "warnings" | "always" }
export const DEFAULT_CHECK_SETTINGS: QuotationCheckSettings = { enabled: true, auto: true, monthly_cap: 300, approval: "off" }

export function cleanCheckSettings(v: any): QuotationCheckSettings {
  const o = { ...DEFAULT_CHECK_SETTINGS }
  if (!v || typeof v !== "object") return o
  if (typeof v.enabled === "boolean") o.enabled = v.enabled
  if (typeof v.auto === "boolean") o.auto = v.auto
  const c = Number(v.monthly_cap); if (Number.isFinite(c) && c >= 0 && c <= 100000) o.monthly_cap = Math.round(c)
  if (v.approval === "off" || v.approval === "warnings" || v.approval === "always") o.approval = v.approval
  return o
}

export async function loadCheckSettings(admin: any, clientCode: string): Promise<QuotationCheckSettings> {
  try {
    const { data } = await admin.from("client_settings").select("value").eq("client_code", clientCode).eq("key", "quotation_check").maybeSingle()
    return cleanCheckSettings(data?.value)
  } catch { return { ...DEFAULT_CHECK_SETTINGS } }
}

export interface Finding { id: string; severity: "error" | "warning" | "info"; topic: string; message: string; source: "rule" | "ai" }
export interface Suggestion { id: string; finding_id: string; find: string; replace: string; reason: string; applied?: boolean }
export type Verdict = "ok" | "warnings" | "problems"

/** What the check looked at. Any change to these makes an earlier check stale. */
export function contentHash(q: { generated_subject?: string | null; generated_body?: string | null; generated_html?: string | null; final_price_usd?: number | null }): string {
  return createHash("sha1").update([q.generated_subject ?? "", q.generated_body ?? "", q.generated_html ?? "", String(q.final_price_usd ?? "")].join("\u0000")).digest("hex")
}

export async function usageThisMonth(admin: any, clientCode: string): Promise<number> {
  const start = new Date(); start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0)
  const { count } = await admin.from("quotation_checks").select("id", { count: "exact", head: true })
    .ilike("client_code", clientCode).eq("ai_ok", true).gte("created_at", start.toISOString())
  return count ?? 0
}

const plain = (html: string) => html.replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n").replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim()
const digits = (s: string) => s.replace(/[, ]/g, "")
const nums = (s: string): string[] => (s.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => digits(n).replace(/\.0+$/, "")).filter((n) => n.replace(/\D/g, "").length > 0)

const SKIP = /(^|_)(id|uuid|client_code|thread|message|gmail|raw|html|token|hash|created|updated|embedding|validation|review|intake|source_|meta|email_)/i
function compact(row: Record<string, any>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    if (v == null || v === "" || v === false || SKIP.test(k)) continue
    if (typeof v === "string") out[k] = v.slice(0, 400)
    else if (Array.isArray(v)) { if (v.length) out[k] = JSON.stringify(v).slice(0, 1800) }
    else if (typeof v === "object") out[k] = JSON.stringify(v).slice(0, 800)
    else out[k] = v
  }
  return out
}

const PROMPT = `You are a careful freight-forwarding quality checker. A forwarder prepared a QUOTATION to send to a customer. Compare it with the customer's REQUEST and the CARRIER REPLY it is based on, and list real differences only.

Report a finding when the quotation:
- states a route, port, equipment, cargo, incoterm, quantity, weight or date that disagrees with the request or the carrier reply
- states a price, charge, currency, transit time, free time, cut-off, validity or condition that disagrees with the carrier reply (the carrier's prices may have a markup added, so a higher total is normal; do NOT report the markup)
- leaves out something the carrier said that the customer must know (surcharges not included, exclusions, subject-to conditions, validity limits)
- promises something nobody offered, or contradicts itself
- has wording that is confusing, wrong, or unprofessional for a customer

Do NOT report: style preferences, missing information that neither source contains, differences in number formatting (1,200 vs 1200), harmless wording.
Every finding needs a "severity": "error" (the customer would be misled or the forwarder loses money), "warning" (should be looked at), or "info" (minor).
When you can fix it by changing exact text in the quotation, give "quoted" (copied exactly, character for character, from the QUOTATION, short) and "replacement" (the corrected text). Any number you write in a replacement must appear in the REQUEST or CARRIER REPLY data below. If you cannot fix it with exact text, leave quoted and replacement empty.
Return JSON {"findings":[{"severity","topic","message","quoted","replacement"}]}. Return {"findings":[]} when everything agrees. Keep each message to one plain sentence. Write in English.`

const SCHEMA = { type: "OBJECT", properties: { findings: { type: "ARRAY", items: { type: "OBJECT", properties: {
  severity: { type: "STRING" }, topic: { type: "STRING" }, message: { type: "STRING" }, quoted: { type: "STRING" }, replacement: { type: "STRING" } }, required: ["severity", "topic", "message"] } } }, required: ["findings"] }

interface Inputs { quotation: Record<string, any>; request: Record<string, any>; quotes: Record<string, any>[] }

/** The fixed checks. Cheap and certain; they run even when the AI is off or unavailable. */
export function ruleFindings({ quotation: q, request: r, quotes }: Inputs): Finding[] {
  const out: Finding[] = []
  const add = (severity: Finding["severity"], topic: string, message: string) => out.push({ id: `r${out.length + 1}`, severity, topic, message, source: "rule" })
  const body = String(q.generated_body ?? ""), html = String(q.generated_html ?? "")
  const text = `${q.generated_subject ?? ""}\n${body}\n${plain(html)}`
  const price = Number(q.final_price_usd)
  if (/\{\{[^}]*\}\}|\bundefined\b|\bNaN\b|\[object Object\]/.test(text)) add("error", "Unfilled field", "The quotation contains a field that was not filled in (for example {{…}}, undefined or NaN).")
  if (Number.isFinite(price) && price > 0) {
    const shown = new Set(nums(text))
    const want = [String(price), price.toFixed(2).replace(/\.00$/, "")]
    if (!want.some((w) => shown.has(w) || shown.has(w.replace(/\.0$/, "")))) add("warning", "Price", `The final price ${price.toLocaleString("en-US", { minimumFractionDigits: 2 })} does not appear in the quotation text. Check that the right price is shown.`)
  }
  const base = Number(q.base_rate_usd)
  if (Number.isFinite(price) && Number.isFinite(base) && base > 0 && price < base) add("error", "Price below cost", `The final price (${price.toFixed(2)}) is lower than the carrier's price (${base.toFixed(2)}). That is a loss.`)
  const qv = String(q.valid_until ?? "").slice(0, 10)
  const cq = quotes[0]
  const cv = String(cq?.validity_date ?? "").slice(0, 10)
  if (qv && cv && qv > cv) add("warning", "Validity", `The quotation is valid until ${qv}, but the carrier's quote is only valid until ${cv}.`)
  if (qv && qv < new Date().toISOString().slice(0, 10)) add("warning", "Validity", `The quotation's validity date (${qv}) has already passed.`)
  const lc = text.toLowerCase()
  const places = [r.origin_city, r.destination_city].map((x) => String(x ?? "").trim()).filter((x) => x.length > 2)
  if (places.length && !places.some((p) => lc.includes(p.toLowerCase()))) add("warning", "Route", `Neither ${places.join(" nor ")} appears in the quotation. Check the route.`)
  return out
}

function numbersAllowed(inputs: Inputs, fx: any): Set<string> {
  const pool = [JSON.stringify(compact(inputs.request)), ...inputs.quotes.map((x) => JSON.stringify(compact(x))), String(inputs.quotation.final_price_usd ?? ""), String(inputs.quotation.base_rate_usd ?? "")]
  for (const x of inputs.quotes) { try { pool.push(String(carrierBaseDetail(x, fx).base)) } catch { /* ignore */ } }
  return new Set(pool.flatMap((p) => nums(p)))
}

/** Runs the whole check. Never throws: a failed AI call gives the fixed findings and ai_ok=false. */
export async function runQuotationCheck(inputs: Inputs, opts: { useAi: boolean }): Promise<{ verdict: Verdict; ai_ok: boolean; findings: Finding[]; suggestions: Suggestion[] }> {
  const findings = ruleFindings(inputs)
  const suggestions: Suggestion[] = []
  let ai_ok = false
  if (opts.useAi && aiConfigured()) {
    try {
      const q = inputs.quotation
      const html = String(q.generated_html ?? "")
      const quotationText = `Subject: ${q.generated_subject ?? ""}\n\n${String(q.generated_body ?? "")}${html ? `\n\n[Formatted version]\n${plain(html)}` : ""}`.slice(0, 9000)
      const data = [
        `REQUEST:\n${JSON.stringify(compact(inputs.request))}`,
        ...inputs.quotes.map((x, i) => `CARRIER REPLY${inputs.quotes.length > 1 ? ` ${i + 1}` : ""}:\n${JSON.stringify(compact(x))}`),
        `QUOTATION (price shown is carrier price plus the forwarder's markup; final price ${q.final_price_usd} ${q.currency ?? "USD"}):\n${quotationText}`,
      ].join("\n\n")
      const r = await gemini(`${PROMPT}\n\n${data}`, SCHEMA, 0)
      const allowed = numbersAllowed(inputs, cleanFx(inputs.quotation.fx_rates))
      const src = `${q.generated_body ?? ""}`
      for (const f of (Array.isArray(r?.findings) ? r.findings : []).slice(0, 12)) {
        const message = String(f?.message ?? "").trim().slice(0, 300)
        if (!message) continue
        const severity: Finding["severity"] = f.severity === "error" || f.severity === "info" ? f.severity : "warning"
        const id = `a${findings.length + 1}`
        findings.push({ id, severity, topic: String(f?.topic ?? "Check").trim().slice(0, 40) || "Check", message, source: "ai" })
        const find = String(f?.quoted ?? ""), replace = String(f?.replacement ?? "")
        const okNums = nums(replace).every((n) => allowed.has(n) || nums(find).includes(n))
        const unique = find.length >= 3 && src.split(find).length === 2
        if (find && replace && find !== replace && unique && okNums) suggestions.push({ id: `s${suggestions.length + 1}`, finding_id: id, find, replace, reason: message })
      }
      ai_ok = true
    } catch (e) { console.error("[quotation-check] ai", (e as Error).message) }
  }
  const verdict: Verdict = findings.some((f) => f.severity === "error") ? "problems" : findings.some((f) => f.severity === "warning") ? "warnings" : "ok"
  return { verdict, ai_ok, findings, suggestions }
}

/** Loads what the check needs for one quotation. */
export async function loadInputs(admin: any, clientCode: string, quotationId: number): Promise<Inputs | null> {
  const { data: q } = await admin.from("quotations").select("*").eq("id", quotationId).ilike("client_code", clientCode).maybeSingle()
  if (!q) return null
  const ids: number[] = Array.from(new Set([Number(q.carrier_quote_id), ...(Array.isArray(q.carrier_quote_ids) ? q.carrier_quote_ids.map(Number) : [])].filter((n) => Number.isFinite(n) && n > 0)))
  const [{ data: fr }, { data: cqs }] = await Promise.all([
    admin.from("freight_requests").select("*").eq("id", q.freight_request_id).ilike("client_code", clientCode).maybeSingle(),
    ids.length ? admin.from("carrier_quotes").select("*, carriers:carrier_id ( carrier_name )").in("id", ids) : Promise.resolve({ data: [] }),
  ])
  if (!fr) return null
  const quotes = ((cqs ?? []) as any[]).map((x) => ({ ...x, carrier: x.carriers?.carrier_name ?? undefined, carriers: undefined }))
  quotes.sort((a, b) => (a.id === q.carrier_quote_id ? -1 : b.id === q.carrier_quote_id ? 1 : 0))
  return { quotation: q, request: fr, quotes }
}

/** Runs and stores a check for one quotation. Returns the stored row, or an error reason ("off" | "cap" | "not_found"). */
export async function checkAndStore(admin: any, clientCode: string, quotationId: number, mode: "auto" | "manual", by: string | null, force = false): Promise<{ row: any; cached?: boolean } | { error: "off" | "cap" | "not_found" }> {
  const set = await loadCheckSettings(admin, clientCode)
  if (!set.enabled) return { error: "off" }
  const inputs = await loadInputs(admin, clientCode, quotationId)
  if (!inputs) return { error: "not_found" }
  const hash = contentHash(inputs.quotation)
  if (!force) {
    const { data: last } = await admin.from("quotation_checks").select("*").eq("quotation_id", quotationId).eq("content_hash", hash).order("created_at", { ascending: false }).limit(1).maybeSingle()
    if (last && last.ai_ok) return { row: last, cached: true }
  }
  const used = await usageThisMonth(admin, clientCode)
  const useAi = set.monthly_cap === 0 ? false : used < set.monthly_cap
  if (!useAi && mode === "manual" && set.monthly_cap > 0) return { error: "cap" }
  const res = await runQuotationCheck(inputs, { useAi })
  const { data: row, error } = await admin.from("quotation_checks").insert({
    client_code: clientCode, quotation_id: quotationId, content_hash: hash, verdict: res.verdict, ai_ok: res.ai_ok,
    findings: res.findings, suggestions: res.suggestions, mode, created_by: by,
  }).select("*").single()
  if (error) { console.error("[quotation-check] store", error.message); return { row: { ...res, content_hash: hash, quotation_id: quotationId, created_at: new Date().toISOString(), mode } } }
  return { row }
}
