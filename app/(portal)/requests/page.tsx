"use client"

import { HeroChip, PageHero } from "@/components/portal/page-hero"
import { TYPE_LABEL } from "@/lib/shipment-types"
import { EmailDropZone } from "@/components/portal/email-drop-zone"
import { IntakeLogButton } from "@/components/portal/intake-log-button"
import { isSeaOnly, exwNeedsAddress } from "@/lib/shipment-labels"
import { regionOf, toCountryCode } from "@/lib/countries"
import { Seg } from "@/components/portal/seg"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, Clock, ExternalLink, Eye, FileText, LayoutGrid, List as ListIcon, Loader2, Mail, MapPinOff, MessageCircle, PenLine, RefreshCw, Search, SlidersHorizontal, TriangleAlert, X, Zap } from "lucide-react"
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
/** Won deals show how far they are: to book → booked → invoiced → paid. Closed is only "dismissed" and never a result. */
const outcomeLabel = (r: FreightRequest) => r.outcome === "won" ? `won · ${r.paidAt ? "paid" : r.invoicedAt ? "invoiced" : r.bookedAt ? "booked" : "to book"}` : r.outcome ?? ""

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
      className="rq-chip-btn inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13.5px] font-bold"
      style={{
        border: `1.5px solid ${on ? c : "var(--card-border)"}`,
        background: on ? `color-mix(in srgb, ${c} 16%, var(--card-bg))` : "var(--card-bg)",
        color: on ? c : "var(--text-secondary)",
      }}
    >
      {children}
      {count !== undefined && (
        <span className="rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums" style={{ background: on ? c : "var(--table-header-bg)", color: on ? "#fff" : "var(--text-muted)" }}>{count}</span>
      )}
    </button>
  )
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 sm:justify-start">
      <span className="w-[74px] shrink-0 text-center text-[10.5px] font-bold uppercase tracking-wider sm:text-left" style={{ color: "var(--text-secondary)" }}>{label}</span>
      {children}
    </div>
  )
}

