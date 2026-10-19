"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, CheckCircle2, Clock, Copy, ExternalLink, Loader2, Mail, Send, X, XCircle, Zap } from "lucide-react"
import type { Carrier, CarrierRow } from "@/lib/portal-data"
import { groupCarrierRows } from "@/components/portal/send-to-carriers-modal"
import { rankCarriers, type Match } from "@/lib/carrier-match"
import { FitTag, fitHint } from "@/components/portal/suggested-badge"
import { MissingFieldsConfirm, fetchReadiness, type Readiness } from "@/components/portal/missing-fields-confirm"

type Draft = { carrier_id: number; carrier_name: string; to: string; cc: string[]; subject: string; body: string }
type Result = { carrier_id: number; carrier_name: string; email: string; status: "sent" | "failed" | "pending"; error?: string | null }
type LegInfo = { index: number; label: string; modes: string[]; origin_country: string; destination_country: string }
type Info = { options?: boolean; legs?: LegInfo[]; missing_required?: string[] | null; smtp: { configured: boolean; enabled: boolean }; n8n: boolean; default_template_id?: number | null; templates: { template_id: number; template_name: string; is_default: boolean; default_sea?: boolean; default_air?: boolean; default_land?: boolean; default_multi?: boolean }[] }

const btn = "inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
const field = { border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--text-primary)" } as const

