/**
 * lib/aog-dgr-detector.ts
 * Lightweight keyword scanner that auto-detects AOG and DGR freight.
 * Import and call detectFlags() in any API route or webhook handler.
 */

// ── AOG keywords (air mode only) ──────────────────────────────────────────────
const AOG_KEYWORDS = [
  "aog",
  "aircraft on ground",
  "aircraft part",
  "aircraft parts",
  "engine component",
  "engine components",
  "avionics",
  "rotable",
  "rotables",
  "serviceable",
  "airframe part",
  "landing gear",
  "apu",
  "auxiliary power unit",
  "line replacement unit",
  "lru",
]

// ── DGR keywords (air & ocean) ────────────────────────────────────────────────
const DGR_KEYWORDS = [
  "dangerous goods",
  "hazmat",
  "hazardous material",
  "hazardous materials",
  "imdg",
  "iata dgr",
  "dangerous cargo",
  "flammable",
  "explosive",
  "explosives",
  "corrosive",
  "oxidizer",
  "toxic",
  "radioactive",
  "infectious substance",
  "lithium battery",
  "lithium batteries",
  "li-ion",
  "lipo",
  "un ",           // matches UN1234, UN 1234, etc.
  "class 1",
  "class 2",
  "class 3",
  "class 4",
  "class 5",
  "class 6",
  "class 7",
  "class 8",
  "class 9",
  "packing group",
  "msds",
  "sds",
  "safety data sheet",
  "ernie",         // emergency response guide
  "imco",
  "dgd",           // dangerous goods declaration
]

function scan(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase()
  return keywords.some((kw) => lower.includes(kw))
}

export interface DetectFlagsInput {
  /** true when transport_mode includes air */
  isAir: boolean
  /** text fields to scan — all concatenated */
  fields: (string | null | undefined)[]
}

export interface DetectFlagsResult {
  aog: boolean
  dgr: boolean
}

/**
 * Scans the provided text fields and returns AOG/DGR detection results.
 * AOG is only flagged when isAir is true.
 */
export function detectFlags({ isAir, fields }: DetectFlagsInput): DetectFlagsResult {
  const text = fields.filter(Boolean).join(" ")
  const dgr  = scan(text, DGR_KEYWORDS)
  const aog  = isAir ? scan(text, AOG_KEYWORDS) : false
  return { aog, dgr }
}
