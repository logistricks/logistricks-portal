"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AlertTriangle, CheckCircle2, Info, Loader2, Sparkles, XCircle } from "lucide-react"

type Finding = { id: string; severity: "error" | "warning" | "info"; topic: string; message: string; source: "rule" | "ai"; resolved?: boolean }
type Suggestion = { id: string; finding_id: string; find: string; replace: string; reason: string; applied?: boolean }
type Check = { id: string; verdict: "ok" | "warnings" | "problems"; ai_ok: boolean; findings: Finding[]; suggestions: Suggestion[]; created_at: string; mode: "auto" | "manual" }
type State = { check: Check | null; stale: boolean; usage: { used: number; cap: number }; settings: { enabled: boolean; auto: boolean } }

const SEV = {
  error: { Icon: XCircle, fg: "#dc2626", bg: "rgba(220,38,38,0.08)" },
  warning: { Icon: AlertTriangle, fg: "#b45309", bg: "rgba(245,158,11,0.1)" },
  info: { Icon: Info, fg: "#2563eb", bg: "rgba(37,99,235,0.07)" },
} as const

/**
 * The quality check of one quotation: what looks wrong, and fixes that can be accepted one by one.
 * Runs by itself when the quotation is built (if switched on in Settings → Rules); "Check again" runs it once more.
 */
