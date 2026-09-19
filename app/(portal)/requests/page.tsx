"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { FileText, Loader2, RefreshCw, Search } from "lucide-react"
import { ConfidenceBadge, SourceBadge, StatusBadge } from "@/components/portal/badges"
import { RequestDetailModal } from "@/components/portal/request-detail-modal"
import { type FreightRequest, type RequestStatus, type Source } from "@/lib/portal-data"
import { fetchRequests, subscribeToRequests } from "@/lib/supabase-queries"
import { createClient } from "@/lib/supabase"

const statusFilters: (RequestStatus | "All")[] = ["Pending", "All", "Sent to Carrier", "Quoted", "Closed"]
const sourceFilters: (Source | "All Sources")[] = ["All Sources", "Email", "WhatsApp"]

export default function RequestsPage() {
  const [requests, setRequests]     = useState<FreightRequest[]>([])
  const [loading, setLoading]       = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const [statusFilter, setStatusFilter] = useState<RequestStatus | "All">("Pending")
  const [sourceFilter, setSourceFilter] = useState<Source | "All Sources">("All Sources")
  const [search, setSearch]         = useState("")
  const [selected, setSelected]     = useState<string[]>([])
  const [active, setActive]         = useState<FreightRequest | null>(null)

  // ── Client automation flags ──────────────────────────────────
  const [requireCriticalData, setRequireCriticalData] = useState(false)
  const [criticalFields, setCriticalFields]           = useState<string[]>([])

  // ── Fetch + subscribe ────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const clientCode = (() => { try { return sessionStorage.getItem("portal_client_code") ?? "" } catch { return "" } })()
    const data = await fetchRequests(supabase, clientCode)
    setRequests(data)
    setLastUpdated(new Date())
    setLoading(false)
  }, [])

  useEffect(() => {
    load()

    const supabase = createClient()
    const clientCode = (() => { try { return sessionStorage.getItem("portal_client_code") ?? "" } catch { return "" } })()
    const unsubscribe = subscribeToRequests(
      supabase,
      // INSERT — prepend to list, show live badge
      (newRow) => {
        setRequests((prev) => [newRow, ...prev])
        setLastUpdated(new Date())
      },
      // UPDATE — replace the matching row in place
      (updatedRow) => {
        setRequests((prev) =>
          prev.map((r) => (r.id === updatedRow.id ? updatedRow : r)),
        )
        // Reflect update inside open modal too
        setActive((prev) => (prev?.id === updatedRow.id ? updatedRow : prev))
      },
      clientCode,
    )

    return unsubscribe
  }, [load])

  // ── Load client automation flags ─────────────────────────────
  useEffect(() => {
    async function loadClientFlags() {
      try {
        const code = sessionStorage.getItem("portal_client_code")
        if (!code) return
        const supabase = createClient()
        const { data } = await supabase
          .from("clients")
          .select("require_critical_data, critical_fields")
          .eq("client_code", code)
          .single()
        if (data) {
          setRequireCriticalData(data.require_critical_data ?? false)
          setCriticalFields(data.critical_fields ?? [])
        }
      } catch {
        // flags remain at defaults
      }
    }
    loadClientFlags()
  }, [])

  // ── Filter ───────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return requests.filter((r) => {
      if (statusFilter !== "All" && r.status !== statusFilter) return false
      if (sourceFilter !== "All Sources" && r.source !== sourceFilter) return false
      if (search) {
        const q = search.toLowerCase()
        const hay = `${r.senderName} ${r.cargoType} ${r.originCity} ${r.destinationCity}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [requests, statusFilter, sourceFilter, search])

  // ── Selection ────────────────────────────────────────────────
  function toggle(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }
  function toggleAll() {
    setSelected((s) => (s.length === filtered.length ? [] : filtered.map((r) => r.id)))
  }

  // ── Loading skeleton ─────────────────────────────────────────
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
            <button
              onClick={load}
              title={`Last synced ${lastUpdated.toLocaleTimeString()}`}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[#94A3B8] hover:bg-[#F1F5F9] dark:hover:bg-[#1A2A40]"
            >
              <RefreshCw className="h-3 w-3" />
              <span className="hidden sm:inline">Live</span>
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as RequestStatus | "All")}
            className="h-9 rounded border border-[#D1D9E0] bg-white px-3 text-sm outline-none focus:border-[#F97316] focus:shadow-[0_0_0_3px_rgba(249,115,22,0.12)] dark:border-[#1E3A5F] dark:bg-[#111E33] dark:text-[#E2E8F0]"
          >
            {statusFilters.map((s) => (
              <option key={s} value={s}>{s === "All" ? "All Statuses" : s}</option>
            ))}
          </select>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as Source | "All Sources")}
            className="h-9 rounded border border-[#D1D9E0] bg-white px-3 text-sm outline-none focus:border-[#F97316] focus:shadow-[0_0_0_3px_rgba(249,115,22,0.12)] dark:border-[#1E3A5F] dark:bg-[#111E33] dark:text-[#E2E8F0]"
          >
            {sourceFilters.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, cargo, route..."
              className="h-9 w-full rounded border border-[#D1D9E0] bg-white pl-9 pr-3 text-sm outline-none focus:border-[#F97316] focus:shadow-[0_0_0_3px_rgba(249,115,22,0.12)] dark:border-[#1E3A5F] dark:bg-[#111E33] dark:text-[#E2E8F0] sm:w-64"
            />
          </div>
        </div>
      </div>

      {/* Bulk actions */}
      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded border border-[#F97316]/30 bg-[#FFF7ED] px-4 py-3 dark:bg-[#1A1200]">
          <span className="text-sm font-medium text-[#0D1B2A] dark:text-[#E2E8F0]">{selected.length} requests selected</span>
          <button className="rounded bg-[#F97316] px-3 py-1.5 text-sm font-bold text-white hover:bg-[#EA580C]">
            Send to Carriers
          </button>
          <button className="rounded border border-[#E2E8F0] bg-white px-3 py-1.5 text-sm font-bold text-[#0F172A] hover:border-[#F97316]/40 dark:border-[#1E3A5F] dark:bg-transparent dark:text-[#E2E8F0]">
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
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={filtered.length > 0 && selected.length === filtered.length}
                    onChange={toggleAll}
                    onClick={(e) => e.stopPropagation()}
                    className="h-4 w-4 accent-[#F97316]"
                  />
                </th>
                <th className="px-4 py-3 font-semibold">Source</th>
                <th className="px-4 py-3 font-semibold">Sender</th>
                <th className="px-4 py-3 font-semibold">Route</th>
                <th className="px-4 py-3 font-semibold">Cargo</th>
                <th className="px-4 py-3 font-semibold">Received</th>
                <th className="px-4 py-3 font-semibold">Confidence</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr
                  key={r.id}
                  onClick={() => setActive(r)}
                  className={`cursor-pointer border-t border-[#E2E8F0] transition-colors hover:bg-[#FFF7ED] dark:border-[#1E3A5F] dark:hover:bg-[#1A2A40] ${
                    i % 2 === 1 ? "bg-[#F8FAFC] dark:bg-[#0E1A2E]" : "bg-white dark:bg-[#111E33]"
                  }`}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label={`Select ${r.senderName}`}
                      checked={selected.includes(r.id)}
                      onChange={() => {}}
                      onClick={(e) => toggle(r.id, e)}
                      className="h-4 w-4 accent-[#F97316]"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <SourceBadge source={r.source} />
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-[#0F172A] dark:text-[#E2E8F0]">{r.senderName}</p>
                    <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                      {r.source === "WhatsApp" ? r.senderPhone : r.senderEmail}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-[#0F172A] dark:text-[#E2E8F0]">
                    <span className="whitespace-nowrap">
                      {r.originFlag} {r.originCity} → {r.destinationFlag} {r.destinationCity}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-[#0F172A] dark:text-[#E2E8F0]">{r.cargoType}</p>
                    <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">{r.equipment}</p>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-[#64748B] dark:text-[#94A3B8]" title={r.receivedExact}>
                    {r.receivedRelative}
                  </td>
                  <td className="px-4 py-3">
                    <ConfidenceBadge confidence={r.confidence} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={(e) => { e.stopPropagation(); setActive(r) }}
                      className="rounded border border-[#F97316] px-3 py-1.5 text-xs font-bold text-[#F97316] transition-colors hover:bg-[#FFF7ED] dark:hover:bg-[#1A1200]"
                    >
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
              {requests.length === 0 ? "No requests yet — send a test email to n8n to see one appear here." : "No requests match your filters"}
            </p>
          </div>
        )}

        {filtered.length > 0 && (
          <div className="flex items-center justify-between border-t border-[#E2E8F0] px-4 py-3 text-sm text-[#64748B] dark:border-[#1E3A5F] dark:text-[#94A3B8]">
            <span>
              Showing 1–{filtered.length} of {filtered.length} requests
            </span>
            <div className="flex gap-2">
              <button className="rounded border border-[#E2E8F0] px-3 py-1.5 text-xs font-medium text-[#94A3B8] dark:border-[#1E3A5F]" disabled>
                Previous
              </button>
              <button className="rounded border border-[#E2E8F0] px-3 py-1.5 text-xs font-medium text-[#94A3B8] dark:border-[#1E3A5F]" disabled>
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {active && (
        <RequestDetailModal
          request={active}
          onClose={() => setActive(null)}
          requireCriticalData={requireCriticalData}
          criticalFields={criticalFields}
        />
      )}
    </div>
  )
}
