/** Client-side formatting, CSV / Excel export and the themed printable (PDF) layout. */
import type { CellType, ColumnDef, ReportResult } from "./catalog"
import { hours as fmtHours, money } from "@/lib/dashboard-range"

const pad = (x: number) => String(x).padStart(2, "0")
const d = (v: any) => new Date(v)
export const fmtDate = (v: any) => { const t = d(v); return isNaN(+t) ? String(v ?? "") : `${pad(t.getDate())} ${t.toLocaleString("en-GB", { month: "short" })} ${t.getFullYear()}` }
export const fmtDateTime = (v: any) => { const t = d(v); return isNaN(+t) ? String(v ?? "") : `${fmtDate(t)}, ${pad(t.getHours())}:${pad(t.getMinutes())}` }

export function formatCell(type: CellType | undefined, v: any): string {
  if (v == null || v === "") return type === "num" || type === "money" || type === "pct" || type === "hours" ? "—" : ""
  switch (type) {
    case "num": return Number(v).toLocaleString("en-US", { maximumFractionDigits: 1 })
    case "money": return money(Number(v))
    case "pct": return `${Math.round(Number(v))}%`
    case "hours": return fmtHours(Number(v))
    case "date": return fmtDate(v)
    case "datetime": return fmtDateTime(v)
    default: return String(v)
  }
}

const esc = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
const isNum = (t?: CellType) => t === "num" || t === "money" || t === "pct" || t === "hours"
const align = (c: ColumnDef) => c.align ?? (isNum(c.type) ? "right" : "left")

/** Raw-ish value for spreadsheets: numbers stay numbers, dates become sortable text. */
function rawCell(c: ColumnDef, v: any): string | number {
  if (v == null || v === "") return ""
  if (c.type === "money" || c.type === "num") return Number(v)
  if (c.type === "pct" || c.type === "hours") return Math.round(Number(v) * 10) / 10
  if (c.type === "date") { const t = d(v); return isNaN(+t) ? String(v) : `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}` }
  if (c.type === "datetime") { const t = d(v); return isNaN(+t) ? String(v) : `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}` }
  return String(v)
}
const hdr = (c: ColumnDef) => (c.type === "pct" ? `${c.label} (%)` : c.type === "hours" ? `${c.label} (hours)` : c.label)

export interface Meta { client: string; title: string; period: string; filters: string; generated: string }

export function filenameFor(title: string, ext: string) {
  const t = new Date()
  return `${title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()}-${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}.${ext}`
}

function download(name: string, mime: string, content: string) {
  const a = document.createElement("a")
  a.href = URL.createObjectURL(new Blob([content], { type: mime }))
  a.download = name; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}

export function exportCsv(r: ReportResult, m: Meta) {
  const q = (v: string | number) => (typeof v === "number" ? String(v) : `"${v.replace(/"/g, '""')}"`)
  const lines = [[m.client], [m.title], [`Period: ${m.period}`], ...(m.filters ? [[`Filters: ${m.filters}`]] : []), [`Generated: ${m.generated}`], [],
    r.columns.map(hdr), ...r.rows.map((row) => r.columns.map((c) => rawCell(c, row[c.key])))]
  download(filenameFor(m.title, "csv"), "text/csv;charset=utf-8", "﻿" + lines.map((l) => l.map((v) => q(v as any)).join(",")).join("\r\n"))
}

