"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, RotateCcw } from "lucide-react"
import { useToast } from "@/components/ui/toast"
import { CARRIER_EMAILS, type CarrierEmails } from "@/lib/carrier-emails"

/** Templates → Carrier emails: the emails the portal writes to carriers by itself (one default each). */
export function CarrierEmailsPanel() {
  const { error: toastError, success } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [canEdit, setCanEdit] = useState(false)
  const [emails, setEmails] = useState<CarrierEmails | null>(null)
  const [defaults, setDefaults] = useState<CarrierEmails | null>(null)
  const areas = useRef<Record<string, HTMLTextAreaElement | null>>({})

  useEffect(() => {
    fetch("/api/carrier-emails", { cache: "no-store" }).then((r) => r.json()).then((j) => {
      if (j.error) throw new Error(j.error)
      setEmails(j.emails); setDefaults(j.defaults); setCanEdit(!!j.canEdit)
    }).catch((e) => toastError("Could not load the carrier emails", e.message)).finally(() => setLoading(false))
  }, [toastError])

  function insert(key: keyof CarrierEmails, v: string) {
    if (!emails) return
    const el = areas.current[key], text = `{{${v}}}`
    const at = el ? [el.selectionStart, el.selectionEnd] : [emails[key].length, emails[key].length]
    setEmails({ ...emails, [key]: emails[key].slice(0, at[0]) + text + emails[key].slice(at[1]) })
    requestAnimationFrame(() => { if (el) { el.focus(); el.setSelectionRange(at[0] + text.length, at[0] + text.length) } })
  }

  async function save() {
    if (!emails) return
    setSaving(true)
    try {
      const r = await fetch("/api/carrier-emails", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(emails) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { toastError("Could not save", j.error); return }
      setEmails(j.emails); success("Carrier email saved")
    } finally { setSaving(false) }
  }

  const line = { borderColor: "var(--card-border)", background: "var(--card-bg)", color: "var(--text-primary)" } as const
  if (loading || !emails) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--brand-accent)" }} /></div>
  return (
    <div className="space-y-5">
      <h2 className="text-[28px] font-extrabold leading-tight" style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}>Carrier emails</h2>
      {CARRIER_EMAILS.map((d) => (
        <div key={d.key} className="ds-card p-5">
          <p className="text-[16px] font-bold" style={{ color: "var(--text-primary)" }}>{d.title}</p>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-secondary)" }}>{d.hint}</p>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>Insert:</span>
            {d.vars.map((v) => (
              <button key={v.key} type="button" disabled={!canEdit} onClick={() => insert(d.key, v.key)} className="rounded-full border px-2.5 py-1 text-xs font-semibold disabled:opacity-50"
                style={{ borderColor: "var(--brand-accent)", color: "var(--brand-accent)" }}>{v.label}</button>
            ))}
          </div>
          <textarea ref={(el) => { areas.current[d.key] = el }} rows={12} disabled={!canEdit} value={emails[d.key]} onChange={(e) => setEmails({ ...emails, [d.key]: e.target.value })}
            className="mt-2 w-full rounded-xl border p-3 text-[13px] disabled:opacity-60" style={{ ...line, fontFamily: "inherit" }} />
          {canEdit && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl px-5 py-2 text-[13px] font-extrabold disabled:opacity-60"
                style={{ background: "var(--brand-accent)", color: "var(--brand-navy)" }}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
              </button>
              <button type="button" onClick={() => defaults && setEmails({ ...emails, [d.key]: defaults[d.key] })} className="inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-[13px] font-bold" style={line}>
                <RotateCcw className="h-3.5 w-3.5" /> Reset to default
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
