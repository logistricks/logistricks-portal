"use client"

import { useEffect, useState } from "react"
import {
  CheckCircle,
  Clock,
  Loader2,
  Send,
  XCircle,
  AlertTriangle,
  TrendingDown,
  Bot,
  Trash2,
  ChevronDown,
  ChevronUp,
  Unlink,
  User,
  EyeOff,
  RotateCcw,
} from "lucide-react"
import type { CarrierQuote, CarrierQuoteRequest } from "@/lib/carrier-quotes-queries"
import { fetchQuotesForRequest, isActiveQuote } from "@/lib/carrier-quotes-queries"
import { createClient } from "@/lib/supabase"
import { isExpiredDate } from "@/lib/validity"
import { fmtDateTimeSec, fmtDuration } from "@/lib/duration"
import { QuoteChips, QuoteDetails, hasExtendedData } from "@/components/portal/quote-details"
import { ConfirmStepsDialog, type ConfirmStep } from "@/components/portal/confirm-steps-dialog"

// ─── Helpers ───────────────────────────────────────────────────────────────────

function ResponseTimeBadge({ sentAt, respondedAt }: { sentAt: string; respondedAt: string | null }) {
  // Waiting carriers count up live, to the second; answered ones show the exact time they took.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (respondedAt) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [respondedAt])
  if (!respondedAt) {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-[color-mix(in_srgb,var(--brand-accent)_10%,white)] px-2 py-0.5 text-xs font-semibold tabular-nums text-[var(--brand-accent)]">
        <Clock className="h-3 w-3" />
        {fmtDuration(Math.max(0, now - new Date(sentAt).getTime()))} waiting
      </span>
    )
  }
  return (
    <span title={`RFQ sent ${fmtDateTimeSec(sentAt)} · answered ${fmtDateTimeSec(respondedAt)}`} className="inline-flex items-center gap-1 rounded bg-[#F0FDF4] px-2 py-0.5 text-xs font-semibold tabular-nums text-emerald-600 dark:bg-emerald-900/20">
      <Clock className="h-3 w-3" />
      {fmtDuration(Math.max(0, new Date(respondedAt).getTime() - new Date(sentAt).getTime()))} response
    </span>
  )
}

function StatusIcon({ status }: { status: CarrierQuoteRequest["status"] }) {
  if (status === "responded")
    return <CheckCircle className="h-4 w-4 text-emerald-500" />
  if (status === "declined" || status === "expired")
    return <XCircle className="h-4 w-4 text-red-400" />
  return <Send className="h-4 w-4 text-[#94A3B8]" />
}

/** "Linked by AI: Yes / No" — who attached this quote to the request. */
function LinkedByBadge({ quote }: { quote: CarrierQuote }) {
  if (quote.linkedByAi === null) return null
  return quote.linkedByAi ? (
    <span
      className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: "rgba(59,130,246,0.12)", color: "#3b82f6" }}
      title="Matched to this request automatically"
    >
      <Bot className="h-3 w-3" /> Linked by AI: Yes
    </span>
  ) : (
    <span
      className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: "var(--table-header-bg)", color: "var(--text-secondary)" }}
      title={quote.linkedBy ? `Linked manually by ${quote.linkedBy}` : "Linked manually"}
    >
      <User className="h-3 w-3" /> Linked by AI: No
    </span>
  )
}

function rateLabel(q: CarrierQuote): string {
  if (q.rateUsd != null) return `$${q.rateUsd.toLocaleString("en-US")}`
  if (q.rateOriginal != null) return `${q.rateOriginal.toLocaleString()} ${q.rateCurrency}`
  return "no rate"
}

// ─── Main component ─────────────────────────────────────────────────────────

interface Props {
  freightRequestId: string
  /** Closed / completed request: unlink and delete are disabled. */
  locked?: boolean
  /** Called after a quote was unlinked or deleted, so siblings can refresh. */
  onChanged?: () => void
  /** Reports the carrier quotes that are still active (not disregarded) whenever they load or change. */
  onActiveQuotes?: (quotes: CarrierQuote[]) => void
}

