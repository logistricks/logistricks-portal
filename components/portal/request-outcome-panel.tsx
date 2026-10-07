"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { BadgeCheck, CheckCircle2, Loader2, Package, Save, Trophy, XCircle } from "lucide-react"

type Quotation = { id: number; carrier_quote_id: number; quotation_number: string | null; base_rate_usd: number | null; final_price_usd: number | null; status: string; created_at: string }
type Option = { carrier_quote_id: number; carrier_name: string; cost_usd: number | null; currency: string; received_at: string; quotations: Quotation[] }
type Saved = Record<string, any>
type Outcome = "won" | "lost" | "expired" | "cancelled" | null

const REASONS: [string, string][] = [["price", "Price"], ["transit_time", "Transit time"], ["service", "Service"], ["no_response", "No response"], ["cargo_cancelled", "Cargo cancelled"], ["other", "Other"]]
const usd = (n: number | null | undefined) => n == null ? "—" : `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function Check({ on, onChange, disabled, children, tone = "var(--brand-accent)" }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; children: React.ReactNode; tone?: string }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors" style={{
      border: `1px solid ${on ? tone : "var(--card-border)"}`, background: on ? `color-mix(in srgb, ${tone} 12%, var(--card-bg))` : "var(--card-bg)",
      color: on ? tone : "var(--text-secondary)", opacity: disabled ? 0.6 : 1, cursor: disabled ? "not-allowed" : "pointer",
    }}>
      <input type="checkbox" className="h-4 w-4" style={{ accentColor: tone }} checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  )
}

/** After quoting: what happened to the deal — won (which carrier quote, at what price), what was booked, invoiced, paid. */
export function RequestOutcomePanel({ requestId, refreshSignal, status }: { requestId: string; refreshSignal?: number; status?: string }) {
  const [loading, setLoading] = useState(true)
  const [options, setOptions] = useState<Option[]>([])
  const [canEdit, setCanEdit] = useState(true)
  const [saved, setSaved] = useState<Saved>({})
  const [outcome, setOutcome] = useState<Outcome>(null)
  const [reason, setReason] = useState("")
  const [note, setNote] = useState("")
  const [cqId, setCqId] = useState<number | null>(null)
  const [qtId, setQtId] = useState<number | null>(null)
  const [sell, setSell] = useState("")
  const [booked, setBooked] = useState(false)
  const [bookRef, setBookRef] = useState("")
  const [bookWhat, setBookWhat] = useState("")
  const [invoiced, setInvoiced] = useState(false)
  const [paid, setPaid] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const fill = useCallback((s: Saved) => {
    setSaved(s)
    setOutcome((s.outcome ?? null) as Outcome)
    setReason(s.outcome_reason ?? ""); setNote(s.outcome_note ?? "")
    setCqId(s.won_carrier_quote_id ?? null); setQtId(s.won_quotation_id ?? null)
    setSell(s.won_sell_usd != null ? String(s.won_sell_usd) : "")
    setBooked(!!s.booked_at); setBookRef(s.booking_reference ?? ""); setBookWhat(s.booking_description ?? "")
    setInvoiced(!!s.invoiced_at); setPaid(!!s.paid_at)
  }, [])

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/request-outcome?freight_request_id=${encodeURIComponent(requestId)}`, { cache: "no-store" })
      if (!r.ok) throw new Error()
      const j = await r.json()
      setOptions(j.options ?? []); setCanEdit(j.can_edit !== false); fill(j.saved ?? {})
    } catch { /* panel stays empty */ } finally { setLoading(false) }
  }, [requestId, fill])
  useEffect(() => { void load() }, [load, refreshSignal])

  const chosen = options.find((o) => o.carrier_quote_id === cqId) ?? null
  // Which quotation carries the price: the one picked, otherwise the newest built for that carrier quote.
  const quotation = useMemo(() => chosen?.quotations.find((q) => q.id === qtId) ?? chosen?.quotations[0] ?? null, [chosen, qtId])

  function pick(o: Option) {
    setCqId(o.carrier_quote_id)
    const q = o.quotations.find((x) => x.status === "sent") ?? o.quotations[0] ?? null
    setQtId(q?.id ?? null)
    setSell(q?.final_price_usd != null ? String(q.final_price_usd) : "")
  }
  function pickQuotation(id: number) {
    setQtId(id)
    const q = chosen?.quotations.find((x) => x.id === id)
    if (q?.final_price_usd != null) setSell(String(q.final_price_usd))
  }

  const cost = chosen?.cost_usd ?? null
  const sellNum = sell.trim() === "" ? null : Number(sell)
  const margin = sellNum != null && Number.isFinite(sellNum) && cost != null ? Math.round((sellNum - cost) * 100) / 100 : null

  async function save() {
    setMsg(null)
    if (outcome === "won" && !cqId && options.length) { setMsg({ ok: false, text: "Choose which carrier quote won." }); return }
    if (outcome === "won" && booked && !bookRef.trim()) { setMsg({ ok: false, text: "Add the booking reference, or untick “Booked”." }); return }
    setBusy(true)
    try {
      const r = await fetch("/api/request-outcome", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          freight_request_id: requestId, outcome, outcome_reason: reason, outcome_note: note,
          won_carrier_quote_id: cqId, won_quotation_id: quotation?.id ?? qtId, won_sell_usd: sellNum != null && Number.isFinite(sellNum) ? sellNum : null,
          booked, booking_reference: bookRef, booking_description: bookWhat,
          invoiced, paid,
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || "Could not save")
      setMsg({ ok: true, text: "Saved" }); await load()
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not save" }) } finally { setBusy(false) }
  }

  if (loading) return null
  // Only once there is something to decide: a quote came in, the RFQ is out, or an outcome was already saved.
  if (!options.length && !saved.outcome && !["Sent to Carrier", "Quoted", "Closed"].includes(status ?? "")) return null
  const dis = !canEdit
  const tone = outcome === "won" ? "#16a34a" : outcome === "lost" ? "#ef4444" : "#64748b"

  return (
    <div className="ds-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5" style={{ borderBottom: "1px solid var(--divider)" }}>
        <h4 className="flex items-center gap-2 text-sm font-bold" style={{ color: "var(--text-primary)" }}><Trophy className="h-4 w-4" style={{ color: "var(--brand-accent)" }} /> Outcome &amp; Booking</h4>
        {saved.outcome && <span className="rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase" style={{ background: `color-mix(in srgb, ${tone} 15%, transparent)`, color: tone }}>{saved.outcome}</span>}
      </div>
      <div className="space-y-4 px-5 py-4">
        <div className="flex flex-wrap gap-2">
          <Check on={outcome === "won"} onChange={(v) => setOutcome(v ? "won" : null)} disabled={dis} tone="#16a34a"><CheckCircle2 className="h-4 w-4" /> Quotation approved — WON</Check>
          <Check on={outcome === "lost"} onChange={(v) => setOutcome(v ? "lost" : null)} disabled={dis} tone="#ef4444"><XCircle className="h-4 w-4" /> Lost</Check>
          <Check on={outcome === "expired"} onChange={(v) => setOutcome(v ? "expired" : null)} disabled={dis} tone="#64748b">Expired</Check>
          <Check on={outcome === "cancelled"} onChange={(v) => setOutcome(v ? "cancelled" : null)} disabled={dis} tone="#64748b">Cancelled</Check>
        </div>

        {outcome === "won" && (
          <>
            <div>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Which carrier quote won?</p>
              {options.length === 0 ? <p className="text-sm" style={{ color: "var(--text-muted)" }}>No carrier quotes on this request yet.</p> : (
                <div className="space-y-1.5">
                  {options.map((o) => {
                    const q = o.quotations.find((x) => x.status === "sent") ?? o.quotations[0]
                    const on = cqId === o.carrier_quote_id
                    return (
                      <label key={o.carrier_quote_id} className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-3 py-2.5 text-sm" style={{ border: `1px solid ${on ? "#16a34a" : "var(--card-border)"}`, background: on ? "color-mix(in srgb, #16a34a 10%, var(--card-bg))" : "var(--card-bg)", opacity: dis ? 0.7 : 1 }}>
                        <input type="radio" name="won-quote" className="h-4 w-4" style={{ accentColor: "#16a34a" }} checked={on} disabled={dis} onChange={() => pick(o)} />
                        <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{o.carrier_name}</span>
                        <span className="tabular-nums" style={{ color: "var(--text-secondary)" }}>Carrier price {o.cost_usd != null ? usd(o.cost_usd) : "not computed"}</span>
                        {q ? <span className="tabular-nums" style={{ color: "var(--text-secondary)" }}>→ Quotation {q.quotation_number ?? `#${q.id}`}: <b style={{ color: "var(--text-primary)" }}>{usd(q.final_price_usd)}</b>{q.status === "sent" ? " (sent)" : " (draft)"}</span>
                          : <span style={{ color: "#d97706" }}>No quotation built yet</span>}
                      </label>
                    )
                  })}
                </div>
              )}
            </div>

            {chosen && (
              <div className="rounded-lg p-3" style={{ border: "1px solid var(--card-border)", background: "var(--table-header-bg)" }}>
                <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
                  {chosen.quotations.length > 1 && (
                    <label className="text-xs" style={{ color: "var(--text-muted)" }}>Quotation
                      <select disabled={dis} value={quotation?.id ?? ""} onChange={(e) => pickQuotation(Number(e.target.value))} className="mt-1 block h-8 rounded-md px-2 text-sm" style={{ border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--text-primary)" }}>
                        {chosen.quotations.map((q) => <option key={q.id} value={q.id}>{q.quotation_number ?? `#${q.id}`} — {usd(q.final_price_usd)}</option>)}
                      </select>
                    </label>
                  )}
                  <div><p className="text-xs" style={{ color: "var(--text-muted)" }}>Carrier price (cost)</p><p className="text-base font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{cost != null ? usd(cost) : "—"}</p></div>
                  <label className="text-xs" style={{ color: "var(--text-muted)" }}>Won price (sold at, USD)
                    <input disabled={dis} inputMode="decimal" value={sell} onChange={(e) => setSell(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="from the quotation" className="mt-1 block h-8 w-36 rounded-md px-2 text-sm font-bold tabular-nums" style={{ border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--text-primary)" }} />
                  </label>
                  <div><p className="text-xs" style={{ color: "var(--text-muted)" }}>Margin (markup)</p><p className="text-base font-bold tabular-nums" style={{ color: margin == null ? "var(--text-muted)" : margin >= 0 ? "#16a34a" : "#ef4444" }}>{margin == null ? "—" : `${margin >= 0 ? "+" : ""}${usd(margin)}`}{margin != null && cost ? <span className="ml-1 text-xs font-semibold">({((margin / cost) * 100).toFixed(1)}%)</span> : null}</p></div>
                </div>
                <p className="mt-2 text-[11px]" style={{ color: "var(--text-muted)" }}>The won price is read from the quotation (carrier price + your markup). Type another figure only if the requester agreed a different price.</p>
              </div>
            )}

            <div className="space-y-3">
              <Check on={booked} onChange={setBooked} disabled={dis} tone="#0ea5e9"><Package className="h-4 w-4" /> Booked</Check>
              {booked && (
                <div className="grid gap-3 sm:grid-cols-3" style={{ animation: "lt-drop-in .16s ease-out" }}>
                  <label className="text-xs" style={{ color: "var(--text-muted)" }}>Booking reference
                    <input disabled={dis} value={bookRef} onChange={(e) => setBookRef(e.target.value)} placeholder="e.g. MAEU123456789" className="mt-1 block h-9 w-full rounded-md px-2 text-sm font-mono" style={{ border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--text-primary)" }} />
                  </label>
                  <label className="text-xs sm:col-span-2" style={{ color: "var(--text-muted)" }}>What was booked
                    <input disabled={dis} value={bookWhat} onChange={(e) => setBookWhat(e.target.value)} placeholder="e.g. 1×40HC Jebel Ali → Aqaba, vessel / ETD, container no." className="mt-1 block h-9 w-full rounded-md px-2 text-sm" style={{ border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--text-primary)" }} />
                  </label>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Check on={invoiced} onChange={(v) => { setInvoiced(v); if (!v) setPaid(false) }} disabled={dis} tone="#8b5cf6">Invoiced</Check>
                <Check on={paid} onChange={(v) => { setPaid(v); if (v) setInvoiced(true) }} disabled={dis} tone="#16a34a"><BadgeCheck className="h-4 w-4" /> Paid</Check>
              </div>
            </div>
          </>
        )}

        {outcome === "lost" && (
          <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Why was it lost?</p>
            <div className="flex flex-wrap gap-1.5">
              {REASONS.map(([k, l]) => (
                <button key={k} type="button" disabled={dis} aria-pressed={reason === k} onClick={() => setReason(reason === k ? "" : k)} className="rq-chip-btn rounded-full px-3 py-1 text-xs font-semibold"
                  style={{ border: `1px solid ${reason === k ? "#ef4444" : "var(--card-border)"}`, background: reason === k ? "color-mix(in srgb, #ef4444 14%, var(--card-bg))" : "var(--card-bg)", color: reason === k ? "#ef4444" : "var(--text-secondary)" }}>{l}</button>
              ))}
            </div>
          </div>
        )}

        {outcome && (
          <label className="block text-xs" style={{ color: "var(--text-muted)" }}>Note (optional)
            <textarea disabled={dis} value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-1 block w-full rounded-md px-2 py-1.5 text-sm" style={{ border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--text-primary)" }} />
          </label>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button onClick={save} disabled={busy || dis} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50" style={{ background: "var(--brand-accent)" }}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save outcome
          </button>
          {dis && <span className="text-xs" style={{ color: "var(--text-muted)" }}>Viewers can look but not change this.</span>}
          {msg && <span className="text-xs font-semibold" style={{ color: msg.ok ? "#16a34a" : "#ef4444" }}>{msg.text}</span>}
          {saved.outcome_at && !msg && <span className="text-xs" style={{ color: "var(--text-muted)" }}>Last saved by {saved.outcome_by ?? "—"}</span>}
        </div>
      </div>
    </div>
  )
}
