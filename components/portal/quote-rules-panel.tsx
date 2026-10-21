"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, RotateCcw, SlidersHorizontal, X } from "lucide-react"
import { useToast } from "@/components/ui/toast"
import type { QuoteRules, RuleAction } from "@/lib/quote-rules"

type Item = { code: string; label: string; hint: string; askable: boolean }


/** A tick box that can show "some selected" (used by the select-all boxes). */
function Check({ checked, some, disabled, onChange, label }: { checked: boolean; some?: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (ref.current) ref.current.indeterminate = !!some && !checked }, [some, checked])
  return <input ref={ref} type="checkbox" aria-label={label} disabled={disabled} checked={checked} onChange={(e) => onChange(e.target.checked)}
    className="h-[18px] w-[18px] shrink-0 cursor-pointer accent-[var(--brand-accent)] disabled:cursor-not-allowed disabled:opacity-35" />
}

/** Pick which problems are checked, and which of them also email the carrier. */
function ChecksDialog({ catalog, actions, canEdit, onApply, onClose }: { catalog: Item[]; actions: Record<string, RuleAction>; canEdit: boolean; onApply: (a: Record<string, RuleAction>) => void; onClose: () => void }) {
  const [a, setA] = useState<Record<string, RuleAction>>({ ...actions })
  const on = (c: Item) => (a[c.code] ?? "flag") !== "ignore"
  const asks = (c: Item) => a[c.code] === "ask"
  const askable = catalog.filter((c) => c.askable)
  const nOn = catalog.filter(on).length, nAsk = askable.filter(asks).length
  const setAllOn = (v: boolean) => setA(Object.fromEntries(catalog.map((c) => [c.code, v ? (asks(c) ? "ask" : "flag") : "ignore"])) as Record<string, RuleAction>)
  const setAllAsk = (v: boolean) => setA(Object.fromEntries(catalog.map((c) => [c.code, v ? (c.askable ? "ask" : on(c) ? "flag" : "ignore") : asks(c) ? "flag" : (a[c.code] ?? "flag")])) as Record<string, RuleAction>)
  const setOne = (c: Item, check: boolean) => setA({ ...a, [c.code]: check ? "flag" : "ignore" })
  const setAsk = (c: Item, v: boolean) => setA({ ...a, [c.code]: v ? "ask" : "flag" })
  const line = { borderColor: "var(--card-border)", background: "var(--card-bg)", color: "var(--text-primary)" } as const

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-[640px] flex-col rounded-2xl border shadow-2xl" style={line} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 p-5 pb-3">
          <div>
            <p className="text-[15px] font-bold">Choose the checks</p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>Tick the problems to look for on every carrier quote. Tick &ldquo;Ask carrier&rdquo; to also email the carrier about it.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <div className="grid grid-cols-[1fr_74px_88px] items-center gap-x-3 border-y px-5 py-2.5 text-[11px] font-bold uppercase tracking-wide" style={{ borderColor: "var(--divider)", background: "var(--table-header-bg)", color: "var(--text-secondary)" }}>
          <span>Select all</span>
          <label className="flex flex-col items-center gap-1">Check<Check label="Select all checks" disabled={!canEdit} checked={nOn === catalog.length} some={nOn > 0} onChange={setAllOn} /></label>
          <label className="flex flex-col items-center gap-1">Ask carrier<Check label="Select all ask carrier" disabled={!canEdit} checked={nAsk === askable.length} some={nAsk > 0} onChange={setAllAsk} /></label>
        </div>
        <div className="flex-1 overflow-y-auto px-5">
          {catalog.map((c) => (
            <div key={c.code} className="grid grid-cols-[1fr_74px_88px] items-center gap-x-3 border-b py-2.5" style={{ borderColor: "var(--divider)" }}>
              <div>
                <p className="text-[13px] font-semibold">{c.label}</p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>{c.hint}</p>
              </div>
              <span className="flex justify-center"><Check label={`Check: ${c.label}`} disabled={!canEdit} checked={on(c)} onChange={(v) => setOne(c, v)} /></span>
              <span className="flex justify-center"><Check label={`Ask carrier: ${c.label}`} disabled={!canEdit || !c.askable || !on(c)} checked={asks(c)} onChange={(v) => setAsk(c, v)} /></span>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3 p-5 pt-3">
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>{nOn} of {catalog.length} checks on · {nAsk} ask the carrier</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-xl border px-4 py-2 text-[13px] font-bold" style={line}>Cancel</button>
            {canEdit && <button type="button" onClick={() => { onApply(a); onClose() }} className="rounded-xl px-5 py-2 text-[13px] font-extrabold" style={{ background: "var(--brand-accent)", color: "var(--brand-navy)" }}>Apply</button>}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Settings → Rules: what happens when a carrier's quote fails a check. */
export function QuoteRulesPanel() {
  const { error: toastError, success } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [canEdit, setCanEdit] = useState(false)
  const [rules, setRules] = useState<QuoteRules | null>(null)
  const [defaults, setDefaults] = useState<QuoteRules | null>(null)
  const [catalog, setCatalog] = useState<Item[]>([])
  const [pick, setPick] = useState(false)

  useEffect(() => {
    fetch("/api/quote-rules", { cache: "no-store" }).then((r) => r.json()).then((j) => {
      if (j.error) throw new Error(j.error)
      setRules(j.rules); setDefaults(j.defaults); setCatalog(j.catalog); setCanEdit(!!j.canEdit)
    }).catch((e) => toastError("Could not load the quote rules", e.message)).finally(() => setLoading(false))
  }, [toastError])

  async function save() {
    if (!rules) return
    setSaving(true)
    try {
      const r = await fetch("/api/quote-rules", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ actions: rules.actions, max_asks: rules.max_asks }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { toastError("Could not save", j.error); return }
      setRules(j.rules); success("Quote rules saved")
    } finally { setSaving(false) }
  }

  const card = { borderColor: "var(--card-border)", background: "var(--card-bg)" } as const
  const nAsk = rules ? catalog.filter((c) => rules.actions[c.code] === "ask").length : 0
  const nOn = rules ? catalog.filter((c) => (rules.actions[c.code] ?? "flag") !== "ignore").length : 0

  return (
    <div className="mt-3 rounded-xl border p-4" style={card}>
      <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Carrier quote checks</p>
      <p className="mt-0.5 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        Every quote that arrives is checked. Choose what happens to each problem: ignore it, keep the quote with the problem shown on it, or keep it and also ask the carrier to fix it.
        A flagged quote is never blocked — it can still be used for a quotation.
      </p>
      {loading || !rules ? (
        <div className="flex items-center gap-2 py-6 text-sm" style={{ color: "var(--text-secondary)" }}><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-[200px] flex-1">
              <p className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>{nOn} of {catalog.length} checks on</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>{nAsk ? `${nAsk} also ask the carrier to fix the problem` : "None of them email the carrier"}</p>
            </div>
            <button type="button" onClick={() => setPick(true)} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-[13px] font-bold" style={{ borderColor: "var(--card-border)", color: "var(--text-primary)" }}>
              <SlidersHorizontal className="h-4 w-4" /> {canEdit ? "Choose checks" : "View checks"}
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3" style={{ borderColor: "var(--divider)" }}>
            <div className="min-w-[200px] flex-1">
              <p className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>Stop asking the carrier after</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                If the corrected quote still has a problem, the carrier is asked again, up to this many emails for each request. After that it is left for a person to handle.
                The email itself is edited under Templates → Carrier emails.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input type="number" min={1} max={5} step={1} disabled={!canEdit || !nAsk} value={rules.max_asks} aria-label="Stop asking the carrier after"
                className="w-[72px] rounded-xl border px-3 py-2 text-center text-[14px] font-semibold disabled:opacity-60" style={{ ...card, color: "var(--text-primary)" }}
                onChange={(e) => setRules({ ...rules, max_asks: Number(e.target.value) })} />
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>emails</span>
            </div>
          </div>
          {pick && <ChecksDialog catalog={catalog} actions={rules.actions} canEdit={canEdit} onApply={(a) => setRules({ ...rules, actions: a })} onClose={() => setPick(false)} />}

          {canEdit && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl px-5 py-2 text-[13px] font-extrabold disabled:opacity-60"
                style={{ background: "var(--brand-accent)", color: "var(--brand-navy)" }}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save quote rules
              </button>
              <button type="button" onClick={() => defaults && setRules(defaults)} className="inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-[13px] font-bold"
                style={{ borderColor: "var(--card-border)", color: "var(--text-primary)" }}>
                <RotateCcw className="h-3.5 w-3.5" /> Reset to defaults
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
