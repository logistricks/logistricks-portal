"use client"

import { EmailDropZone } from "@/components/portal/email-drop-zone"
import { IntakeLogButton } from "@/components/portal/intake-log-button"
import { isSeaOnly, exwNeedsAddress } from "@/lib/shipment-labels"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Clock, ExternalLink, Eye, FileText, Loader2, Mail, MapPinOff, MessageCircle, RefreshCw, Search, TriangleAlert, X, Zap } from "lucide-react"
import { useRouter } from "next/navigation"
import { useToast } from "@/components/ui/toast"
import { SpecialRequestsDialog } from "@/components/portal/special-requests"
import { RequestDetailModal } from "@/components/portal/request-detail-modal"
import { SendToCarriersModal } from "@/components/portal/send-to-carriers-modal"
import { type FreightRequest, type RequestStatus } from "@/lib/portal-data"

type Stage = "Pending" | "Waiting" | "Approved" | "Rejected" | "Sent to Carrier" | "Quoted" | "Closed"
const STAGES: Stage[] = ["Pending", "Waiting", "Approved", "Rejected", "Sent to Carrier", "Quoted", "Closed"]
type Target = "Carrier" | "Reply"
type Delivery = "Pending send" | "Sent"

/** "Approved - Carrier, Pending Send" → stage Approved + target Carrier + delivery Pending send. */
function parseStatus(st: RequestStatus): { stage: Stage; target?: Target; delivery?: Delivery } {
  if (st.startsWith("Approved")) {
    return { stage: "Approved", target: /Reply/.test(st) ? "Reply" : "Carrier", delivery: /Pending/.test(st) ? "Pending send" : "Sent" }
  }
  if (st === "Waiting for Approval") return { stage: "Waiting" }
  return { stage: st as Stage }
}

const SOURCES = ["Email", "WhatsApp"] as const
type SourceKey = (typeof SOURCES)[number]

const POLL_INTERVAL = 30_000
const PREFS_KEY = "lt_requests_filters_v2"

function parseArrayField(value: string | null | undefined): string {
  if (!value) return ""
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return parsed.join(", ")
  } catch { /* not JSON */ }
  return value
}

function Toggle({ on, onClick, children, count, tone }: { on: boolean; onClick: () => void; children: React.ReactNode; count?: number; tone?: string }) {
  const c = tone ?? "var(--brand-accent)"
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className="rq-chip-btn inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
      style={{
        border: `1px solid ${on ? c : "var(--card-border)"}`,
        background: on ? `color-mix(in srgb, ${c} 16%, var(--card-bg))` : "var(--card-bg)",
        color: on ? c : "var(--text-secondary)",
      }}
    >
      {children}
      {count !== undefined && (
        <span className="rounded-full px-1.5 text-[10px] tabular-nums" style={{ background: on ? c : "var(--table-header-bg)", color: on ? "#fff" : "var(--text-muted)" }}>{count}</span>
      )}
    </button>
  )
}

function Chip({ tone, icon, children, title }: { tone: "red" | "amber" | "blue" | "slate"; icon?: React.ReactNode; children: React.ReactNode; title?: string }) {
  const t = { red: "#ef4444", amber: "#d97706", blue: "#3b82f6", slate: "#64748b" }[tone]
  return (
    <span title={title} className="inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-bold"
      style={{ background: `color-mix(in srgb, ${t} 14%, transparent)`, color: t, border: `1px solid color-mix(in srgb, ${t} 35%, transparent)` }}>
      {icon}{children}
    </span>
  )
}

const STATUS_TONE: Record<Stage, string> = {
  Pending: "var(--brand-accent)", Waiting: "#d97706", Approved: "#10b981", Rejected: "#ef4444",
  "Sent to Carrier": "#3b82f6", Quoted: "#0ea5e9", Closed: "#64748b",
}

function StatusPill({ status, quoteCount }: { status: RequestStatus; quoteCount?: number }) {
  const { stage, target, delivery } = parseStatus(status)
  const c = STATUS_TONE[stage]
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: `color-mix(in srgb, ${c} 16%, transparent)`, color: c }}>{stage === "Waiting" ? "Waiting for approval" : stage}{stage === "Quoted" && quoteCount ? ` · ${quoteCount}` : ""}</span>
      {target && <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ border: "1px solid var(--card-border)", color: "var(--text-secondary)" }}>{target}</span>}
      {delivery && <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ border: "1px solid var(--card-border)", color: delivery === "Sent" ? "#10b981" : "#d97706" }}>{delivery}</span>}
    </span>
  )
}


