/**
 * lib/quotation-render.ts
 *
 * Turns a quotation template + a carrier quote + markup into the customer-facing quotation.
 * Pure TypeScript (no Node / DOM APIs): the same code builds the real quotation on the server and
 * the live preview in the template editor.
 *
 * Template syntax: see lib/quotation-variables.ts.
 */
import { parseSpecial } from "@/lib/special"
import { isSeaOnly, isExw } from "@/lib/shipment-labels"
import { ALL_VARIABLES, BLOCK_KEYS, VARIABLE_KEYS, type TemplateOptions, normalizeOptions } from "@/lib/quotation-variables"

export interface Block { html: string; text: string }
export interface RenderCtx { values: Record<string, string>; blocks: Record<string, Block> }

// ── formatting helpers ───────────────────────────────────────────────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

export function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""))
  return Number.isFinite(n) ? n : null
}
const round2 = (n: number) => Math.round(n * 100) / 100
export const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const plain = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 3 })

export function fmtDate(v: unknown): string {
  if (!v) return ""
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return String(v)
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}`
}

function addDaysIso(from: Date, days: number): string {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + days))
  return d.toISOString().slice(0, 10)
}

const BASIS_LABEL: Record<string, string> = {
  per_kg: "per kg", per_cbm: "per CBM", per_wm: "per W/M", per_container: "per container",
  per_shipment: "per shipment", per_pallet: "per pallet", percent: "%", flat: "flat",
}
const STATUS_LABEL: Record<string, string> = {
  firm: "Firm", indicative: "Indicative",
  subject_to_space: "Subject to space availability", subject_to_equipment: "Subject to equipment availability",
}

// ── template engine ──────────────────────────────────────────────────────────

const COND = /\{\{#(if|unless)\s+(\w+)\s*\}\}((?:(?!\{\{#(?:if|unless)\b)[\s\S])*?)\{\{\/\1\}\}/g
const VAR = /\{\{\s*(\w+)\s*(?:\|([^}]*))?\}\}/g

function isSet(ctx: RenderCtx, key: string, mode: "text" | "html"): boolean {
  const b = ctx.blocks[key]
  if (b) return (mode === "html" ? b.html : b.text).trim() !== ""
  return (ctx.values[key] ?? "").trim() !== ""
}

export function renderTemplate(tpl: string, ctx: RenderCtx, mode: "text" | "html"): string {
  let out = tpl ?? ""
  for (let i = 0; i < 20; i++) {
    const next = out.replace(COND, (_, kind: string, key: string, inner: string) => {
      const on = isSet(ctx, key, mode)
      return (kind === "if" ? on : !on) ? inner : ""
    })
    if (next === out) break
    out = next
  }
  const rendered = out.replace(VAR, (_, key: string, fallback?: string) => {
    const b = ctx.blocks[key]
    if (b) {
      const v = mode === "html" ? b.html : b.text
      if (v.trim()) return v
    } else if ((ctx.values[key] ?? "").trim()) {
      return mode === "html" ? esc(ctx.values[key]) : ctx.values[key]
    }
    const fb = fallback?.trim() ?? ""
    return mode === "html" ? esc(fb) : fb
  })
  return mode === "html" ? pruneEmptyRows(rendered) : rendered
}

/** Drops detail-table rows whose value cells came out empty (or only a unit like "days"), so blanks never show. */
function pruneEmptyRows(html: string): string {
  return html.replace(/<tr\b[^>]*>((?:(?!<\/?tr\b)[\s\S])*?)<\/tr>/gi, (row, inner: string) => {
    const cells = [...inner.matchAll(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
    if (cells.length < 2 || /<th\b/i.test(inner) || /<table\b/i.test(inner)) return row
    const text = (c: RegExpMatchArray) => c[2].replace(/<[^>]*>/g, "").replace(/&nbsp;|\u00a0/g, " ").trim()
    const first = text(cells[0])
    if (!first) return row
    const emptyVals = cells.slice(1).every((c) => /^(days?|kgs?|cbm)?$/i.test(text(c)))
    return emptyVals ? "" : row
  })
}

/** Variables used in a template, and the ones that don't exist (typos). */
export function findVariables(...templates: string[]): { used: string[]; unknown: string[] } {
  const used = new Set<string>(), unknown = new Set<string>()
  for (const t of templates) {
    for (const m of (t ?? "").matchAll(/\{\{\s*#?(?:if|unless)?\s*(\w+)\s*(?:\|[^}]*)?\}\}/g)) {
      const key = m[1]
      if (key === "if" || key === "unless") continue
      ;(VARIABLE_KEYS.has(key) ? used : unknown).add(key)
    }
  }
  return { used: [...used], unknown: [...unknown] }
}

// ── pricing lines ────────────────────────────────────────────────────────────

export interface ChargeIn {
  carrier_label?: string | null; basis?: string | null; unit_rate?: number | null; quantity?: number | null
  amount?: number | null; inclusion?: string | null; condition_note?: string | null; currency?: string | null
}
export interface Line { label: string; basis: string; qty: number | null; rate: number | null; amount: number; currency?: string }

function sellLines(charges: ChargeIn[], style: TemplateOptions["charges_style"], final: number, markupLabel = "Service fee") {
  const included = charges.filter((c) => (c.inclusion ?? "included") === "included" && num(c.amount) !== null)
  const optional = charges.filter((c) => c.inclusion && c.inclusion !== "included")
  if (style === "total_only" || included.length === 0) return { lines: [] as Line[], optional, mixed: false }
  // Lines in different currencies are never added together or scaled to the total: each is listed in its own
  // currency as the carrier stated it, and the all-in price follows as the total.
  if (mixedCurrency(included)) {
    const lines: Line[] = included.map((c) => ({
      label: c.carrier_label ?? "Charge", basis: BASIS_LABEL[c.basis ?? ""] ?? (c.basis ?? ""),
      qty: num(c.quantity), rate: num(c.unit_rate), amount: num(c.amount) as number, currency: String(c.currency || "USD").toUpperCase(),
    }))
    return { lines, optional, mixed: true }
  }

  const base = (c: ChargeIn): Line => ({
    label: c.carrier_label ?? "Charge", basis: BASIS_LABEL[c.basis ?? ""] ?? (c.basis ?? ""),
    qty: num(c.quantity), rate: num(c.unit_rate), amount: num(c.amount) as number,
  })
  const cost = included.map(base)
  const sum = round2(cost.reduce((s, l) => s + l.amount, 0))

  if (style === "detailed") {
    const fee = round2(final - sum)
    const lines = [...cost]
    if (Math.abs(fee) >= 0.01) lines.push({ label: fee > 0 ? markupLabel : "Adjustment", basis: "", qty: null, rate: null, amount: fee })
    return { lines, optional, mixed: false }
  }

  // marked_up: spread the total across the carrier's lines so the customer sees one sell price per line.
  const factor = sum > 0 ? final / sum : 1
  const lines = cost.map((l) => {
    const amount = round2(l.amount * factor)
    return { ...l, amount, rate: l.qty ? round2(amount / l.qty) : null }
  })
  const drift = round2(final - lines.reduce((s, l) => s + l.amount, 0))
  if (drift !== 0) {
    let big = 0
    lines.forEach((l, i) => { if (l.amount > lines[big].amount) big = i })
    lines[big].amount = round2(lines[big].amount + drift)
    if (lines[big].qty) lines[big].rate = round2(lines[big].amount / (lines[big].qty as number))
  }
  return { lines, optional, mixed: false }
}

// ── blocks ───────────────────────────────────────────────────────────────────

const TD = "padding:8px 10px;border-bottom:1px solid #e2e8f0;vertical-align:top"

function tableHtml(heads: string[], rows: string[][], accent: string, rightCols: number[], totalRow?: string[]): string {
  const th = (h: string, i: number) => `<th style="background:${accent};color:#ffffff;text-align:${rightCols.includes(i) ? "right" : "left"};padding:8px 10px;font-weight:600">${esc(h)}</th>`
  const td = (c: string, i: number) => `<td style="${TD};text-align:${rightCols.includes(i) ? "right" : "left"}">${esc(c)}</td>`
  const tr = (r: string[]) => `<tr>${r.map(td).join("")}</tr>`
  const total = totalRow
    ? `<tr>${totalRow.map((c, i) => `<td style="padding:10px;border-top:2px solid ${accent};font-weight:700;text-align:${rightCols.includes(i) ? "right" : "left"}">${esc(c)}</td>`).join("")}</tr>`
    : ""
  return `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:13px"><thead><tr>${heads.map(th).join("")}</tr></thead><tbody>${rows.map(tr).join("")}${total}</tbody></table>`
}

