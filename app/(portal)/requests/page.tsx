"use client"

/**
 * app/(portal)/requests/page.tsx
 *
 * Fetches freight requests from /api/requests (server-side, service role).
 * Realtime subscription is replaced with 30-second polling + manual refresh,
 * because Supabase realtime requires auth that we no longer use client-side.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { FileText, Loader2, RefreshCw, Search } from "lucide-react"
import { useToast } from "@/components/ui/toast"
import { AogBadge, ConfidenceBadge, DgrBadge, SourceBadge, StatusBadge } from "@/components/portal/badges"
import { RequestDetailModal } from "@/components/portal/request-detail-modal"
import { Select } from "@/components/portal/select"
import { type FreightRequest, type RequestStatus, type Source } from "@/lib/portal-data"

const statusOptions = [
  { value: "Pending" as const,               label: "Pending" },
  { value: "All" as const,                   label: "All Statuses" },
  { value: "Waiting for Approval" as const,  label: "Waiting for Approval" },
  { value: "Rejected" as const,              label: "Rejected" },
  { value: "Approved" as const,              label: "Approved" },
  { value: "Sent to Carrier" as const,       label: "Sent to Carrier" },
  { value: "Quoted" as const,                label: "Quoted" },
  { value: "Closed" as const,                label: "Closed" },
]

const sourceOptions = [
  { value: "All Sources" as const, label: "All Sources" },
  { value: "Email" as const,       label: "Email" },
  { value: "WhatsApp" as const,    label: "WhatsApp" },
]

const POLL_INTERVAL = 30_000 // 30 s


function parseArrayField(value: string | null | undefined): string {
  if (!value) return ""
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return parsed.join("\n")
  } catch { /* not JSON */ }
  return value
}