export default function RequestsPage() {
  const router = useRouter()
  const [requests, setRequests]         = useState<FreightRequest[]>([])
  const [loading, setLoading]           = useState(true)
  const [lastUpdated, setLastUpdated]   = useState<Date | null>(null)

  const [stages, setStages]     = useState<Stage[]>(["Pending"])
  const [targets, setTargets]   = useState<Target[]>([])
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [sources, setSources]   = useState<SourceKey[]>([])
  const [onlyFlagged, setOnlyFlagged] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const [search, setSearch]             = useState("")
  const [selected, setSelected]         = useState<string[]>([])
  const [showRfqModal, setShowRfqModal] = useState(false)
  const [active, setActive]             = useState<FreightRequest | null>(null)
  const [specialFor, setSpecialFor]       = useState<FreightRequest | null>(null)
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

  // Remember the filters between visits; "/" jumps to search.
  const [prefsReady, setPrefsReady] = useState(false)
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(PREFS_KEY) || "null")
      if (v) { setStages(v.stages ?? ["Pending"]); setTargets(v.targets ?? []); setDeliveries(v.deliveries ?? []); setSources(v.sources ?? []); setOnlyFlagged(!!v.onlyFlagged) }
    } catch { /* ignore */ }
    setPrefsReady(true)
  }, [])
  useEffect(() => {
    if (!prefsReady) return
    try { localStorage.setItem(PREFS_KEY, JSON.stringify({ stages, targets, deliveries, sources, onlyFlagged })) } catch { /* ignore */ }
  }, [prefsReady, stages, targets, deliveries, sources, onlyFlagged])
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (e.key === "/" && !(t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable))) { e.preventDefault(); searchRef.current?.focus() }
    }
    window.addEventListener("keydown", k)
    return () => window.removeEventListener("keydown", k)
  }, [])

  useEffect(() => {
    load()
    pollRef.current = setInterval(() => load(true), POLL_INTERVAL)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [load])

  const flagsOf = useCallback((r: FreightRequest) => ({
    exw: exwNeedsAddress(r.incoterm, r.pickupAddress),
    missing: r.missingFields?.length ?? 0,
    low: r.confidence === "Low",
    urgent: r.urgency === "Urgent",
  }), [])
  const isFlagged = useCallback((r: FreightRequest) => {
    const f = flagsOf(r)
    return r.aog || r.dgr || f.exw || f.missing > 0 || f.low || f.urgent
  }, [flagsOf])

  const stageCounts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const r of requests) { const k = parseStatus(r.status).stage; c[k] = (c[k] ?? 0) + 1 }
    return c
  }, [requests])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const base = requests.filter((r) => {
      const p = parseStatus(r.status)
      if (stages.length && !stages.includes(p.stage)) return false
      if (p.stage === "Approved") {
        if (targets.length && !(p.target && targets.includes(p.target))) return false
        if (deliveries.length && !(p.delivery && deliveries.includes(p.delivery))) return false
      }
      if (sources.length && !sources.includes(r.source as SourceKey)) return false
      if (onlyFlagged && !isFlagged(r)) return false
      if (q) {
        const hay = `${r.requestRef ?? ""} ${r.senderName} ${r.senderEmail} ${r.cargoType} ${r.originCity} ${r.destinationCity} ${r.incoterm}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    return base.sort((a, b) => {
      const sa = (a.aog ? 2 : 0) + (a.dgr ? 1 : 0)
      const sb = (b.aog ? 2 : 0) + (b.dgr ? 1 : 0)
      if (sb !== sa) return sb - sa
      return (b.receivedIso ?? "").localeCompare(a.receivedIso ?? "")
    })
  }, [requests, stages, targets, deliveries, sources, onlyFlagged, search, isFlagged])

  const flip = <T,>(set: React.Dispatch<React.SetStateAction<T[]>>, v: NoInfer<T>) => set((a) => (a.includes(v) ? a.filter((x) => x !== v) : [...a, v]))
  function clearFilters() { setStages(["Pending"]); setTargets([]); setDeliveries([]); setSources([]); setOnlyFlagged(false); setSearch("") }
  function showAll() { setStages([]); setTargets([]); setDeliveries([]) }

  function toggle(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }
  function toggleAll() {
    setSelected((s) => (s.length === filtered.length ? [] : filtered.map((r) => r.id)))
  }

  const hasActiveFilters = !(stages.length === 1 && stages[0] === "Pending") || targets.length > 0 || deliveries.length > 0 || sources.length > 0 || onlyFlagged || search !== ""

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
          <h2 className="text-[28px] font-extrabold leading-tight" style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
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
          <h2 className="text-[28px] font-extrabold leading-tight" style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
            Requests
          </h2>
          <span className="rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums" style={{ background: "rgb(var(--brand-accent-rgb) / 0.12)", color: "var(--brand-accent)" }}>
            {requests.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
        <IntakeLogButton />
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
      </div>

      <EmailDropZone kind="request" slim onDone={() => load(true)} />

      {/* Filter bar */}
      <div className="ds-card">
        <div className="space-y-2.5 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-14 text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Status</span>
            <Toggle on={stages.length === 0} onClick={showAll} count={requests.length} tone="#64748b">All</Toggle>
            {STAGES.map((st) => (
              <Toggle key={st} on={stages.includes(st)} onClick={() => flip(setStages, st)} count={stageCounts[st] ?? 0} tone={STATUS_TONE[st]}>
                {st === "Waiting" ? "Waiting for approval" : st}
              </Toggle>
            ))}
          </div>
          {stages.includes("Approved") && (
            <div className="flex flex-wrap items-center gap-2 pl-0" style={{ animation: "lt-drop-in .18s ease-out" }}>
              <span className="w-14 text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Approved</span>
              <Toggle on={targets.includes("Carrier")} onClick={() => flip(setTargets, "Carrier")} tone="#10b981">Carrier</Toggle>
              <Toggle on={targets.includes("Reply")} onClick={() => flip(setTargets, "Reply")} tone="#10b981">Reply</Toggle>
              <span className="mx-1 h-4 w-px" style={{ background: "var(--divider)" }} />
              <Toggle on={deliveries.includes("Pending send")} onClick={() => flip(setDeliveries, "Pending send")} tone="#d97706">Pending send</Toggle>
              <Toggle on={deliveries.includes("Sent")} onClick={() => flip(setDeliveries, "Sent")} tone="#10b981">Sent</Toggle>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-14 text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Source</span>
            <Toggle on={sources.includes("Email")} onClick={() => flip(setSources, "Email")} tone="#3b82f6"><Mail className="h-3.5 w-3.5" />Email</Toggle>
            <Toggle on={sources.includes("WhatsApp")} onClick={() => flip(setSources, "WhatsApp")} tone="#22c55e"><MessageCircle className="h-3.5 w-3.5" />WhatsApp</Toggle>
            <span className="mx-1 h-4 w-px" style={{ background: "var(--divider)" }} />
            <Toggle on={onlyFlagged} onClick={() => setOnlyFlagged((v) => !v)} tone="#ef4444"><TriangleAlert className="h-3.5 w-3.5" />Needs attention</Toggle>
            <div className="relative ml-auto min-w-[220px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search ref, sender, cargo, route…  ( / )"
                className="h-8 w-full rounded-lg pl-9 pr-8 text-sm outline-none"
                style={{ border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--text-primary)" }}
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} aria-label="Clear search">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="text-xs font-medium" style={{ color: "var(--brand-accent)" }}>Reset</button>
            )}
          </div>
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-3 rounded-lg px-4 py-3"
          style={{ background: "rgb(var(--brand-accent-rgb) / 0.08)", border: "1px solid rgb(var(--brand-accent-rgb) / 0.25)" }}
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
          <table className="rq-table w-full min-w-[900px] text-left text-sm">
            <thead style={{ background: "var(--table-header-bg)" }}>
              <tr>
                <th className="w-10 px-3 py-2.5">
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
                {["Ref", "Sender", "Route", "Cargo", "Flags", "Status", "Received", ""].map((h, i) => (
                  <th key={i} className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const f = flagsOf(r)
                const sea = isSeaOnly(r.modes)
                return (
                  <tr
                    key={r.id}
                    onClick={() => router.push(`/requests/${r.id}`)}
                    className={`rq-row ${r.aog ? "rq-aog" : ""}`}
                    title="Click to open the request"
                  >
                    <td className="px-3 py-2.5">
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
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[13px] font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
                      {r.requestRef ?? (r.id ? `LT-${r.id}` : "")}
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="flex items-center gap-1.5 font-medium" style={{ color: "var(--text-primary)" }}>
                        {r.source === "WhatsApp" ? <MessageCircle className="h-3.5 w-3.5 shrink-0" style={{ color: "#22c55e" }} aria-label="WhatsApp" /> : <Mail className="h-3.5 w-3.5 shrink-0" style={{ color: "#3b82f6" }} aria-label="Email" />}
                        {r.senderName}
                      </p>
                      <p className="max-w-[220px] truncate text-xs" style={{ color: "var(--text-secondary)" }}>
                        {r.source === "WhatsApp" ? r.senderPhone : r.senderEmail}
                      </p>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="whitespace-nowrap font-medium" style={{ color: "var(--text-primary)" }}>
                        {sea && <span className="mr-1 text-[10px] font-bold" style={{ color: "var(--text-muted)" }}>POL</span>}{r.originFlag} {r.originCity} → {sea && <span className="mr-1 text-[10px] font-bold" style={{ color: "var(--text-muted)" }}>POD</span>}{r.destinationFlag} {r.destinationCity}
                      </span>
                      {r.incoterm && <span className="ml-1.5 text-[11px] font-bold" style={{ color: "var(--text-muted)" }}>{r.incoterm}</span>}
                    </td>
                    <td className="max-w-[200px] px-3 py-2.5">
                      <p className="truncate" style={{ color: "var(--text-primary)" }}>{r.cargoType}</p>
                      {r.equipment && <p className="truncate text-xs" style={{ color: "var(--text-secondary)" }}>{parseArrayField(r.equipment)}</p>}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-1">
                        {r.aog && <Chip tone="red" icon={<Zap className="h-3 w-3" />}>AOG</Chip>}
                        {r.dgr && <Chip tone="amber" icon={<TriangleAlert className="h-3 w-3" />}>DGR</Chip>}
                        {f.exw && <Chip tone="red" icon={<MapPinOff className="h-3 w-3" />} title="EXW — pickup address missing">EXW address</Chip>}
                        {f.missing > 0 && <Chip tone="amber" title={`Missing: ${r.missingFields.join(", ")}`}>Missing {f.missing}</Chip>}
                        {(r.specialRequirements?.length ?? 0) > 0 && (
                          <button type="button" onClick={(e) => { e.stopPropagation(); setSpecialFor(r) }} title="Show the special requests" className="rounded-md">
                            <Chip tone="blue">Special {r.specialRequirements.length}</Chip>
                          </button>
                        )}
                        {f.urgent && <Chip tone="blue" icon={<Clock className="h-3 w-3" />}>Urgent</Chip>}
                        {f.low && <Chip tone="slate" title="The AI was not confident reading this request">Low conf.</Chip>}
                        {!isFlagged(r) && !(r.specialRequirements?.length) && <span className="text-xs" style={{ color: "var(--text-muted)" }}>—</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusPill status={r.status} quoteCount={r.activeQuoteCount} />
                      {r.outcome && (
                        <span className="ml-1 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold uppercase" title={r.bookingReference ? `Booking ${r.bookingReference}` : undefined}
                          style={{ background: `color-mix(in srgb, ${r.outcome === "won" ? "#16a34a" : r.outcome === "lost" ? "#ef4444" : "#64748b"} 16%, transparent)`, color: r.outcome === "won" ? "#16a34a" : r.outcome === "lost" ? "#ef4444" : "#64748b" }}>
                          {r.outcome}{r.outcome === "won" && r.paidAt ? " · paid" : ""}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[12.5px] tabular-nums" style={{ color: "var(--text-secondary)" }} title={r.receivedExact}>
                      {r.receivedRelative}
                    </td>
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setActive(r)}
                          title="Quick preview"
                          aria-label={`Quick preview of ${r.requestRef ?? r.senderName}`}
                          className="rq-preview inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-bold text-white shadow-sm"
                          style={{ background: "var(--brand-accent)" }}
                        >
                          <Eye className="h-4 w-4" /> Preview
                        </button>
                        <a
                          href={`/requests/${r.id}`}
                          target="_blank"
                          rel="noopener"
                          title="Open full page in a new tab"
                          aria-label="Open full page in a new tab"
                          className="inline-flex items-center rounded-md p-1.5"
                          style={{ border: "1px solid var(--card-border)", color: "var(--text-secondary)", background: "var(--card-bg)" }}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
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
                onClick={clearFilters}
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
      {specialFor && (
        <SpecialRequestsDialog requirements={specialFor.specialRequirements ?? []} questions={specialFor.availabilityQuestions ?? []} reference={specialFor.requestRef} onClose={() => setSpecialFor(null)} />
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
