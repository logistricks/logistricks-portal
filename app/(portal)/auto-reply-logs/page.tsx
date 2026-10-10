"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, Mail, RefreshCw, AlertTriangle, Truck, CheckCircle, Info } from "lucide-react"

type LogType = "acknowledgement" | "missing_fields" | "carrier" | "quotation"
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
  { key: "all",             label: "All",              icon: Mail          },
  { key: "acknowledgement", label: "Acknowledgements", icon: CheckCircle   },
  { key: "missing_fields",  label: "Missing Fields",   icon: AlertTriangle },
  { key: "carrier",         label: "To Carriers",      icon: Truck         },
  { key: "quotation",       label: "Quotations",       icon: Mail          },
]

const RANGES: { label: string; value: Range }[] = [
  { label: "Today",    value: "today" },
  { label: "7 days",  value: "7d"    },
  { label: "30 days", value: "30d"   },
  { label: "All time", value: "all"  },
]

const TYPE_CONFIG: Record<LogType, { bg: string; color: string; label: string; icon: React.ElementType }> = {
  acknowledgement: { bg: "rgba(59,130,246,0.12)",  color: "#3b82f6", label: "Acknowledgement", icon: CheckCircle   },
  missing_fields:  { bg: "rgba(245,158,11,0.12)",  color: "#d97706", label: "Missing Fields",  icon: AlertTriangle },
  carrier:         { bg: "rgba(22,163,74,0.1)",    color: "#16a34a", label: "To Carrier",      icon: Truck         },
  quotation:       { bg: "rgba(139,92,246,0.12)",  color: "#7c3aed", label: "Quotation",       icon: Mail          },
}

function formatTime(iso: string): { relative: string; exact: string } {
  const date = new Date(iso)
  const diff  = Date.now() - date.getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  let relative: string
  if (mins < 1)        relative = "Just now"
  else if (mins < 60)  relative = `${mins}m ago`
  else if (hours < 24) relative = `${hours}h ago`
  else if (days === 1) relative = "Yesterday"
  else                 relative = `${days}d ago`
  const timeStr = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  const dateStr = date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
  return { relative, exact: `${dateStr} at ${timeStr}` }
}

