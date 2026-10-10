/**
 * Special requests: stored in freight_requests.special_requirements (JSONB). Depending on how a row was written
 * (portal, n8n Supabase node, older workflow) the value can be a clean array, a JSON string of an array, a plain
 * text blob, or an object — all of them are read into one list of strings here.
 *
 * Items may be written "Label: value" (e.g. "Free time at POD: at least 10 days"); parseSpecial() splits those
 * so the portal can show them as labelled fields. Items without a label are shown as plain text.
 */

function flatten(v: unknown, out: string[], depth = 0): void {
  if (v == null || depth > 4) return
  if (typeof v === "string") {
    const t = v.trim()
    if (!t) return
    if ((t.startsWith("[") && t.endsWith("]")) || (t.startsWith("{") && t.endsWith("}"))) {
      try { flatten(JSON.parse(t), out, depth + 1); return } catch { /* plain text */ }
    }
    // Also split where one string holds several "Label: value" pairs joined by commas ("Inland pickup: Gebze, Packaging details: 640 pieces")
    for (const part of t.split(/\r?\n|\s*[•●▪]\s*|;\s+(?=[A-Z0-9])|,\s+(?=[A-Z][A-Za-z'\/&-]*(?:\s+[A-Za-z'\/&()-]+){0,3}:\s+\S)/)) {
      const p = part.replace(/^[\s\-–*•\d.)]+(?=\S)/, (m) => (/^\s*\d+[.)]\s*$/.test(m) || /^[\s\-–*•]+$/.test(m) ? "" : m)).trim()
      if (p) out.push(p)
    }
    return
  }
  if (typeof v === "number" || typeof v === "boolean") { out.push(String(v)); return }
  if (Array.isArray(v)) { for (const x of v) flatten(x, out, depth + 1); return }
  if (typeof v === "object") {
    const o = v as Record<string, unknown>
    for (const k of ["items", "list", "values", "requirements", "special_requirements"]) if (Array.isArray(o[k])) { flatten(o[k], out, depth + 1); return }
    if (typeof o.label === "string" && o.value != null) { const val = String(o.value).trim(); if (val) out.push(`${o.label.trim()}: ${val}`); return }
    for (const [k, val] of Object.entries(o)) {
      if (val == null || val === "" || val === false) continue
      const s = typeof val === "object" ? (flatten(val, [], depth + 1), JSON.stringify(val)) : String(val)
      out.push(`${k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())}: ${s}`)
    }
  }
}

export function toStringList(v: unknown): string[] {
  const out: string[] = []
  flatten(v, out)
  return Array.from(new Set(out.map((s) => s.trim()).filter(Boolean)))
}

export type SpecialItem = { label: string | null; value: string }

/** "Label: value" → {label, value}; anything else → {label: null, value}. A label is short and starts with a letter. */
export function parseSpecial(item: string): SpecialItem {
  const m = /^([A-Za-z؀-ۿ][^:\n]{1,40}?)\s*:\s+(\S[\s\S]*)$/.exec(item.trim())
  if (m && !/^https?$/i.test(m[1])) return { label: m[1].trim(), value: m[2].trim() }
  return { label: null, value: item.trim() }
}

const norm = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]+/g, " ").trim()

/**
 * Safety net for the AI: drops a special request that only repeats a field the request already has
 * (e.g. "BL type: Telex" when BL type is already filled). Items that add anything beyond the field are kept.
 */
export function dropRepeats(items: string[], fields: unknown[]): string[] {
  const known = fields.map(norm).filter((f) => f.length >= 3)
  return items.filter((it) => {
    const v = norm(parseSpecial(it).value)
    if (v.length < 3) return true
    return !known.some((f) => f === v || f.includes(v))
  })
}

/**
 * Plain value that may have been stored as an array: ["40ft Dry Container","40ft Reefer Container"] (real array or
 * a JSON string of one) becomes "40ft Dry Container, 40ft Reefer Container". Anything else is returned trimmed.
 */
export function joinList(v: unknown, sep = ", "): string {
  if (v == null) return ""
  if (Array.isArray(v)) return v.map((x) => joinList(x, sep)).filter(Boolean).join(sep)
  const t = String(v).trim()
  if (t.startsWith("[") && t.endsWith("]")) {
    try { const a = JSON.parse(t); if (Array.isArray(a)) return joinList(a, sep) } catch { /* plain text */ }
  }
  return t
}

/**
 * The special-requests list as it goes to a CARRIER: no repeats of fields the request already has, and nothing that is the
 * client's own business (which lines they want to avoid or prefer). One string per item, ready to print one per line.
 */
export function forCarrier(items: string[], fields: unknown[]): string[] {
  const internal = /^(carrier|preferred carrier|shipping line|line|airline)\s+(preference|preferences|to avoid|avoid)\b/i
  return dropRepeats(items, fields).filter((it) => {
    const p = parseSpecial(it)
    return !(p.label && internal.test(p.label)) && !/^\s*(avoid|prefer)\b/i.test(p.value) || (p.label ? !internal.test(p.label) && !/^\s*(avoid|prefer)\b/i.test(p.value) : false)
  })
}

/**
 * Special requests rewritten for a CARRIER: the stored items are notes about the request ("Quote must include: ...",
 * "Carrier preference: Avoid MSC"); a carrier should read professional, direct requests. Internal items (carrier
 * preferences, which name competitors) are dropped; known labels get carrier-facing wording; anything else is kept as is.
 */
export function carrierFacingSpecial(items: string[]): string[] {
  const out: string[] = []
  for (const raw of items) {
    const { label, value } = parseSpecial(raw)
    if (!label) { out.push(raw.trim()); continue }
    const l = label.toLowerCase()
    const v = value.replace(/[.\s]+$/, "")
    if (/carrier preference|preferred carrier|avoid |prefer /.test(l + " ")) continue
    const rules: Array<[RegExp, (v: string) => string]> = [
      [/^quote must include|^quotation must include|^please include/, (x) => `Please include in your quotation: ${x}`],
      [/^please confirm|^confirm/, (x) => `Kindly confirm: ${x}`],
      [/^inland pickup|^pickup|^pick-up|^collection/, (x) => `Pre-carriage (pickup) from: ${x}`],
      [/^inland delivery|^delivery/, (x) => `On-carriage (delivery) to: ${x}`],
      [/free time|detention|demurrage/, (x) => `Free time requested: ${x}`],
      [/rate validity|quote validity|validity/, (x) => `Required rate validity: ${x}`],
      [/readiness|ready date|cargo ready/, (x) => `Cargo ready date: ${x}`],
      [/incoterm option/, (x) => `Please quote both options: ${x.replace(/^compare\s+/i, "")}`],
      [/weight breakdown/, (x) => `Weight breakdown: ${x}`],
      [/packaging|packing/, (x) => `Packing: ${x}`],
      [/commodity/, (x) => `Commodity note: ${x}`],
    ]
    const hit = rules.find(([re]) => re.test(l))
    out.push(hit ? hit[1](v) : `${label}: ${v}`)
  }
  return Array.from(new Set(out))
}
