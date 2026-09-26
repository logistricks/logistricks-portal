"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Activity,
  ArrowDownUp,
  Loader2,
  RefreshCw,
  Truck,
  FileText,
  Mail,
} from "lucide-react"

type Category = "All" | "Requests" | "Carriers" | "Templates"
type Range    = "today" | "7d" | "30d" | "all"

interface ActivityRow {
  id:          number
  event_type:  string
  actor:       string
  description: string
  request_id:  string | null
  meta:        Record<string, unknown>
  created_at:  string
  category:    Category | "Other"
}

const CATEGORIES: Category[] = ["All", "Requests", "Carriers", "Templates"]
const RANGES: { label: string; value: Range }[] = [
  { label: "Today",    value: "today" },
  { label: "7 days",  value: "7d"    },
  { label: "30 days", value: "30d"   },
  { label: "All time", value: "all"  },
]

interface BadgeConfig {
  label: string
  bg:    string
  text:  string
}

const EVENT_BADGE: Record<string, BadgeConfig> = {
  request_received:       { label: "Request",          bg: "bg-blue-50 dark:bg-blue-500/10",    text: "text-blue-600 dark:text-blue-300"    },
  request_status_changed: { label: "Status Change",    bg: "bg-purple-50 dark:bg-purple-500/10", text: "text-purple-600 dark:text-purple-300" },
  carrier_added:          { label: "Carrier Added",    bg: "bg-emerald-50 dark:bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-300" },
  carrier_updated:        { label: "Carrier Updated",  bg: "bg-yellow-50 dark:bg-yellow-500/10",  text: "text-yellow-700 dark:text-yellow-300"  },
  carrier_deleted:        { label: "Carrier Deleted",  bg: "bg-red-50 dark:bg-red-500/10",       text: "text-red-600 dark:text-red-300"       },
  template_created:       { label: "Template Created", bg: "bg-emerald-50 dark:bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-300" },
  template_updated:       { label: "Template Updated", bg: "bg-yellow-50 dark:bg-yellow-500/10",  text: "text-yellow-700 dark:text-yellow-300"  },
  template_deleted:       { label: "Template Deleted", bg: "bg-red-50 dark:bg-red-500/10",       text: "text-red-600 dark:text-red-300"       },
}

const DEFAULT_BADGE: BadgeConfig = {
  label: "Event",
  bg:    "bg-[#F0F4F8] dark:bg-[#1E3A5F]",
  text:  "text-[var(--text-secondary)]",
}

function CategoryIcon({ category }: { category: string }) {
  if (category === "Carriers")  return <Truck    className="h-3.5 w-3.5" />
  if (category === "Templates") return <Mail     className="h-3.5 w-3.5" />
  if (category === "Requests")  return <FileText className="h-3.5 w-3.5" />
  return <Activity className="h-3.5 w-3.5" />
}

function formatTime(iso: string): { relative: string; exact: string } {
  const date = new Date(iso)
  const diff  = Date.now() - date.getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)

  let relative: string
  if (mins < 1)    relative = "Just now"
  else if (mins < 60)  relative = `${mins}m ago`
  else if (hours < 24) relative = `${hours}h ago`
  else if (days === 1) relative = "Yesterday"
  else relative = `${days}d ago`

  const timeStr = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  const today     = new Date(); today.setHours(0,0,0,0)
  const yesterday = new Date(today); yesterday.setDate(today.getDate()-1)

  let exact: string
  if (date >= today)          exact = `Today, ${timeStr}`
  else if (date >= yesterday) exact = `Yesterday, ${timeStr}`
  else exact = date.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) + `, ${timeStr}`

  return { relative, exact }
}