export default function RequestsPage() {
  const [requests, setRequests]     = useState<FreightRequest[]>([])
  const [loading, setLoading]       = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const [statusFilter, setStatusFilter] = useState<RequestStatus | "All">("Pending")
  const [sourceFilter, setSourceFilter] = useState<Source | "All Sources">("All Sources")
  const [search, setSearch]             = useState("")
  const [selected, setSelected]         = useState<string[]>([])
  const [active, setActive]             = useState<FreightRequest | null>(null)

  const [bulkBusy, setBulkBusy] = useState(false)
  const { success, error: toastError } = useToast()

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const res = await fetch("/api/requests")
      if (!res.ok) throw new Error("fetch failed")
      const data: FreightRequest[] = await res.json()
      setRequests(data)
      setLastUpdated(new Date())
      // Reflect updates inside open modal
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
    // Poll silently every 30 s for new/updated rows
    pollRef.current = setInterval(() => load(true), POLL_INTERVAL)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [load])

  // ── Filters ───────────────────────────────────────────────────
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
    // AOG always first, then DGR-only, then the rest — within each tier sort by received date
    return base.sort((a, b) => {
      const scoreA = (a.aog ? 2 : 0) + (a.dgr ? 1 : 0)
      const scoreB = (b.aog ? 2 : 0) + (b.dgr ? 1 : 0)
      if (scoreB !== scoreA) return scoreB - scoreA
      return 0 // preserve server order (newest first)
    })
  }, [requests, statusFilter, sourceFilter, search])

  // ── Selection ─────────────────────────────────────────────────
  function toggle(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }
  function toggleAll() {
    setSelected((s) => (s.length === filtered.length ? [] : filtered.map((r) => r.id)))
  }

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
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold tracking-tight text-[#0D1B2A] dark:text-[#E2E8F0]"
              style={{ fontFamily: "var(--font-jakarta), var(--font-inter), system-ui, sans-serif" }}>
            Requests
          </h2>
        </div>
        <div className="flex items-center justify-center gap-2 py-24 text-[#94A3B8]">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading requests…</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold tracking-tight text-[#0D1B2A] dark:text-[#E2E8F0]"
              style={{ fontFamily: "var(--font-jakarta), var(--font-inter), system-ui, sans-serif" }}>
            Requests
          </h2>
          {lastUpdated && (
            <button onClick={() => load()}
              title={`Last synced ${lastUpdated.toLocaleTimeString()}`}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[#94A3B8] hover:bg-[#F1F5F9] dark:hover:bg-[#1A2A40]">
              <RefreshCw className="h-3 w-3" />
              <span className="hidden sm:inline">Live</span>
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, cargo, route..."
              className="h-9 w-full rounded border border-[#D1D9E0] bg-white pl-9 pr-3 text-sm outline-none focus:border-[#F97316] focus:shadow-[0_0_0_3px_rgba(249,115,22,0.12)] dark:border-[#1E3A5F] dark:bg-[#111E33] dark:text-[#E2E8F0] sm:w-64" />
          </div>
        </div>
      </div>

      {/* Bulk actions */}
      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded border border-[#F97316]/30 bg-[#FFF7ED] px-4 py-3 dark:bg-[#1A1200]">
          <span className="text-sm font-medium text-[#0D1B2A] dark:text-[#E2E8F0]">{selected.length} requests selected</span>
          <button
            onClick={() => bulkUpdateStatus("Sent to Carrier")}
            disabled={bulkBusy}
            className="flex items-center gap-1.5 rounded bg-[#F97316] px-3 py-1.5 text-sm font-bold text-white hover:bg-[#EA580C] disabled:opacity-50">
            {bulkBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Send to Carriers
          </button>
          <button
            onClick={() => bulkUpdateStatus("Closed")}
            disabled={bulkBusy}
            className="flex items-center gap-1.5 rounded border border-[#E2E8F0] bg-white px-3 py-1.5 text-sm font-bold text-[#0F172A] hover:border-[#F97316]/40 disabled:opacity-50 dark:border-[#1E3A5F] dark:bg-transparent dark:text-[#E2E8F0]">
            {bulkBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Mark as Closed
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded border border-[#E2E8F0] bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)] dark:border-[#1E3A5F] dark:bg-[#111E33]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-[#0D1B2A] text-[11px] uppercase tracking-[0.08em] text-[#94A3B8]">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input type="checkbox" aria-label="Select all"
                    checked={filtered.length > 0 && selected.length === filtered.length}
                    onChange={toggleAll} onClick={(e) => e.stopPropagation()}
                    className="h-4 w-4 accent-[#F97316]" />
                </th>
                <th className="px-4 py-3 font-semibold">Source</th>
                <th className="px-4 py-3 font-semibold">Sender</th>
                <th className="px-4 py-3 font-semibold">Route</th>
                <th className="px-4 py-3 font-semibold">Cargo</th>
                <th className="px-4 py-3 font-semibold">Received</th>
                <th className="px-4 py-3 font-semibold">Confidence</th>
                <th className="px-4 py-3 font-semibold">Flags</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={r.id} onClick={() => setActive(r)}
                  className={`cursor-pointer border-t border-[#E2E8F0] transition-colors hover:bg-[#FFF7ED] dark:border-[#1E3A5F] dark:hover:bg-[#1A2A40] ${
                    r.aog ? "bg-red-50/60 dark:bg-red-950/20 border-l-2 border-l-red-500" : i % 2 === 1 ? "bg-[#F8FAFC] dark:bg-[#0E1A2E]" : "bg-white dark:bg-[#111E33]"
                  }`}>
                  <td className="px-4 py-3">
                    <input type="checkbox" aria-label={`Select ${r.senderName}`}
                      checked={selected.includes(r.id)} onChange={() => {}}
                      onClick={(e) => toggle(r.id, e)} className="h-4 w-4 accent-[#F97316]" />
                  </td>
                  <td className="px-4 py-3"><SourceBadge source={r.source} /></td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-[#0F172A] dark:text-[#E2E8F0]">{r.senderName}</p>
                    <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                      {r.source === "WhatsApp" ? r.senderPhone : r.senderEmail}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-[#0F172A] dark:text-[#E2E8F0]">
                    <span className="whitespace-nowrap">{r.originFlag} {r.originCity} → {r.destinationFlag} {r.destinationCity}</span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-[#0F172A] dark:text-[#E2E8F0]">{r.cargoType}</p>
                    <p className="text-xs text-[#64748B] dark:text-[#94A3B8] whitespace-pre-line">{parseArrayField(r.equipment)}</p>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-[#64748B] dark:text-[#94A3B8]" title={r.receivedExact}>
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
                    <button onClick={(e) => { e.stopPropagation(); setActive(r) }}
                      className="rounded border border-[#F97316] px-3 py-1.5 text-xs font-bold text-[#F97316] transition-colors hover:bg-[#FFF7ED] dark:hover:bg-[#1A1200]">
                      View Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <FileText className="h-10 w-10 text-[#CBD5E1]" />
            <p className="text-sm font-medium text-[#64748B] dark:text-[#94A3B8]">
              {requests.length === 0
                ? "No requests yet — send a test email to see one appear here."
                : "No requests match your filters"}
            </p>
          </div>
        )}

        {filtered.length > 0 && (
          <div className="flex items-center justify-between border-t border-[#E2E8F0] px-4 py-3 text-sm text-[#64748B] dark:border-[#1E3A5F] dark:text-[#94A3B8]">
            <span>Showing 1–{filtered.length} of {filtered.length} requests</span>
            <div className="flex gap-2">
              <button className="rounded border border-[#E2E8F0] px-3 py-1.5 text-xs font-medium text-[#94A3B8] dark:border-[#1E3A5F]" disabled>Previous</button>
              <button className="rounded border border-[#E2E8F0] px-3 py-1.5 text-xs font-medium text-[#94A3B8] dark:border-[#1E3A5F]" disabled>Next</button>
            </div>
          </div>
        )}
      </div>

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
