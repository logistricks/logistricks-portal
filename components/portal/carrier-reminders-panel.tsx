"use client"

import { useEffect, useState } from "react"
import { Loader2, RotateCcw } from "lucide-react"
import { useToast } from "@/components/ui/toast"

type S = { enabled: boolean; after_h: number; max: number }

/** Settings → Rules: remind carriers that haven't answered a rate request. */
export function CarrierRemindersPanel() {
  const { error: toastError, success } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [canEdit, setCanEdit] = useState(false)
  const [s, setS] = useState<S | null>(null)
  const [defaults, setDefaults] = useState<S | null>(null)

  useEffect(() => {
    fetch("/api/carrier-reminders/settings", { cache: "no-store" }).then((r) => r.json()).then((j) => {
      if (j.error) throw new Error(j.error)
      setS(j.settings); setDefaults(j.defaults); setCanEdit(!!j.canEdit)
    }).catch((e) => toastError("Could not load the reminder settings", e.message)).finally(() => setLoading(false))
  }, [toastError])

  async function save() {
    if (!s) return
    setSaving(true)
    try {
      const r = await fetch("/api/carrier-reminders/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(s) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { toastError("Could not save", j.error); return }
      setS(j.settings); success("Reminder settings saved")
    } finally { setSaving(false) }
  }

  const card = { borderColor: "var(--card-border)", background: "var(--card-bg)" } as const
  const num = "w-[72px] rounded-xl border px-3 py-2 text-center text-[14px] font-semibold disabled:opacity-60"
  return (
    <div className="mt-3 rounded-xl border p-4" style={card}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Remind carriers that haven&apos;t replied</p>
          <p className="mt-0.5 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            When a carrier hasn&apos;t sent a quote or declined after a rate request, the portal emails a reminder by itself. You can always send one yourself with the Remind button on the request.
            An out-of-office reply doesn&apos;t count as an answer. The email is edited under Templates → Carrier emails.
          </p>
        </div>
        {s && (
          <button type="button" role="switch" aria-checked={s.enabled} aria-label="Remind carriers automatically" disabled={!canEdit} onClick={() => setS({ ...s, enabled: !s.enabled })}
            className="relative h-6 w-11 shrink-0 overflow-hidden rounded-full transition-colors disabled:opacity-50" style={{ background: s.enabled ? "var(--brand-accent)" : "#CBD5E1" }}>
            <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all" style={{ left: s.enabled ? 22 : 2 }} />
          </button>
        )}
      </div>
      {loading || !s ? (
        <div className="flex items-center gap-2 py-4 text-sm" style={{ color: "var(--text-secondary)" }}><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3" style={{ borderColor: "var(--divider)" }}>
            <div className="min-w-[200px] flex-1">
              <p className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>Remind after</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Since the rate request was sent, and again since the last reminder.</p>
            </div>
            <div className="flex items-center gap-2">
              <input type="number" min={1} max={720} step={1} disabled={!canEdit || !s.enabled} value={s.after_h} aria-label="Hours before a reminder" className={num} style={{ ...card, color: "var(--text-primary)" }}
                onChange={(e) => setS({ ...s, after_h: Number(e.target.value) })} />
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>hours</span>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3" style={{ borderColor: "var(--divider)" }}>
            <div className="min-w-[200px] flex-1">
              <p className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>Send at most</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Automatic reminders per carrier and request. After that it&apos;s left for a person.</p>
            </div>
            <div className="flex items-center gap-2">
              <input type="number" min={1} max={10} step={1} disabled={!canEdit || !s.enabled} value={s.max} aria-label="Most reminders" className={num} style={{ ...card, color: "var(--text-primary)" }}
                onChange={(e) => setS({ ...s, max: Number(e.target.value) })} />
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>reminders</span>
            </div>
          </div>
          {canEdit && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl px-5 py-2 text-[13px] font-extrabold disabled:opacity-60"
                style={{ background: "var(--brand-accent)", color: "var(--brand-navy)" }}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save reminder settings
              </button>
              <button type="button" onClick={() => defaults && setS(defaults)} className="inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-[13px] font-bold"
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
