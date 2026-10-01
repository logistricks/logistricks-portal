"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { CheckCircle2, ExternalLink, Inbox, Link2, Loader2, RefreshCw, Search, Trash2, X } from "lucide-react"
import { ConfirmStepsDialog } from "@/components/portal/confirm-steps-dialog"

// ─── Types ──────────────────────────────────────────────────────────────────

interface UnlinkedQuote {
  id: number
  carrierId: number | null
  carrierName: string | null
  fromEmail: string | null
  subject: string | null
  emailThreadId: string | null
  rateUsd: number | null
  rateCurrency: string | null
  rateOriginal: number | null
  transitDays: number | null
  validityDate: string | null
  freeDays: number | null
  notes: string | null
  rawReply: string | null
  reason: string | null
  receivedAt: string
}

interface CarrierOption { id: number; name: string; email: string }

interface LinkTarget {
  id: string
  ref: string
  senderName: string
  origin: string
  destination: string
  cargoType: string
  status: string
  receivedAt: string
  rfqSentToCarrier: boolean
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const REASONS: Record<string, string> = {
  carrier_not_recognised: "Sender isn't a known carrier",
  no_reference_found:     "No request reference in the email",
  no_matching_rfq:        "Reference didn't match an open RFQ",
  unlinked_manually:      "Unlinked by a user",
}

function reasonLabel(r: string | null): string {
  return (r && REASONS[r]) || "Couldn't be matched"
}

function rateText(q: Pick<UnlinkedQuote, "rateUsd" | "rateOriginal" | "rateCurrency">): string {
  if (q.rateUsd != null) return `$${q.rateUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
  if (q.rateOriginal != null) return `${q.rateOriginal.toLocaleString()} ${q.rateCurrency ?? ""}`.trim()
  return "—"
}

function carrierText(q: Pick<UnlinkedQuote, "carrierName" | "fromEmail">): string {
  return q.carrierName ?? q.fromEmail ?? "Unknown sender"
}

function whenText(iso: string): { relative: string; exact: string } {
  const d = new Date(iso)
  const mins = Math.floor((Date.now() - d.getTime()) / 60_000)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)
  const relative = mins < 1 ? "Just now" : mins < 60 ? `${mins}m ago` : hours < 24 ? `${hours}h ago` : days === 1 ? "Yesterday" : `${days}d ago`
  const exact = `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} at ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
  return { relative, exact }
}

function dateText(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"
}

const inputStyle = { borderColor: "var(--card-border)", background: "var(--card-bg)", color: "var(--text-primary)" }

async function readError(res: Response): Promise<string> {
  const d = await res.json().catch(() => ({}))
  return d?.error ?? `Server error ${res.status}`
}

// ─── Link dialog ────────────────────────────────────────────────────────────

