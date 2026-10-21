/**
 * lib/quote-rules.ts  (client-safe: no server imports)
 *
 * The checks a carrier quote goes through when it arrives, and what the company wants done when one fails:
 *   ignore → not raised at all      flag → quote is accepted, the problem is shown on it      ask → flagged, and the carrier is asked to fix it
 * A flagged quote is never blocked: it can still be used to build a quotation.
 */
import type { Flag } from "@/lib/quote-math"

export type RuleAction = "ignore" | "flag" | "ask"

export interface RuleDef {
  code: string
  label: string
  hint: string
  /** false → the problem is on our side (extraction doubts), never worth an email to the carrier */
  askable: boolean
  /** the sentence put in the email to the carrier */
  ask?: (f: Flag) => string
}

/** "Charge lines add up to 3,100 but the carrier states 3,000." → "…but you state 3,000." */
const toCarrier = (m: string) => m.replace(/\b(the )?carrier (state|show)s\b/gi, (_x, _the, v: string) => `you ${v.toLowerCase()}`).replace(/\bcarrier(?: quote)? shows\b/gi, "you show")

export const RULES: RuleDef[] = [
  { code: "cutoff_before_ready", label: "Cut-off before the cargo is ready", hint: "The sailing's cargo cut-off is earlier than the cargo ready date", askable: true,
    ask: () => "The cargo cut-off you quoted is before our cargo ready date, so that sailing doesn't work for us. Could you quote a later sailing?" },
  { code: "eta_before_etd", label: "Arrival before departure", hint: "ETA is earlier than ETD", askable: true,
    ask: () => "The arrival date you quoted is earlier than the departure date. Could you confirm the correct dates?" },
  { code: "validity_inverted", label: "Validity dates inverted", hint: "Valid-until is earlier than valid-from", askable: true,
    ask: () => "The validity dates in your quote look inconsistent (valid-until is before valid-from). Could you confirm them?" },
  { code: "quote_expired", label: "Quote already expired", hint: "The validity date has already passed", askable: true,
    ask: () => "The validity date on your quote has already passed. Could you send an updated quote with a current validity?" },
  { code: "missing_validity", label: "No validity stated", hint: "A quote or update with no validity date or period", askable: true,
    ask: () => "Your quote doesn't say how long it is valid. Could you confirm the validity?" },
  { code: "missing_price", label: "No price found", hint: "A quote with no total and no charge lines", askable: true,
    ask: () => "We couldn't find a price in your reply. Could you send the rate with the charge breakdown?" },
  { code: "total_mismatch", label: "Total doesn't match the charges", hint: "Charge lines add up to a different total", askable: true,
    ask: (f) => `${toCarrier(f.message)} Could you confirm the correct total?` },
  { code: "line_math", label: "A charge line doesn't add up", hint: "Rate × quantity differs from the line amount", askable: true,
    ask: (f) => `${toCarrier(f.message)} Could you check it?` },
  { code: "mixed_currency", label: "Several currencies", hint: "Charges are in more than one currency", askable: true,
    ask: () => "Your charges are in more than one currency. Could you quote everything in a single currency?" },
  { code: "chargeable_mismatch", label: "Chargeable weight differs", hint: "The carrier's chargeable weight differs from ours", askable: true,
    ask: (f) => `${toCarrier(f.message)} Could you confirm which is right?` },
  { code: "volume_mismatch", label: "Volume differs from dimensions", hint: "Stated volume differs from the dimensions", askable: true,
    ask: (f) => `${toCarrier(f.message)} Could you confirm the volume?` },
  { code: "exw_no_address", label: "EXW without a pickup address", hint: "EXW shipment and nobody gave an address", askable: true,
    ask: () => "This is an EXW shipment. Could you confirm the pickup address your quote is based on?" },
  { code: "not_firm", label: "Quote isn't firm", hint: "Indicative, or subject to space or equipment", askable: true,
    ask: () => "Is this quote firm? Could you confirm space and equipment, or tell us what it is subject to?" },
  { code: "mode_mismatch", label: "Different mode from the request", hint: "e.g. the request is for air and the carrier quoted sea", askable: true,
    ask: (f) => `${f.message} Could you quote the mode we asked for, or confirm you can't?` },
  { code: "equipment_mismatch", label: "Different container size", hint: "The container size quoted isn't the one requested", askable: true,
    ask: (f) => `${f.message} Could you quote the equipment we asked for?` },
  { code: "low_confidence", label: "Reading was uncertain", hint: "The system wasn't sure it read the reply correctly", askable: false },
  { code: "inferred_values", label: "Values were inferred", hint: "Something wasn't stated and was worked out", askable: false },
  { code: "unknown_weight_unit", label: "Unknown weight unit", hint: "The weight unit wasn't recognised", askable: false },
  { code: "chargeable_not_verifiable", label: "Chargeable weight not verifiable", hint: "Not enough cargo data to check it", askable: false },
]
export const RULE_BY_CODE: Record<string, RuleDef> = Object.fromEntries(RULES.map((r) => [r.code, r]))

