"use client"

import { useState } from "react"
import { Loader2, X } from "lucide-react"
import type { Template } from "@/lib/portal-data"

export type DefaultModes = { sea: boolean; air: boolean; land: boolean }
export const defaultModesOf = (t: Pick<Template, "default_sea" | "default_air" | "default_land">): DefaultModes => ({ sea: !!t.default_sea, air: !!t.default_air, land: !!t.default_land })
export const defaultLabel = (t: Pick<Template, "default_sea" | "default_air" | "default_land">) => [t.default_sea && "Sea", t.default_air && "Air", t.default_land && "Land"].filter(Boolean) as string[]

/** Choose which modes a template is the default Quote Request for. One default per mode; a template can cover several. */
export function QuoteDefaultDialog({ template, others, onSave, onClose }: {
  template: Template
  /** current default holders, to warn which template a mode is taken from */
  others: Template[]
  onSave: (modes: DefaultModes) => Promise<void>
  onClose: () => void
}) {
  const [m, setM] = useState<DefaultModes>(defaultModesOf(template))
  const [busy, setBusy] = useState(false)
  const rows = [["sea", "Sea"], ["air", "Air"], ["land", "Land"]] as const
  const holder = (k: "sea" | "air" | "land") => others.find((o) => o.template_id !== template.template_id && o.type === template.type && o[`default_${k}` as const])
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl p-5 shadow-2xl" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }} onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-start justify-between gap-3">
          <h3 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>Quote Request default</h3>
          <button onClick={onClose} aria-label="Close" style={{ color: "var(--text-muted)" }}><X className="h-4 w-4" /></button>
        </div>
        <p className="mb-4 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          Use <b>{template.template_name}</b> as the default quote request for the modes below. It is the one sent automatically, and the one pre-selected when you send manually. Each mode has one default.
        </p>
        <div className="space-y-2">
          {rows.map(([k, label]) => {
            const h = holder(k)
            return (
              <label key={k} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5" style={{ border: `1px solid ${m[k] ? "var(--brand-accent)" : "var(--card-border)"}`, background: m[k] ? "rgb(var(--brand-accent-rgb) / 0.06)" : "transparent" }}>
                <input type="checkbox" checked={m[k]} onChange={(e) => setM({ ...m, [k]: e.target.checked })} className="h-4 w-4 shrink-0" style={{ accentColor: "var(--brand-accent)" }} />
                <span className="flex-1 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{label}</span>
                {h && !m[k] && <span className="truncate text-[11px]" style={{ color: "var(--text-muted)" }}>now: {h.template_name}</span>}
                {h && m[k] && <span className="truncate text-[11px]" style={{ color: "#b45309" }}>replaces {h.template_name}</span>}
              </label>
            )
          })}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium" style={{ border: "1px solid var(--card-border)", color: "var(--text-secondary)" }}>Cancel</button>
          <button
            disabled={busy}
            onClick={async () => { setBusy(true); try { await onSave(m) } finally { setBusy(false) } }}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-all hover:brightness-90 disabled:opacity-50"
            style={{ background: "var(--brand-accent)" }}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  )
}