export function QuoteComparisonPanel({ freightRequestId, locked = false, onChanged, onActiveQuotes }: Props) {
  const [rows, setRows]       = useState<CarrierQuoteRequest[]>([])
  const [loading, setLoading] = useState(true)

  const [pending, setPending] = useState<{
    quoteId: number
    action: "unlink" | "delete" | "disregard" | "reactivate"
    carrierName: string
    rate: string
  } | null>(null)
  const [expanded, setExpanded]     = useState<Set<number>>(new Set())
  const [actionBusy, setActionBusy]   = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  async function load() {
    const data = await fetchQuotesForRequest(createClient(), freightRequestId)
    setRows(data)
    setLoading(false)
    onActiveQuotes?.(data.map((r) => r.quote).filter((q): q is CarrierQuote => isActiveQuote(q)))
  }

  useEffect(() => { void load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [freightRequestId])

  async function runAction() {
    if (!pending) return
    setActionBusy(true); setActionError(null)
    try {
      const isDis = pending.action === "disregard" || pending.action === "reactivate"
      const res = await fetch(`/api/carrier-quotes/${isDis ? "disregard" : pending.action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isDis ? { quote_id: pending.quoteId, disregard: pending.action === "disregard" } : { quote_id: pending.quoteId }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? `Server error ${res.status}`)
      }
      setPending(null)
      await load()
      onChanged?.()
    } catch (e) {
      setActionError((e as Error).message)
    } finally {
      setActionBusy(false)
    }
  }

  const confirmSteps: ConfirmStep[] = !pending ? [] : pending.action === "disregard"
    ? [
        {
          title: "Disregard this quote?",
          body: <>The quote from <strong>{pending.carrierName}</strong> ({pending.rate}) will be greyed out. It can no longer be used to build a quotation or be sent to the original sender. You can reactivate it at any time.</>,
          confirmLabel: "Continue",
        },
        {
          title: "Confirm disregard",
          body: <>Final check: <strong>{pending.carrierName}</strong> will stop counting as an active quotation on this request.</>,
          confirmLabel: "Disregard quote",
        },
      ]
    : pending.action === "reactivate"
    ? [
        {
          title: "Reactivate this quote?",
          body: <>The quote from <strong>{pending.carrierName}</strong> ({pending.rate}) will count again and can be used in a quotation.</>,
          confirmLabel: "Continue",
        },
        {
          title: "Confirm reactivation",
          body: <>Final check: reactivate the <strong>{pending.carrierName}</strong> quote.</>,
          confirmLabel: "Reactivate quote",
        },
      ]
    : pending.action === "unlink"
    ? [
        {
          title: "Unlink this quote?",
          body: <>The quote from <strong>{pending.carrierName}</strong> ({pending.rate}) will be taken off this request and moved to Non-linked Quotes. You can link it again later.</>,
          confirmLabel: "Continue",
        },
        {
          title: "Confirm unlink",
          body: <>Final check: this request will no longer count the <strong>{pending.carrierName}</strong> quote.</>,
          confirmLabel: "Unlink quote",
        },
      ]
    : [
        {
          title: "Delete this quote?",
          body: <>The quote from <strong>{pending.carrierName}</strong> ({pending.rate}) will be removed from the system.</>,
          confirmLabel: "Continue",
        },
        {
          title: "Delete permanently",
          body: <>This is the final confirmation. The <strong>{pending.carrierName}</strong> quote will be deleted for good and cannot be recovered.</>,
          confirmLabel: "Delete quote",
        },
      ]

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-[#94A3B8]">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading quotes…
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="rounded border border-dashed border-[#CBD5E1] px-4 py-6 text-center text-sm text-[#94A3B8] dark:border-[#1E3A5F]">
        No carriers contacted yet. Use "Send to Carriers" to request quotes.
      </div>
    )
  }

  const respondedRows = rows.filter((r) => r.status === "responded" && isActiveQuote(r.quote))
  const disregardedCount = rows.filter((r) => r.quote?.disregarded).length
  const bestRate      = respondedRows.length
    ? Math.min(...respondedRows.map((r) => r.quote!.rateUsd ?? Infinity))
    : null

  return (
    <div className="space-y-3">
      {/* Summary line */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-[#64748B] dark:text-[#94A3B8]">
        <span>{rows.length} carrier{rows.length !== 1 ? "s" : ""} contacted</span>
        <span className="text-[#CBD5E1]">·</span>
        <span className="text-emerald-600 dark:text-emerald-400">
          {respondedRows.length} active quote{respondedRows.length !== 1 ? "s" : ""}
        </span>
        {disregardedCount > 0 && (<><span className="text-[#CBD5E1]">·</span><span>{disregardedCount} disregarded</span></>)}
        <span className="text-[#CBD5E1]">·</span>
        <span>{rows.filter((r) => r.status === "sent").length} pending</span>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {rows.map((row) => {
          const off = row.quote?.disregarded === true
          const expired = !off && isExpiredDate(row.quote?.validityDate)
          const isBest = !off && row.quote?.rateUsd != null && row.quote.rateUsd === bestRate
          return (
            <div
              key={row.id}
              className={`relative overflow-hidden rounded border bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)] dark:bg-[#111E33] ${
                off ? "opacity-60 grayscale " : ""}${
                isBest
                  ? "border-emerald-400 dark:border-emerald-500"
                  : "border-[#E2E8F0] dark:border-[#1E3A5F]"
              }`}
            >
              {off && (
                <div className="absolute right-0 top-0 rounded-bl bg-slate-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                  Disregarded
                </div>
              )}
              {expired && (
                <div className="absolute left-0 top-0 rounded-br bg-red-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                  Expired
                </div>
              )}
              {isBest && (
                <div className="absolute right-0 top-0 rounded-bl bg-emerald-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                  Best Rate
                </div>
              )}

              {/* Carrier header */}
              <div className="mb-3 flex items-start gap-2">
                <StatusIcon status={row.status} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[#0D1B2A] dark:text-[#E2E8F0]">
                    {row.carrierName}
                  </p>
                  <ResponseTimeBadge sentAt={row.sentAt} respondedAt={row.respondedAt} />
                </div>
              </div>

              {/* Quote details */}
              {row.quote ? (
                <div className="space-y-1.5 border-t border-[#F1F5F9] pt-3 dark:border-[#1A2A40]">
                  {/* Rate */}
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-[#64748B] dark:text-[#94A3B8]">Rate</span>
                    <span
                      className="text-lg font-black tabular-nums text-[#0D1B2A] dark:text-[#E2E8F0]"
                      style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
                    >
                      {row.quote.rateUsd != null
                        ? `$${row.quote.rateUsd.toLocaleString("en-US", { minimumFractionDigits: 0 })}`
                        : row.quote.rateOriginal != null
                        ? `${row.quote.rateOriginal.toLocaleString()} ${row.quote.rateCurrency}`
                        : "—"}
                      {isBest && bestRate !== null && respondedRows.length > 1 && (
                        <span className="ml-1.5 text-xs font-semibold text-emerald-500">
                          <TrendingDown className="inline h-3 w-3" />
                          {" "}Lowest
                        </span>
                      )}
                    </span>
                  </div>

                  {/* Transit */}
                  {row.quote.transitDays != null && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[#64748B] dark:text-[#94A3B8]">Transit</span>
                      <span className="text-xs font-semibold text-[#0F172A] dark:text-[#E2E8F0]">
                        {row.quote.transitDays} days
                      </span>
                    </div>
                  )}

                  {/* Validity */}
                  {row.quote.validityDate && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[#64748B] dark:text-[#94A3B8]">Valid until</span>
                      <span className={`text-xs font-semibold ${expired ? "text-red-600 dark:text-red-400" : "text-[#0F172A] dark:text-[#E2E8F0]"}`}>
                        {expired && "Expired · "}
                        {new Date(row.quote.validityDate).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                  )}

                  {/* Free days */}
                  {row.quote.freeDays != null && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[#64748B] dark:text-[#94A3B8]">Free days</span>
                      <span className="text-xs font-semibold text-[#0F172A] dark:text-[#E2E8F0]">
                        {row.quote.freeDays} days
                      </span>
                    </div>
                  )}

                  <div className="pt-1"><QuoteChips ext={row.quote.ext} /></div>

                  {/* Chargeable weight headline */}
                  {row.quote.ext.chargeableWeight != null && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[#64748B] dark:text-[#94A3B8]">Chargeable</span>
                      <span className="text-xs font-semibold text-[#0F172A] dark:text-[#E2E8F0]">
                        {row.quote.ext.chargeableWeight.toLocaleString("en-US", { maximumFractionDigits: 3 })} {row.quote.ext.chargeableUnit === "rt" ? "RT" : "kg"}
                      </span>
                    </div>
                  )}

                  {/* Notes */}
                  {row.quote.notes && (
                    <p className="mt-1 rounded bg-[#F8FAFC] px-2 py-1.5 text-[11px] leading-relaxed text-[#64748B] dark:bg-[#0E1A2E] dark:text-[#94A3B8]">
                      {row.quote.notes}
                    </p>
                  )}

                  {hasExtendedData(row.quote.ext) && (
                    <>
                      <button
                        type="button"
                        onClick={() => setExpanded((prev) => {
                          const next = new Set(prev); const id = row.quote!.id
                          if (next.has(id)) next.delete(id); else next.add(id)
                          return next
                        })}
                        className="flex w-full items-center justify-center gap-1 rounded border py-1 text-[11px] font-semibold"
                        style={{ borderColor: "var(--card-border)", color: "var(--text-secondary)" }}
                      >
                        {expanded.has(row.quote.id)
                          ? <><ChevronUp className="h-3 w-3" /> Hide full details</>
                          : <><ChevronDown className="h-3 w-3" /> Show full details</>}
                      </button>
                      {expanded.has(row.quote.id) && <QuoteDetails ext={row.quote.ext} />}
                    </>
                  )}

                  {/* Who linked it + unlink / delete */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                    <LinkedByBadge quote={row.quote} />
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        disabled={locked}
                        title={locked ? "Closed or completed requests can't be changed" : off ? "Make this quote active again" : "Grey this quote out so it can't be used or sent"}
                        onClick={() => setPending({ quoteId: row.quote!.id, action: off ? "reactivate" : "disregard", carrierName: row.carrierName, rate: rateLabel(row.quote!) })}
                        className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                        style={{ borderColor: "var(--card-border)", color: "var(--text-primary)" }}
                      >
                        {off ? <><RotateCcw className="h-3 w-3" /> Reactivate</> : <><EyeOff className="h-3 w-3" /> Disregard</>}
                      </button>
                      <button
                        type="button"
                        disabled={locked}
                        title={locked ? "Closed or completed requests can't be changed" : "Move this quote back to Non-linked Quotes"}
                        onClick={() => setPending({ quoteId: row.quote!.id, action: "unlink", carrierName: row.carrierName, rate: rateLabel(row.quote!) })}
                        className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                        style={{ borderColor: "var(--card-border)", color: "var(--text-primary)" }}
                      >
                        <Unlink className="h-3 w-3" /> Unlink
                      </button>
                      <button
                        type="button"
                        disabled={locked}
                        title={locked ? "Closed or completed requests can't be changed" : "Delete this quote from the system"}
                        onClick={() => setPending({ quoteId: row.quote!.id, action: "delete", carrierName: row.carrierName, rate: rateLabel(row.quote!) })}
                        className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-semibold text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-400"
                        style={{ borderColor: "rgba(220,38,38,0.35)" }}
                      >
                        <Trash2 className="h-3 w-3" /> Delete
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 border-t border-[#F1F5F9] pt-3 text-xs text-[#94A3B8] dark:border-[#1A2A40]">
                  {row.status === "declined" ? (
                    <><XCircle className="h-3.5 w-3.5 text-red-400" /> Declined</>
                  ) : row.status === "expired" ? (
                    <><AlertTriangle className="h-3.5 w-3.5 text-amber-400" /> Expired</>
                  ) : (
                    <><Clock className="h-3.5 w-3.5" /> Awaiting response</>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <ConfirmStepsDialog
        open={pending !== null}
        steps={confirmSteps}
        busy={actionBusy}
        error={actionError}
        onConfirm={runAction}
        onCancel={() => { setPending(null); setActionError(null) }}
      />
    </div>
  )
}
