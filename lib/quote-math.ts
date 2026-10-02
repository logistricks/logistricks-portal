/**
 * lib/quote-math.ts
 *
 * Everything numeric about a carrier quote is computed HERE, never by the AI:
 * weights, volumetric / chargeable weight, charge-line arithmetic, totals,
 * date sanity. The AI only reports what the carrier wrote; this file turns that
 * into trusted numbers and a list of validation flags.
 */

export type Severity = "info" | "warn" | "error"
export interface Flag { code: string; field: string | null; severity: Severity; message: string }

export interface DimLine { length_cm?: number; width_cm?: number; height_cm?: number; pieces?: number }
export interface ChargeLine {
  canonical_code?: string | null
  carrier_label?: string | null
  category?: string | null
  basis?: string | null
  unit_rate?: number | null
  quantity?: number | null
  amount?: number | null
  currency?: string | null
  inclusion?: "included" | "excluded" | "optional" | "at_cost" | "subject_to" | null
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""))
  return Number.isFinite(n) ? n : null
}
const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp

export function toKg(value: unknown, unit: unknown): number | null {
  const v = num(value)
  if (v === null) return null
  const u = String(unit ?? "kg").trim().toLowerCase()
  if (["kg", "kgs", "kilo", "kilos", "kilogram", "kilograms"].includes(u)) return round(v, 3)
  if (["lb", "lbs", "pound", "pounds"].includes(u)) return round(v * 0.45359237, 3)
  if (["t", "ton", "tons", "tonne", "tonnes", "mt"].includes(u)) return round(v * 1000, 3)
  return null // unknown unit: caller flags it, we never guess
}

/** Σ (L × W × H × pieces) in cm³ → m³ */
export function volumeFromDimensions(dims: unknown): number | null {
  if (!Array.isArray(dims) || dims.length === 0) return null
  let cm3 = 0
  for (const d of dims as DimLine[]) {
    const l = num(d?.length_cm), w = num(d?.width_cm), h = num(d?.height_cm)
    if (l === null || w === null || h === null) return null
    cm3 += l * w * h * (num(d?.pieces) ?? 1)
  }
  return round(cm3 / 1_000_000, 3)
}

export interface WeightResult {
  gross_weight_kg: number | null
  volume_cbm: number | null
  volumetric_divisor: number | null
  volumetric_weight_kg: number | null
  chargeable_weight: number | null
  chargeable_unit: "kg" | "rt" | null
  chargeable_basis: "actual" | "volumetric" | "wm_weight" | "wm_volume" | "stated" | null
  flags: Flag[]
}

export function computeWeights(input: {
  mode?: string | null
  service_level?: string | null
  gross_weight?: unknown
  weight_unit?: unknown
  volume_cbm?: unknown
  dimensions?: unknown
  volumetric_divisor?: unknown
  chargeable_weight_stated?: unknown
}): WeightResult {
  const flags: Flag[] = []
  const mode = (input.mode ?? "").toLowerCase()
  const lcl = (input.service_level ?? "").toLowerCase().includes("lcl")

  const gross = toKg(input.gross_weight, input.weight_unit)
  if (num(input.gross_weight) !== null && gross === null)
    flags.push({ code: "unknown_weight_unit", field: "weight_unit", severity: "warn", message: `Weight unit "${input.weight_unit}" not recognised; gross weight not normalised.` })

  const stated = num(input.chargeable_weight_stated)
  const dimsVol = volumeFromDimensions(input.dimensions)
  const volume = num(input.volume_cbm) ?? dimsVol
  if (num(input.volume_cbm) !== null && dimsVol !== null && Math.abs((num(input.volume_cbm) as number) - dimsVol) / Math.max(dimsVol, 0.001) > 0.05)
    flags.push({ code: "volume_mismatch", field: "volume_cbm", severity: "warn", message: `Stated volume ${num(input.volume_cbm)} m³ differs from dimensions (${dimsVol} m³).` })

  const out: WeightResult = {
    gross_weight_kg: gross, volume_cbm: volume,
    volumetric_divisor: null, volumetric_weight_kg: null,
    chargeable_weight: null, chargeable_unit: null, chargeable_basis: null, flags,
  }

  if (mode === "sea" && lcl) {
    // W/M: the greater of tonnes and CBM, billed as revenue tons.
    if (gross !== null && volume !== null) {
      const tonnes = gross / 1000
      out.chargeable_unit = "rt"
      out.chargeable_basis = tonnes >= volume ? "wm_weight" : "wm_volume"
      out.chargeable_weight = round(Math.max(tonnes, volume), 3)
    }
  } else if (mode === "air" || mode === "land" || mode === "") {
    const divisor = num(input.volumetric_divisor) ?? (mode === "air" ? 6000 : null)
    out.volumetric_divisor = divisor
    if (volume !== null && divisor) out.volumetric_weight_kg = round((volume * 1_000_000) / divisor, 3)
    if (gross !== null || out.volumetric_weight_kg !== null) {
      const g = gross ?? 0, v = out.volumetric_weight_kg ?? 0
      out.chargeable_unit = "kg"
      out.chargeable_basis = v > g ? "volumetric" : "actual"
      out.chargeable_weight = round(Math.max(g, v), 3)
    }
  }

  if (stated !== null) {
    if (out.chargeable_weight === null) {
      out.chargeable_weight = stated
      out.chargeable_unit = out.chargeable_unit ?? "kg"
      out.chargeable_basis = "stated"
      flags.push({ code: "chargeable_not_verifiable", field: "chargeable_weight", severity: "info", message: "Chargeable weight taken from the carrier; not enough cargo data to verify it." })
    } else if (out.chargeable_unit === "kg" && Math.abs(stated - out.chargeable_weight) / Math.max(out.chargeable_weight, 1) > 0.02) {
      flags.push({ code: "chargeable_mismatch", field: "chargeable_weight", severity: "warn", message: `Carrier states ${stated} kg chargeable; computed ${out.chargeable_weight} kg.` })
    }
  }
  return out
}

