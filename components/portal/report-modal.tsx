"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Download, FileSpreadsheet, Loader2, Play, Printer, X } from "lucide-react"
import { type ReportDef, type ReportResult } from "@/lib/reports/catalog"
import { exportCsv, exportXls, formatCell, printReport, readTheme, type Meta } from "@/lib/reports/output"
import { useBranding } from "@/lib/use-branding"
import { useToast } from "@/components/ui/toast"

type Opt = { value: string; label: string }
let optionsCache: { carriers: Opt[]; statuses: Opt[] } | null = null

const d0 = (t = new Date()) => { const x = new Date(t); x.setHours(0, 0, 0, 0); return x }
const day = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
const iso = (t: number) => { const x = new Date(t); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}` }

const PERIODS = ["today", "week", "month", "30d", "90d", "year", "custom"] as const
type PKey = (typeof PERIODS)[number]
const PLABEL: Record<PKey, string> = { today: "Today", week: "This week", month: "This month", "30d": "Last 30 days", "90d": "Last 90 days", year: "This year", custom: "Custom" }

function period(key: PKey, cf: string, ct: string): { from: number; to: number; label: string } {
  const n = new Date(), t0 = d0(n), tomorrow = new Date(t0); tomorrow.setDate(t0.getDate() + 1)
  let a = t0, b = tomorrow
  if (key === "week") { a = new Date(t0); a.setDate(a.getDate() - ((a.getDay() + 6) % 7)); b = new Date(a); b.setDate(a.getDate() + 7) }
  else if (key === "month") { a = new Date(n.getFullYear(), n.getMonth(), 1); b = new Date(n.getFullYear(), n.getMonth() + 1, 1) }
  else if (key === "30d") { a = new Date(t0); a.setDate(a.getDate() - 29) }
  else if (key === "90d") { a = new Date(t0); a.setDate(a.getDate() - 89) }
  else if (key === "year") { a = new Date(n.getFullYear(), 0, 1); b = new Date(n.getFullYear() + 1, 0, 1) }
  else if (key === "custom") { a = d0(cf ? new Date(cf + "T00:00:00") : n); const e = d0(ct ? new Date(ct + "T00:00:00") : n); b = new Date(Math.max(+e, +a)); b.setDate(b.getDate() + 1) }
  return { from: +a, to: +b, label: key === "today" ? `Today, ${day(+a)}` : `${day(+a)} – ${day(+b - 1)}` }
}

export function ReportModal({ report, onClose }: { report: ReportDef; onClose: () => void }) {
  const brand = useBranding()
  const { error: toastError } = useToast()
  const [pk, setPk] = useState<PKey>("month")
  const [cf, setCf] = useState(iso(Date.now()))
  const [ct, setCt] = useState(iso(Date.now()))
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(report.filters.map((f) => [f.key, f.key === "group" ? "day" : ""])))
  const [opts, setOpts] = useState(optionsCache)
  const [result, setResult] = useState<ReportResult | null>(null)
  const [meta, setMeta] = useState<Meta | null>(null)
  const [busy, setBusy] = useState<"" | "display" | "print" | "xls" | "csv">("")
  const dirty = useRef(true)

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    document.addEventListener("keydown", k)
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden"
    return () => { document.removeEventListener("keydown", k); document.body.style.overflow = prev }
  }, [onClose])

  useEffect(() => {
    if (optionsCache || !report.filters.some((f) => f.dynamic)) return
    fetch("/api/reports?options=1").then((r) => (r.ok ? r.json() : null)).then((o) => { if (o) { optionsCache = o; setOpts(o) } }).catch(() => {})
  }, [report])

  const setVal = (k: string, v: string) => { dirty.current = true; setVals((p) => ({ ...p, [k]: v })) }
  const per = useMemo(() => period(pk, cf, ct), [pk, cf, ct])

  const filterText = useMemo(() => report.filters.map((f) => {
    const v = vals[f.key]; if (!v) return ""
    const o = (f.dynamic ? opts?.[f.dynamic === "carriers" ? "carriers" : "statuses"] : f.options)?.find((x) => x.value === v)
    return `${f.label}: ${o?.label ?? v}`
  }).filter(Boolean).join(" · "), [report, vals, opts])

  const run = useCallback(async (): Promise<{ r: ReportResult; m: Meta } | null> => {
    if (result && meta && !dirty.current) return { r: result, m: meta }
    const qs = new URLSearchParams({ id: report.id, from: new Date(per.from).toISOString(), to: new Date(per.to).toISOString(), tz: String(new Date().getTimezoneOffset()) })
    for (const [k, v] of Object.entries(vals)) if (v) qs.set(k, v)
    const res = await fetch(`/api/reports?${qs}`, { cache: "no-store" })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { toastError("Report failed", j.error || `HTTP ${res.status}`); return null }
    const m: Meta = {
      client: brand.displayName || "Logistricks", title: report.title,
      period: report.snapshot ? "Current snapshot" : per.label, filters: filterText,
      generated: new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
    }
    dirty.current = false
    setResult(j); setMeta(m)
    return { r: j, m }
  }, [result, meta, report, per, vals, brand.displayName, filterText, toastError])

  async function go(kind: "display" | "print" | "xls" | "csv") {
    setBusy(kind)
    try {
      const out = await run()
      if (!out) return
      if (kind === "print") printReport(out.r, out.m, readTheme(), brand.logo)
      if (kind === "xls") exportXls(out.r, out.m, readTheme())
      if (kind === "csv") exportCsv(out.r, out.m)
    } catch (e) { toastError("Report failed", (e as Error).message) } finally { setBusy("") }
  }

  const shown = result?.rows.slice(0, 500) ?? []
  const Btn = ({ k, icon: I, label, primary }: { k: "display" | "print" | "xls" | "csv"; icon: React.ElementType; label: string; primary?: boolean }) => (
    <button type="button" disabled={!!busy} onClick={() => go(k)}
      className="flex items-center gap-1.5 rounded-[7px] border px-3.5 py-2 text-[12.5px] font-semibold disabled:opacity-60"
      style={primary ? { background: "var(--brand-accent)", borderColor: "var(--brand-accent)", color: "#fff" } : { background: "var(--card-bg)", borderColor: "var(--card-border)", color: "var(--text-primary)" }}>
      {busy === k ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <I className="h-3.5 w-3.5" />}{label}
    </button>
  )

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/55 p-3 backdrop-blur-[2px] sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-[1100px] rounded-xl border shadow-2xl" style={{ background: "var(--page-bg)", borderColor: "var(--card-border)" }}>
        <div className="flex items-start justify-between gap-4 rounded-t-xl border-b px-5 py-4" style={{ background: "var(--card-bg)", borderColor: "var(--card-border)" }}>
          <div>
            <h3 className="text-[17px] font-bold" style={{ color: "var(--text-primary)" }}>{report.title}</h3>
            <p className="mt-0.5 max-w-[720px] text-[12.5px]" style={{ color: "var(--text-secondary)" }}>{report.description}</p>
          </div>
          <button type="button" onClick={onClose} title="Close (Esc)" className="rounded-md border p-1.5" style={{ borderColor: "var(--card-border)", color: "var(--text-secondary)" }}><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-4 p-5">
          <div className="ds-card p-4">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Filters</p>
            {!report.snapshot && (
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap gap-0.5 rounded-[7px] p-0.5" style={{ background: "var(--page-bg)", border: "1px solid var(--card-border)" }}>
                  {PERIODS.map((k) => (
                    <button key={k} type="button" onClick={() => { dirty.current = true; setPk(k) }} className="rounded-[5px] px-3 py-1 text-[12px] font-medium"
                      style={pk === k ? { background: "var(--brand-accent)", color: "#fff" } : { background: "transparent", color: "var(--text-secondary)" }}>{PLABEL[k]}</button>
                  ))}
                </div>
                {pk === "custom" && (
                  <div className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                    <input type="date" value={cf} max={ct} onChange={(e) => { dirty.current = true; setCf(e.target.value) }} className="ds-input !py-1 text-[12px]" />
                    <span>to</span>
                    <input type="date" value={ct} min={cf} onChange={(e) => { dirty.current = true; setCt(e.target.value) }} className="ds-input !py-1 text-[12px]" />
                  </div>
                )}
                <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>{per.label}</span>
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {report.filters.map((f) => {
                const options = f.dynamic ? [...(f.options ?? []), ...(opts?.[f.dynamic] ?? [])] : f.options
                return (
                  <label key={f.key} className="block text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>
                    {f.label}
                    {f.type === "select" ? (
                      <select value={vals[f.key]} onChange={(e) => setVal(f.key, e.target.value)} className="ds-input mt-1 w-full">
                        {options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    ) : (
                      <input type={f.type === "number" ? "number" : "text"} min={f.type === "number" ? 0 : undefined} value={vals[f.key]} placeholder={f.placeholder} onChange={(e) => setVal(f.key, e.target.value)} className="ds-input mt-1 w-full" />
                    )}
                  </label>
                )
              })}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Btn k="display" icon={Play} label="Display" primary />
              <Btn k="print" icon={Printer} label="Print / PDF" />
              <Btn k="xls" icon={FileSpreadsheet} label="Excel (.xls)" />
              <Btn k="csv" icon={Download} label="CSV" />
            </div>
          </div>

          {result && meta && (
            <div className="space-y-4">
              {result.summary.some((s) => s.value != null) && (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
                  {result.summary.filter((s) => s.value != null).map((s) => (
                    <div key={s.label} className="ds-card p-3.5">
                      <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{s.label}</p>
                      <p className="mt-1 text-[22px] font-bold tabular-nums leading-tight" style={{ color: "var(--text-primary)" }}>{formatCell(s.type, s.value)}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="ds-card overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5" style={{ borderColor: "var(--divider)" }}>
                  <span className="text-[12.5px] font-semibold" style={{ color: "var(--text-primary)" }}>{meta.client} — {meta.title}</span>
                  <span className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>{meta.period}{meta.filters ? ` · ${meta.filters}` : ""}</span>
                </div>
                <div className="max-h-[52vh] overflow-auto">
                  <table className="ds-table w-full">
                    <thead className="sticky top-0 z-[1]"><tr>{result.columns.map((c) => <th key={c.key} style={{ textAlign: c.align ?? (["num", "money", "pct", "hours"].includes(c.type ?? "") ? "right" : "left"), whiteSpace: "nowrap" }}>{c.label}</th>)}</tr></thead>
                    <tbody>
                      {shown.length === 0 ? (
                        <tr><td colSpan={result.columns.length} className="py-10 text-center text-sm" style={{ color: "var(--text-muted)" }}>No data for the selected filters.</td></tr>
                      ) : shown.map((row, i) => (
                        <tr key={i}>{result.columns.map((c) => (
                          <td key={c.key} className="tabular-nums" style={{ textAlign: c.align ?? (["num", "money", "pct", "hours"].includes(c.type ?? "") ? "right" : "left") }}>{formatCell(c.type, row[c.key])}</td>
                        ))}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="border-t px-4 py-2 text-[11.5px]" style={{ borderColor: "var(--divider)", color: "var(--text-muted)" }}>
                  {result.rows.length} row{result.rows.length === 1 ? "" : "s"}
                  {result.rows.length > 500 && " — showing the first 500 here; print and export include all"}
                  {result.truncated && " — limited to the first 5,000 rows"}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
