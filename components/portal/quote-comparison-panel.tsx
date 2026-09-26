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
} from "lucide-react"
import type { CarrierQuoteRequest } from "@/lib/carrier-quotes-queries"
import { fetchQuotesForRequest } from "@/lib/carrier-quotes-queries"
import { createClient } from "@/lib/supabase"

// ─── Helpers ───────────────────────────────────────────────────────────────────

function ResponseTimeBadge({ sentAt, respondedAt }: { sentAt: string; respondedAt: string | null }) {
  if (!respondedAt) {
    const hours = Math.floor((Date.now() - new Date(sentAt).getTime()) / 3_600_000)
    return (
      <span className="inline-flex items-center gap-1 rounded bg-[#FFF7ED] px-2 py-0.5 text-xs font-semibold text-[#F97316]">
        <Clock className="h-3 w-3" />
        {hours < 1 ? "Waiting" : `${hours}h waiting`}
      </span>
    )
  }
  const hrs = Math.round(
    (new Date(respondedAt).getTime() - new Date(sentAt).getTime()) / 3_600_000,
  )
  return (
    <span className="inline-flex items-center gap-1 rounded bg-[#F0FDF4] px-2 py-0.5 text-xs font-semibold text-emerald-600 dark:bg-emerald-900/20">
      <Clock className="h-3 w-3" />
      {hrs < 1 ? "<1h" : `${hrs}h`} response
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

// ─── Main component ─────────────────────────────────────────────────────────

interface Props {
  freightRequestId: string
}

export function QuoteComparisonPanel({ freightRequestId }: Props) {
  const [rows, setRows]       = useState<CarrierQuoteRequest[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    fetchQuotesForRequest(supabase, freightRequestId).then((data) => {
      setRows(data)
      setLoading(false)
    })
  }, [freightRequestId])

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

  const respondedRows = rows.filter((r) => r.status === "responded" && r.quote)
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
          {respondedRows.length} responded
        </span>
        <span className="text-[#CBD5E1]">·</span>
        <span>{rows.filter((r) => r.status === "sent").length} pending</span>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {rows.map((row) => {
          const isBest = row.quote?.rateUsd != null && row.quote.rateUsd === bestRate
          return (
            <div
              key={row.id}
              className={`relative overflow-hidden rounded border bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)] dark:bg-[#111E33] ${
                isBest
                  ? "border-emerald-400 dark:border-emerald-500"
                  : "border-[#E2E8F0] dark:border-[#1E3A5F]"
              }`}
            >
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
                      style={{ fontFamily: "var(--font-jakarta), system-ui, sans-serif" }}
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
                      <span className="text-xs font-semibold text-[#0F172A] dark:text-[#E2E8F0]">
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

                  {/* Notes */}
                  {row.quote.notes && (
                    <p className="mt-1 rounded bg-[#F8FAFC] px-2 py-1.5 text-[11px] leading-relaxed text-[#64748B] dark:bg-[#0E1A2E] dark:text-[#94A3B8]">
                      {row.quote.notes}
                    </p>
                  )}
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
    </div>
  )
}
