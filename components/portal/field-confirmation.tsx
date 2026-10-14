"use client"

import { useCallback, useEffect, useState } from "react"
import { CheckCircle2, ShieldAlert, Loader2 } from "lucide-react"

type FC = { state: "unconfirmed" | "confirmed" | "changed"; at: string | null; by: string | null; via: string | null; editedAt: string | null; migrated: boolean }
const VIA: Record<string, string> = { manual: "confirmed by hand", acknowledgment: "acknowledgment sent", rfq: "carrier RFQ sent", carrier_quote: "carrier quote received" }
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "")

/** Header chip + button for the Cargo Details box: are this request's fields confirmed? Re-reads when `refreshKey` changes (after an edit). */
export function FieldConfirmation({ requestId, refreshKey = 0, disabled }: { requestId: string; refreshKey?: number; disabled?: boolean }) {
  const [fc, setFc] = useState<FC | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/requests/${requestId}/field-confirmation`, { cache: "no-store" })
      if (r.ok) setFc(await r.json())
    } catch { /* keep what we have */ }
  }, [requestId])
  useEffect(() => { void load() }, [load, refreshKey])

  async function confirm() {
    setBusy(true); setErr("")
    try {
      const r = await fetch(`/api/requests/${requestId}/field-confirmation`, { method: "POST" })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) setErr(j.error || "Could not confirm"); else setFc(j)
    } catch { setErr("Network error") }
    finally { setBusy(false) }
  }

  if (!fc) return null
  const ok = fc.state === "confirmed"
  const tone = ok ? { bg: "rgba(16,185,129,0.12)", fg: "#059669" } : { bg: "rgba(245,158,11,0.14)", fg: "#b45309" }
  const label = ok ? "Fields confirmed" : fc.state === "changed" ? "Changed since confirmed" : "Fields not confirmed"
  const detail = ok ? `${VIA[fc.via ?? ""] ?? ""}${fc.by ? ` · ${fc.by}` : ""} · ${when(fc.at)}` : fc.state === "changed" ? `edited ${when(fc.editedAt)}` : ""

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <span title={detail} className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold" style={{ background: tone.bg, color: tone.fg }}>
        {ok ? <CheckCircle2 className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}{label}
      </span>
      {ok && <span className="hidden text-[11px] sm:inline" style={{ color: "var(--text-muted)" }}>{detail}</span>}
      {!ok && (
        <button type="button" onClick={() => void confirm()} disabled={busy || disabled}
          className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11.5px] font-bold disabled:opacity-60"
          style={{ background: "var(--brand-accent)", color: "var(--brand-navy)" }}>
          {busy && <Loader2 className="h-3 w-3 animate-spin" />}{fc.state === "changed" ? "Confirm again" : "Confirm fields"}
        </button>
      )}
      {err && <span className="text-[11px]" style={{ color: "#dc2626" }}>{err}</span>}
    </div>
  )
}