// ── context ──────────────────────────────────────────────────────────────────

export interface RequestIn {
  requestRef?: string; receivedExact: string; urgency: string
  originCity: string; originCountry: string; destinationCity: string; destinationCountry: string
  cargoType: string; equipment: string; weight: string; quantity: string; dimensions: string
  incoterm: string; blType: string; modes: string[]; pickupAddress?: string
  senderName: string; senderEmail: string; senderPhone: string
  specialRequirements: string[]
}
export type QuoteIn = Record<string, any>


/**
 * Carrier text that is safe to show a customer: drops any sentence that names the carrier (or its people), gives contact
 * details, or talks about the carrier's own cost basis ("deduct ... USD 350"). Everything else is kept as written.
 */
export function cleanCarrierText(text: unknown, carrierName?: string | null): string {
  const t = String(text ?? "").replace(/\s+/g, " ").trim()
  if (!t) return ""
  const names = String(carrierName ?? "").split(/\s+/).filter((w) => w.length > 2 && !/^(line|lines|shipping|logistics|group|co|ltd|llc|inc|the|and)$/i.test(w))
  const nameRe = names.length ? new RegExp("\\b" + names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+") + "\\b|\\b" + names[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i") : null
  const sentences = t.split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
  return sentences.filter((x) =>
    !(nameRe && nameRe.test(x)) &&
    !/\bcarrier is\b|\bour (sales|pricing|agent)\b/i.test(x) &&
    !/[\w.+-]+@[\w-]+\.[\w.]+|https?:\/\/|\+?\d[\d\s()-]{8,}\d/.test(x) &&
    !/\bdeduct(ed|ion)?\b/i.test(x)
  ).join(" ").trim()
}

