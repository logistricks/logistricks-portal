"use client"

import { useEffect, useState } from "react"
import { Loader2, RotateCcw } from "lucide-react"
import { useToast } from "@/components/ui/toast"

type S = { enabled: boolean; auto: boolean; monthly_cap: number; approval: "off" | "warnings" | "always" }

/** Settings → Rules: the AI check of the generated quotation. */
export function QuotationCheckSettingsPanel() {
  const { error: toastError, success } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [canEdit, setCanEdit] = useState(false)
  const [s, setS] = useState<S | null>(null)
  const [defaults, setDefaults] = useState<S | null>(null)
  const [used, setUsed] = useState(0)

  useEffect(() => {
    fetch("/api/quotation-checks/settings", { cache: "no-store" }).then((r) => r.json()).then((j) => {
      if (j.error) throw new Error(j.error)
      setS(j.settings); setDefaults(j.defaults); setCanEdit(!!j.canEdit); setUsed(j.usage ?? 0)
    }).catch((e) => toastError("Could not load the quotation check settings", e.message)).finally(() => setLoading(false))
  }, [toastError])

  async function save() {
    if (!s) return
    setSaving(true)
    try {
      const r = await fetch("/api/quotation-checks/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(s) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { toastError("Could not save", j.error); return }
      setS(j.settings); success("Quotation check settings saved")
    } finally { setSaving(false) }
  }

  const card = { borderColor: "var(--card-border)", background: "var(--card-bg)" } as const
  const toggle = (on: boolean, set: () => void, label: string) => (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={!canEdit} onClick={set}
      className="relative h-6 w-11 shrink-0 overflow-hidden rounded-full transition-colors disabled:opacity-50" style={{ background: on ? "var(--brand-accent)" : "#CBD5E1" }}>
      <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all" style={{ left: on ? 22 : 2 }} />
    </button>
  )
  return (
    <div className="mt-3 rounded-xl border p-4" style={card}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Check quotations before they go out</p>
          <p className="mt-0.5 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            Every quotation is compared with the request and the carrier&apos;s reply: route, equipment, price, validity, conditions, wording. Differences are listed with a suggested fix you can accept with one click.
            Prices in a fix always come from the request or the carrier&apos;s reply, never from the AI.
          </p>
        </div>
        {s && toggle(s.enabled, () => setS({ ...s, enabled: !s.enabled }), "Check quotations")}
      </div>
      {loading || !s ? (
        <div className="flex items-center gap-2 py-4 text-sm" style={{ color: "var(--text-secondary)" }}><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : (
        <>
          <div className="mt-3 flex items-center justify-between gap-3 border-t pt-3" style={{ borderColor: "var(--divider)" }}>
            <div className="min-w-[200px] flex-1">
              <p className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>Check automatically when a quotation is built</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Otherwise a person presses &ldquo;Check this quotation&rdquo;.</p>
            </div>
            {toggle(s.auto, () => setS({ ...s, auto: !s.auto }), "Check automatically")}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3" style={{ borderColor: "var(--divider)" }}>
            <div className="min-w-[200px] flex-1">
              <p className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>Most AI checks per month</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>{used} used this month. 0 = the basic checks only, no AI. After the limit only the basic checks run.</p>
            </div>
            <input type="number" min={0} max={100000} step={10} disabled={!canEdit} value={s.monthly_cap} aria-label="Most AI checks per month"
              className="w-[96px] rounded-xl border px-3 py-2 text-center text-[14px] font-semibold disabled:opacity-60" style={{ ...card, color: "var(--text-primary)" }}
              onChange={(e) => setS({ ...s, monthly_cap: Number(e.target.value) })} />
          </div>
          {canEdit && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl px-5 py-2 text-[13px] font-extrabold disabled:opacity-60" style={{ background: "var(--brand-accent)", color: "var(--brand-navy)" }}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save quotation check settings
              </button>
              <button type="button" onClick={() => defaults && setS(defaults)} className="inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-[13px] font-bold" style={{ borderColor: "var(--card-border)", color: "var(--text-primary)" }}>
                <RotateCcw className="h-3.5 w-3.5" /> Reset to defaults
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
