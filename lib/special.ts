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
    for (const part of t.split(/\r?\n|\s*[•●▪]\s*|;\s+(?=[A-Z0-9])/)) {
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