export function exportXls(r: ReportResult, m: Meta, theme: Theme) {
  const th = r.columns.map((c) => `<th style="background:${theme.navy};color:#fff;text-align:${align(c)};padding:6px;border:1px solid #cbd5e1">${esc(hdr(c))}</th>`).join("")
  const body = r.rows.map((row) => `<tr>${r.columns.map((c) => {
    const v = rawCell(c, row[c.key])
    const fmt = c.type === "money" ? "mso-number-format:'\\#\\,\\#\\#0\\.00'" : c.type === "num" ? "mso-number-format:'\\#\\,\\#\\#0\\.\\#'" : "mso-number-format:'\\@'"
    return `<td style="border:1px solid #e2e8f0;padding:4px;text-align:${align(c)};${typeof v === "number" ? "" : fmt}">${esc(v)}</td>`
  }).join("")}</tr>`).join("")
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>${esc(m.title.slice(0, 28))}</x:Name></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head><body>
<table><tr><td colspan="${r.columns.length}" style="font-size:16pt;font-weight:bold;color:${theme.navy}">${esc(m.client)}</td></tr>
<tr><td colspan="${r.columns.length}" style="font-size:13pt;font-weight:bold;color:${theme.accent}">${esc(m.title)}</td></tr>
<tr><td colspan="${r.columns.length}">Period: ${esc(m.period)}${m.filters ? " · " + esc(m.filters) : ""}</td></tr>
<tr><td colspan="${r.columns.length}">Generated: ${esc(m.generated)}</td></tr><tr></tr>
<tr>${th}</tr>${body}</table></body></html>`
  download(filenameFor(m.title, "xls"), "application/vnd.ms-excel;charset=utf-8", html)
}

export interface Theme { navy: string; accent: string }
export function readTheme(): Theme {
  const cs = getComputedStyle(document.documentElement)
  return { navy: cs.getPropertyValue("--brand-navy").trim() || "#0f1e36", accent: cs.getPropertyValue("--brand-accent").trim() || "#E8821A" }
}

export function printReport(r: ReportResult, m: Meta, theme: Theme, logo: string | null) {
  const landscape = r.columns.length > 6
  const tiles = r.summary.filter((s) => s.value != null).map((s) =>
    `<div class="tile"><div class="v">${esc(formatCell(s.type, s.value))}</div><div class="l">${esc(s.label)}</div></div>`).join("")
  const th = r.columns.map((c) => `<th style="text-align:${align(c)}">${esc(c.label)}</th>`).join("")
  const tr = r.rows.map((row) => `<tr>${r.columns.map((c) => `<td style="text-align:${align(c)}">${esc(formatCell(c.type, row[c.key]))}</td>`).join("")}</tr>`).join("")
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(m.title)}</title><style>
@page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 14mm 12mm 16mm; @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 8pt Helvetica, Arial, sans-serif; color: #64748b } }
* { box-sizing: border-box } body { font: 10pt/1.4 Helvetica, Arial, sans-serif; color: #0f172a; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact }
.head { display: flex; justify-content: space-between; align-items: flex-end; padding-bottom: 10px; border-bottom: 3px solid ${theme.accent} }
.brand { display: flex; align-items: center; gap: 12px } .brand img { max-height: 52px; max-width: 170px; object-fit: contain }
.client { font-size: 18pt; font-weight: 700; color: ${theme.navy}; letter-spacing: -.01em }
.meta { text-align: right; font-size: 8.5pt; color: #475569 } .meta .t { font-size: 13pt; font-weight: 700; color: ${theme.accent}; margin-bottom: 2px }
.tiles { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0 }
.tile { flex: 1 1 120px; border: 1px solid #e2e8f0; border-left: 3px solid ${theme.accent}; border-radius: 4px; padding: 7px 10px }
.tile .v { font-size: 14pt; font-weight: 700; color: ${theme.navy} } .tile .l { font-size: 8pt; color: #64748b }
table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 8.5pt } thead { display: table-header-group }
th { background: ${theme.navy}; color: #fff; padding: 6px 7px; font-weight: 600; font-size: 8pt; text-transform: uppercase; letter-spacing: .04em }
td { padding: 5px 7px; border-bottom: 1px solid #e2e8f0; vertical-align: top } tr { page-break-inside: avoid } tbody tr:nth-child(even) td { background: #f8fafc }
.empty { padding: 30px; text-align: center; color: #64748b } .foot { margin-top: 12px; font-size: 8pt; color: #94a3b8; display: flex; justify-content: space-between }
</style></head><body>
<div class="head"><div class="brand">${logo ? `<img src="${esc(logo)}" alt="">` : ""}<div class="client">${esc(m.client)}</div></div>
<div class="meta"><div class="t">${esc(m.title)}</div><div>${esc(m.period)}</div>${m.filters ? `<div>${esc(m.filters)}</div>` : ""}<div>Generated ${esc(m.generated)}</div></div></div>
${tiles ? `<div class="tiles">${tiles}</div>` : ""}
${r.rows.length ? `<table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>` : `<div class="empty">No data for the selected filters.</div>`}
<div class="foot"><span>${r.rows.length} row${r.rows.length === 1 ? "" : "s"}${r.truncated ? " (first 5,000 shown)" : ""}</span><span>LOGISTRICKS</span></div>
</body></html>`
  const f = document.createElement("iframe")
  f.setAttribute("aria-hidden", "true")
  f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden"
  f.srcdoc = html
  f.onload = () => {
    const w = f.contentWindow
    if (!w) return
    // let the logo decode before the print dialog opens
    setTimeout(() => { w.focus(); w.print(); setTimeout(() => f.remove(), 60_000) }, 250)
  }
  document.body.appendChild(f)
}
