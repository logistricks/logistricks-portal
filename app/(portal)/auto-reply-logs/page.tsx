"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, Mail, RefreshCw, AlertTriangle, Truck, CheckCircle } from "lucide-react"

type LogType = "acknowledgement" | "missing_fields" | "carrier"
type Range   = "today" | "7d" | "30d" | "all"

interface LogRow {
  id:           number
  log_type:     LogType
  sender_email: string
  sender_name:  string | null
  subject:      string | null
  request_id:   string | null
  meta:         Record<string, unknown>
  created_at:   string
}

const TABS: { key: LogType | "all"; label: string; icon: React.ElementType }[] = [
  { key: "all",             label: "All",                icon: Mail          },
  { key: "acknowledgement", label: "Acknowledgements",   icon: CheckCircle   },
  { key: "missing_fields",  label: "Missing Fields",     icon: AlertTriangle },
  { key: "carrier",         label: "To Carriers",        icon: Truck         },
]

const RANGES: { label: string; value: Range }[] = [
  { label: "Today",    value: "today" },
  { label: "7 days",  value: "7d"    },
  { label: "30 days", value: "30d"   },
  { label: "All time", value: "all"  },
]

const TYPE_STYLE: Record<LogType, { bg: string; text: string; label: string; Icon: React.ElementType }> = {
  acknowledgement: { bg: "bg-blue-50 dark:bg-blue-500/10",     text: "text-blue-600 dark:text-blue-300",     label: "Acknowledgement", Icon: CheckCircle   },
  missing_fields:  { bg: "bg-amber-50 dark:bg-amber-500/10",   text: "text-amber-700 dark:text-amber-300",   label: "Missing Fields",  Icon: AlertTriangle },
  carrier:         { bg: "bg-emerald-50 dark:bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-300", label: "To Carrier",  Icon: Truck         },
}

function formatTime(iso: string): { relative: string; exact: string } {
  const date = new Date(iso)
  const diff  = Date.now() - date.getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  let relative: string
  if (mins < 1)       relative = "Just now"
  else if (mins < 60) relative = `${mins}m ago`
  else if (hours < 24) relative = `${hours}h ago`
  else if (days === 1) relative = "Yesterday"
  else                 relative = `${days}d ago`
  const timeStr = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  const dateStr = date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
  return { relative, exact: `${dateStr} at ${timeStr}` }
}

export default function AutoReplyLogsPage() {
  const [tab,   setTab]   = useState<LogType | "all">("all")
  const [range, setRange] = useState<Range>("30d")
  const [rows,  setRows]  = useState<LogRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ range })
      if (tab !== "all") params.set("type", tab)
      const res = await fetch(`/api/auto-reply-logs?${params}`)
      if (!res.ok) throw new Error("fetch failed")
      setRows(await res.json())
    } catch {
      // keep stale
    } finally {
      setLoading(false)
    }
  }, [tab, range])

  useEffect(() => { void load() }, [load])

  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.log_type] = (acc[r.log_type] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="portal-page space-y-5 p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-jakarta), var(--font-inter), system-ui, sans-serif" }}>
          Auto Reply Logs
        </h2>
        <div className="flex items-center gap-2">
          {/* Range selector */}
          <div className="flex rounded border border-[var(--card-border)] overflow-hidden">
            {RANGES.map((r) => (
              <button key={r.value} onClick={() => setRange(r.value)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  range === r.value
                    ? "bg-[#0D1B2A] text-white dark:bg-[var(--brand-accent)]"
                    : "bg-white text-[#64748B] hover:bg-[#F8FAFC] dark:bg-[#111E33] dark:text-[var(--text-muted)] dark:hover:bg-[#1A2A40]"
                }`}>
                {r.label}
              </button>
            ))}
          </div>
          <button onClick={load}
            className="flex items-center gap-1 rounded border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs text-[#64748B] hover:bg-[#F8FAFC] dark:border-[#1E3A5F] dark:bg-[#111E33] dark:text-[var(--text-muted)]">
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-1 dark:border-[#1E3A5F] dark:bg-[#0E1A2E]">
        {TABS.map(({ key, label, icon: Icon }) => {
          const count = key === "all" ? rows.length : (counts[key] ?? 0)
          const active = tab === key
          return (
            <button key={key} onClick={() => setTab(key)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-white text-[#0D1B2A] shadow-sm dark:bg-[#1A2A40] dark:text-[#E2E8F0]"
                  : "text-[#64748B] hover:text-[#0D1B2A] dark:text-[var(--text-muted)] dark:hover:text-[#E2E8F0]"
              }`}>
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{label}</span>
              {count > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  active ? "bg-[var(--brand-accent)]/10 text-[var(--brand-accent)]" : "bg-[#E2E8F0] text-[#64748B] dark:bg-[#1E3A5F] dark:text-[var(--text-muted)]"
                }`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Table */}
      <div className="overflow-hidden ds-card">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-[var(--text-muted)]">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading logs…</span>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
            <Mail className="h-10 w-10 text-[#CBD5E1]" />
            <p className="text-sm font-medium text-[var(--text-secondary)]">No auto-reply emails logged yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="bg-[#0D1B2A] text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Recipient</th>
                  <th className="px-4 py-3 font-semibold">Subject</th>
                  <th className="px-4 py-3 font-semibold">Route</th>
                  <th className="px-4 py-3 font-semibold">Missing Fields</th>
                  <th className="px-4 py-3 font-semibold">Sent</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const s = TYPE_STYLE[row.log_type]
                  const Icon = s.Icon
                  const t = formatTime(row.created_at)
                  const origin      = row.meta.origin      as string | undefined
                  const destination = row.meta.destination as string | undefined
                  const route = [origin, destination].filter(Boolean).join(" → ")
                  const missingFields = row.meta.missing_fields as string | undefined

                  return (
                    <tr key={row.id}
                      className={`border-t border-[var(--card-border)] ${
                        i % 2 === 1 ? "bg-[#F8FAFC] dark:bg-[#0E1A2E]" : "bg-[var(--card-bg)]"
                      }`}>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.bg} ${s.text}`}>
                          <Icon className="h-3 w-3" />
                          {s.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-[var(--text-primary)]">{row.sender_name || "—"}</p>
                        <p className="text-xs text-[var(--text-secondary)]">{row.sender_email}</p>
                      </td>
                      <td className="px-4 py-3 text-[var(--text-primary)] max-w-[200px] truncate" title={row.subject ?? ""}>
                        {row.subject || "—"}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-secondary)] whitespace-nowrap">
                        {route || "—"}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-secondary)] max-w-[180px]">
                        {missingFields
                          ? <span className="text-amber-600 dark:text-amber-400 text-xs">{missingFields}</span>
                          : <span className="text-[#CBD5E1]">—</span>}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-[var(--text-secondary)]" title={t.exact}>
                        {t.relative}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > 0 && (
          <div className="border-t border-[#E2E8F0] px-4 py-3 text-sm text-[#64748B] dark:border-[#1E3A5F] dark:text-[var(--text-muted)]">
            Showing {rows.length} log{rows.length > 1 ? "s" : ""}
          </div>
        )}
      </div>
    </div>
  )
}