function Chip({ tone, icon, children, title }: { tone: "red" | "amber" | "blue" | "slate"; icon?: React.ReactNode; children: React.ReactNode; title?: string }) {
  const t = { red: "#ef4444", amber: "#d97706", blue: "#3b82f6", slate: "#64748b" }[tone]
  return (
    <span title={title} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-[12px] font-bold"
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
      <span className="rounded-full px-3 py-1 text-[12px] font-bold" style={{ background: `color-mix(in srgb, ${c} 16%, transparent)`, color: c }}>{stage === "Waiting" ? "Waiting for approval" : stage}{stage === "Quoted" && quoteCount ? ` · ${quoteCount}` : ""}</span>
      {target && <span className="rounded-full px-3 py-1 text-[12px] font-semibold" style={{ border: "1px solid var(--card-border)", color: "var(--text-secondary)" }}>{target}</span>}
      {delivery && <span className="rounded-full px-3 py-1 text-[12px] font-semibold" style={{ border: "1px solid var(--card-border)", color: delivery === "Sent" ? "#10b981" : "#d97706" }}>{delivery}</span>}
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
  const [directions, setDirections] = useState<("Export" | "Import" | "Cross-trade")[]>([])
  const [regions, setRegions] = useState<string[]>([])
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [dropOpen, setDropOpen] = useState(false)
  const [manualSignal, setManualSignal] = useState(0)
  const [home, setHome] = useState<{ port: string | null; airport: string | null }>({ port: null, airport: null })
  const homeCodes = useMemo(() => Array.from(new Set([home.port, home.airport].filter(Boolean) as string[])), [home])
  const [onlyOverdue, setOnlyOverdue] = useState(false)
  const [lateMap, setLateMap] = useState<Record<string, { lateH: number; title: string; stuck: boolean }>>({})
  const [results, setResults] = useState<("won" | "lost")[]>([])
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
  const [view, setView] = useState<"cards" | "table">("cards")
  const [sortBy, setSortBy] = useState<"priority" | "newest" | "oldest">("priority")
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(PREFS_KEY) || "null")
      if (v) { setStages(v.stages ?? ["Pending"]); setTargets(v.targets ?? []); setDeliveries(v.deliveries ?? []); setSources(v.sources ?? []); setOnlyFlagged(!!v.onlyFlagged); setDirections(v.directions ?? []); setRegions(v.regions ?? []); setFiltersOpen(!!v.filtersOpen) }
    } catch { /* ignore */ }
    try { const v = localStorage.getItem("lt_requests_view"); if (v === "table" || v === "cards") setView(v) } catch { /* ignore */ }
    try { const v = localStorage.getItem("lt_requests_sort"); if (v === "priority" || v === "newest" || v === "oldest") setSortBy(v) } catch { /* ignore */ }
    // Links from the dashboard: ?stage=Quoted&q=Amman&attention=1
    try {
      const p = new URLSearchParams(window.location.search)
      const st = p.get("stage")
      if (st) { const hit = STAGES.find((x) => x.toLowerCase() === st.toLowerCase()); setStages(hit ? [hit] : []); setTargets([]); setDeliveries([]) }
      if (p.get("attention")) setOnlyFlagged(true)
      const oc = p.get("outcome"); if (oc === "won" || oc === "lost") { setResults([oc]); setStages([]); setTargets([]); setDeliveries([]) }
      const qq = p.get("q"); if (qq) setSearch(qq)
    } catch { /* ignore */ }
    setPrefsReady(true)
  }, [])
  useEffect(() => { try { localStorage.setItem("lt_requests_view", view) } catch { /* ignore */ } }, [view])
  useEffect(() => { try { localStorage.setItem("lt_requests_sort", sortBy) } catch { /* ignore */ } }, [sortBy])
  useEffect(() => {
    if (!prefsReady) return
    try { localStorage.setItem(PREFS_KEY, JSON.stringify({ stages, targets, deliveries, sources, onlyFlagged, directions, regions, filtersOpen })) } catch { /* ignore */ }
  }, [prefsReady, stages, targets, deliveries, sources, onlyFlagged, directions, regions, filtersOpen])
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (e.key === "/" && !(t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable))) { e.preventDefault(); setFiltersOpen(true); setTimeout(() => searchRef.current?.focus(), 60) }
    }
    window.addEventListener("keydown", k)
    return () => window.removeEventListener("keydown", k)
  }, [])

  useEffect(() => {
    const loadHome = () => fetch("/api/default-locations", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (j?.value) setHome({ port: toCountryCode(j.value.port?.country), airport: toCountryCode(j.value.airport?.country) })
    }).catch(() => { /* filters just won't offer export / import */ })
    loadHome()
    const onShow = () => { if (document.visibilityState === "visible") void loadHome() }
    document.addEventListener("visibilitychange", onShow)
    window.addEventListener("focus", onShow)
    return () => { document.removeEventListener("visibilitychange", onShow); window.removeEventListener("focus", onShow) }
  }, [])

  useEffect(() => {
    const loadLate = () => fetch("/api/tasks?map=1", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j?.map) setLateMap(j.map) }).catch(() => { /* tags are optional */ })
    loadLate()
    const lateTimer = setInterval(loadLate, 120_000)
    return () => clearInterval(lateTimer)
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

  const lateChip = (r: FreightRequest) => {
    const l = lateMap[String(r.id)]
    if (!l) return null
    const txt = l.lateH < 48 ? `${Math.max(1, Math.floor(l.lateH))}h` : `${Math.floor(l.lateH / 24)}d`
    return l.stuck
      ? <Chip tone="red" icon={<Clock className="h-3 w-3" />} title={`${l.title} — stuck for ${txt}`}>Stuck {txt}</Chip>
      : <Chip tone="amber" icon={<Clock className="h-3 w-3" />} title={`${l.title} — ${txt} past its time limit`}>Overdue {txt}</Chip>
  }

  /** Export = leaves the home country, import = arrives in it, cross-trade = neither. Region = where the other end is. */
  const geoOf = useCallback((r: FreightRequest) => {
    const o = toCountryCode(r.originCountry), d = toCountryCode(r.destinationCountry)
    // sea shipments follow the default port's country, air the default airport's, anything else either one
    const modes = (r.modes ?? []).map((m) => String(m).toLowerCase())
    const homes = modes.includes("sea") && home.port ? [home.port] : modes.includes("air") && home.airport ? [home.airport] : homeCodes
    const isHome = (c: string | null) => !!c && homes.includes(c)
    const direction = homes.length ? (isHome(o) && !isHome(d) ? "Export" : isHome(d) && !isHome(o) ? "Import" : "Cross-trade") : null
    const far = direction === "Export" ? d : direction === "Import" ? o : null
    const set = new Set<string>()
    for (const c of far ? [far] : [o, d]) { const g = regionOf(c); if (g && !isHome(c)) set.add(g) }
    return { direction, regions: Array.from(set) }
  }, [home, homeCodes])
  const regionOptions = useMemo(() => Array.from(new Set(requests.flatMap((r) => geoOf(r).regions))).sort((a, b) => a.localeCompare(b)), [requests, geoOf])

  // requests approved through an approval workflow stay under "Approved" even after they were sent or quoted
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set())
  useEffect(() => {
    const load = () => fetch("/api/approval-requests?view=approved_ids").then((r) => (r.ok ? r.json() : [])).then((a: string[]) => setApprovedIds(new Set(a))).catch(() => {})
    load()
    const t = setInterval(load, POLL_INTERVAL)
    return () => clearInterval(t)
  }, [])
  const stagesOf = useCallback((r: FreightRequest): Stage[] => {
    const st = parseStatus(r.status).stage
    return st !== "Approved" && approvedIds.has(String(r.id)) ? [st, "Approved"] : [st]
  }, [approvedIds])

  const stageCounts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const r of requests) for (const k of stagesOf(r)) c[k] = (c[k] ?? 0) + 1
    return c
  }, [requests, stagesOf])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const base = requests.filter((r) => {
      const p = parseStatus(r.status)
      if (stages.length && !stagesOf(r).some((x) => stages.includes(x))) return false
      if (p.stage === "Approved" && stages.includes("Approved")) {
        if (targets.length && !(p.target && targets.includes(p.target))) return false
        if (deliveries.length && !(p.delivery && deliveries.includes(p.delivery))) return false
      }
      if (results.length && !(r.outcome && (results as string[]).includes(r.outcome))) return false
      if (sources.length && !sources.includes(r.source as SourceKey)) return false
      if (onlyFlagged && !isFlagged(r)) return false
      if (directions.length || regions.length) {
        const g = geoOf(r)
        if (directions.length && !(g.direction && (directions as string[]).includes(g.direction))) return false
        if (regions.length && !g.regions.some((x) => regions.includes(x))) return false
      }
      if (onlyOverdue && !lateMap[String(r.id)]) return false
      if (q) {
        const hay = `${r.requestRef ?? ""} ${r.senderName} ${r.senderEmail} ${r.cargoType} ${r.originCity} ${r.destinationCity} ${r.incoterm}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    return base.sort((a, b) => {
      if (sortBy === "priority") {
        const sa = (a.aog ? 2 : 0) + (a.dgr ? 1 : 0)
        const sb = (b.aog ? 2 : 0) + (b.dgr ? 1 : 0)
        if (sb !== sa) return sb - sa
      }
      // Newest first. Compare real times (not text), and fall back to the id so equal times never shuffle between refreshes.
      const ta = Date.parse(a.receivedIso ?? ""), tb = Date.parse(b.receivedIso ?? "")
      const na = Number.isNaN(ta) ? 0 : ta, nb = Number.isNaN(tb) ? 0 : tb
      if (nb !== na) return sortBy === "oldest" ? na - nb : nb - na
      return String(a.id).localeCompare(String(b.id))
    })
  }, [requests, stagesOf, stages, targets, deliveries, sources, onlyFlagged, onlyOverdue, lateMap, results, search, isFlagged, sortBy, directions, regions, geoOf])

  const flip = <T,>(set: React.Dispatch<React.SetStateAction<T[]>>, v: NoInfer<T>) => set((a) => (a.includes(v) ? a.filter((x) => x !== v) : [...a, v]))
  function clearFilters() { setOnlyOverdue(false); setResults([]); setStages(["Pending"]); setTargets([]); setDeliveries([]); setSources([]); setOnlyFlagged(false); setDirections([]); setRegions([]); setSearch("") }
  function showAll() { setStages([]); setTargets([]); setDeliveries([]); setResults([]) }
  // Picking a status leaves the Won/Lost result filter, and dropping Approved drops its sub-filters, so no filter stays on out of sight.
  function flipStage(st: Stage) {
    setResults([])
    if (st === "Approved" && stages.includes("Approved")) { setTargets([]); setDeliveries([]) }
    flip(setStages, st)
  }

  // Rows that a filter has hidden must not stay selected for bulk actions.
  useEffect(() => {
    setSelected((s) => { const ids = new Set(filtered.map((r) => r.id)); const next = s.filter((x) => ids.has(x)); return next.length === s.length ? s : next })
  }, [filtered])

  function toggle(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }
  function toggleAll() {
    setSelected((s) => (s.length === filtered.length ? [] : filtered.map((r) => r.id)))
  }

  const hasActiveFilters = !(stages.length === 1 && stages[0] === "Pending") || results.length > 0 || targets.length > 0 || deliveries.length > 0 || sources.length > 0 || onlyFlagged || onlyOverdue || directions.length > 0 || regions.length > 0 || search !== ""

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
        <PageHero eyebrow="Inbox" title="Requests" />
        <div className="flex items-center justify-center gap-2 py-24" style={{ color: "var(--text-muted)" }}>
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading requests…</span>
        </div>
      </div>
    )
  }

  return (
    <div className="portal-page space-y-4 p-6">
      <PageHero
        eyebrow="Inbox"
        title="Requests"
        titleExtra={
          <button
            onClick={() => load()}
            title={lastUpdated ? `Last synced ${lastUpdated.toLocaleTimeString()}` : "Refresh"}
            aria-label="Refresh"
            className="spin-once inline-flex h-[34px] w-[34px] items-center justify-center rounded-full text-white transition-colors hover:bg-white/10"
            style={{ border: "1px solid rgba(255,255,255,0.28)", background: "rgba(255,255,255,0.08)" }}
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        }
        left={
          <>
            <div className="flex flex-col items-center gap-1.5 text-center">
            <button type="button" onClick={() => { setDropOpen(true); setManualSignal((n) => n + 1) }}
              className="inline-flex h-[34px] items-center gap-2 rounded-full px-4 text-[13px] font-bold transition-all hover:brightness-90"
              style={{ background: "var(--brand-accent)", color: "var(--brand-navy)", boxShadow: "0 10px 22px -12px rgb(var(--brand-accent-rgb) / 0.9)" }}>
              <PenLine className="h-4 w-4" /> Enter manually
            </button>
            <span className="text-[12px] text-white/55">or drop an email anywhere on the page</span>
            </div>
          </>
        }
        right={
          <>
            <div className="grid grid-cols-2 gap-1.5">
              <HeroChip>{requests.length} total</HeroChip>
              <HeroChip>{requests.filter((r) => isFlagged(r)).length} need attention</HeroChip>
              {Object.keys(lateMap).length > 0 && <HeroChip>{Object.keys(lateMap).length} overdue</HeroChip>}
              <IntakeLogButton />
            </div>
          </>
        }
        belowOpen={dropOpen}
        below={
          <div className="relative rounded-2xl p-3" style={{ background: "rgba(255,255,255,0.94)" }}>
            <button type="button" onClick={() => setDropOpen(false)} aria-label="Hide" title="Hide" className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:brightness-90" style={{ background: "var(--table-header-bg)", color: "var(--text-secondary)" }}>
              <ChevronDown className="h-4 w-4 rotate-180" />
            </button>
            <EmailDropZone kind="request" slim manualSignal={manualSignal} onActive={(a) => { if (a) setDropOpen(true) }} onDone={() => load(true)} />
          </div>
        }
      />

      {/* Filter bar: status always, the rest slides out */}
      <div className="ds-card">
        <div className="flex flex-wrap items-center justify-center gap-3 p-3">
          <Seg label="Status" items={[
            { key: "all", label: "All", on: stages.length === 0 && results.length === 0, onClick: showAll, count: requests.length },
            ...STAGES.map((st) => ({ key: st, label: st === "Waiting" ? "Waiting for approval" : st, on: stages.includes(st), onClick: () => flipStage(st), count: stageCounts[st] ?? 0 })),
          ]} />
          <Seg label="View" items={([["cards", LayoutGrid, "Cards"], ["table", ListIcon, "List"]] as const).map(([k, Ic, l]) => ({ key: k, label: <><Ic className="h-4 w-4" />{l}</>, on: view === k, onClick: () => setView(k) }))} />
          <button type="button" onClick={() => setFiltersOpen((o) => !o)} aria-expanded={filtersOpen}
            className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-[13px] font-bold transition-colors hover:brightness-95"
            style={{ border: "1.5px solid var(--card-border)", background: "var(--card-bg)", color: "var(--text-primary)" }}>
            <SlidersHorizontal className="h-4 w-4" /> Filters
            {hasActiveFilters && <span className="h-2 w-2 rounded-full" style={{ background: "var(--brand-accent)" }} />}
            <ChevronDown className="h-4 w-4 transition-transform duration-300" style={{ transform: filtersOpen ? "rotate(180deg)" : "none" }} />
          </button>
        </div>
        <div className="grid transition-[grid-template-rows] duration-300 ease-out" style={{ gridTemplateRows: filtersOpen ? "1fr" : "0fr" }}>
          <div className="overflow-hidden">
            <div className="space-y-2.5 px-4 pb-4 pt-3" style={{ borderTop: "1px solid var(--divider)" }}>
              {stages.includes("Approved") && (
                <FilterRow label="Approved">
                  <Seg label="Approved target" items={[
                    { key: "Carrier", label: "To carrier", on: targets.includes("Carrier"), onClick: () => flip(setTargets, "Carrier") },
                    { key: "Reply", label: "Reply", on: targets.includes("Reply"), onClick: () => flip(setTargets, "Reply") },
                  ]} />
                  <Seg label="Approved delivery" items={[
                    { key: "Pending send", label: "Pending send", on: deliveries.includes("Pending send"), onClick: () => flip(setDeliveries, "Pending send") },
                    { key: "Sent", label: "Sent", on: deliveries.includes("Sent"), onClick: () => flip(setDeliveries, "Sent") },
                  ]} />
                </FilterRow>
              )}
              <FilterRow label="Result">
                <Seg label="Result" items={[
                  { key: "won", label: "Won", on: results.includes("won"), onClick: () => { flip(setResults, "won"); setStages([]) }, count: requests.filter((r) => r.outcome === "won").length },
                  { key: "lost", label: "Lost", on: results.includes("lost"), onClick: () => { flip(setResults, "lost"); setStages([]) }, count: requests.filter((r) => r.outcome === "lost").length },
                ]} />
              </FilterRow>
              <FilterRow label="Source">
                <Seg label="Source" items={[
                  { key: "Email", label: <><Mail className="h-3.5 w-3.5" />Email</>, on: sources.includes("Email"), onClick: () => flip(setSources, "Email") },
                  { key: "WhatsApp", label: <><MessageCircle className="h-3.5 w-3.5" />WhatsApp</>, on: sources.includes("WhatsApp"), onClick: () => flip(setSources, "WhatsApp") },
                ]} />
              </FilterRow>
              <FilterRow label="Flags">
                <Seg label="Flags" items={[
                  { key: "attn", label: <><TriangleAlert className="h-3.5 w-3.5" />Needs attention</>, on: onlyFlagged, onClick: () => setOnlyFlagged((v) => !v) },
                  { key: "late", label: <><Clock className="h-3.5 w-3.5" />Overdue</>, on: onlyOverdue, onClick: () => setOnlyOverdue((v) => !v), count: Object.keys(lateMap).length },
                ]} />
              </FilterRow>
              {homeCodes.length > 0 && (
                <FilterRow label="Direction">
                  <Seg label="Direction" items={(["Export", "Import", "Cross-trade"] as const).map((d) => ({ key: d, label: d, on: directions.includes(d), onClick: () => flip(setDirections, d), count: requests.filter((r) => geoOf(r).direction === d).length }))} />
                </FilterRow>
              )}
              {regionOptions.length > 0 && (
                <FilterRow label="Region">
                  <Seg label="Region" items={regionOptions.map((g) => ({ key: g, label: g, on: regions.includes(g), onClick: () => flip(setRegions, g), count: requests.filter((r) => geoOf(r).regions.includes(g)).length }))} />
                </FilterRow>
              )}
              <FilterRow label="Search">
                <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
                  <input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ref, sender, cargo, route…  ( / )"
                    className="h-10 w-full rounded-xl pl-10 pr-8 text-[14px] outline-none"
                    style={{ border: "1.5px solid var(--card-border)", background: "var(--card-bg)", color: "var(--text-primary)" }} />
                  {search && (
                    <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} aria-label="Clear search"><X className="h-3.5 w-3.5" /></button>
                  )}
                </div>
              </FilterRow>
              <FilterRow label="Sort">
                <Seg label="Sort order" items={([["priority", "AOG / DGR first"], ["newest", "Newest first"], ["oldest", "Oldest first"]] as const).map(([k, l]) => ({ key: k, label: l, on: sortBy === k, onClick: () => setSortBy(k) }))} />
                {hasActiveFilters && <button onClick={clearFilters} className="text-xs font-bold" style={{ color: "var(--brand-accent)" }}>Reset filters</button>}
              </FilterRow>
            </div>
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
      <div id="requests-table" className={view === "table" ? "ds-card scroll-mt-24 overflow-hidden" : "scroll-mt-24"}>
        {view === "cards" ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((r) => {
              const f = flagsOf(r)
              const sea = isSeaOnly(r.modes)
              return (
                <div key={r.id} onClick={() => router.push(`/requests/${r.id}`)} title="Click to open the request"
                  className={`rq-card ds-card relative flex cursor-pointer flex-col items-center gap-3 px-5 pb-5 pt-12 text-center ${r.aog ? "rq-card-aog" : ""}`}>
                  <input type="checkbox" aria-label={`Select ${r.senderName}`} checked={selected.includes(r.id)} onChange={() => {}} onClick={(e) => toggle(r.id, e)}
                    className="absolute left-4 top-4 h-4 w-4" style={{ accentColor: "var(--brand-accent)" }} />
                  <a href={`/requests/${r.id}`} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()} title="Open full page in a new tab" aria-label="Open full page in a new tab"
                    className="absolute right-4 top-4 inline-flex items-center rounded-lg p-1.5" style={{ border: "1px solid var(--card-border)", color: "var(--text-secondary)", background: "var(--card-bg)" }}>
                    <ExternalLink className="h-4 w-4" />
                  </a>
                  <table className="w-full table-fixed border-collapse text-center">
                    <tbody>
                    <tr style={{ borderTop: "1px solid var(--card-border)" }}>
                      <th scope="row" className="w-[28%] px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>Request</th>
                      <td className="px-3 py-2.5 text-center">
                        <span className="font-mono text-[13px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--brand-accent)" }}>{r.requestRef ?? (r.id ? `LT-${r.id}` : "")}</span>
                      </td>
                    </tr>
                    <tr style={{ borderTop: "1px solid var(--card-border)" }}>
                      <th scope="row" className="w-[28%] px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>Sender</th>
                      <td className="px-3 py-2.5 text-center">
                  <div className="min-w-0 max-w-full">
                    <p className="flex items-center justify-center gap-1.5 font-display text-[15px] font-extrabold leading-tight" style={{ color: "var(--text-primary)" }}>
                      {r.source === "WhatsApp" ? <MessageCircle className="h-4 w-4 shrink-0" style={{ color: "#22c55e" }} aria-label="WhatsApp" /> : <Mail className="h-4 w-4 shrink-0" style={{ color: "#3b82f6" }} aria-label="Email" />}
                      <span className="truncate">{r.senderName}</span>
                    </p>
                    <p className="mt-0.5 truncate text-[13px]" style={{ color: "var(--text-secondary)" }}>{r.source === "WhatsApp" ? r.senderPhone : r.senderEmail}</p>
                  </div>

                      </td>
                    </tr>
                    <tr style={{ borderTop: "1px solid var(--card-border)" }}>
                      <th scope="row" className="w-[28%] px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>Route</th>
                      <td className="px-3 py-2.5 text-center">
                  <p className="font-display text-[15px] font-bold" style={{ color: "var(--text-primary)" }}>
                    {sea && <span className="mr-1 text-[10px] font-bold" style={{ color: "var(--text-muted)" }}>POL</span>}{r.originFlag} {r.originCity} → {sea && <span className="mr-1 text-[10px] font-bold" style={{ color: "var(--text-muted)" }}>POD</span>}{r.destinationFlag} {r.destinationCity}
                    {r.incoterm && <span className="ml-3 inline-block rounded-md px-1.5 py-0.5 text-[10.5px] font-bold tracking-wide align-middle" style={{ color: "var(--text-muted)", background: "rgb(var(--brand-navy-rgb, 15 23 42) / 0.06)", marginLeft: 12 }}>{r.incoterm}</span>}
                  </p>

                      </td>
                    </tr>
                    <tr style={{ borderTop: "1px solid var(--card-border)" }}>
                      <th scope="row" className="w-[28%] px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>Cargo</th>
                      <td className="px-3 py-2.5 text-center">
                  <p className="max-w-full truncate text-[13.5px]" style={{ color: "var(--text-secondary)" }}>{r.cargoType}{r.equipment ? ` · ${parseArrayField(r.equipment)}` : ""}</p>

                      </td>
                    </tr>
                    <tr style={{ borderTop: "1px solid var(--card-border)" }}>
                      <th scope="row" className="w-[28%] px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>Flags</th>
                      <td className="px-3 py-2.5 text-center">
                  <div className="flex flex-wrap items-center justify-center gap-1.5">
                    {r.shipmentType && <Chip tone="blue">{TYPE_LABEL[r.shipmentType]}</Chip>}
                    {lateChip(r)}
                    {r.aog && <Chip tone="red" icon={<Zap className="h-3 w-3" />}>AOG</Chip>}
                    {r.dgr && <Chip tone="amber" icon={<TriangleAlert className="h-3 w-3" />}>DGR</Chip>}
                    {f.exw && <Chip tone="red" icon={<MapPinOff className="h-3 w-3" />} title="EXW — pickup address missing">EXW address</Chip>}
                    {f.missing > 0 && <Chip tone="amber" title={`Missing: ${r.missingFields.join(", ")}`}>Missing {f.missing}</Chip>}
                    {(r.specialRequirements?.length ?? 0) > 0 && (
                      <button type="button" onClick={(e) => { e.stopPropagation(); setSpecialFor(r) }} title="Show the special requests" className="rounded-full">
                        <Chip tone="blue">Special {r.specialRequirements.length}</Chip>
                      </button>
                    )}
                    {f.urgent && <Chip tone="blue" icon={<Clock className="h-3 w-3" />}>Urgent</Chip>}
                    {f.low && <Chip tone="slate" title="The AI was not confident reading this request">Low conf.</Chip>}
                  </div>

                      </td>
                    </tr>
                    <tr style={{ borderTop: "1px solid var(--card-border)" }}>
                      <th scope="row" className="w-[28%] px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>Status</th>
                      <td className="px-3 py-2.5 text-center">
                  <div className="flex flex-wrap items-center justify-center gap-1.5">
                    <StatusPill status={r.status} quoteCount={r.activeQuoteCount} />
                    {r.outcome && (
                      <span className="inline-flex items-center rounded-full px-3 py-1 text-[12px] font-bold uppercase" title={r.bookingReference ? `Booking ${r.bookingReference}` : undefined}
                        style={{ background: `color-mix(in srgb, ${r.outcome === "won" ? "#16a34a" : r.outcome === "lost" ? "#ef4444" : "#64748b"} 16%, transparent)`, color: r.outcome === "won" ? "#16a34a" : r.outcome === "lost" ? "#ef4444" : "#64748b" }}>
                        {outcomeLabel(r)}
                      </span>
                    )}
                  </div>

                      </td>
                    </tr>
                    <tr style={{ borderTop: "1px solid var(--card-border)" }}>
                      <th scope="row" className="w-[28%] px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>Received</th>
                      <td className="px-3 py-2.5 text-center">
                  <p className="font-mono text-[12px]" style={{ color: "var(--text-muted)" }} title={r.receivedExact}>{r.receivedRelative}</p>

                      </td>
                    </tr>
                    </tbody>
                  </table>
                  <button onClick={(e) => { e.stopPropagation(); setActive(r) }} title="Quick preview" aria-label={`Quick preview of ${r.requestRef ?? r.senderName}`}
                    className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[14px] font-bold" style={{ background: "var(--brand-accent)", color: "var(--brand-navy)" }}>
                    <Eye className="h-4 w-4" /> Preview
                  </button>
                </div>
              )
            })}
          </div>
        ) : (
        <div className="overflow-x-auto">
          <table className="rq-table rq-list w-full text-center text-sm">
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
                {["Ref", "Sender", "Route", "Cargo", "Details", ""].map((h, i) => (
                  <th key={i} className={`${h === "Cargo" ? "hidden 2xl:table-cell " : ""}px-3 py-3.5 text-[11px] font-semibold uppercase tracking-wide`} style={{ color: "var(--text-muted)" }}>{h}</th>
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
                    style={{ ["--st" as string]: STATUS_TONE[parseStatus(r.status).stage] ?? "#64748b" }}
                    title="Click to open the request"
                  >
                    <td className="px-3 py-4">
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
                    <td className="whitespace-nowrap px-3 py-4 font-mono text-[13px] font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
                      {r.requestRef ?? (r.id ? `LT-${r.id}` : "")}
                    </td>
                    <td className="px-3 py-4">
                      <p className="flex items-center justify-center gap-1.5 font-medium" style={{ color: "var(--text-primary)" }}>
                        {r.source === "WhatsApp" ? <MessageCircle className="h-3.5 w-3.5 shrink-0" style={{ color: "#22c55e" }} aria-label="WhatsApp" /> : <Mail className="h-3.5 w-3.5 shrink-0" style={{ color: "#3b82f6" }} aria-label="Email" />}
                        {r.senderName}
                      </p>
                      <p className="mx-auto max-w-[200px] truncate text-xs" style={{ color: "var(--text-secondary)" }}>
                        {r.source === "WhatsApp" ? r.senderPhone : r.senderEmail}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <div className="mx-auto flex w-fit flex-col items-start gap-0.5 text-left font-medium" style={{ color: "var(--text-primary)" }}>
                        <span className="flex items-center gap-1.5 whitespace-nowrap">
                          {sea && <span className="w-7 text-[9.5px] font-bold" style={{ color: "var(--text-muted)" }}>POL</span>}{r.originFlag} {r.originCity}
                        </span>
                        <span className="flex items-center gap-1.5 whitespace-nowrap">
                          {sea && <span className="w-7 text-[9.5px] font-bold" style={{ color: "var(--text-muted)" }}>POD</span>}{r.destinationFlag} {r.destinationCity}
                          {r.incoterm && <span className="ml-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold tracking-wide" style={{ color: "var(--text-muted)", background: "rgb(var(--brand-navy-rgb, 15 23 42) / 0.06)" }}>{r.incoterm}</span>}
                        </span>
                      </div>
                    </td>
                    <td className="mx-auto hidden max-w-[200px] px-3 py-4 2xl:table-cell">
                      <p className="truncate" style={{ color: "var(--text-primary)" }}>{r.cargoType}</p>
                      {r.equipment && <p className="truncate text-xs" style={{ color: "var(--text-secondary)" }}>{parseArrayField(r.equipment)}</p>}
                    </td>
                    <td className="px-3 py-3">
                      {(() => {
                        const late = lateMap[String(r.id)]
                        const lateTxt = late ? (late.lateH < 48 ? `${Math.max(1, Math.floor(late.lateH))}h` : `${Math.floor(late.lateH / 24)}d`) : ""
                        const flags: { k: string; text: string; critical?: boolean; tone?: string; title?: string; onClick?: () => void }[] = []
                        if (r.aog) flags.push({ k: "aog", text: "AOG", critical: true })
                        if (late?.stuck) flags.push({ k: "late", text: `Stuck ${lateTxt}`, critical: true, title: late.title })
                        if (f.exw) flags.push({ k: "exw", text: "EXW address", critical: true, title: "EXW: pickup address missing" })
                        if (f.missing > 0) flags.push({ k: "miss", text: `Missing ${f.missing}`, critical: true, title: `Missing: ${r.missingFields.join(", ")}` })
                        if (late && !late.stuck) flags.push({ k: "late", text: `Overdue ${lateTxt}`, tone: "#d97706", title: late.title })
                        if (r.dgr) flags.push({ k: "dgr", text: "DGR", tone: "#d97706" })
                        if (f.urgent) flags.push({ k: "urg", text: "Urgent", tone: "#d97706" })
                        if ((r.specialRequirements?.length ?? 0) > 0) flags.push({ k: "sp", text: `Special · ${r.specialRequirements.length}`, tone: "#2563eb", title: "Show the special requests", onClick: () => setSpecialFor(r) })
                        if (f.low) flags.push({ k: "low", text: "Low conf.", title: "The AI was not confident reading this request" })
                        const cell = (label: string, value: React.ReactNode, pos: string) => (
                          <div key={label} className={`flex items-center justify-between gap-4 px-3.5 py-2 ${pos}`}>
                            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{label}</span>
                            <span className="flex flex-wrap items-center justify-end gap-x-2 gap-y-0.5 text-right text-[12.5px] font-semibold" style={{ color: "var(--text-primary)" }}>{value}</span>
                          </div>
                        )
                        return (
                          <div className="mx-auto grid w-full min-w-[420px] max-w-[560px] grid-cols-2 overflow-hidden rounded-2xl" style={{ border: "1px solid var(--card-border)", background: "color-mix(in srgb, var(--card-bg) 55%, transparent)" }}>
                            {cell("Type", r.shipmentType ? TYPE_LABEL[r.shipmentType] : "—", "")}
                            {cell("Status", <span className="inline-flex flex-wrap items-center justify-end gap-1"><StatusPill status={r.status} quoteCount={r.activeQuoteCount} />{r.outcome && <span title={r.bookingReference ? `Booking ${r.bookingReference}` : undefined} className="text-[11px] font-bold uppercase" style={{ color: r.outcome === "won" ? "#16a34a" : r.outcome === "lost" ? "#dc2626" : "var(--text-secondary)" }}>{outcomeLabel(r)}</span>}</span>, "border-l [border-color:var(--card-border)]")}
                            {cell("Received", <span title={r.receivedExact} style={{ color: "var(--text-secondary)" }}>{r.receivedRelative}</span>, "border-t [border-color:var(--card-border)]")}
                            {cell("Flags", flags.length ? flags.map((fl, i) => {
                              const st = { color: fl.critical ? "#dc2626" : fl.tone ?? "var(--text-secondary)" }
                              const sep = i > 0 ? <span key={`${fl.k}-sep`} aria-hidden className="mx-0.5 inline-block h-3 w-px self-center" style={{ background: "var(--card-border)" }} /> : null
                              return (
                                <span key={fl.k} className="inline-flex items-center gap-2">
                                  {sep}
                                  {fl.onClick
                                    ? <button type="button" title={fl.title} onClick={(e) => { e.stopPropagation(); fl.onClick!() }} className="underline decoration-dotted underline-offset-2" style={st}>{fl.text}</button>
                                    : <span title={fl.title} style={st}>{fl.text}</span>}
                                </span>
                              )
                            }) : <span style={{ color: "var(--text-muted)" }}>None</span>, "border-l border-t [border-color:var(--card-border)]")}
                          </div>
                        )
                      })()}
                    </td>
                    <td className="px-3 py-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-col items-center justify-center gap-1.5">
                        <button
                          onClick={() => setActive(r)}
                          title="Quick preview"
                          aria-label={`Quick preview of ${r.requestRef ?? r.senderName}`}
                          className="rq-preview inline-flex h-8 w-8 items-center justify-center rounded-lg text-white shadow-sm"
                          style={{ background: "var(--brand-accent)" }}
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <a
                          href={`/requests/${r.id}`}
                          target="_blank"
                          rel="noopener"
                          title="Open full page in a new tab"
                          aria-label="Open full page in a new tab"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg"
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
          <p className="px-5 py-3 text-left text-[13px]" style={{ color: "var(--text-muted)", borderTop: "1px solid var(--divider)" }}>{filtered.length} rows</p>
        </div>
        )}

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
          originCountry={requests.find(r => r.id === selected[0])?.originCountry}
          destinationCountry={requests.find(r => r.id === selected[0])?.destinationCountry}
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
