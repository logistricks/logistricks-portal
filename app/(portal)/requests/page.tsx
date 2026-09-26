"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ExternalLink, FileText, Filter, Loader2, Maximize2, RefreshCw, Search, X } from "lucide-react"
import Link from "next/link"
import { useToast } from "@/components/ui/toast"
import { AogBadge, ConfidenceBadge, DgrBadge, SourceBadge, StatusBadge } from "@/components/portal/badges"
import { RequestDetailModal } from "@/components/portal/request-detail-modal"
import { SendToCarriersModal } from "@/components/portal/send-to-carriers-modal"
import { Select } from "@/components/portal/select"
import { type FreightRequest, type RequestStatus, type Source } from "@/lib/portal-data"

const statusOptions = [
  { value: "Pending" as const,                          label: "Pending" },
  { value: "All" as const,                              label: "All Statuses" },
  { value: "Waiting for Approval" as const,             label: "Waiting for Approval" },
  { value: "Rejected" as const,                         label: "Rejected" },
  { value: "Approved - Carrier, Pending Send" as const, label: "Approved – Carrier, Pending Send" },
  { value: "Approved - Carrier, Sent" as const,         label: "Approved – Carrier, Sent" },
  { value: "Approved - Reply, Pending Send" as const,   label: "Approved – Reply, Pending Send" },
  { value: "Approved - Reply, Sent" as const,           label: "Approved – Reply, Sent" },
  { value: "Sent to Carrier" as const,                  label: "Sent to Carrier" },
  { value: "Quoted" as const,                           label: "Quoted" },
  { value: "Closed" as const,                           label: "Closed" },
]

const sourceOptions = [
  { value: "All Sources" as const, label: "All Sources" },
  { value: "Email" as const,       label: "Email" },
  { value: "WhatsApp" as const,    label: "WhatsApp" },
]

const POLL_INTERVAL = 30_000

function parseArrayField(value: string | null | undefined): string {
  if (!value) return ""
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return parsed.join(", ")
  } catch { /* not JSON */ }
  return value
}