function ActorBadge({ actor }: { actor: string }) {
  const isSystem = actor === "system" || actor === "n8n"
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 font-mono text-[11px] font-medium ${
        isSystem
          ? "bg-[#F0F4F8] text-[#64748B] dark:bg-[#1E3A5F] dark:text-[var(--text-muted)]"
          : "bg-[var(--brand-accent)]/10 text-[var(--brand-accent)] dark:bg-[var(--brand-accent)]/10"
      }`}
    >
      {actor}
    </span>
  )
}

export default function ActivityPage() {
  const [rows, setRows]               = useState<ActivityRow[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [category, setCategory]       = useState<Category>("All")
  const [range, setRange]             = useState<Range>("7d")
  const [sortAsc, setSortAsc]         = useState(false)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ category, range })
      const res = await fetch(`/api/activity?${params}`)
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const data: ActivityRow[] = await res.json()
      setRows(data)
      setLastUpdated(new Date())
    } catch (e) {
      if (!silent) setError((e as Error).message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [category, range])

  useEffect(() => { load() }, [load])

  const sorted = useMemo(
    () => (sortAsc ? [...rows].reverse() : rows),
    [rows, sortAsc],
  )

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { Requests: 0, Carriers: 0, Templates: 0 }
    for (const r of rows) if (r.category in counts) counts[r.category]++
    return counts
  }, [rows])

  const topActors = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of rows) counts.set(r.actor, (counts.get(r.actor) ?? 0) + 1)
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
  }, [rows])

  return (
    <div className="portal-page space-y-5 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-[var(--text-primary)]">Activity Log</h2>
          {!loading && (
            <span className="rounded-full bg-[#F0F4F8] px-2.5 py-1 text-xs font-medium text-[#64748B] dark:bg-[#1E3A5F] dark:text-[var(--text-muted)]">
              {sorted.length} events
            </span>
          )}
          {lastUpdated && (
            <button
              onClick={() => load()}
              title={`Last synced ${lastUpdated.toLocaleTimeString()}`}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--hover-bg)]"
            >
              <RefreshCw className="h-3 w-3" />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-[#E2E8F0] bg-white p-0.5 dark:border-[#1E3A5F] dark:bg-[#111E33]">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  category === c
                    ? "bg-[var(--brand-accent)] text-white"
                    : "text-[#64748B] hover:text-[#0D1B2A] dark:hover:text-white"
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          <select
            value={range}
            onChange={(e) => setRange(e.target.value as Range)}
            className="h-9 rounded border border-[#D1D9E0] bg-white px-3 text-sm outline-none focus:border-[var(--brand-accent)] focus:shadow-[0_0_0_3px_rgba(249,115,22,0.12)] dark:border-[#1E3A5F] dark:bg-[#111E33] dark:text-[#E2E8F0]"
          >
            {RANGES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {error}
        </p>
      )}

      {!loading && sorted.length > 0 && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="ds-card flex items-center gap-3 p-4">
            <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[9px]" style={{ background: "rgba(15,30,54,0.08)" }}>
              <Activity className="h-[18px] w-[18px]" style={{ color: "var(--text-primary)" }} />
            </div>
            <div>
              <p className="text-xl font-bold tabular-nums leading-none" style={{ color: "var(--text-primary)" }}>{sorted.length}</p>
              <p className="mt-1 text-[11.5px] font-medium" style={{ color: "var(--text-secondary)" }}>Total Events</p>
            </div>
          </div>
          <div className="ds-card flex items-center gap-3 p-4">
            <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[9px]" style={{ background: "rgba(37,99,235,0.1)" }}>
              <FileText className="h-[18px] w-[18px]" style={{ color: "#2563eb" }} />
            </div>
            <div>
              <p className="text-xl font-bold tabular-nums leading-none" style={{ color: "var(--text-primary)" }}>{categoryCounts.Requests}</p>
              <p className="mt-1 text-[11.5px] font-medium" style={{ color: "var(--text-secondary)" }}>Requests</p>
            </div>
          </div>
          <div className="ds-card flex items-center gap-3 p-4">
            <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[9px]" style={{ background: "rgba(22,163,74,0.1)" }}>
              <Truck className="h-[18px] w-[18px]" style={{ color: "#16a34a" }} />
            </div>
            <div>
              <p className="text-xl font-bold tabular-nums leading-none" style={{ color: "var(--text-primary)" }}>{categoryCounts.Carriers}</p>
              <p className="mt-1 text-[11.5px] font-medium" style={{ color: "var(--text-secondary)" }}>Carriers</p>
            </div>
          </div>
          <div className="ds-card flex items-center gap-3 p-4">
            <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[9px]" style={{ background: "rgba(232,130,26,0.12)" }}>
              <Mail className="h-[18px] w-[18px]" style={{ color: "var(--brand-accent)" }} />
            </div>
            <div>
              <p className="text-xl font-bold tabular-nums leading-none" style={{ color: "var(--text-primary)" }}>{categoryCounts.Templates}</p>
              <p className="mt-1 text-[11.5px] font-medium" style={{ color: "var(--text-secondary)" }}>Templates</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
      <div className="overflow-hidden ds-card lg:col-span-3">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--brand-accent)]" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-[#f7f8fa] text-[11px] uppercase tracking-[0.06em] text-[#8a9ab0] dark:bg-[#0D1B2A] dark:text-[#94A3B8]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Event</th>
                  <th className="px-4 py-3 font-semibold">Description</th>
                  <th className="px-4 py-3 font-semibold">Actor</th>
                  <th className="px-4 py-3 font-semibold">
                    <button
                      onClick={() => setSortAsc((v) => !v)}
                      className="inline-flex items-center gap-1 hover:text-[var(--brand-accent)]"
                    >
                      Time
                      <ArrowDownUp className="h-3 w-3" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, i) => {
                  const badge = EVENT_BADGE[row.event_type] ?? DEFAULT_BADGE
                  const { relative, exact } = formatTime(row.created_at)
                  return (
                    <tr
                      key={row.id}
                      className={`border-t border-[#E2E8F0] transition-colors dark:border-[#1E3A5F] ${
                        i % 2 === 1
                          ? "bg-[var(--table-header-bg)]"
                          : "bg-white dark:bg-transparent"
                      }`}
                    >
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${badge.bg} ${badge.text}`}
                        >
                          <CategoryIcon category={row.category} />
                          {badge.label}
                        </span>
                      </td>

                      <td className="max-w-[340px] px-4 py-3 text-[var(--text-primary)]">
                        <p className="truncate">{row.description}</p>
                        {row.request_id && (
                          <p className="mt-0.5 font-mono text-[10px] text-[var(--text-muted)]">
                            req:{row.request_id.slice(0, 8)}…
                          </p>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <ActorBadge actor={row.actor} />
                      </td>

                      <td
                        className="whitespace-nowrap px-4 py-3 tabular-nums text-[var(--text-secondary)]"
                        title={exact}
                      >
                        {relative}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && sorted.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Activity className="h-10 w-10 text-[#CBD5E1]" />
            <p className="text-sm font-medium text-[var(--text-secondary)]">
              No activity yet for this period.
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              Events appear here when carriers and templates are added, edited, or deleted.
            </p>
          </div>
        )}
      </div>

      {!loading && topActors.length > 0 && (
        <div className="ds-card lg:col-span-2">
          <div className="ds-card-header">
            <h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>Top Actors</h3>
          </div>
          <div>
            {topActors.map(([actor, count]) => (
              <div key={actor} className="flex items-center justify-between px-5 py-2.5 border-b last:border-b-0" style={{ borderColor: "var(--divider)" }}>
                <ActorBadge actor={actor} />
                <span className="text-xs font-semibold tabular-nums" style={{ color: "var(--text-secondary)" }}>{count} event{count !== 1 ? "s" : ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
