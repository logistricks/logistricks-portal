"use client"

import { useCallback, useEffect, useState } from "react"
import { Check, Copy, FlaskConical, Loader2 } from "lucide-react"

type Lead = {
  id: string; company: string; contact: string | null; code: string; triesTotal: number; triesUsed: number; status: string
  expiresAt: string; lastActive: string | null; converted: boolean; notes: string | null; signals: number; hot: boolean
  finishedTries: number; dataDeletedAt: string | null
  runs: { tryNo: number; mode: string | null; finished: boolean; durationMs: number | null; price: number | null; currency: string | null }[]
}
type Data = { leads: Lead[]; signals: { feature: string; count: number }[]; activity: { at: string; lead: string; type: string; meta: any }[]; retentionDays: number; baseUrl: string }
type Created = { code: string; password: string; link: string; message: string }

const EVENT_TEXT: Record<string, (m: any) => string> = {
  login: () => "Signed in", login_failed: () => "Wrong password", expired_login: () => "Tried to sign in after expiry", page_opened: () => "Opened the page",
  try_start: (m) => `Started try ${m?.try_no} (${m?.mode ?? ""}, ${m?.source ?? ""})`, request_read: (m) => `Request read, ${m?.missing ?? 0} missing`,
  parse_failed: () => "Email could not be read (free)", quote_read: (m) => `Carrier quote read, ${m?.charges ?? 0} charges, ${m?.flags ?? 0} warnings`, quote_failed: () => "Quote could not be read (free)",
  markup_set: (m) => `Set markup ${m?.value}${m?.type === "percent" ? "%" : ""}`, format_switched: (m) => `Switched format to ${m?.format}`,
  pdf_downloaded: () => "Downloaded the PDF", excel_exported: () => "Downloaded the Excel", reply_copied: () => "Copied the suggested reply", email_copied: () => "Copied the email body",
  try_finished: (m) => `Finished try ${m?.try_no}${m?.duration_ms ? " in " + Math.round(m.duration_ms / 1000) + " s" : ""}`,
  locked_click: (m) => `Tapped locked: ${m?.feature}`, cta_click: (m) => `Tapped: ${m?.feature ?? "Book a walkthrough"}`,
}
const evText = (e: { type: string; meta: any }) => (EVENT_TEXT[e.type] ? EVENT_TEXT[e.type](e.meta) : e.type.replace(/^admin_/, "Admin: ").replace(/_/g, " "))
const ago = (iso: string | null) => {
  if (!iso) return "Never"
  const s = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 1000))
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} d ago`
}
const inDays = (iso: string | null) => {
  if (!iso) return "No data"
  const d = Math.ceil((Date.parse(iso) - Date.now()) / 86400000)
  return d <= 0 ? "Due now" : d === 1 ? "in 1 day" : `in ${d} days`
}
const STATUS_CLS: Record<string, string> = { Finished: "bg-emerald-500/15 text-emerald-500", "In progress": "bg-amber-500/15 text-amber-500", Active: "bg-sky-500/15 text-sky-500", "Not opened": "bg-[var(--hover-bg)] text-[var(--text-muted)]", Disabled: "bg-red-500/15 text-red-400", Expired: "bg-red-500/15 text-red-400" }
const inputCls = "w-full rounded-lg border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]/50"
const card = "rounded-xl border border-[var(--border)] bg-[var(--card-bg,var(--modal-bg))] p-5"

export default function TrialLeadsPage() {
  const [data, setData] = useState<Data | null>(null)
  const [err, setErr] = useState("")
  const [company, setCompany] = useState(""); const [contact, setContact] = useState(""); const [tries, setTries] = useState("2"); const [days, setDays] = useState("14")
  const [busy, setBusy] = useState(false); const [created, setCreated] = useState<Created | null>(null); const [copied, setCopied] = useState("")

  const load = useCallback(async () => {
    const r = await fetch("/api/trial-leads", { cache: "no-store" })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(j.error ?? "Could not load trial leads."); return }
    setErr(""); setData(j)
  }, [])
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t) }, [load])

  async function create(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setCreated(null)
    const r = await fetch("/api/trial-leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company, contact, tries: Number(tries), days: Number(days) }) })
    const j = await r.json().catch(() => ({})); setBusy(false)
    if (!r.ok) { setErr(j.error ?? "Could not create the lead."); return }
    setErr(""); setCreated(j); setCompany(""); setContact(""); load()
  }
  async function act(id: string, body: Record<string, unknown>, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return
    const r = await fetch(`/api/trial-leads/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(j.error ?? "Failed."); return }
    if (j.password) window.prompt("New password (shown once). Copy it now:", j.password)
    load()
  }
  const copyText = (key: string, text: string) => { navigator.clipboard?.writeText(text); setCopied(key); setTimeout(() => setCopied(""), 1800) }

  return (
    <div className="portal-page mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div>
        <div className="flex items-center gap-2 text-[var(--text-primary)]"><FlaskConical className="h-5 w-5 text-[var(--brand-accent)]" /><h1 className="text-xl font-semibold">Trial leads</h1></div>
        <p className="mt-1 max-w-3xl text-sm text-[var(--text-muted)]">Create a login, send the message, then watch who tries it, how far they get and which locked features they reach for. Parsed content is deleted {data?.retentionDays ?? 5} days after a lead&apos;s last activity, so review each lead inside that window. The page lives at <span className="font-mono">{data?.baseUrl ?? "try.logistricks.com"}</span>.</p>
      </div>
      {err && <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-400">{err}</div>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <form onSubmit={create} className={card + " space-y-3"}>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Create a lead</h2>
          <div><label className="mb-1 block text-xs text-[var(--text-muted)]">Company</label><input className={inputCls} value={company} onChange={(e) => setCompany(e.target.value)} required /></div>
          <div><label className="mb-1 block text-xs text-[var(--text-muted)]">Contact name</label><input className={inputCls} value={contact} onChange={(e) => setContact(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="mb-1 block text-xs text-[var(--text-muted)]">Tries</label><input className={inputCls} type="number" min={1} max={10} value={tries} onChange={(e) => setTries(e.target.value)} /></div>
            <div><label className="mb-1 block text-xs text-[var(--text-muted)]">Login open (days)</label><input className={inputCls} type="number" min={1} max={90} value={days} onChange={(e) => setDays(e.target.value)} /></div>
          </div>
          <button disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-[var(--brand-accent)] px-4 py-2 text-sm font-semibold text-[var(--brand-navy)] disabled:opacity-50">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Create login</button>
          {created && (
            <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--hover-bg)] p-3 text-sm">
              {([["Link", created.link], ["Code", created.code], ["Password", created.password]] as const).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-2"><span className="text-[var(--text-muted)]">{k}</span><code className="break-all rounded bg-[var(--input-bg)] px-2 py-1 text-xs text-[var(--text-primary)]">{v}</code></div>
              ))}
              <button type="button" onClick={() => copyText("msg", created.message)} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)]">{copied === "msg" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}Copy outreach message</button>
              <p className="text-[11px] text-[var(--text-muted)]">The password is shown once. Only its hash is stored. The link carries the code only.</p>
            </div>
          )}
        </form>

        <div className={card + " overflow-x-auto"}>
          <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">All leads</h2>
          {!data ? <Loader2 className="h-5 w-5 animate-spin text-[var(--text-muted)]" /> : data.leads.length === 0 ? <p className="text-sm text-[var(--text-muted)]">No leads yet.</p> : (
            <table className="w-full text-left text-sm">
              <thead><tr className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]"><th className="py-2 pr-3">Company</th><th className="pr-3">Tries</th><th className="pr-3">Status</th><th className="pr-3">Signals</th><th className="pr-3">Last active</th><th className="pr-3">Data deleted</th><th /></tr></thead>
              <tbody>
                {data.leads.map((l) => (
                  <tr key={l.id} className="border-t border-[var(--border)] align-top">
                    <td className="py-3 pr-3"><div className="font-medium text-[var(--text-primary)]">{l.company}{l.converted && <span className="ml-2 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-500">Converted</span>}</div><div className="font-mono text-xs text-[var(--text-muted)]">{l.code}{l.contact ? " · " + l.contact : ""}</div>
                      {l.runs.length > 0 && <div className="mt-1 text-[11px] text-[var(--text-muted)]">{l.runs.map((r) => `Try ${r.tryNo}: ${r.mode ?? "?"}${r.finished ? " done" + (r.price ? ` · ${r.currency} ${r.price}` : "") : " open"}`).join(" | ")}</div>}</td>
                    <td className="pr-3 font-mono">{l.triesUsed}/{l.triesTotal}</td>
                    <td className="pr-3"><span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_CLS[l.status] ?? ""}`}>{l.status}</span>{l.hot && <span className="ml-1 rounded-full bg-red-500/15 px-2 py-0.5 text-xs text-red-400">Hot</span>}</td>
                    <td className="pr-3 font-mono">{l.signals}</td>
                    <td className="pr-3">{ago(l.lastActive)}</td>
                    <td className="pr-3">{inDays(l.dataDeletedAt)}</td>
                    <td className="space-x-1 whitespace-nowrap py-3 text-xs">
                      <button className="rounded border border-[var(--border)] px-2 py-1" onClick={() => act(l.id, { action: "reset_tries" }, `Reset tries for ${l.company}?`)}>Reset</button>
                      <button className="rounded border border-[var(--border)] px-2 py-1" onClick={() => act(l.id, { action: "extend", days: 7 })}>+7 d</button>
                      <button className="rounded border border-[var(--border)] px-2 py-1" onClick={() => act(l.id, { action: l.status === "Disabled" ? "enable" : "disable" })}>{l.status === "Disabled" ? "Enable" : "Disable"}</button>
                      <button className="rounded border border-[var(--border)] px-2 py-1" onClick={() => act(l.id, { action: "converted", value: !l.converted })}>{l.converted ? "Unmark" : "Won"}</button>
                      <button className="rounded border border-[var(--border)] px-2 py-1" onClick={() => act(l.id, { action: "new_password" }, `Make a new password for ${l.company}? The old one stops working.`)}>New pw</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className={card}>
          <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Activity</h2>
          <div className="max-h-96 divide-y divide-[var(--border)] overflow-auto text-sm">
            {(data?.activity ?? []).map((e, i) => (
              <div key={i} className="flex gap-3 py-2"><span className="w-20 shrink-0 text-xs text-[var(--text-muted)]">{ago(e.at)}</span><span className={e.type === "locked_click" || e.type === "cta_click" ? "text-[var(--brand-accent)]" : "text-[var(--text-primary)]"}><b>{e.lead}</b> {evText(e)}</span></div>
            ))}
            {data && data.activity.length === 0 && <p className="py-2 text-[var(--text-muted)]">Nothing yet.</p>}
          </div>
        </div>
        <div className={card}>
          <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">What leads reach for</h2>
          <div className="space-y-3">
            {(data?.signals ?? []).map((s) => (
              <div key={s.feature}><div className="mb-1 flex justify-between text-sm text-[var(--text-primary)]"><span>{s.feature}</span><span className="font-mono">{s.count}</span></div><div className="h-2 rounded-full bg-[var(--hover-bg)]"><div className="h-2 rounded-full bg-[var(--brand-accent)]" style={{ width: `${Math.round((s.count / (data!.signals[0]?.count || 1)) * 100)}%` }} /></div></div>
            ))}
            {data && data.signals.length === 0 && <p className="text-sm text-[var(--text-muted)]">No locked-feature taps yet.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
