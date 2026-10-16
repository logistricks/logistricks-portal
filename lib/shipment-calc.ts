// Calculations for shipment types: weights, volumes and the air chargeable weight.
// Pure functions (no server code) so the pages, the API and the RFQ drafts all use the same numbers.

const num = (s: string) => Number(s.replace(/,/g, ""))

/** "50 kg", "1.2 tons", "22,000 lbs" -> kilograms. No unit = kg. null when there is no number. */
export function weightKg(text: unknown): number | null {
  const s = String(text ?? "").toLowerCase()
  const m = s.match(/(\d[\d,]*\.?\d*)\s*(kgs?|kilos?|kilograms?|tons?|tonnes?|mts?|t|lbs?|pounds?|g|grams?)?\b/)
  if (!m) return null
  const v = num(m[1])
  if (!Number.isFinite(v)) return null
  const u = m[2] ?? "kg"
  if (/^(ton|tonne|mt|t)/.test(u)) return v * 1000
  if (/^(lb|pound)/.test(u)) return v * 0.45359237
  if (u === "g" || /^gram/.test(u)) return v / 1000
  return v
}

export interface DimLine { l: number; w: number; h: number; pieces: number }

const CM: Record<string, number> = { mm: 0.1, cm: 1, m: 100, in: 2.54, inch: 2.54, inches: 2.54 }

/**
 * "120 x 80 x 100 cm @ 5", "50x40x30 cm; 60x60x60 cm @ 2" -> lines in centimetres, with the piece count.
 * A line without "@ N" counts as 1 piece, unless there is a single line and `pieces` (the quantity) gives a number.
 */
export function parseDimensions(text: unknown, pieces?: unknown): DimLine[] {
  const raw = String(text ?? "")
  if (!raw.trim()) return []
  const lines: DimLine[] = []
  for (const part of raw.split(/[;\n]+/)) {
    const m = part.match(/(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m|inches|inch|in)?\b(?:[^@\d]*@\s*(\d+))?/i)
    if (!m) continue
    const f = CM[(m[4] ?? "cm").toLowerCase()] ?? 1
    const [l, w, h] = [m[1], m[2], m[3]].map((x) => Number(x.replace(",", ".")) * f)
    if (![l, w, h].every((x) => Number.isFinite(x) && x > 0)) continue
    lines.push({ l, w, h, pieces: m[5] ? Number(m[5]) : 1 })
  }
  if (lines.length === 1 && !/@/.test(raw)) {
    const q = String(pieces ?? "").match(/\d[\d,]*/)
    const n = q ? Number(q[0].replace(/,/g, "")) : NaN
    if (Number.isFinite(n) && n > 0) lines[0].pieces = n
  }
  return lines
}

/** Total volume in CBM from the dimension lines (per-piece size x pieces). null when nothing can be read. */
export function cbmFromDimensions(dimensions: unknown, pieces?: unknown): number | null {
  const lines = parseDimensions(dimensions, pieces)
  if (!lines.length) return null
  return lines.reduce((t, x) => t + (x.l * x.w * x.h * x.pieces) / 1_000_000, 0)
}

/** Volumetric weight for air in kg: L x W x H cm / 6000 per piece, times pieces. */
export function volumetricKg(dimensions: unknown, pieces?: unknown, cbm?: unknown): number | null {
  const lines = parseDimensions(dimensions, pieces)
  if (lines.length) return lines.reduce((t, x) => t + ((x.l * x.w * x.h) / 6000) * x.pieces, 0)
  const c = Number(String(cbm ?? "").match(/\d+(?:[.,]\d+)?/)?.[0]?.replace(",", "."))
  return Number.isFinite(c) && c > 0 ? (c * 1_000_000) / 6000 : null // only a CBM figure: 1 CBM = 166.7 kg
}

const r1 = (n: number) => Math.round(n * 10) / 10
export const fmtKg = (n: number) => `${r1(n).toLocaleString("en-US", { maximumFractionDigits: 1 })} kg`
export const fmtCbm = (n: number) => `${(Math.round(n * 1000) / 1000).toLocaleString("en-US", { maximumFractionDigits: 3 })} CBM`

interface Row { weight?: unknown; dimensions?: unknown; quantity?: unknown; cbm?: unknown }

/** Air chargeable weight: the larger of gross weight and volumetric weight. null until at least one can be worked out. */
export function chargeableWeight(row: Row): string | null {
  const gross = weightKg(row.weight)
  const vol = volumetricKg(row.dimensions, row.quantity, row.cbm)
  if (gross == null && vol == null) return null
  return fmtKg(Math.max(gross ?? 0, vol ?? 0))
}

/** CBM worked out from the dimensions (shown as a suggestion when the CBM field is empty). */
export function calculatedCbm(row: Row): string | null {
  const c = cbmFromDimensions(row.dimensions, row.quantity)
  return c == null ? null : fmtCbm(c)
}