export default function AutoReplyLogsPage() {
  const [tab,     setTab]     = useState<LogType | "all">("all")
  const [range,   setRange]   = useState<Range>("30d")
  const [rows,    setRows]    = useState<LogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ range })
      if (tab !== "all") params.set("type", tab)
      const res = await fetch(`/api/auto-reply-logs?${params}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        throw new Error(body?.error ?? `HTTP ${res.status}`)
      }
      const data = await res.json()
      setRows(Array.isArray(data) ? data : [])
    } catch (e) {
      setError((e as Error).message)
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [tab, range])

  useEffect(() => { void load() }, [load])

  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.log_type] = (acc[r.log_type] ?? 0) + 1
    return acc
  }, {})

  const visibleRows = tab === "all" ? rows : rows.filter((r) => r.log_type === tab)

  return (
    <div className="portal-page space-y-5 p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-[28px] font-extrabold leading-tight" style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
            Auto Reply Logs
          </h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--card-border)" }}>
            {RANGES.map((r) => (
              <button
                key={r.value}
                onClick={() => setRange(r.value)}
                style={{
                  padding: "6px 12px",
                  fontSize: 12,
                  fontWeight: 600,
                  background: range === r.value ? "var(--brand-navy)" : "var(--card-bg)",
                  color: range === r.value ? "#fff" : "var(--text-muted)",
                  borderRight: "1px solid var(--card-border)",
                  transition: "all 0.15s",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            onClick={load}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 14px", borderRadius: 8,
              border: "1px solid var(--card-border)",
              background: "var(--card-bg)",
              color: "var(--text-secondary)",
              fontSize: 12, fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "12px 16px", borderRadius: 10,
          background: "rgba(220,38,38,0.08)",
          border: "1px solid rgba(220,38,38,0.2)",
          color: "#dc2626",
        }}>
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <div>
            <p style={{ fontWeight: 600, fontSize: 13 }}>Failed to load logs</p>
            <p style={{ fontSize: 12, opacity: 0.8 }}>{error}</p>
          </div>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Total Sent",       value: rows.length,                 color: "var(--brand-accent)", bg: "rgb(var(--brand-accent-rgb) / 0.1)",  icon: Mail          },
          { label: "Acknowledgements", value: counts.acknowledgement ?? 0, color: "#3b82f6",             bg: "rgba(59,130,246,0.1)",  icon: CheckCircle   },
          { label: "Missing Fields",   value: counts.missing_fields  ?? 0, color: "#d97706",             bg: "rgba(245,158,11,0.1)",  icon: AlertTriangle },
          { label: "To Carriers",      value: counts.carrier         ?? 0, color: "#16a34a",             bg: "rgba(22,163,74,0.1)",   icon: Truck         },
        ].map(({ label, value, color, bg, icon: Icon }) => (
          <div key={label} className="ds-card" style={{ padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 9, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon className="h-[18px] w-[18px]" style={{ color }} />
            </div>
            <div>
              {loading
                ? <div style={{ height: 24, width: 40, borderRadius: 4, background: "var(--divider)", marginBottom: 4 }} className="animate-pulse" />
                : <p style={{ fontSize: 22, fontWeight: 800, lineHeight: 1, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>{value}</p>
              }
              <p style={{ fontSize: 11.5, fontWeight: 500, color: "var(--text-secondary)", marginTop: 4 }}>{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{
        display: "flex", gap: 4, padding: 4, borderRadius: 12,
        background: "var(--table-header-bg)",
        border: "1px solid var(--card-border)",
      }}>
        {TABS.map(({ key, label, icon: Icon }) => {
          const count  = key === "all" ? rows.length : (counts[key] ?? 0)
          const active = tab === key
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                padding: "8px 12px", borderRadius: 8,
                background: active ? "var(--card-bg)" : "transparent",
                color: active ? "var(--text-primary)" : "var(--text-muted)",
                fontWeight: active ? 600 : 500,
                fontSize: 13,
                boxShadow: active ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                border: "none", cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{label}</span>
              {count > 0 && (
                <span style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  padding: "1px 7px", borderRadius: 99,
                  background: active ? "rgb(var(--brand-accent-rgb) / 0.15)" : "var(--divider)",
                  color: active ? "var(--brand-accent)" : "var(--text-muted)",
                  fontSize: 10, fontWeight: 700, minWidth: 18,
                }}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Table */}
      <div className="ds-card" style={{ overflow: "hidden" }}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "80px 0", color: "var(--text-muted)" }}>
            <Loader2 className="h-5 w-5 animate-spin" />
            <span style={{ fontSize: 14 }}>Loading logs…</span>
          </div>
        ) : visibleRows.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: "80px 0", textAlign: "center" }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: "var(--divider)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Mail className="h-6 w-6" style={{ color: "var(--text-muted)" }} />
            </div>
            <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-secondary)" }}>
              {tab === "all" ? "No auto-reply logs yet" : `No ${TABS.find(t => t.key === tab)?.label.toLowerCase()} logs`}
            </p>
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Auto-reply emails will appear here once sent
            </p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 700, textAlign: "left", fontSize: 13, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--table-header-bg)" }}>
                  {["Type", "Recipient", "Subject", "Route", "Missing Fields", "Sent"].map((h) => (
                    <th key={h} style={{
                      padding: "10px 16px",
                      fontSize: 11, fontWeight: 600,
                      textTransform: "uppercase", letterSpacing: "0.06em",
                      color: "var(--text-muted)",
                      borderBottom: "1px solid var(--card-border)",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, i) => {
                  const cfg  = TYPE_CONFIG[row.log_type]
                  const Icon = cfg.icon
                  const t    = formatTime(row.created_at)
                  const origin      = row.meta?.origin      as string | undefined
                  const destination = row.meta?.destination as string | undefined
                  const route       = [origin, destination].filter(Boolean).join(" → ")
                  const missingFields = row.meta?.missing_fields as string | undefined

                  return (
                    <tr
                      key={row.id}
                      style={{
                        borderBottom: "1px solid var(--divider)",
                        background: i % 2 === 1 ? "var(--table-header-bg)" : "var(--card-bg)",
                      }}
                    >
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 5,
                          padding: "3px 9px", borderRadius: 99,
                          background: cfg.bg, color: cfg.color,
                          fontSize: 11, fontWeight: 600,
                        }}>
                          <Icon className="h-3 w-3" />
                          {cfg.label}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <p style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 13 }}>{row.sender_name || "—"}</p>
                        <p style={{ fontSize: 11.5, color: "var(--text-secondary)", marginTop: 1 }}>{row.sender_email}</p>
                      </td>
                      <td style={{ padding: "12px 16px", color: "var(--text-primary)", maxWidth: 220 }}>
                        <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row.subject ?? ""}>
                          {row.subject || "—"}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                        {route || "—"}
                      </td>
                      <td style={{ padding: "12px 16px", maxWidth: 180 }}>
                        {missingFields
                          ? <span style={{ color: "#d97706", fontSize: 12 }}>{missingFields}</span>
                          : <span style={{ color: "var(--text-muted)" }}>—</span>
                        }
                      </td>
                      <td style={{ padding: "12px 16px", fontVariantNumeric: "tabular-nums", color: "var(--text-secondary)", whiteSpace: "nowrap" }} title={t.exact}>
                        {t.relative}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {visibleRows.length > 0 && (
          <div style={{
            padding: "10px 16px",
            borderTop: "1px solid var(--divider)",
            fontSize: 12, color: "var(--text-muted)",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <Info className="h-3.5 w-3.5" />
            Showing {visibleRows.length} of {rows.length} log{rows.length !== 1 ? "s" : ""}
          </div>
        )}
      </div>
    </div>
  )
}