function LinkDialog({
  quote,
  carriers,
  onClose,
  onLinked,
}: {
  quote: UnlinkedQuote
  carriers: CarrierOption[]
  onClose: () => void
  onLinked: (quoteId: number, ref: string) => void
}) {
  const [carrierId, setCarrierId]   = useState<number | "">(quote.carrierId ?? "")
  const [targets, setTargets]       = useState<LinkTarget[]>([])
  const [loadingT, setLoadingT]     = useState(true)
  const [search, setSearch]         = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy]             = useState(false)
  const [error, setError]           = useState<string | null>(null)

  // Reload the candidate requests when the carrier changes, so requests that
  // already have an RFQ out to that carrier are listed first.
  useEffect(() => {
    let cancelled = false
    setLoadingT(true)
    const qs = carrierId ? `?carrier_id=${carrierId}` : ""
    fetch(`/api/carrier-quotes/link-targets${qs}`)
      .then(async (r) => { if (!r.ok) throw new Error(await readError(r)); return r.json() })
      .then((d: { targets: LinkTarget[] }) => { if (!cancelled) setTargets(d.targets ?? []) })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoadingT(false) })
    return () => { cancelled = true }
  }, [carrierId])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return targets
    return targets.filter((t) => `${t.ref} ${t.senderName} ${t.origin} ${t.destination} ${t.cargoType}`.toLowerCase().includes(q))
  }, [targets, search])

  const selected = targets.find((t) => t.id === selectedId) ?? null
  const carrierName = carriers.find((c) => c.id === carrierId)?.name ?? carrierText(quote)

  async function confirm() {
    if (!selected || !carrierId) return
    setBusy(true); setError(null)
    try {
      const res = await fetch("/api/carrier-quotes/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quote_id: quote.id, freight_request_id: selected.id, carrier_id: carrierId }),
      })
      if (!res.ok) throw new Error(await readError(res))
      onLinked(quote.id, selected.ref)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" onClick={() => { if (!busy) onClose() }}>
      <div
        role="dialog" aria-modal="true" aria-label="Link quote to a request"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl shadow-2xl"
        style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b px-5 py-4" style={{ borderColor: "var(--divider)" }}>
          <div className="min-w-0">
            <h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>Link quote to a request</h3>
            <p className="truncate text-xs" style={{ color: "var(--text-muted)" }}>
              {carrierText(quote)} · {rateText(quote)}{quote.subject ? ` · ${quote.subject}` : ""}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="rounded-lg p-1.5" style={{ color: "var(--text-muted)" }}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto px-5 py-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Carrier</label>
            <select
              value={carrierId}
              onChange={(e) => { setCarrierId(e.target.value ? Number(e.target.value) : ""); setSelectedId(null) }}
              className="h-10 w-full rounded-md border px-3 text-sm" style={inputStyle}
            >
              {!quote.carrierId && <option value="">Choose the carrier who sent this…</option>}
              {carriers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.email ? ` — ${c.email}` : ""}</option>)}
            </select>
            {!quote.carrierId && (
              <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>The sender wasn&apos;t recognised as one of your carriers, so pick it here.</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Request</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
              <input
                value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by reference, sender, route or cargo"
                className="h-10 w-full rounded-md border pl-9 pr-3 text-sm" style={inputStyle}
              />
            </div>
            <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>Only open requests are listed. Closed and completed requests can&apos;t take new quotes.</p>

            <div className="mt-2 max-h-64 overflow-y-auto rounded-md border" style={{ borderColor: "var(--card-border)" }}>
              {loadingT ? (
                <div className="flex items-center gap-2 px-4 py-6 text-sm" style={{ color: "var(--text-muted)" }}>
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading requests…
                </div>
              ) : filtered.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>No open requests match.</p>
              ) : filtered.map((t) => {
                const active = t.id === selectedId
                return (
                  <button
                    key={t.id} type="button" onClick={() => setSelectedId(t.id)}
                    className="flex w-full items-start gap-3 px-3 py-2.5 text-left"
                    style={{
                      borderTop: "1px solid var(--divider)",
                      background: active ? "var(--hover-bg)" : "transparent",
                      boxShadow: active ? "inset 3px 0 0 var(--brand-accent)" : undefined,
                    }}
                  >
                    <span className="mt-0.5 font-mono text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>{t.ref}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>{t.senderName}</span>
                      <span className="block truncate text-xs" style={{ color: "var(--text-secondary)" }}>
                        {[t.origin && t.destination ? `${t.origin} → ${t.destination}` : t.origin || t.destination, t.cargoType].filter(Boolean).join(" · ") || "—"}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{t.status}</span>
                      {t.rfqSentToCarrier && (
                        <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "rgba(22,163,74,0.12)", color: "#16a34a" }}>RFQ sent to this carrier</span>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {error && (
            <p className="rounded-lg px-3 py-2 text-sm text-red-700 dark:text-red-400" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>{error}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4" style={{ borderColor: "var(--divider)" }}>
          <p className="min-w-0 flex-1 text-xs" style={{ color: "var(--text-secondary)" }}>
            {selected && carrierId
              ? <>Link <strong>{carrierName}</strong>&apos;s {rateText(quote)} quote to <strong>{selected.ref}</strong> ({selected.senderName})?</>
              : "Choose a carrier and a request to continue."}
          </p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} disabled={busy} className="rounded-md border px-3.5 py-2 text-sm font-semibold disabled:opacity-50" style={{ borderColor: "var(--card-border)", color: "var(--text-primary)" }}>Cancel</button>
            <button
              type="button" onClick={confirm} disabled={busy || !selected || !carrierId}
              className="inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--brand-accent)" }}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Link quote
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Detail dialog ──────────────────────────────────────────────────────────

function DetailDialog({
  quote, onClose, onLink, onDelete,
}: {
  quote: UnlinkedQuote
  onClose: () => void
  onLink: () => void
  onDelete: () => void
}) {
  const fields: [string, string][] = [
    ["Rate", rateText(quote)],
    ["Transit", quote.transitDays != null ? `${quote.transitDays} days` : "—"],
    ["Valid until", dateText(quote.validityDate)],
    ["Free days", quote.freeDays != null ? `${quote.freeDays} days` : "—"],
  ]
  const threadUrl = quote.emailThreadId && /^[0-9a-f]{10,}$/i.test(quote.emailThreadId)
    ? `https://mail.google.com/mail/u/0/#all/${quote.emailThreadId}` : null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        role="dialog" aria-modal="true" aria-label="Quote details"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl shadow-2xl"
        style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b px-5 py-4" style={{ borderColor: "var(--divider)" }}>
          <div className="min-w-0">
            <h3 className="truncate font-semibold" style={{ color: "var(--text-primary)" }}>{carrierText(quote)}</h3>
            <p className="truncate text-xs" style={{ color: "var(--text-muted)" }}>
              {quote.fromEmail && quote.carrierName ? `${quote.fromEmail} · ` : ""}{whenText(quote.receivedAt).exact}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5" style={{ color: "var(--text-muted)" }}><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          <div className="inline-flex items-center rounded px-2 py-1 text-xs font-semibold" style={{ background: "rgba(245,158,11,0.12)", color: "#d97706" }}>
            {reasonLabel(quote.reason)}
          </div>

          {quote.subject && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Email subject</p>
              <p className="text-sm" style={{ color: "var(--text-primary)" }}>{quote.subject}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {fields.map(([label, value]) => (
              <div key={label} className="rounded-lg px-3 py-2" style={{ background: "var(--table-header-bg)" }}>
                <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</p>
                <p className="text-sm font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>{value}</p>
              </div>
            ))}
          </div>

          {quote.notes && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Notes</p>
              <p className="whitespace-pre-wrap text-sm" style={{ color: "var(--text-secondary)" }}>{quote.notes}</p>
            </div>
          )}

          {quote.rawReply && (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Original reply</p>
              <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg p-3 text-xs leading-relaxed" style={{ background: "var(--table-header-bg)", color: "var(--text-secondary)", fontFamily: "inherit" }}>{quote.rawReply}</pre>
            </div>
          )}

          {threadUrl && (
            <a href={threadUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold hover:underline" style={{ color: "var(--brand-accent)" }}>
              <ExternalLink className="h-3.5 w-3.5" /> Open the email thread
            </a>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t px-5 py-4" style={{ borderColor: "var(--divider)" }}>
          <button type="button" onClick={onDelete} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold text-red-600 dark:text-red-400" style={{ borderColor: "rgba(220,38,38,0.35)" }}>
            <Trash2 className="h-4 w-4" /> Delete
          </button>
          <button type="button" onClick={onLink} className="inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-sm font-semibold text-white" style={{ background: "var(--brand-accent)" }}>
            <Link2 className="h-4 w-4" /> Link to a request
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function UnlinkedQuotesPage() {
  const [quotes, setQuotes]     = useState<UnlinkedQuote[]>([])
  const [carriers, setCarriers] = useState<CarrierOption[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [notice, setNotice]     = useState<string | null>(null)

  const [viewing, setViewing]   = useState<UnlinkedQuote | null>(null)
  const [linking, setLinking]   = useState<UnlinkedQuote | null>(null)
  const [deleting, setDeleting] = useState<UnlinkedQuote | null>(null)
  const [delBusy, setDelBusy]   = useState(false)
  const [delError, setDelError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch("/api/carrier-quotes/unlinked")
      if (!res.ok) throw new Error(await readError(res))
      const d = await res.json()
      setQuotes(d.quotes ?? [])
      setCarriers(d.carriers ?? [])
    } catch (e) {
      setError((e as Error).message)
      setQuotes([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  function handleLinked(quoteId: number, ref: string) {
    setQuotes((list) => list.filter((q) => q.id !== quoteId))
    setLinking(null); setViewing(null)
    setNotice(`Quote linked to ${ref}.`)
  }

  async function confirmDelete() {
    if (!deleting) return
    setDelBusy(true); setDelError(null)
    try {
      const res = await fetch("/api/carrier-quotes/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quote_id: deleting.id }),
      })
      if (!res.ok) throw new Error(await readError(res))
      setQuotes((list) => list.filter((q) => q.id !== deleting.id))
      setDeleting(null); setViewing(null)
      setNotice("Quote deleted.")
    } catch (e) {
      setDelError((e as Error).message)
    } finally {
      setDelBusy(false)
    }
  }

  const th = "px-4 py-3 text-[11px] font-semibold uppercase tracking-wide"

  return (
    <div className="portal-page space-y-5 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-[22px] font-bold tracking-tight" style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}>Non-linked Quotes</h2>
          <p className="mt-0.5 text-sm" style={{ color: "var(--text-secondary)" }}>
            Carrier replies the system couldn&apos;t match to a request. Link each one to a request, or delete it.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 self-start rounded-lg border px-3.5 py-1.5 text-xs font-semibold"
          style={{ borderColor: "var(--card-border)", background: "var(--card-bg)", color: "var(--text-secondary)" }}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {notice && (
        <p className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400" style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)" }}>
          <CheckCircle2 className="h-4 w-4 shrink-0" /> {notice}
          <button onClick={() => setNotice(null)} aria-label="Dismiss" className="ml-auto"><X className="h-4 w-4" /></button>
        </p>
      )}
      {error && (
        <p className="rounded-lg px-4 py-3 text-sm text-red-700 dark:text-red-400" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>{error}</p>
      )}

      <div className="ds-card overflow-hidden">
        {loading ? (
          <div className="flex items-center gap-2 px-5 py-10 text-sm" style={{ color: "var(--text-muted)" }}>
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : quotes.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 py-14 text-center">
            <Inbox className="h-8 w-8" style={{ color: "var(--text-muted)" }} />
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Nothing to review</p>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Every carrier reply has been linked to a request.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead style={{ background: "var(--table-header-bg)" }}>
                <tr>
                  {["Received", "Carrier / sender", "Subject", "Rate", "Transit", "Valid until", "Why it's here", "Actions"].map((h) => (
                    <th key={h} className={th} style={{ color: "var(--text-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => {
                  const when = whenText(q.receivedAt)
                  return (
                    <tr
                      key={q.id}
                      onClick={() => setViewing(q)}
                      className="cursor-pointer transition-colors"
                      style={{ borderTop: "1px solid var(--divider)", background: "var(--card-bg)" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--hover-bg)" }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--card-bg)" }}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium" style={{ color: "var(--text-primary)" }}>{when.relative}</p>
                        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{when.exact}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium" style={{ color: "var(--text-primary)" }}>{carrierText(q)}</p>
                        {q.carrierName && q.fromEmail && <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{q.fromEmail}</p>}
                      </td>
                      <td className="max-w-[220px] px-4 py-3">
                        <p className="truncate" style={{ color: "var(--text-secondary)" }} title={q.subject ?? ""}>{q.subject ?? "—"}</p>
                      </td>
                      <td className="px-4 py-3 font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>{rateText(q)}</td>
                      <td className="px-4 py-3 tabular-nums" style={{ color: "var(--text-secondary)" }}>{q.transitDays != null ? `${q.transitDays} d` : "—"}</td>
                      <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>{dateText(q.validityDate)}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded px-2 py-0.5 text-[11px] font-semibold" style={{ background: "rgba(245,158,11,0.12)", color: "#d97706" }}>{reasonLabel(q.reason)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); setLinking(q) }}
                            className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-semibold text-white"
                            style={{ background: "var(--brand-accent)" }}
                          >
                            <Link2 className="h-3.5 w-3.5" /> Link
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setDelError(null); setDeleting(q) }}
                            aria-label="Delete quote"
                            className="rounded-md border p-1.5 text-red-600 dark:text-red-400"
                            style={{ borderColor: "rgba(220,38,38,0.35)" }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {viewing && !linking && !deleting && (
        <DetailDialog
          quote={viewing}
          onClose={() => setViewing(null)}
          onLink={() => setLinking(viewing)}
          onDelete={() => { setDelError(null); setDeleting(viewing) }}
        />
      )}

      {linking && (
        <LinkDialog quote={linking} carriers={carriers} onClose={() => setLinking(null)} onLinked={handleLinked} />
      )}

      <ConfirmStepsDialog
        open={deleting !== null}
        steps={deleting ? [{
          title: "Delete this quote?",
          body: <>The quote from <strong>{carrierText(deleting)}</strong> ({rateText(deleting)}) will be permanently removed from the system. This can&apos;t be undone.</>,
          confirmLabel: "Delete quote",
        }] : []}
        busy={delBusy}
        error={delError}
        onConfirm={confirmDelete}
        onCancel={() => { setDeleting(null); setDelError(null) }}
      />
    </div>
  )
}