export const DEFAULT_ASK_BODY = `Dear {{contact_name}},

Thank you for your quote for {{request_ref}}. Before we can use it, could you please check the following:

{{issues}}

Please reply with a corrected quote.

Best regards,
{{sender_name}}`

export interface QuoteRules {
  actions: Record<string, RuleAction>
  /** how many times the carrier is asked, per request, before it is left to a person */
  max_asks: number
  ask_body: string
}

export const DEFAULT_RULES: QuoteRules = {
  actions: Object.fromEntries(RULES.map((r) => [r.code, "flag" as RuleAction])),
  max_asks: 2,
  ask_body: DEFAULT_ASK_BODY,
}

export function cleanRules(v: any): QuoteRules {
  const out: QuoteRules = { actions: { ...DEFAULT_RULES.actions }, max_asks: DEFAULT_RULES.max_asks, ask_body: DEFAULT_RULES.ask_body }
  if (!v || typeof v !== "object") return out
  if (v.actions && typeof v.actions === "object") {
    for (const r of RULES) {
      const a = v.actions[r.code]
      if (a === "ignore" || a === "flag" || (a === "ask" && r.askable)) out.actions[r.code] = a
    }
  }
  const n = Number(v.max_asks)
  if (Number.isFinite(n) && n >= 1 && n <= 5) out.max_asks = Math.round(n)
  if (typeof v.ask_body === "string" && v.ask_body.trim()) out.ask_body = v.ask_body.slice(0, 4000)
  return out
}

/** Drops the ignored problems; the rest are kept, each remembering whether the carrier should be asked. */
export function applyRules(flags: Flag[], rules: QuoteRules): { kept: Flag[]; ask: Flag[] } {
  const kept: Flag[] = [], ask: Flag[] = []
  for (const f of flags) {
    const a = rules.actions[f.code] ?? "flag"
    if (a === "ignore") continue
    kept.push(f)
    if (a === "ask" && RULE_BY_CODE[f.code]?.askable) ask.push(f)
  }
  return { kept, ask }
}

/** The numbered list of problems that goes into the email. */
export function issuesText(flags: Flag[]): string {
  const lines = flags.map((f) => RULE_BY_CODE[f.code]?.ask?.(f)).filter((x): x is string => !!x)
  return lines.map((l, i) => `${i + 1}. ${l}`).join("\n")
}

// ── checks that need the request ─────────────────────────────────────────────────────────────────────
export interface RequestCtx {
  incoterm?: string | null; pickup_address?: string | null; cargo_ready_date?: string | null
  equipment?: unknown; is_sea?: boolean | null; is_air?: boolean | null; is_land?: boolean | null
}

const sizes = (v: unknown): Set<string> => {
  const text = Array.isArray(v) ? v.map(String).join(" ") : String(v ?? "")
  return new Set(Array.from(text.matchAll(/(?<![0-9])(20|40|45)(?![0-9])/g)).map((m) => m[1]))
}

/** Checks of the quote against what was asked, and for what any quote must contain. */
export function requestChecks(row: Record<string, any>, body: Record<string, any>, ctx?: RequestCtx): Flag[] {
  const flags: Flag[] = []
  const rt = String(body.response_type ?? "quote")
  const isQuote = rt === "quote" || rt === "update"
  if (isQuote) {
    const hasPrice = row.total_amount != null || body.rate_usd != null || body.rate_original != null || (Array.isArray(row.charges) && row.charges.length > 0)
    if (!hasPrice) flags.push({ code: "missing_price", field: "total_amount", severity: "error", message: "No price was found in the reply." })
    if (!body.validity_date && !body.validity_days)
      flags.push({ code: "missing_validity", field: "validity_date", severity: "warn", message: "The carrier did not state how long the quote is valid." })
  }
  if (ctx) {
    const wanted = [["sea", ctx.is_sea], ["air", ctx.is_air], ["land", ctx.is_land]].filter(([, on]) => on).map(([m]) => m as string)
    const mode = String(row.mode ?? "").toLowerCase()
    if (isQuote && mode && wanted.length && !wanted.includes(mode))
      flags.push({ code: "mode_mismatch", field: "mode", severity: "warn", message: `The request is for ${wanted.join(" / ")}, the carrier quoted ${mode}.` })
    const ask = sizes(ctx.equipment), got = sizes(row.container_type)
    if (isQuote && ask.size && got.size && !Array.from(got).some((s) => ask.has(s)))
      flags.push({ code: "equipment_mismatch", field: "container_type", severity: "warn", message: `The request is for ${Array.from(ask).map((s) => `${s}'`).join(" / ")} containers, the carrier quoted ${row.container_type}.` })
  }
  return flags
}
