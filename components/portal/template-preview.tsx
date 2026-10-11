import type { ReactNode } from "react"

const ENT: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'", rsquo: "’", lsquo: "‘", ndash: "–", mdash: "—", hellip: "…", rarr: "→" }

/** HTML template body → readable one-line text (entities decoded, tags and {{#if}} markers removed). */
export function plainPreview(html: string): string {
  return String(html ?? "")
    .replace(/<\s*(br|\/p|\/div|\/li|\/tr|\/h[1-6])\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#?\w+);/g, (m, k) => (k in ENT ? ENT[k] : /^#\d+$/.test(k) ? String.fromCharCode(Number(k.slice(1))) : m))
    .replace(/\{\{\s*[#/][^}]*\}\}/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim()
}

const pretty = (v: string) => { const t = v.split("|")[0].trim().replace(/_/g, " "); return t.charAt(0).toUpperCase() + t.slice(1) }

/** Preview text with each {{variable}} shown as a small tag instead of raw braces. */
export function TemplatePreview({ body }: { body: string }) {
  const text = plainPreview(body)
  if (!text) return <em style={{ color: "var(--text-muted)" }}>No content</em>
  const out: ReactNode[] = []
  const re = /\{\{\s*([^}]+?)\s*\}\}/g
  let last = 0, m: RegExpExecArray | null, i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push(<span key={i++} className="mx-0.5 rounded px-1.5 py-px text-[11.5px] font-semibold" style={{ background: "rgb(var(--brand-accent-rgb) / 0.1)", color: "var(--brand-accent)" }}>{pretty(m[1])}</span>)
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return <>{out}</>
}