export default function RequestsPage() {
  const [requests, setRequests]         = useState<FreightRequest[]>([])
  const [loading, setLoading]           = useState(true)
  const [lastUpdated, setLastUpdated]   = useState<Date | null>(null)

  const [statusFilter, setStatusFilter] = useState<RequestStatus | "All">("Pending")
  const [sourceFilter, setSourceFilter] = useState<Source | "All Sources">("All Sources")
  const [search, setSearch]             = useState("")
  const [selected, setSelected]         = useState<string[]>([])
  const [showRfqModal, setShowRfqModal] = useState(false)
  const [active, setActive]             = useState<FreightRequest | null>(null)
  const [bulkBusy, setBulkBusy]         = useState(false)
  const { success, error: toastError }  = useToast()
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const res = await fetch("/api/requests")
      if (!res.ok) throw new Error("fetch failed")
      const data: FreightRequest[] = await res.json()
      setRequests(data)
      setLastUpdated(new Date())
      setActive((prev) => {
        if (!prev) return prev
        const updated = data.find((r) => r.id === prev.id)
        return updated ?? prev
      })
    } catch {
      // keep stale data on poll failure
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    pollRef.current = setInterval(() => load(true), POLL_INTERVAL)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [load])

  const filtered = useMemo(() => {
    const base = requests.filter((r) => {
      if (statusFilter !== "All" && r.status !== statusFilter) return false
      if (sourceFilter !== "All Sources" && r.source !== sourceFilter) return false
      if (search) {
        const q = search.toLowerCase()
        const hay = `${r.senderName} ${r.cargoType} ${r.originCity} ${r.destinationCity}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    return base.sort((a, b) => {
      const scoreA = (a.aog ? 2 : 0) + (a.dgr ? 1 : 0)
      const scoreB = (b.aog ? 2 : 0) + (b.dgr ? 1 : 0)
      if (scoreB !== scoreA) return scoreB - scoreA
      return 0
    })
  }, [requests, statusFilter, sourceFilter, search])

  function toggle(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }
  function toggleAll() {
    setSelected((s) => (s.length === filtered.length ? [] : filtered.map((r) => r.id)))
  }

  const hasActiveFilters = statusFilter !== "Pending" || sourceFilter !== "All Sources" || search !== ""

  async function bulkUpdateStatus(newStatus: string) {
    if (bulkBusy || selected.length === 0) return
    setBulkBusy(true)
    try {
      const results = await Promise.all(
        selected.map((id) =>
          fetch("/api/requests", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, status: newStatus }),
          }).then((r) => r.ok),
        ),
      )
      const failed = results.filter((ok) => !ok).length
      if (failed > 0) {
        toastError(`${failed} update(s) failed`, "Some requests could not be updated.")
      } else {
        success(
          `${selected.length} request${selected.length > 1 ? "s" : ""} updated`,
          `Marked as "${newStatus}"`,
        )
      }
      setSelected([])
      await load(true)
    } catch {
      toastError("Update failed", "Could not reach the server.")
    } finally {
      setBulkBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="portal-page space-y-5 p-6">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold tracking-tight" style={{ color: "var(--text-primary)", fontFamily: "var(--font-sans)" }}>
            Requests
          </h2>
        </div>
        <div className="flex items-center justify-center gap-2 py-24" style={{ color: "var(--text-muted)" }}>
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading requests…</span>
        </div>
      </div>
    )
  }

  return (
    <div className="portal-page space-y-4 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold tracking-tight" style={{ color: "var(--text-primary)", fontFamily: "var(--font-sans)" }}>
            Requests
          </h2>
          <span className="rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums" style={{ background: "rgba(232,130,26,0.12)", color: "var(--brand-accent)" }}>
            {requests.length}
          </span>
        </div>
        <button
          onClick={() => load()}
          title={lastUpdated ? `Last synced ${lastUpdated.toLocaleTimeString()}` : "Refresh"}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
          style={{ color: "var(--text-secondary)", border: "1px solid var(--card-border)", background: "var(--card-bg)" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--brand-accent)" }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)" }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {/* Filter bar */}
      <div className="ds-card">
        <div className="flex flex-wrap items-center gap-2 p-3">
          <Filter className="h-4 w-4 shrink-0" style={{ color: "var(--text-muted)" }} />
          <Select
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as RequestStatus | "All")}
            options={statusOptions}
          />
          <Select
            value={sourceFilter}
            onChange={(v) => setSourceFilter(v as Source | "All Sources")}
            options={sourceOptions}
          />
          <div className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, cargo, route…"
              className="h-9 w-full rounded-lg pl-9 pr-8 text-sm outline-none"
              style={{
                border: "1px solid var(--card-border)",
                background: "var(--card-bg)",
                color: "var(--text-primary)",
              }}
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }}>
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {hasActiveFilters && (
            <button
              onClick={() => { setStatusFilter("Pending"); setSourceFilter("All Sources"); setSearch("") }}
              className="text-xs font-medium"
              style={{ color: "var(--brand-accent)" }}
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-3 rounded-lg px-4 py-3"
          style={{ background: "rgba(232,130,26,0.08)", border: "1px solid rgba(232,130,26,0.25)" }}
        >
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            {selected.length} selected
          </span>
          <button
            onClick={() => setShowRfqModal(true)}
            disabled={bulkBusy}
            className="rounded-md px-3 py-1.5 text-sm font-bold text-white transition-colors disabled:opacity-50"
            style={{ background: "var(--brand-accent)" }}
          >
            Send to Carriers
          </button>
          <button
            onClick={() => bulkUpdateStatus("Closed")}
            disabled={bulkBusy}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50"
            style={{ border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--text-primary)" }}
          >
            {bulkBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Mark as Closed
          </button>
          <button
            onClick={() => setSelected([])}
            className="ml-auto text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            Clear
          </button>
        </div>
      )}

      {/* Table */}
      <div className="ds-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead style={{ background: "var(--table-header-bg)" }}>
              <tr>
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={filtered.length > 0 && selected.length === filtered.length}
                    onChange={toggleAll}
                    onClick={(e) => e.stopPropagation()}
                    className="h-4 w-4"
                    style={{ accentColor: "var(--brand-accent)" }}
                  />
                </th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Source</th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Sender</th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Route</th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Cargo</th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Received</th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Confidence</th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Flags</th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Status</th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const isAog = r.aog
                return (
                  <tr
                    key={r.id}
                    onClick={() => setActive(r)}
                    className="cursor-pointer transition-colors"
                    style={{
                      borderTop: "1px solid var(--divider)",
                      background: isAog ? "rgba(239,68,68,0.04)" : "var(--card-bg)",
                      borderLeft: isAog ? "3px solid #ef4444" : undefined,
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = isAog ? "rgba(239,68,68,0.08)" : "var(--hover-bg)" }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = isAog ? "rgba(239,68,68,0.04)" : "var(--card-bg)" }}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label={`Select ${r.senderName}`}
                        checked={selected.includes(r.id)}
                        onChange={() => {}}
                        onClick={(e) => toggle(r.id, e)}
                        className="h-4 w-4"
                        style={{ accentColor: "var(--brand-accent)" }}
                      />
                    </td>
                    <td className="px-4 py-3"><SourceBadge source={r.source} /></td>
                    <td className="px-4 py-3">
                      <p className="font-medium" style={{ color: "var(--text-primary)" }}>{r.senderName}</p>
                      <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                        {r.source === "WhatsApp" ? r.senderPhone : r.senderEmail}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="whitespace-nowrap font-medium" style={{ color: "var(--text-primary)" }}>
                        {r.originFlag} {r.originCity} → {r.destinationFlag} {r.destinationCity}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p style={{ color: "var(--text-primary)" }}>{r.cargoType}</p>
                      {r.equipment && (
                        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{parseArrayField(r.equipment)}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums" style={{ color: "var(--text-secondary)" }} title={r.receivedExact}>
                      {r.receivedRelative}
                    </td>
                    <td className="px-4 py-3"><ConfidenceBadge confidence={r.confidence} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {r.aog && <AogBadge />}
                        {r.dgr && <DgrBadge />}
                      </div>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setActive(r)}
                          title="Quick view"
                          className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors"
                          style={{ border: "1px solid var(--card-border)", color: "var(--text-secondary)", background: "var(--card-bg)" }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--brand-accent)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(232,130,26,0.4)" }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--card-border)" }}
                        >
                          <Maximize2 className="h-3 w-3" />
                        </button>
                        <Link
                          href={`/requests/${r.id}`}
                          title="Open full page"
                          className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors"
                          style={{ border: "1px solid var(--card-border)", color: "var(--text-secondary)", background: "var(--card-bg)" }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--brand-accent)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(232,130,26,0.4)" }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--card-border)" }}
                        >
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <FileText className="h-9 w-9" style={{ color: "var(--card-border)" }} />
            <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              {requests.length === 0
                ? "No requests yet — send a test email to see one appear here."
                : "No requests match your filters."}
            </p>
            {hasActiveFilters && (
              <button
                onClick={() => { setStatusFilter("Pending"); setSourceFilter("All Sources"); setSearch("") }}
                className="text-sm font-medium"
                style={{ color: "var(--brand-accent)" }}
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {filtered.length > 0 && (
          <div
            className="flex items-center justify-between px-4 py-3 text-sm"
            style={{ borderTop: "1px solid var(--divider)", color: "var(--text-muted)" }}
          >
            <span>Showing {filtered.length} of {requests.length} requests</span>
          </div>
        )}
      </div>

      {showRfqModal && selected.length > 0 && (
        <SendToCarriersModal
          freightRequestId={selected[0]}
          modes={requests.find(r => r.id === selected[0])?.modes ?? []}
          onClose={() => setShowRfqModal(false)}
          onSent={() => {
            setShowRfqModal(false)
            setSelected([])
          }}
        />
      )}
      {active && (
        <RequestDetailModal
          request={active}
          onClose={() => setActive(null)}
          onFlagChange={(id, aog, dgr) => {
            setRequests((prev) => prev.map((r) => r.id === id ? { ...r, aog, dgr } : r))
            setActive((prev) => prev && prev.id === id ? { ...prev, aog, dgr } : prev)
          }}
        />
      )}
    </div>
  )
}