export function SendRfqDialog({ requestId, modes, originCountry, destinationCountry, onClose, onDone, onReplyToSender }: { requestId: string; modes: string[]; originCountry?: string; destinationCountry?: string; onClose: () => void; onDone: () => void; onReplyToSender?: () => void }) {
  const [rows, setRows] = useState<CarrierRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [info, setInfo] = useState<Info | null>(null)
  const [leg, setLeg] = useState<string>("0") // multi-leg requests: a leg number - 1, or "all" = one email for every leg
  const [templateId, setTemplateId] = useState<string>("")
  const [step, setStep] = useState<"select" | "manual" | "result">("select")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ info: Readiness; run: () => void } | null>(null)
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [result, setResult] = useState<{ method: string; sent: number; total: number; results: Result[]; n8n?: { ok: boolean; error?: string } | null } | null>(null)

  useEffect(() => {
    fetch("/api/carriers").then((r) => (r.ok ? r.json() : [])).then((rs: CarrierRow[]) => setRows(rs)).catch(() => {}).finally(() => setLoading(false))
  }, [])
  // (re)load the request's sending info; the default template depends on the leg
  useEffect(() => {
    fetch(`/api/requests/${requestId}/send-rfq?leg=${leg}`).then((r) => (r.ok ? r.json() : null)).then((d: Info | null) => {
      if (d) { setInfo(d); if (d.options && leg === "0") setLeg("all") /* alternatives: one email for every destination by default */; const def = d.templates.find((t) => t.template_id === d.default_template_id) ?? d.templates.find((t) => t.is_default) ?? d.templates[0]; if (def) setTemplateId(String(def.template_id)) }
    }).catch(() => {})
  }, [requestId, leg])

  const legs = info?.legs ?? []
  const multi = legs.length > 1
  const options = !!info?.options // the "legs" are alternative destinations of one shipment
  // carriers are ranked for the chosen leg's mode and countries (for "all legs": every mode of the request, no country filter)
  const scope = useMemo(() => {
    const l = leg === "all" ? null : legs.find((x) => String(x.index) === leg)
    if (l) return { modes: l.modes, originCountry: l.origin_country || undefined, destinationCountry: l.destination_country || undefined }
    if (leg === "all") return { modes: Array.from(new Set(legs.flatMap((x) => x.modes))), originCountry: undefined, destinationCountry: undefined }
    return { modes, originCountry, destinationCountry }
  }, [leg, legs, modes, originCountry, destinationCountry])
  const carriers = useMemo(() => rankCarriers(groupCarrierRows(rows).filter((c) => c.email), scope), [rows, scope])
  // pre-tick the suggested carriers so the common case is one click
  useEffect(() => { setSelected(new Set(carriers.filter((x) => x.match.suggested).map((x) => x.carrier.carrier_id))) }, [carriers])

  const ids = useMemo(() => Array.from(selected), [selected])
  const suggestedIds = useMemo(() => carriers.filter((x) => x.match.suggested).map((x) => x.carrier.carrier_id), [carriers])
  const toggle = (id: number) => setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const missingRequired = info?.missing_required ?? []
  /** Runs the action straight away, or after a confirmation pop-up when mandatory fields are still missing. */
  async function guarded(run: () => void) {
    setBusy(true)
    const r = await fetchReadiness(requestId) // also covers older untyped requests (their saved missing list)
    setBusy(false)
    if (r && r.missing.length) { setConfirm({ info: r, run }); return }
    if (!r && missingRequired.length) { setConfirm({ info: { missing: missingRequired, sender_name: "", sender_email: "", source: "Email", asked: null }, run }); return }
    run()
  }
  const autoReady = !!info?.smtp.configured && !!info?.smtp.enabled && !!info?.n8n && (!multi || options) // alternatives go out as one email per carrier, also automatically; real multi-leg requests are sent manually for now

  async function prepareManual() {
    setBusy(true); setError(null)
    try {
      const r = await fetch(`/api/requests/${requestId}/send-rfq?leg=${leg}&carrier_ids=${ids.join(",")}${templateId ? `&template_id=${templateId}` : ""}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? "Could not prepare the emails")
      if (!d.drafts?.length) throw new Error("There is no RFQ email template yet. Create one on the Templates page (tag it Default).")
      setDrafts(d.drafts); setStep("manual")
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  async function send(method: "manual" | "automatic") {
    setBusy(true); setError(null)
    try {
      const r = await fetch(`/api/requests/${requestId}/send-rfq`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, leg: multi ? leg : undefined, carrier_ids: ids, template_id: templateId ? Number(templateId) : undefined, drafts: method === "manual" ? drafts : undefined }),
      })
      const d = await r.json().catch(() => ({}))
      if (d.results) { setResult(d); setStep("result"); onDone(); return }
      throw new Error(d.message ?? d.error ?? `Failed (${r.status})`)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  const setDraft = (i: number, patch: Partial<Draft>) => setDrafts((p) => p.map((d, k) => (k === i ? { ...d, ...patch } : d)))
  const mailto = (d: Draft) => `mailto:${encodeURIComponent(d.to)}?${d.cc.length ? `cc=${encodeURIComponent(d.cc.join(","))}&` : ""}subject=${encodeURIComponent(d.subject)}&body=${encodeURIComponent(d.body)}`

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[88vh] w-full max-w-xl flex-col rounded-xl shadow-2xl" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid var(--divider)" }}>
          <div>
            <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Send to carriers</h3>
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              {step === "select" ? "Choose carriers, then how to send" : step === "manual" ? "Review, send from your own mail, then log it" : "Result"}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ color: "var(--text-muted)" }}><X className="h-4 w-4" /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {step === "select" && (
            <div className="space-y-3">
              {multi && (
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{options ? "Destinations in this email" : "This email is about"}</label>
                  <div className="flex flex-wrap gap-1.5">
                    {[...legs.map((l) => ({ key: String(l.index), label: l.label })), { key: "all", label: options ? "All options in one email" : "All legs in one email" }].map((o) => (
                      <button key={o.key} type="button" onClick={() => setLeg(o.key)} className="rounded-full px-3 py-1 text-[11.5px] font-bold"
                        style={leg === o.key ? { background: "var(--brand-accent)", color: "#fff" } : { border: "1px solid var(--card-border)", color: "var(--text-secondary)" }}>{o.label}</button>
                    ))}
                  </div>
                </div>
              )}
              {loading ? (
                <div className="flex items-center gap-2 py-4 text-xs" style={{ color: "var(--text-muted)" }}><Loader2 className="h-4 w-4 animate-spin" /> Loading carriers…</div>
              ) : carriers.length === 0 ? (
                <p className="py-4 text-xs" style={{ color: "var(--text-muted)" }}>No active carriers with an email address match this request&apos;s mode.</p>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Carriers{suggestedIds.length > 0 ? ` · ${suggestedIds.length} suggested` : ""}</span>
                    <div className="flex gap-3">
                      {suggestedIds.length > 0 && <button className="text-[11px] font-semibold" style={{ color: "var(--brand-accent)" }} onClick={() => setSelected(new Set(suggestedIds))}>Select suggested</button>}
                      <button className="text-[11px] font-semibold" style={{ color: "var(--brand-accent)" }} onClick={() => setSelected(selected.size === carriers.length ? new Set() : new Set(carriers.map((x) => x.carrier.carrier_id)))}>
                        {selected.size === carriers.length ? "Clear" : "Select all"}
                      </button>
                    </div>
                  </div>
                  <ul className="overflow-hidden rounded-lg" style={{ border: "1px solid var(--card-border)" }}>
                    {carriers.map(({ carrier: c, match }) => (
                      <li key={c.carrier_id} style={{ borderBottom: "1px solid var(--divider)" }}>
                        <label className="flex cursor-pointer items-center gap-3 px-3 py-2">
                          <input type="checkbox" checked={selected.has(c.carrier_id)} onChange={() => toggle(c.carrier_id)} className="h-4 w-4 accent-[var(--brand-accent)]" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{c.carrier_name}{c.person_name ? <span className="font-normal" style={{ color: "var(--text-muted)" }}> — {c.person_name}</span> : null}<FitTag match={match} /></p>
                            <p className="truncate text-[11px]" style={{ color: "var(--text-muted)" }}>{c.email} · {fitHint(match)}</p>
                          </div>
                        </label>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {info && info.templates.length > 0 && (
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>RFQ template</label>
                  <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="h-8 w-full rounded-md px-2 text-xs outline-none" style={field}>
                    {info.templates.map((t) => <option key={t.template_id} value={t.template_id}>{t.template_name}{t.template_id === info.default_template_id ? " (default)" : ""}</option>)}
                  </select>
                </div>
              )}
              {missingRequired.length > 0 && (
                <div className="rounded-md px-3 py-2 text-[11px]" style={{ background: "rgb(245 158 11 / 0.12)", color: "var(--text-secondary)" }}>
                  <p className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "#d97706" }} /><span><b>Not ready to quote.</b> Still missing: {missingRequired.join(", ")}. You will be asked to confirm before sending.</span></p>
                </div>
              )}
              {info && !autoReady && (
                <p className="flex items-start gap-2 rounded-md px-3 py-2 text-[11px]" style={{ background: "rgb(245 158 11 / 0.12)", color: "var(--text-secondary)" }}>
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "#d97706" }} />
                  {multi ? "This request has more than one leg, so it is sent manually: one email per leg, or one email for all legs." : !info.smtp.configured || !info.smtp.enabled ? "Automatic sending needs your email server. Set it up in Settings → Email server." : "The automatic sending workflow is not connected yet (N8N_RFQ_WEBHOOK_URL)."} You can still send manually.
                </p>
              )}
            </div>
          )}

          {step === "manual" && (
            <div className="space-y-3">
              <p className="rounded-md px-3 py-2 text-[11px]" style={{ background: "var(--table-header-bg, var(--divider))", color: "var(--text-secondary)" }}>
                Send each email from your own mail app (open it, or copy it). Keep the request number in the subject so the carrier&apos;s reply links back. When all are sent, press <b>Log as sent</b>.
              </p>
              {drafts.map((d, i) => (
                <div key={d.carrier_id} className="space-y-2 rounded-lg p-3" style={{ border: "1px solid var(--card-border)" }}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>{d.carrier_name} <span className="font-normal" style={{ color: "var(--text-muted)" }}>· {d.to}</span></p>
                    <div className="flex gap-1.5">
                      <a href={mailto(d)} className={btn} style={{ border: "1px solid var(--card-border)", color: "var(--text-primary)" }}><ExternalLink className="h-3 w-3" /> Open in mail</a>
                      <button className={btn} style={{ border: "1px solid var(--card-border)", color: "var(--text-primary)" }} onClick={() => navigator.clipboard?.writeText(`To: ${d.to}\nSubject: ${d.subject}\n\n${d.body}`)}><Copy className="h-3 w-3" /> Copy</button>
                    </div>
                  </div>
                  <input value={d.subject} onChange={(e) => setDraft(i, { subject: e.target.value })} className="h-8 w-full rounded-md px-2 text-xs outline-none" style={field} />
                  <textarea value={d.body} rows={7} onChange={(e) => setDraft(i, { body: e.target.value })} className="w-full resize-y rounded-md p-2 text-xs outline-none" style={field} />
                </div>
              ))}
            </div>
          )}

          {step === "result" && result && (
            <div className="space-y-3">
              <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                {result.method === "automatic" ? "Automatic send" : "Logged manual send"}: {result.sent} of {result.total} carrier{result.total !== 1 ? "s" : ""} {result.method === "automatic" ? "sent" : "logged"}.
              </p>
              {result.n8n && !result.n8n.ok && <p className="rounded-md px-3 py-2 text-[11px]" style={{ background: "rgb(239 68 68 / 0.1)", color: "#ef4444" }}>The sending workflow reported a problem: {result.n8n.error}</p>}
              <ul className="overflow-hidden rounded-lg" style={{ border: "1px solid var(--card-border)" }}>
                {result.results.map((r) => (
                  <li key={r.carrier_id} className="flex items-start gap-2 px-3 py-2" style={{ borderBottom: "1px solid var(--divider)" }}>
                    {r.status === "sent" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "#10b981" }} /> : r.status === "pending" ? <Clock className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "#d97706" }} /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "#ef4444" }} />}
                    <div className="min-w-0">
                      <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{r.carrier_name} <span className="font-normal" style={{ color: "var(--text-muted)" }}>· {r.email}</span></p>
                      {r.error && <p className="text-[11px]" style={{ color: r.status === "failed" ? "#ef4444" : "var(--text-muted)" }}>{r.error}</p>}
                    </div>
                  </li>
                ))}
              </ul>
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Every send is recorded under Auto-reply logs → To Carriers and in the request timeline.</p>
            </div>
          )}

          {error && <p className="mt-3 rounded-md px-3 py-2 text-[11px]" style={{ background: "rgb(239 68 68 / 0.1)", color: "#ef4444" }}>{error}</p>}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3" style={{ borderTop: "1px solid var(--divider)" }}>
          {step === "select" && (<>
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{selected.size ? `${selected.size} selected` : "No carriers selected"}</span>
            <div className="flex gap-2">
              <button className={btn} style={{ border: "1px solid var(--card-border)", color: "var(--text-primary)" }} onClick={() => void guarded(() => void prepareManual())} disabled={!selected.size || busy}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />} Send manually
              </button>
              <button className={`${btn} text-white`} style={{ background: "var(--brand-accent)" }} onClick={() => void guarded(() => void send("automatic"))} disabled={!selected.size || busy || !autoReady} title={autoReady ? "" : "Needs your email server and the sending workflow"}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />} Send automatically
              </button>
            </div>
          </>)}
          {step === "manual" && (<>
            <button className={btn} style={{ border: "1px solid var(--card-border)", color: "var(--text-primary)" }} onClick={() => setStep("select")} disabled={busy}>Back</button>
            <button className={`${btn} text-white`} style={{ background: "var(--brand-accent)" }} onClick={() => send("manual")} disabled={busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Log as sent
            </button>
          </>)}
          {step === "result" && (<><span /><button className={`${btn} text-white`} style={{ background: "var(--brand-accent)" }} onClick={onClose}>Close</button></>)}
        </div>
      </div>
      {confirm && (
        <MissingFieldsConfirm info={confirm.info} action="ask carriers for a quotation"
          onCancel={() => setConfirm(null)}
          onContinue={() => { const run = confirm.run; setConfirm(null); run() }}
          onReply={onReplyToSender ? () => { setConfirm(null); onReplyToSender() } : undefined} />
      )}
    </div>
  )
}