const readDate = (v: unknown): string => {
  const t = String(v ?? "").trim()
  return /^\d{4}-\d{2}-\d{2}/.test(t) ? fmtDate(t) : t
}

/** Cargo / port cut-off and document cut-off from the carrier quote's `cutoffs` field (object or text). */
function cutoffsOf(c: unknown): { cargo: string; docs: string } {
  if (!c) return { cargo: "", docs: "" }
  if (typeof c === "string") { const t = c.trim(); return { cargo: /^[\[{]/.test(t) ? "" : readDate(t), docs: "" } }
  if (typeof c === "object") {
    const o = c as Record<string, unknown>
    const pick = (re: RegExp) => { const k = Object.keys(o).find((x) => re.test(x) && o[x]); return k ? readDate(o[k]) : "" }
    const cargo = pick(/cargo|port|gate|container|fcl|general|cut/i)
    return { cargo: cargo || readDate(Object.values(o).find((x) => typeof x === "string" && x) ?? ""), docs: pick(/doc|si\b|bl\b|vgm/i) }
  }
  return { cargo: "", docs: "" }
}

/** "via Port Said" from the quote's legs / mode_details, if the carrier stated a routing. */
function routingOf(q: Record<string, any>): string {
  const via = new Set<string>()
  const add = (x: unknown) => { const t = String(x ?? "").trim(); if (t) via.add(t) }
  const legs = Array.isArray(q.legs) ? q.legs : []
  for (const l of legs) {
    if (typeof l === "string") continue
    for (const k of ["via", "transshipment", "transshipment_port", "ts_port", "routing"]) {
      const val = (l as any)?.[k]
      if (Array.isArray(val)) val.forEach(add); else add(val)
    }
  }
  const md = q.mode_details && typeof q.mode_details === "object" ? q.mode_details as Record<string, unknown> : null
  if (md) for (const k of ["via", "routing", "transshipment", "transshipment_port"]) { const val = md[k]; if (Array.isArray(val)) val.forEach(add); else add(val) }
  const list = Array.from(via).filter((x) => !/^(direct|n\/a|none)$/i.test(x))
  return list.length ? `via ${list.join(", ")}` : ""
}

export interface BuildInput {
  request: RequestIn
  quote: QuoteIn
  carrierName: string
  markupType: "flat" | "percent"
  markupAmount: number
  baseRate: number
  finalPrice: number
  options?: unknown
  showMarkupPercent?: boolean
  preparedBy?: string
  company?: { name?: string | null; email?: string | null; phone?: string | null }
  quotationNumber?: string
  /** Manually edited sell lines — replace the computed ones; the caller sets finalPrice to their sum. */
  lineOverrides?: { label: string; basis: string; qty: number | null; rate: number | null; amount: number }[]
  now?: Date
}

const dash = (s: string | null | undefined) => (s && s !== "—" ? s : "")

/** The carrier's price: headline rate, else the computed total, else the sum of the included charge lines. */
export function carrierBase(q: Record<string, any>): number {
  const direct = num(q.rate_usd) ?? num(q.total_amount)
  if (direct !== null && direct > 0) return direct
  // The carrier's own stated total in USD (kept even when its lines are in several currencies).
  const stated = num(q.rate_original)
  if (stated !== null && stated > 0 && String(q.rate_currency || "USD").toUpperCase() === "USD") return stated
  const rows: ChargeIn[] = Array.isArray(q.charges) ? q.charges : []
  const inc = rows.filter((c) => (c.inclusion ?? "included") === "included")
  // Never add amounts in different currencies together.
  if (mixedCurrency(inc)) return 0
  return round2(inc.reduce((t, c) => t + (num(c.amount) ?? 0), 0))
}

/** True when the charge lines are not all in one currency. */
export function mixedCurrency(rows: ChargeIn[]): boolean {
  return new Set(rows.filter((c) => num(c.amount) !== null).map((c) => String(c.currency || "USD").toUpperCase())).size > 1
}

export function buildContext(input: BuildInput): { ctx: RenderCtx; validUntil: string; currency: string; lines: Line[]; mixed: boolean } {
  const o = normalizeOptions(input.options)
  const { request: r, quote: q } = input
  const now = input.now ?? new Date()
  const currency = String(q.rate_currency || "USD").toUpperCase()
  const finalPrice = input.finalPrice
  const charges: ChargeIn[] = Array.isArray(q.charges) ? q.charges : []
  const pctOn = input.markupType === "percent" && input.showMarkupPercent === true && input.markupAmount > 0
  const markupRowLabel = pctOn ? `${o.markup_label} (${plain(input.markupAmount)}%)` : o.markup_label
  const computed = sellLines(charges, o.charges_style, finalPrice, markupRowLabel)
  const optional = computed.optional
  const lines: Line[] = input.lineOverrides && input.lineOverrides.length && o.charges_style !== "total_only" ? input.lineOverrides : computed.lines

  // chargeable weight / validity
  const cw = num(q.chargeable_weight)
  const chargeable = cw !== null ? `${plain(cw)} ${q.chargeable_unit === "rt" ? "RT (W/M)" : "kg"}` : ""
  const gross = num(q.gross_weight)
  const grossStr = gross !== null ? `${plain(gross)} ${q.weight_unit ?? "kg"}` : ""
  const carrierValid = q.validity_date ? String(q.validity_date).slice(0, 10) : ""
  const own = o.validity_days ? addDaysIso(now, o.validity_days) : ""
  const validUntilIso = carrierValid && own ? (carrierValid < own ? carrierValid : own) : carrierValid || own

  const origin = [r.originCity, r.originCountry].map(dash).filter(Boolean).join(", ")
  const destination = [r.destinationCity, r.destinationCountry].map(dash).filter(Boolean).join(", ")
  const op = q.origin_place || q.origin_code || ""
  const dp = q.destination_place || q.destination_code || ""
  const status = STATUS_LABEL[q.quote_status] ?? ""
  const space = q.space_confirmed === true ? "Space confirmed" : q.space_confirmed === false ? "Subject to space availability" : status
  const markupStr = input.markupType === "percent" ? `${input.markupAmount}%` : money(input.markupAmount)
  const markupAmt = input.markupType === "percent" ? round2(input.baseRate * input.markupAmount / 100) : input.markupAmount
  const freeDays = q.free_days != null ? String(q.free_days) : ""

  // What the carrier actually quoted wins over what was asked (a request can say "Air" while the carrier quotes a 40GP container).
  const sl = String(q.service_level || "")
  const quotedMode = q.mode ? String(q.mode).replace(/^./, (c: string) => c.toUpperCase()) : /^(fcl|lcl)$/i.test(sl) || q.container_type ? "Sea" : ""
  const quotedEquip = q.container_type ? `${q.container_count ?? 1} x ${q.container_type}` : ""

  // Sea shipments are described by ports (POL / POD), not a route.
  const seaShip = isSeaOnly(r.modes ?? []) || quotedMode === "Sea"
  const pol = seaShip ? (op || dash(r.originCity)) : ""
  const pod = seaShip ? (dp || dash(r.destinationCity)) : ""
  const pickup = String(q.pickup_address || r.pickupAddress || "").trim()

  const v: Record<string, string> = {
    pol, pod, pickup_address: isExw(r.incoterm) || isExw(q.incoterm) ? pickup : "",
    quotation_number: input.quotationNumber ?? "",
    quotation_date: fmtDate(now.toISOString()),
    quotation_valid_until: fmtDate(validUntilIso),
    prepared_by: input.preparedBy ?? "",
    company_name: input.company?.name ?? "", company_contact_email: input.company?.email ?? "", company_contact_phone: input.company?.phone ?? "",
    sender_name: dash(r.senderName), sender_first_name: dash(r.senderName).split(/\s+/)[0] ?? "",
    sender_email: r.senderEmail ?? "", sender_phone: r.senderPhone ?? "",
    request_ref: r.requestRef ?? "", received_date: r.receivedExact, urgency: r.urgency,
    origin_city: dash(r.originCity), origin_country: dash(r.originCountry), origin,
    destination_city: dash(r.destinationCity), destination_country: dash(r.destinationCountry), destination,
    cargo_type: dash(r.cargoType), equipment: dash(r.equipment) || quotedEquip, weight: dash(r.weight), quantity: dash(r.quantity),
    dimensions: dash(r.dimensions), incoterm: dash(r.incoterm), bl_type: dash(r.blType), mode: quotedMode || r.modes.join(", "),
    special_requirements: (r.specialRequirements ?? []).join("; "),
    carrier_name: input.carrierName, carrier_quote_ref: q.carrier_quote_ref ?? "",
    quote_mode: q.mode ? String(q.mode).replace(/^./, (c: string) => c.toUpperCase()) : "",
    service_level: q.service_level ?? "", quote_status: status,
    route: !seaShip && op && dp ? `${op} → ${dp}` : "", origin_port: op, destination_port: dp,
    direct_or_connecting: q.direct_or_connecting ? String(q.direct_or_connecting).replace(/^./, (c: string) => c.toUpperCase()) : "",
    etd: fmtDate(q.etd), eta: fmtDate(q.eta), cut_off_date: cutoffsOf(q.cutoffs).cargo, doc_cut_off: cutoffsOf(q.cutoffs).docs, routing: routingOf(q),
    transit_days: q.transit_days != null ? String(q.transit_days) : "", frequency: q.frequency ?? "",
    space_status: space, incoterm_quoted: q.incoterm ?? "",
    container: q.container_type ? `${q.container_count ?? 1} x ${q.container_type}` : "",
    container_type: q.container_type ?? "", container_count: q.container_count != null ? String(q.container_count) : "",
    pieces: q.pieces != null ? String(q.pieces) : "", packaging_type: q.packaging_type ?? "",
    gross_weight: grossStr, volume_cbm: q.volume_cbm != null ? plain(Number(q.volume_cbm)) : "",
    chargeable_weight: chargeable, commodity_quoted: q.commodity_description ?? "", hs_code: q.hs_code ?? "",
    temperature_control: q.temperature_control ?? "", special_handling: q.special_handling ?? "",
    currency, final_price: money(finalPrice), final_price_with_currency: `${currency} ${money(finalPrice)}`,
    base_rate: money(input.baseRate), markup: markupStr, markup_amount: money(markupAmt),
    markup_percent: input.markupType === "percent" && input.markupAmount > 0 ? `${plain(input.markupAmount)}%` : "", markup_label: o.markup_label,
    price_per_unit: cw && cw > 0 ? money(finalPrice / cw) : "",
    minimum_charge: q.minimum_charge != null ? money(Number(q.minimum_charge)) : "",
    tax_note: q.tax_included === true ? "Prices include tax" : q.tax_included === false ? "Prices exclude tax" : "",
    validity_date: fmtDate(carrierValid), free_days: freeDays,
    free_days_demurrage: q.free_days_demurrage != null ? String(q.free_days_demurrage) : "",
    free_days_detention: q.free_days_detention != null ? String(q.free_days_detention) : "",
    per_diem_note: q.per_diem_note ?? "", payment_terms: q.payment_terms ?? "",
    subject_to_conditions: cleanCarrierText(q.subject_to_conditions, input.carrierName), exclusions: cleanCarrierText(q.exclusions, input.carrierName),
    required_documents: q.required_documents ?? "", liability_limit: q.liability_limit ?? "",
    cancellation_terms: q.cancellation_terms ?? "",
    insurance_note: q.insurance_offered === true ? "Insurance available" : q.insurance_offered === false ? "Insurance not included" : "",
    quote_notes: cleanCarrierText(q.notes, input.carrierName),
  }

  // blocks
  const blocks: Record<string, Block> = {}
  const totalLabel = `Total (${currency})`

  const summaryRows = [[`Total freight charges${v.route ? ` — ${v.route}` : ""}`, money(finalPrice)]]
  blocks.summary_table = {
    html: tableHtml(["Description", `Amount (${currency})`], summaryRows, o.accent_color, [1]),
    text: `Total freight charges: ${currency} ${money(finalPrice)}`,
  }

  if (lines.length) {
    const mixed = computed.mixed && lines === computed.lines
    const cur = (l: Line) => (mixed ? l.currency ?? currency : currency)
    const amt = (l: Line) => (mixed ? `${cur(l)} ${money(l.amount)}` : money(l.amount))
    const rates = !mixed && o.show_unit_rates && lines.some((l) => l.qty !== null && l.rate !== null)
    const head = mixed ? "Amount" : `Amount (${currency})`
    const heads = rates ? ["Description", "Basis", "Qty", "Rate", head] : ["Description", "Basis", head]
    const rows = lines.map((l) => rates
      ? [l.label, l.basis, l.qty !== null ? plain(l.qty) : "", l.rate !== null ? money(l.rate) : "", amt(l)]
      : [l.label, l.basis, amt(l)])
    const finalStr = mixed ? `${currency} ${money(finalPrice)}` : money(finalPrice)
    const tl = mixed ? `Total all-in (${currency})` : totalLabel
    const total = rates ? [tl, "", "", "", finalStr] : [tl, "", finalStr]
    const right = rates ? [2, 3, 4] : [2]
    const cs = Array.from(new Set(lines.map((l) => cur(l))))
    const note = mixed ? `Charges are quoted in ${cs.join(" and ")}; the total is the all-in price in ${currency}.` : ""
    blocks.charges_table = {
      html: tableHtml(heads, rows, o.accent_color, right, total) + (note ? `<p style="margin:6px 0 0;font-size:12px;color:#64748b">${esc(note)}</p>` : ""),
      text: "",
    }
    blocks.charges_table.text = [...lines.map((l) => `- ${l.label}${l.basis ? ` (${l.basis})` : ""}: ${cur(l)} ${money(l.amount)}`), `Total: ${currency} ${money(finalPrice)}`, ...(note ? [note] : [])].join("\n")
    blocks.charges_list = { html: `<ul>${lines.map((l) => `<li>${esc(l.label)}: ${esc(cur(l))} ${money(l.amount)}</li>`).join("")}</ul>`, text: blocks.charges_table.text }
  } else {
    blocks.charges_table = blocks.summary_table
    blocks.charges_list = { html: "", text: `Total: ${currency} ${money(finalPrice)}` }
  }

  const opt = optional.map((c) => `${c.carrier_label ?? "Charge"}${num(c.amount) !== null ? ` (${currency} ${money(num(c.amount) as number)})` : ""}${c.inclusion === "excluded" ? " — not included" : c.inclusion === "optional" ? " — optional" : c.inclusion === "at_cost" ? " — at cost" : c.inclusion === "subject_to" ? " — subject to conditions" : ""}`)
  blocks.optional_charges_list = { html: opt.length ? `<ul>${opt.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>` : "", text: opt.map((s) => `- ${s}`).join("\n") }

  const sr = r.specialRequirements ?? []
  blocks.special_requirements_list = { html: sr.length ? `<ul>${sr.map((s) => { const p = parseSpecial(s); return `<li>${p.label ? `<strong>${esc(p.label)}:</strong> ${esc(p.value)}` : esc(s)}</li>` }).join("")}</ul>` : "", text: sr.map((s) => `- ${s}`).join("\n") }

  const free = [freeDays && `${freeDays} free days`, v.free_days_demurrage && `${v.free_days_demurrage} days demurrage`, v.free_days_detention && `${v.free_days_detention} days detention`, v.per_diem_note].filter(Boolean).join(", ")
  const tnorm = (x: string) => x.toLowerCase().replace(/[^a-z]+/g, " ").trim()
  const sameAs = (a: string, b: string) => !!a && !!b && (tnorm(a).includes(tnorm(b)) || tnorm(b).includes(tnorm(a)) || (/space/.test(tnorm(a)) && /space/.test(tnorm(b)) && /equipment/.test(tnorm(a)) === /equipment/.test(tnorm(b))))
  const spaceRow = sameAs(v.space_status, v.subject_to_conditions) ? "" : v.space_status
  const insuranceRow = /insur/i.test(v.exclusions) ? "" : v.insurance_note
  const terms: [string, string][] = ([
    ["Quotation valid until", v.quotation_valid_until], ["Space / equipment", spaceRow], ["Free time", free],
    ["Payment terms", v.payment_terms], ["Subject to", v.subject_to_conditions], ["Not included", v.exclusions],
    ["Documents required", v.required_documents], ["Liability", v.liability_limit], ["Cancellation", v.cancellation_terms],
    ["Insurance", insuranceRow], ["Tax", v.tax_note], ["Notes", v.quote_notes],
  ] as [string, string][]).filter(([, val]) => val)
  blocks.terms_block = {
    html: terms.length ? `<ul>${terms.map(([k, val]) => `<li><strong>${esc(k)}:</strong> ${esc(val)}</li>`).join("")}</ul>` : "",
    text: terms.map(([k, val]) => `- ${k}: ${val}`).join("\n"),
  }

  return { ctx: { values: v, blocks }, validUntil: validUntilIso, currency, lines, mixed: computed.mixed && lines === computed.lines }
}

export interface RenderedQuotation { subject: string; text: string; html: string | null; format: "text" | "html" | "pdf" }

export function renderQuotation(
  tpl: { subject: string; body: string; body_html?: string | null; format?: string | null },
  ctx: RenderCtx,
  optionsRaw?: unknown,
): RenderedQuotation {
  const o = normalizeOptions(optionsRaw)
  const subject = renderTemplate(tpl.subject ?? "", ctx, "text").replace(/\s+/g, " ").trim()
  if (tpl.format === "html" && tpl.body_html) {
    const inner = renderTemplate(tpl.body_html, ctx, "html")
    const html = `<div style="font-family:${o.font_family};font-size:14px;line-height:1.55;color:#1e293b">${inner}</div>`
    const plain = htmlToPlainText(inner)
    if (o.delivery === "pdf") {
      // The template is the PDF; the email text is its own template.
      const email = o.email_body.trim()
        ? renderTemplate(o.email_body, ctx, "text")
        : `Dear ${ctx.values.sender_first_name || "Sir/Madam"},\n\nPlease find our quotation ${ctx.values.quotation_number || ""} attached.\n\nBest regards,\n${ctx.values.prepared_by || ""}\n${ctx.values.company_name || ""}`.trim()
      return { subject, html, text: email, format: "pdf" }
    }
    if (o.delivery === "email_text") return { subject, html: null, text: plain, format: "text" }
    return { subject, html, text: plain, format: "html" }
  }
  return { subject, html: null, text: renderTemplate(tpl.body ?? "", ctx, "text"), format: "text" }
}

function tableToText(tableHtml: string): string {
  const cells = (row: string) => [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
    .map((m) => m[1].replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim())
  const rows = [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => cells(m[1])).filter((r) => r.some(Boolean))
  if (!rows.length) return ""
  const cols = Math.max(...rows.map((r) => r.length))
  const width = Array.from({ length: cols }, (_, i) => Math.max(...rows.map((r) => (r[i] ?? "").length)))
  const fmt = (r: string[]) => r.map((c, i) => (i === cols - 1 && cols > 1 && /^[\d,.\-]+$/.test(c) ? c.padStart(width[i]) : c.padEnd(width[i]))).join("  ").trimEnd()
  const lines = rows.map(fmt)
  lines.splice(1, 0, "-".repeat(Math.max(...lines.map((l) => l.length))))
  return "\n" + lines.join("\n") + "\n"
}

/** Dependency-free HTML → readable plain text (used for the text fallback and mailto links). */
export function htmlToPlainText(html: string): string {
  return (html ?? "")
    .replace(/<table[\s\S]*?<\/table>/gi, (t) => tableToText(t))
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(td|th)>\s*/gi, " | ")
    .replace(/<\/(p|div|h[1-6]|li|tr|table|ul|ol|blockquote)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&")
    .replace(/[ \t]+\|\s*(\n|$)/g, "$1")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
}

/** Wraps rendered HTML into a full document (used by the preview iframe and the print/PDF window). */
export function htmlDocument(innerHtml: string, o?: unknown): string {
  const opt = normalizeOptions(o)
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
body{margin:0;padding:28px;background:#fff;font-family:${opt.font_family};font-size:14px;line-height:1.55;color:#1e293b}
table{border-collapse:collapse} img{max-width:100%;height:auto} a{color:${opt.accent_color}}
@media print{body{padding:0}}
</style></head><body>${innerHtml}</body></html>`
}

// ── sample data for the editor preview ───────────────────────────────────────

export function sampleContext(optionsRaw?: unknown): RenderCtx {
  const sample = buildContext({
    request: {
      requestRef: "LT-0017", receivedExact: "30 Sep 2026", urgency: "Standard",
      originCity: "Genoa", originCountry: "Italy", destinationCity: "Aqaba", destinationCountry: "Jordan",
      cargoType: "Electrical heating appliances", equipment: "1 x 20ft, 1 x 40HC", weight: "18,500 kg", quantity: "2 Containers",
      dimensions: "—", incoterm: "EXW", blType: "Telex Release", modes: ["Sea"],
      senderName: "Nour Abuazzam", senderEmail: "nour@hijazi.example", senderPhone: "+962 7 9000 0000",
      specialRequirements: ["Direct service only", "Mention all fees"],
    },
    quote: {
      carrier_quote_ref: "MX-88123", mode: "sea", service_level: "FCL", quote_status: "subject_to_equipment",
      origin_place: "La Spezia", destination_place: "Aqaba", direct_or_connecting: "direct",
      etd: "2026-10-21", eta: "2026-11-09", transit_days: 19, frequency: "Weekly", incoterm: "EXW",
      container_type: "40HC", container_count: 1, gross_weight: 18500, weight_unit: "kg", volume_cbm: 28.4,
      validity_date: "2026-10-31", free_days_demurrage: 14, free_days_detention: 14, per_diem_note: "USD 40/day per container after free time",
      payment_terms: "Net 30 days", exclusions: "Destination charges at Aqaba, insurance", rate_currency: "USD",
      subject_to_conditions: "Subject to equipment availability", required_documents: "Commercial invoice, packing list",
      charges: [
        { carrier_label: "Ocean freight 40HC", basis: "per_container", unit_rate: 2850, quantity: 1, amount: 2850, inclusion: "included" },
        { carrier_label: "EXW pickup Gualtieri to La Spezia", basis: "per_container", unit_rate: 700, quantity: 1, amount: 700, inclusion: "included" },
        { carrier_label: "THC origin", basis: "per_container", unit_rate: 220, quantity: 1, amount: 220, inclusion: "included" },
        { carrier_label: "BL fee", basis: "per_shipment", unit_rate: 60, quantity: 1, amount: 60, inclusion: "included" },
        { carrier_label: "Export customs clearance", basis: "per_shipment", unit_rate: 120, quantity: 1, amount: 120, inclusion: "included" },
      ],
    },
    carrierName: "Med Express Line", markupType: "flat", markupAmount: 310, baseRate: 3950, finalPrice: 4260,
    options: optionsRaw, preparedBy: "Osama", company: { name: "Hijazi Forwarding Co.", email: "sales@example.com", phone: "+962 6 000 0000" },
    quotationNumber: "QT-LT-0017-01", now: new Date(Date.UTC(2026, 9, 2)),
  })
  return sample.ctx
}

export { ALL_VARIABLES, BLOCK_KEYS }
