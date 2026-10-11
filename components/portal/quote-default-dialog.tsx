"use client"

import { useEffect, useState } from "react"
import { Loader2, Star, X } from "lucide-react"
import type { Template } from "@/lib/portal-data"

export type ModeSet = { sea: boolean; air: boolean; land: boolean }
type Flags = Pick<Template, "mode_sea" | "mode_air" | "mode_land" | "default_sea" | "default_air" | "default_land">
export const modesOf = (t: Flags): ModeSet => ({ sea: !!t.mode_sea, air: !!t.mode_air, land: !!t.mode_land })
export const defaultsOf = (t: Flags): ModeSet => ({ sea: !!t.default_sea, air: !!t.default_air, land: !!t.default_land })
const NAMES = { sea: "Sea", air: "Air", land: "Land" } as const
export const modeNames = (t: Flags) => (["sea", "air", "land"] as const).filter((k) => t[`mode_${k}` as const]).map((k) => ({ key: k, name: NAMES[k], isDefault: !!t[`default_${k}` as const] }))

/**
 * Pick the modes a template is for, and beside each mode whether it is the default for it.
 * A mode that already has a default elsewhere cannot be taken: remove that default first.
 */
export function ModeDefaultsEditor({ modes, defaults, onChange, holders }: {
  modes: ModeSet
  defaults: ModeSet
  onChange: (modes: ModeSet, defaults: ModeSet) => void
  /** other templates (same channel) that are currently the default, by mode */
  holders: Partial<Record<keyof ModeSet, string>>
}) {
  return (
    <div className="space-y-2">
      {(["sea", "air", "land"] as const).map((k) => {
        const on = modes[k], def = defaults[k] && on, held = holders[k]
        return (
          <div key={k} className="flex items-center gap-3 rounded-lg px-3 py-2" style={{ border: `1px solid ${on ? "var(--brand-accent)" : "var(--card-border)"}`, background: on ? "rgb(var(--brand-accent-rgb) / 0.05)" : "transparent" }}>
            <label className="flex flex-1 cursor-pointer items-center gap-3">
              <input type="checkbox" checked={on} onChange={(e) => onChange({ ...modes, [k]: e.target.checked }, e.target.checked ? defaults : { ...defaults, [k]: false })} className="h-4 w-4 shrink-0" style={{ accentColor: "var(--brand-accent)" }} />
              <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{NAMES[k]}</span>
            </label>
            {on && (
              held && !def ? (
                <span className="text-[11px]" style={{ color: "var(--text-muted)" }} title="Remove the default from that template first">Default: {held}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => onChange(modes, { ...defaults, [k]: !def })}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors"
                  style={def ? { background: "var(--brand-accent)", color: "#fff" } : { border: "1px solid var(--card-border)", color: "var(--text-secondary)" }}
                >
                  <Star className="h-3 w-3" fill={def ? "currentColor" : "none"} /> {def ? "Default" : "Make default"}
                </button>
              )
            )}
          </div>
        )
      })}
    </div>
  )
}

export function holdersFor(others: Template[], self: Template): Partial<Record<keyof ModeSet, string>> {
  const out: Partial<Record<keyof ModeSet, string>> = {}
  for (const k of ["sea", "air", "land"] as const) {
    const h = others.find((o) => o.template_id !== self.template_id && o.type === self.type && o[`default_${k}` as const])
    if (h) out[k] = h.template_name
  }
  return out
}

export function QuoteDefaultDialog({ template, others, onSave, onClose }: {
  template: Template
  others: Template[]
  onSave: (modes: ModeSet, defaults: ModeSet) => Promise<void>
  onClose: () => void
}) {
  const [modes, setModes] = useState<ModeSet>(modesOf(template))
  const [defs, setDefs] = useState<ModeSet>(defaultsOf(template))
  const [busy, setBusy] = useState(false)
  useEffect(() => { const h = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h) }, [onClose])
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl p-5 shadow-2xl" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }} onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-start justify-between gap-3">
          <h3 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>Quote Request — modes</h3>
          <button onClick={onClose} aria-label="Close" style={{ color: "var(--text-muted)" }}><X className="h-4 w-4" /></button>
        </div>
        <p className="mb-4 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          Choose the modes <b>{template.template_name}</b> is for. Then make it the <b>default</b> for a mode: that is the one sent automatically, and the one pre-selected when sending manually. Each mode has one default.
        </p>
        <ModeDefaultsEditor modes={modes} defaults={defs} onChange={(m, d) => { setModes(m); setDefs(d) }} holders={holdersFor(others, template)} />
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium" style={{ border: "1px solid var(--card-border)", color: "var(--text-secondary)" }}>Cancel</button>
          <button
            disabled={busy}
            onClick={async () => { setBusy(true); try { await onSave(modes, defs) } finally { setBusy(false) } }}
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