export interface PricingResult {
  charges: ChargeLine[] | null
  total_amount: number | null
  flags: Flag[]
}

/** Quantity a charge basis implies, from what the server computed (never from the AI). */
function impliedQuantity(basis: unknown, ctx: { chargeable_weight?: number | null; chargeable_unit?: string | null; volume_cbm?: number | null; container_count?: number | null; pieces?: number | null }): number | null {
  const b = String(basis ?? "").toLowerCase().replace(/[^a-z]+/g, " ").trim()
  if (!b) return null
  if (/\b(shipment|bl|awb|doc|document|flat|lump)\b/.test(b)) return 1
  if (/\b(kg|kilo|kgs)\b/.test(b)) return ctx.chargeable_unit === "kg" ? ctx.chargeable_weight ?? null : null
  if (/\b(wm|rt|revenue ton)\b/.test(b)) return ctx.chargeable_unit === "rt" ? ctx.chargeable_weight ?? null : null
  if (/\bcbm\b|cubic/.test(b)) return ctx.volume_cbm ?? null
  if (/\b(container|teu|feu|cntr)\b/.test(b)) return ctx.container_count ?? null
  if (/\b(pallet|piece|pcs|carton)\b/.test(b)) return ctx.pieces ?? null
  return null
}

export function computePricing(input: {
  charges?: unknown
  total_amount_stated?: unknown
  currency?: unknown
  chargeable_weight?: number | null
  chargeable_unit?: string | null
  volume_cbm?: number | null
  container_count?: number | null
  pieces?: number | null
}): PricingResult {
  const flags: Flag[] = []
  if (!Array.isArray(input.charges) || input.charges.length === 0)
    return { charges: null, total_amount: null, flags }

  const lines = (input.charges as ChargeLine[]).map((c) => ({ ...c }))
  let total = 0
  let counted = 0
  const currencies = new Set<string>()

  lines.forEach((c, i) => {
    const rate = num(c.unit_rate)
    let qty = num(c.quantity)
    let amount = num(c.amount)
    // Carrier gave "USD 2.10/kg" but no quantity: fill it from the computed cargo figures.
    if (qty === null && rate !== null) {
      const q = impliedQuantity(c.basis, input)
      if (q !== null) { qty = q; c.quantity = q }
    }
    if (rate !== null && qty !== null) {
      const calc = round(rate * qty, 2)
      if (amount === null) amount = calc
      else if (Math.abs(calc - amount) > Math.max(0.05, Math.abs(calc) * 0.005))
        flags.push({ code: "line_math", field: `charges[${i}]`, severity: "warn", message: `${c.carrier_label ?? "Charge"}: rate × qty = ${calc}, carrier shows ${amount}.` })
    }
    c.amount = amount
    if (c.currency) currencies.add(String(c.currency).toUpperCase())
    if (amount !== null && (c.inclusion ?? "included") === "included") { total += amount; counted++ }
  })

  const hasMixed = currencies.size > 1
  if (hasMixed)
    flags.push({ code: "mixed_currency", field: "charges", severity: "warn", message: `Charges use several currencies (${[...currencies].join(", ")}); total not computed.` })

  const computed = hasMixed || counted === 0 ? null : round(total, 2)
  const stated = num(input.total_amount_stated)
  if (computed !== null && stated !== null && Math.abs(computed - stated) > Math.max(0.5, stated * 0.005))
    flags.push({ code: "total_mismatch", field: "total_amount", severity: "error", message: `Charge lines add up to ${computed} but the carrier states ${stated}.` })

  return { charges: lines, total_amount: computed, flags }
}

export function checkDates(input: {
  etd?: unknown; eta?: unknown; validity_date?: unknown; valid_from?: unknown
}): Flag[] {
  const flags: Flag[] = []
  const d = (v: unknown) => { const t = v ? Date.parse(String(v)) : NaN; return Number.isNaN(t) ? null : t }
  const etd = d(input.etd), eta = d(input.eta), until = d(input.validity_date), from = d(input.valid_from)
  if (etd !== null && eta !== null && eta < etd)
    flags.push({ code: "eta_before_etd", field: "eta", severity: "error", message: "ETA is earlier than ETD." })
  if (from !== null && until !== null && until < from)
    flags.push({ code: "validity_inverted", field: "validity_date", severity: "error", message: "Valid-until is earlier than valid-from." })
  if (until !== null && until < Date.now() - 24 * 3600 * 1000)
    flags.push({ code: "quote_expired", field: "validity_date", severity: "warn", message: "The quote validity date has already passed." })
  return flags
}
