"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { BadgeCheck, CheckCircle2, Loader2, Package, Save, Trophy, XCircle } from "lucide-react"

type Quotation = { id: number; carrier_quote_id: number; quotation_number: string | null; base_rate_usd: number | null; final_price_usd: number | null; status: string; created_at: string }
type Option = { leg_index?: number | null; carrier_quote_id: number; carrier_name: string; cost_usd: number | null; currency: string; received_at: string; quotations: Quotation[] }
type Saved = Record<string, any>
/** One won destination option (a request with several options can win more than one). */
type Win = { qtId: number | null; sell: string; booked: boolean; ref: string; what: string; invoiced: boolean; paid: boolean; booked_at?: string | null; invoiced_at?: string | null; paid_at?: string | null }
type Outcome = "won" | "lost" | "expired" | "cancelled" | null

const REASONS: [string, string][] = [["price", "Price"], ["transit_time", "Transit time"], ["service", "Service"], ["no_response", "No response"], ["cargo_cancelled", "Cargo cancelled"], ["other", "Other"]]
const usd = (n: number | null | undefined) => n == null ? "—" : `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function Check({ on, onChange, disabled, children, tone = "var(--brand-accent)" }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; children: React.ReactNode; tone?: string }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors" style={{
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
  const [optionLabels, setOptionLabels] = useState<string[]>([])
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
  const [wins, setWins] = useState<Record<number, Win>>({})
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
    const w: Record<number, Win> = {}
    for (const e of Array.isArray(s.won_options) ? s.won_options : []) w[Number(e.carrier_quote_id)] = {
      qtId: e.quotation_id ?? null, sell: e.sell_usd != null ? String(e.sell_usd) : "", booked: !!e.booked_at, ref: e.booking_reference ?? "", what: e.booking_description ?? "",
      invoiced: !!e.invoiced_at, paid: !!e.paid_at, booked_at: e.booked_at ?? null, invoiced_at: e.invoiced_at ?? null, paid_at: e.paid_at ?? null,
    }
    setWins(w)
  }, [])

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/request-outcome?freight_request_id=${encodeURIComponent(requestId)}`, { cache: "no-store" })
      if (!r.ok) throw new Error()
      const j = await r.json()
      setOptions(j.options ?? []); setOptionLabels(j.option_labels ?? []); setCanEdit(j.can_edit !== false); fill(j.saved ?? {})
    } catch { /* panel stays empty */ } finally { setLoading(false) }
  }, [requestId, fill])
  useEffect(() => { void load() }, [load, refreshSignal])

  // several destination options: the quotes are listed under their option (a quote that covers all of them first)
  const multi = optionLabels.length > 1
  const optionGroup = (o: Option) => o.leg_index == null ? "All options" : `Option ${o.leg_index + 1} · ${optionLabels[o.leg_index] || "destination not set"}`
  const orderedOptions = multi ? [...options].sort((a, b) => (a.leg_index ?? -1) - (b.leg_index ?? -1)) : options
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

  // several options: any number of them can be won, one carrier quote per option
  const sameGroup = (a: Option, b: Option) => (a.leg_index ?? -1) === (b.leg_index ?? -1)
  function toggleWin(o: Option, on: boolean) {
    setWins((cur) => {
      const next = { ...cur }
      for (const x of options) if (sameGroup(x, o)) delete next[x.carrier_quote_id]
      if (on) {
        const q = o.quotations.find((x) => x.status === "sent") ?? o.quotations[0] ?? null
        next[o.carrier_quote_id] = { qtId: q?.id ?? null, sell: q?.final_price_usd != null ? String(q.final_price_usd) : "", booked: false, ref: "", what: "", invoiced: false, paid: false }
      }
      return next
    })
  }
  const setWin = (id: number, patch: Partial<Win>) => setWins((cur) => ({ ...cur, [id]: { ...cur[id], ...patch } }))
  const wonList = orderedOptions.filter((o) => wins[o.carrier_quote_id])
  const totals = wonList.reduce((t, o) => { const w = wins[o.carrier_quote_id]; const sv = w.sell.trim() === "" ? null : Number(w.sell); return { sell: t.sell + (sv != null && Number.isFinite(sv) ? sv : 0), cost: t.cost + (o.cost_usd ?? 0) } }, { sell: 0, cost: 0 })

  const cost = chosen?.cost_usd ?? null
  const sellNum = sell.trim() === "" ? null : Number(sell)
  const margin = sellNum != null && Number.isFinite(sellNum) && cost != null ? Math.round((sellNum - cost) * 100) / 100 : null

  async function save() {
    setMsg(null)
    if (outcome === "won" && multi) {
      if (!wonList.length) { setMsg({ ok: false, text: "Choose at least one winning carrier quote." }); return }
      if (wonList.some((o) => wins[o.carrier_quote_id].booked && !wins[o.carrier_quote_id].ref.trim())) { setMsg({ ok: false, text: "Add the booking reference, or untick “Booked”." }); return }
    } else if (outcome === "won" && !cqId && options.length) { setMsg({ ok: false, text: "Choose which carrier quote won." }); return }
    if (outcome === "won" && !multi && booked && !bookRef.trim()) { setMsg({ ok: false, text: "Add the booking reference, or untick “Booked”." }); return }
    setBusy(true)
    try {
      const r = await fetch("/api/request-outcome", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          freight_request_id: requestId, outcome, outcome_reason: reason, outcome_note: note,
          won_carrier_quote_id: cqId, won_quotation_id: quotation?.id ?? qtId, won_sell_usd: sellNum != null && Number.isFinite(sellNum) ? sellNum : null,
          booked, booking_reference: bookRef, booking_description: bookWhat,
          invoiced, paid,
          ...(multi || saved.won_options ? { won_options: outcome === "won" && multi ? wonList.map((o) => { const w = wins[o.carrier_quote_id]; return { carrier_quote_id: o.carrier_quote_id, quotation_id: w.qtId, sell_usd: w.sell.trim() === "" ? null : Number(w.sell), booked: w.booked, booking_reference: w.ref, booking_description: w.what, invoiced: w.invoiced, paid: w.paid, booked_at: w.booked_at, invoiced_at: w.invoiced_at, paid_at: w.paid_at } }) : null } : {}),
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || "Could not save")
      setMsg({ ok: true, text: "Saved" }); await load()
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not save" }) } finally { setBusy(false) }
  }

  if (loading) return null
  // Only once there is something to decide: a quote came in, the RFQ is out, or an outcome was already saved.
  if (!options.length && !saved.outcome && !["Sent to Carrier", "Quoted", "Closed"].includes(status ?? "")) return <p className="py-1 text-center text-xs font-semibold text-white/60">This request has not been quoted yet.</p>
  const dis = !canEdit
  const tone = outcome === "won" ? "#16a34a" : outcome === "lost" ? "#ef4444" : "#64748b"

  return (
    <div className="ds-card overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
        <h4 className="flex items-center gap-1.5 text-sm font-bold" style={{ color: "var(--text-primary)" }}><Trophy className="h-4 w-4" style={{ color: "var(--brand-accent)" }} /> Outcome &amp; Booking</h4>
        <div className="flex flex-wrap gap-1.5">
          <Check on={outcome === "won"} onChange={(v) => setOutcome(v ? "won" : null)} disabled={dis} tone="#16a34a"><CheckCircle2 className="h-3.5 w-3.5" /> Won</Check>
          <Check on={outcome === "lost"} onChange={(v) => setOutcome(v ? "lost" : null)} disabled={dis} tone="#ef4444"><XCircle className="h-3.5 w-3.5" /> Lost</Check>
          <Check on={outcome === "expired"} onChange={(v) => setOutcome(v ? "expired" : null)} disabled={dis} tone="#64748b">Expired</Check>
          <Check on={outcome === "cancelled"} onChange={(v) => setOutcome(v ? "cancelled" : null)} disabled={dis} tone="#64748b">Cancelled</Check>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {dis && <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>View only</span>}
          {msg && <span className="text-xs font-semibold" style={{ color: msg.ok ? "#16a34a" : "#ef4444" }}>{msg.text}</span>}
          {saved.outcome_at && !msg && <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>Saved by {saved.outcome_by ?? "—"}</span>}
          {saved.outcome && <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{ background: `color-mix(in srgb, ${tone} 15%, transparent)`, color: tone }}>{saved.outcome === "won" ? `won${multi && Array.isArray(saved.won_options) && saved.won_options.some((e: any) => e.leg_index != null) ? ` · ${saved.won_options.length > 1 ? "options" : "option"} ${saved.won_options.map((e: any) => e.leg_index == null ? "all" : e.leg_index + 1).join(" + ")}` : ""} · ${saved.paid_at ? "paid" : saved.invoiced_at ? "invoiced" : saved.booked_at ? "booked" : "to book"}` : saved.outcome}</span>}
          <button onClick={save} disabled={busy || dis} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold text-white disabled:opacity-50" style={{ background: "var(--brand-accent)" }}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
          </button>
        </div>
      </div>
      {outcome && (
      <div className="space-y-3 border-t px-4 py-3" style={{ borderColor: "var(--divider)" }}>

        {outcome === "won" && (
          <>
            <div>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{multi ? "Which options were won, and with which carrier quote? (tick one quote per option)" : "Which carrier quote won?"}</p>
              {options.length === 0 ? <p className="text-sm" style={{ color: "var(--text-muted)" }}>No carrier quotes on this request yet.</p> : (
                <div className="space-y-1.5">
                  {orderedOptions.map((o, idx) => {
                    const grp = optionGroup(o)
                    const head = multi && (idx === 0 || optionGroup(orderedOptions[idx - 1]) !== grp)
                    const q = o.quotations.find((x) => x.status === "sent") ?? o.quotations[0]
                    const on = multi ? !!wins[o.carrier_quote_id] : cqId === o.carrier_quote_id
                    return (
                      <div key={o.carrier_quote_id} className="space-y-1.5">
                      {head && <p className="pt-1 text-[11px] font-extrabold uppercase tracking-wide" style={{ color: "var(--text-primary)" }}>{grp}</p>}
                      <label className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-3 py-2.5 text-sm" style={{ border: `1px solid ${on ? "#16a34a" : "var(--card-border)"}`, background: on ? "color-mix(in srgb, #16a34a 10%, var(--card-bg))" : "var(--card-bg)", opacity: dis ? 0.7 : 1 }}>
                        <input type={multi ? "checkbox" : "radio"} name="won-quote" className="h-4 w-4" style={{ accentColor: "#16a34a" }} checked={on} disabled={dis} onChange={(e) => multi ? toggleWin(o, e.target.checked) : pick(o)} />
                        <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{o.carrier_name}</span>
                        <span className="tabular-nums" style={{ color: "var(--text-secondary)" }}>Carrier price {o.cost_usd != null ? usd(o.cost_usd) : "not computed"}</span>
                        {q ? <span className="tabular-nums" style={{ color: "var(--text-secondary)" }}>→ Quotation {q.quotation_number ?? `#${q.id}`}: <b style={{ color: "var(--text-primary)" }}>{usd(q.final_price_usd)}</b>{q.status === "sent" ? " (sent)" : " (draft)"}</span>
                          : <span style={{ color: "#d97706" }}>No quotation built yet</span>}
                      </label>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {!multi && chosen && (
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

            {multi && wonList.map((o) => {
              const w = wins[o.carrier_quote_id]
              const sv = w.sell.trim() === "" ? null : Number(w.sell)
              const mg = sv != null && Number.isFinite(sv) && o.cost_usd != null ? Math.round((sv - o.cost_usd) * 100) / 100 : null
              const inp = { border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--text-primary)" }
              return (
                <div key={o.carrier_quote_id} className="space-y-3 rounded-lg p-3" style={{ border: "1px solid var(--card-border)", background: "var(--table-header-bg)" }}>
                  <p className="text-[11px] font-extrabold uppercase tracking-wide" style={{ color: "var(--text-primary)" }}>{optionGroup(o)} <span className="font-semibold normal-case tracking-normal" style={{ color: "var(--text-secondary)" }}>· {o.carrier_name}</span></p>
                  <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
                    {o.quotations.length > 1 && (
                      <label className="text-xs" style={{ color: "var(--text-muted)" }}>Quotation
                        <select disabled={dis} value={w.qtId ?? ""} onChange={(e) => { const id = Number(e.target.value); const q = o.quotations.find((x) => x.id === id); setWin(o.carrier_quote_id, { qtId: id, ...(q?.final_price_usd != null ? { sell: String(q.final_price_usd) } : {}) }) }} className="lt-select mt-1 block h-8 rounded-md px-2 text-sm" style={inp}>
                          {o.quotations.map((q) => <option key={q.id} value={q.id}>{q.quotation_number ?? `#${q.id}`} — {usd(q.final_price_usd)}</option>)}
                        </select>
                      </label>
                    )}
                    <div><p className="text-xs" style={{ color: "var(--text-muted)" }}>Carrier price (cost)</p><p className="text-base font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{o.cost_usd != null ? usd(o.cost_usd) : "—"}</p></div>
                    <label className="text-xs" style={{ color: "var(--text-muted)" }}>Won price (sold at, USD)
                      <input disabled={dis} inputMode="decimal" value={w.sell} onChange={(e) => setWin(o.carrier_quote_id, { sell: e.target.value.replace(/[^0-9.]/g, "") })} placeholder="from the quotation" className="mt-1 block h-8 w-36 rounded-md px-2 text-sm font-bold tabular-nums" style={inp} />
                    </label>
                    <div><p className="text-xs" style={{ color: "var(--text-muted)" }}>Margin</p><p className="text-base font-bold tabular-nums" style={{ color: mg == null ? "var(--text-muted)" : mg >= 0 ? "#16a34a" : "#ef4444" }}>{mg == null ? "—" : `${mg >= 0 ? "+" : ""}${usd(mg)}`}</p></div>
                  </div>
                  <Check on={w.booked} onChange={(v) => setWin(o.carrier_quote_id, { booked: v })} disabled={dis} tone="#0ea5e9"><Package className="h-4 w-4" /> Booked</Check>
                  {w.booked && (
                    <div className="grid gap-3 sm:grid-cols-3">
                      <label className="text-xs" style={{ color: "var(--text-muted)" }}>Booking reference
                        <input disabled={dis} value={w.ref} onChange={(e) => setWin(o.carrier_quote_id, { ref: e.target.value })} placeholder="e.g. MAEU123456789" className="mt-1 block h-9 w-full rounded-md px-2 text-sm font-mono" style={inp} />
                      </label>
                      <label className="text-xs sm:col-span-2" style={{ color: "var(--text-muted)" }}>What was booked
                        <input disabled={dis} value={w.what} onChange={(e) => setWin(o.carrier_quote_id, { what: e.target.value })} placeholder="e.g. 1×40HC, vessel / ETD, container no." className="mt-1 block h-9 w-full rounded-md px-2 text-sm" style={inp} />
                      </label>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Check on={w.invoiced} onChange={(v) => setWin(o.carrier_quote_id, { invoiced: v, ...(v ? {} : { paid: false }) })} disabled={dis} tone="#8b5cf6">Invoiced</Check>
                    <Check on={w.paid} onChange={(v) => setWin(o.carrier_quote_id, { paid: v, ...(v ? { invoiced: true } : {}) })} disabled={dis} tone="#16a34a"><BadgeCheck className="h-4 w-4" /> Paid</Check>
                  </div>
                </div>
              )
            })}
            {multi && wonList.length > 1 && (
              <p className="text-center text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>Total sold {usd(totals.sell)} · cost {usd(totals.cost)} · margin {usd(totals.sell - totals.cost)}</p>
            )}

            {!multi && <div className="space-y-3">
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
            </div>}
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

      </div>
      )}
    </div>
  )
}
