"use client"

import { useEffect, useState } from "react"
import { Loader2, RotateCcw } from "lucide-react"
import { useToast } from "@/components/ui/toast"
import type { QuoteRules, RuleAction } from "@/lib/quote-rules"

type Item = { code: string; label: string; hint: string; askable: boolean }

/** Settings → Rules: what happens when a carrier's quote fails a check. */
export function QuoteRulesPanel() {
  const { error: toastError, success } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [canEdit, setCanEdit] = useState(false)
  const [rules, setRules] = useState<QuoteRules | null>(null)
  const [defaults, setDefaults] = useState<QuoteRules | null>(null)
  const [catalog, setCatalog] = useState<Item[]>([])

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
      const r = await fetch("/api/quote-rules", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(rules) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { toastError("Could not save", j.error); return }
      setRules(j.rules); success("Quote rules saved")
    } finally { setSaving(false) }
  }

  const card = { borderColor: "var(--card-border)", background: "var(--card-bg)" } as const
  const asking = rules ? Object.values(rules.actions).filter((a) => a === "ask").length : 0

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
          <div className="mt-3 divide-y" style={{ borderColor: "var(--divider)" }}>
            {catalog.map((c) => (
              <div key={c.code} className="flex flex-wrap items-center justify-between gap-3 py-2.5" style={{ borderColor: "var(--divider)" }}>
                <div className="min-w-[200px] flex-1">
                  <p className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>{c.label}</p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>{c.hint}</p>
                </div>
                <select className="lt-select shrink-0" disabled={!canEdit} value={rules.actions[c.code] ?? "flag"} aria-label={c.label}
                  onChange={(e) => setRules({ ...rules, actions: { ...rules.actions, [c.code]: e.target.value as RuleAction } })}>
                  <option value="ignore">Ignore</option>
                  <option value="flag">Flag the quote</option>
                  {c.askable && <option value="ask">Flag and ask the carrier</option>}
                </select>
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3" style={{ borderColor: "var(--divider)" }}>
            <div className="min-w-[200px] flex-1">
              <p className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>Most times to ask a carrier</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Per request and carrier. After that the quote is left for a person{asking ? "" : " (only used when a rule above asks the carrier)"}.</p>
            </div>
            <input type="number" min={1} max={5} step={1} disabled={!canEdit} value={rules.max_asks} aria-label="Most times to ask a carrier"
              className="w-[80px] rounded-xl border px-3 py-2 text-center text-[14px] font-semibold disabled:opacity-60" style={{ ...card, color: "var(--text-primary)" }}
              onChange={(e) => setRules({ ...rules, max_asks: Number(e.target.value) })} />
          </div>

          <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--divider)" }}>
            <p className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>Email to the carrier</p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Sent from your email server, in the carrier&apos;s own thread. Use <code>{"{{contact_name}}"}</code>, <code>{"{{carrier_name}}"}</code>, <code>{"{{request_ref}}"}</code>, <code>{"{{sender_name}}"}</code>,
              and <code>{"{{issues}}"}</code> for the list of problems (required). A person can edit it before sending by hand.
            </p>
            <textarea rows={9} disabled={!canEdit} value={rules.ask_body} onChange={(e) => setRules({ ...rules, ask_body: e.target.value })}
              className="mt-2 w-full rounded-xl border p-3 text-[13px] disabled:opacity-60" style={{ ...card, color: "var(--text-primary)", fontFamily: "inherit" }} />
          </div>

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