export function QuotationCheckPanel({ quotationId, locked, canRun, onFixed, onVerdict }: {
  quotationId: number
  /** already sent: shown, but fixes cannot be applied */
  locked?: boolean
  /** with locked: still allow running the review (an approver can ask for a fresh review but cannot change the quotation) */
  canRun?: boolean
  /** called after fixes were applied, with the corrected text */
  onFixed?: (q: { generated_subject: string | null; generated_body: string | null; generated_html?: string | null }) => void
  onVerdict?: (v: "ok" | "warnings" | "problems" | null, stale: boolean) => void
}) {
  const [st, setSt] = useState<State | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState("")
  const [pick, setPick] = useState<Set<string>>(new Set())
  const [fixing, setFixing] = useState<string | null>(null)
  const tries = useRef(0)

  const load = useCallback(async () => {
    const r = await fetch(`/api/quotation-checks?quotation_id=${quotationId}`, { cache: "no-store" })
    if (!r.ok) return null
    const j = (await r.json()) as State
    setSt(j); onVerdict?.(j.check?.verdict ?? null, j.stale)
    return j
  }, [quotationId, onVerdict])

  useEffect(() => { tries.current = 0; void load() }, [load])
  // the automatic check starts when the quotation is built: look for the result for up to ~40 seconds
  useEffect(() => {
    if (!st || st.check || !st.settings.enabled || !st.settings.auto || tries.current >= 10) return
    const t = setTimeout(() => { tries.current += 1; void load() }, 4000)
    return () => clearTimeout(t)
  }, [st, load])

  async function run(force: boolean) {
    setBusy(true); setMsg("")
    try {
      const r = await fetch("/api/quotation-checks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ quotation_id: quotationId, force }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setMsg(j.error ?? "Could not run the check"); return }
      setSt(j); setPick(new Set()); onVerdict?.(j.check?.verdict ?? null, j.stale)
    } finally { setBusy(false) }
  }

  async function aiFix(findingId: string) {
    if (!st?.check) return
    setFixing(findingId); setMsg("")
    try {
      const r = await fetch("/api/quotation-checks/fix", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ check_id: st.check.id, finding_id: findingId }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setMsg(j.error ?? "The AI could not fix this"); return }
      await load()
    } finally { setFixing(null) }
  }

  async function apply(ids: string[]) {
    if (!st?.check || !ids.length) return
    setBusy(true); setMsg("")
    try {
      const r = await fetch("/api/quotation-checks/accept", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ check_id: st.check.id, suggestion_ids: ids }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setMsg(j.error ?? "Could not apply the changes"); return }
      onFixed?.(j.quotation)
      setMsg(j.html_not_updated ? "Applied to the email text. The formatted/PDF version has a different wording there, so rebuild the quotation to update it." : "Applied.")
      setPick(new Set()); await load()
    } finally { setBusy(false) }
  }

  if (st && !st.settings.enabled) return null
  const c = st?.check ?? null
  const stale = !!st?.stale, usage = st?.usage ?? { used: 0, cap: 0 }, auto = !!st?.settings.auto
  const open = (c?.findings ?? []).filter((f) => !f.resolved)
  const sugFor = (fid: string) => (c?.suggestions ?? []).find((s) => s.finding_id === fid && !s.applied)
  const pending = (c?.suggestions ?? []).filter((s) => !s.applied)
  const border = "var(--card-border)"
  
  const verdictText = !c ? "" : c.verdict === "ok" ? (open.length ? "No problems, minor notes" : "No problems found") : c.verdict === "problems" ? "Problems found" : "Please look at these"
  const verdictColor = !c ? "var(--text-muted)" : c.verdict === "ok" ? "#059669" : c.verdict === "problems" ? "#dc2626" : "#b45309"
  const capReached = usage.cap > 0 && usage.used >= usage.cap

  return (
    <div className="mb-3 rounded-lg border p-3" style={{ borderColor: border }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-bold" style={{ color: verdictColor }}>
          {c ? (c.verdict === "ok" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />) : <Sparkles className="h-4 w-4" />}
          {c ? `AI review: ${verdictText}` : "AI review"}
          {stale && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-800">Edited since</span>}
        </p>
        {(!locked || canRun) && (
          <button type="button" disabled={busy || capReached} onClick={() => void run(!!c)} className="inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-[11px] font-semibold disabled:opacity-50" style={{ borderColor: border, color: "var(--text-primary)" }}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} {busy ? "Reviewing…" : c ? "Review again with AI" : "Review the Quotation with AI"}
          </button>
        )}
      </div>

      {!c && st?.settings.auto && tries.current < 10 && !busy && <p className="mt-2 flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}><Loader2 className="h-3 w-3 animate-spin" /> Reviewing in the background. You can start it yourself with the button.</p>}
      {!c && st && (!auto || tries.current >= 10) && <p className="mt-2 text-[11px]" style={{ color: "var(--text-muted)" }}>Not reviewed yet. The review compares this quotation with the request and the carrier&apos;s reply.</p>}
      {stale && <p className="mt-2 text-[11px]" style={{ color: "#b45309" }}>The quotation was edited after this check. Check again before sending.</p>}
      {c && !c.ai_ok && <p className="mt-2 text-[11px]" style={{ color: "var(--text-muted)" }}>Only the basic checks ran (the AI comparison was not available{capReached ? ": this month&apos;s limit is reached" : ""}).</p>}

      {c && open.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {open.map((f) => {
            const S = SEV[f.severity] ?? SEV.warning, sug = sugFor(f.id)
            return (
              <li key={f.id} className="rounded px-2 py-1.5 text-[11px]" style={{ background: S.bg, color: S.fg }}>
                <p className="flex items-start gap-1.5 font-medium"><S.Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span><strong>{f.topic}:</strong> {f.message}</span></p>
                {!sug && !locked && f.source === "ai" && (
                  <button type="button" disabled={busy || fixing !== null} onClick={() => void aiFix(f.id)} className="mt-1.5 inline-flex items-center gap-1.5 rounded border bg-white/70 px-2 py-0.5 font-semibold disabled:opacity-50 dark:bg-black/20" style={{ borderColor: border, color: "var(--text-primary)" }}>
                    {fixing === f.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} {fixing === f.id ? "Writing a fix…" : "Fix with AI"}
                  </button>
                )}
                {sug && (
                  <div className="mt-1.5 rounded border bg-white/70 px-2 py-1.5 dark:bg-black/20" style={{ borderColor: border, color: "var(--text-primary)" }}>
                    <p className="line-through opacity-70">{sug.find}</p>
                    <p className="font-semibold">{sug.replace}</p>
                    {!locked && (
                      <div className="mt-1 flex items-center gap-3">
                        <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={pick.has(sug.id)} onChange={(e) => setPick((p) => { const n = new Set(p); if (e.target.checked) n.add(sug.id); else n.delete(sug.id); return n })} /> Select</label>
                        <button type="button" disabled={busy} onClick={() => void apply([sug.id])} className="rounded border px-2 py-0.5 font-semibold disabled:opacity-50" style={{ borderColor: border }}>Apply this change</button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {!locked && pending.length > 1 && (
        <div className="mt-2 flex gap-2">
          <button type="button" disabled={busy || pick.size === 0} onClick={() => void apply([...pick])} className="rounded border px-2.5 py-1 text-[11px] font-semibold disabled:opacity-50" style={{ borderColor: border, color: "var(--text-primary)" }}>Apply selected ({pick.size})</button>
          <button type="button" disabled={busy} onClick={() => void apply(pending.map((s) => s.id))} className="rounded border px-2.5 py-1 text-[11px] font-semibold disabled:opacity-50" style={{ borderColor: border, color: "var(--text-primary)" }}>Apply all ({pending.length})</button>
        </div>
      )}
      {msg && <p className="mt-2 text-[11px]" style={{ color: "var(--text-muted)" }}>{msg}</p>}
      {usage.cap > 0 && <p className="mt-2 text-[10px]" style={{ color: "var(--text-muted)" }}>{usage.used} of {usage.cap} AI checks used this month</p>}
    </div>
  )
}
