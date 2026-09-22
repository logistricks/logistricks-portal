"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Search,
  Filter,
} from "lucide-react"

// ─── Types ───────────────────────────────────────────────────────────────────

interface HistoryRow {
  id: string
  sort_order: number
  step_status: "waiting" | "active" | "approved" | "rejected" | "skipped"
  assigned_to: string
  required: boolean
  notes: string | null
  decided_at: string | null
  freight_request: {
    id: string
    reference_number: string
    status: string
    commodity: string | null
    origin_port: string | null
    destination_port: string | null
    transport_mode: string | null
    submitted_by: string
    submitted_at: string | null
    is_aog: boolean
    is_dgr: boolean
  }
  cycle: { id: string; name: string } | null
  chain: Array<{
    id: string
    sort_order: number
    step_status: string
    assigned_to: string
    notes: string | null
    decided_at: string | null
  }>
}

// Group by freight_request.id
interface GroupedRequest {
  request: HistoryRow["freight_request"]
  cycle: HistoryRow["cycle"]
  chain: HistoryRow["chain"]
  overallStatus: "approved" | "rejected" | "in_progress"
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(d: string | null) {
  if (!d) return "—"
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function statusBadge(status: string) {
  switch (status) {
    case "approved":
      return (
        <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 bg-green-500/10 text-green-600 dark:text-green-400 text-xs font-semibold">
          <CheckCircle2 className="h-3 w-3" /> Approved
        </span>
      )
    case "rejected":
      return (
        <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 bg-red-500/10 text-red-500 text-xs font-semibold">
          <XCircle className="h-3 w-3" /> Rejected
        </span>
      )
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 bg-[#F97316]/10 text-[#F97316] text-xs font-semibold">
          <Clock className="h-3 w-3" /> In Progress
        </span>
      )
  }
}

// ─── RequestRow ──────────────────────────────────────────────────────────────

function RequestRow({ group }: { group: GroupedRequest }) {
  const [expanded, setExpanded] = useState(false)
  const req = group.request

  return (
    <div className="border border-[var(--border)] rounded-xl overflow-hidden bg-[var(--surface)] shadow-sm">
      {/* Header row */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-[var(--surface-2)] transition-colors"
      >
        <div className="flex-1 min-w-0 grid grid-cols-1 gap-1 sm:grid-cols-[1fr_auto]">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-[var(--text-primary)]">
              {req.reference_number}
            </span>
            {req.is_aog && (
              <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0 bg-red-500/10 text-red-500 text-[10px] font-bold">
                <AlertTriangle className="h-2.5 w-2.5" /> AOG
              </span>
            )}
            {req.is_dgr && (
              <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0 bg-amber-500/10 text-amber-500 text-[10px] font-bold">
                ⚠ DGR
              </span>
            )}
            {statusBadge(group.overallStatus)}
            {group.cycle && (
              <span className="text-xs text-[var(--text-muted)]">
                {group.cycle.name}
              </span>
            )}
          </div>
          <div className="text-xs text-[var(--text-muted)]">
            {req.commodity && <span>{req.commodity} · </span>}
            {req.origin_port && req.destination_port && (
              <span>
                {req.origin_port} → {req.destination_port} ·{" "}
              </span>
            )}
            Submitted by {req.submitted_by} · {fmt(req.submitted_at)}
          </div>
        </div>
        <div className="shrink-0 text-[var(--text-muted)]">
          {expanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </div>
      </button>

      {/* Chain detail */}
      {expanded && (
        <div className="border-t border-[var(--border)] px-5 py-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">
            Approval Chain
          </h3>
          <div className="space-y-3">
            {group.chain.map((step, idx) => (
              <div key={step.id} className="flex items-start gap-3">
                {/* Step connector */}
                <div className="flex flex-col items-center">
                  <span
                    className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                      step.step_status === "approved"
                        ? "bg-green-500/15 text-green-600 dark:text-green-400"
                        : step.step_status === "rejected"
                        ? "bg-red-500/15 text-red-500"
                        : step.step_status === "skipped"
                        ? "bg-[var(--surface-3)] text-[var(--text-muted)] line-through"
                        : step.step_status === "active"
                        ? "bg-[#F97316]/15 text-[#F97316]"
                        : "bg-[var(--surface-3)] text-[var(--text-muted)]"
                    }`}
                  >
                    {step.step_status === "approved" ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : step.step_status === "rejected" ? (
                      <XCircle className="h-3.5 w-3.5" />
                    ) : step.step_status === "active" ? (
                      <Clock className="h-3.5 w-3.5" />
                    ) : (
                      idx + 1
                    )}
                  </span>
                  {idx < group.chain.length - 1 && (
                    <div className="w-px flex-1 min-h-4 bg-[var(--border)] mt-1" />
                  )}
                </div>
                <div className="flex-1 min-w-0 pb-2">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-[var(--text-primary)]">
                      {step.assigned_to}
                    </span>
                    <span
                      className={`text-xs capitalize font-medium ${
                        step.step_status === "approved"
                          ? "text-green-600 dark:text-green-400"
                          : step.step_status === "rejected"
                          ? "text-red-500"
                          : step.step_status === "skipped"
                          ? "text-[var(--text-muted)] line-through"
                          : "text-[var(--text-muted)]"
                      }`}
                    >
                      {step.step_status}
                    </span>
                    {step.decided_at && (
                      <span className="text-xs text-[var(--text-muted)]">
                        · {fmt(step.decided_at)}
                      </span>
                    )}
                  </div>
                  {step.notes && (
                    <p className="text-xs text-red-500 mt-0.5 italic">
                      "{step.notes}"
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type FilterStatus = "all" | "approved" | "rejected" | "in_progress"

export default function ApprovalHistoryPage() {
  const [rows, setRows] = useState<HistoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all")
  const router = useRouter()

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true)
      else setRefreshing(true)
      try {
        const res = await fetch("/api/approval-requests?view=all")
        if (res.status === 401) {
          router.push("/login")
          return
        }
        if (!res.ok) throw new Error(await res.text())
        const data: HistoryRow[] = await res.json()

        // Fetch full detail for each unique freight request
        const seen = new Set<string>()
        const toFetch: HistoryRow[] = []
        for (const row of data) {
          if (!seen.has(row.id)) {
            seen.add(row.id)
            toFetch.push(row)
          }
        }
        const details = await Promise.all(
          toFetch.map((row) =>
            fetch(`/api/approval-requests/${row.id}`).then((r) =>
              r.ok ? r.json() : null
            )
          )
        )
        setRows(details.filter(Boolean))
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [router]
  )

  useEffect(() => {
    load()
  }, [load])

  // Group by freight_request.id, keeping one representative row per request
  const grouped = (() => {
    const map = new Map<string, GroupedRequest>()
    for (const row of rows) {
      const reqId = row.freight_request.id
      if (!map.has(reqId)) {
        // Determine overall status from chain
        const hasRejected = row.chain.some((s) => s.step_status === "rejected")
        const allDone = row.chain.every(
          (s) =>
            s.step_status === "approved" ||
            s.step_status === "skipped" ||
            s.step_status === "rejected"
        )
        const allApproved =
          allDone &&
          !hasRejected &&
          row.chain.some((s) => s.step_status === "approved")

        map.set(reqId, {
          request: row.freight_request,
          cycle: row.cycle,
          chain: row.chain,
          overallStatus: hasRejected
            ? "rejected"
            : allApproved
            ? "approved"
            : "in_progress",
        })
      }
    }
    return Array.from(map.values())
  })()

  // Filter + search
  const filtered = grouped.filter((g) => {
    if (filterStatus !== "all" && g.overallStatus !== filterStatus) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        g.request.reference_number.toLowerCase().includes(q) ||
        (g.request.commodity?.toLowerCase().includes(q) ?? false) ||
        g.request.submitted_by.toLowerCase().includes(q) ||
        g.chain.some((s) => s.assigned_to.toLowerCase().includes(q))
      )
    }
    return true
  })

  const counts = {
    all: grouped.length,
    approved: grouped.filter((g) => g.overallStatus === "approved").length,
    rejected: grouped.filter((g) => g.overallStatus === "rejected").length,
    in_progress: grouped.filter((g) => g.overallStatus === "in_progress")
      .length,
  }

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            Approval History
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">
            {loading
              ? "Loading…"
              : `${grouped.length} request${grouped.length !== 1 ? "s" : ""} total`}
          </p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={loading || refreshing}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors disabled:opacity-50"
        >
          <RefreshCw
            className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
          />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)] pointer-events-none" />
          <input
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] pl-9 pr-4 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            placeholder="Search by reference, commodity, submitter, approver…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1">
          <Filter className="h-4 w-4 text-[var(--text-muted)] ml-1.5 shrink-0" />
          {(
            [
              ["all", "All"],
              ["in_progress", "In Progress"],
              ["approved", "Approved"],
              ["rejected", "Rejected"],
            ] as const
          ).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setFilterStatus(val)}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                filterStatus === val
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              {label}
              <span className="ml-1 opacity-60">
                ({counts[val]})
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-[var(--text-muted)]">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          Loading history…
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-14 w-14 rounded-full bg-[var(--surface-2)] flex items-center justify-center mb-4">
            <Search className="h-7 w-7 text-[var(--text-muted)]" />
          </div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            No results
          </h2>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            {search
              ? "Try a different search term."
              : "No approval records found."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((group) => (
            <RequestRow key={group.request.id} group={group} />
          ))}
        </div>
      )}
    </div>
  )
}
