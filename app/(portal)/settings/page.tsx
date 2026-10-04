"use client"

import { BrandingCard } from "@/components/portal/branding-card"
import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { createClient } from "@/lib/supabase"
import {
  AlertTriangle, Check, CheckSquare, ChevronRight, Copy, FileText, GitBranch, Loader2,
  Bell, Mail, MessageCircle, Palette, Plus, RefreshCw, RotateCcw, Server, Settings2,
  Square, Trash2, Truck, X, Zap,
} from "lucide-react"
import { TemplatesPanel } from "@/components/portal/templates-panel"
import { CarriersPanel } from "@/components/portal/carriers-panel"
import { SmtpPanel } from "@/components/portal/smtp-panel"
import { NotificationTemplatesPanel } from "@/components/portal/notification-templates-panel"

// ── Types ─────────────────────────────────────────────────────────────────────
type ReceiverEmail  = { id: string; r_mail: string; active: boolean; label: string | null }
type WhatsappNumber = { id: string; number: string; active: boolean; label: string | null }
type UserRole       = "admin" | "operator" | "viewer"

const CRITICAL_FIELD_OPTIONS = [
  { key: "cargo_type", label: "Cargo Type" },
  { key: "weight",     label: "Weight / Tonnage" },
  { key: "dimensions", label: "Dimensions" },
  { key: "equipment",  label: "Equipment / Container" },
  { key: "incoterm",   label: "Incoterm" },
  { key: "bl_type",    label: "BL Type" },
  { key: "pickup_address", label: "Pickup address (only when EXW)" },
]

type SectionKey = "emails" | "smtp" | "whatsapp" | "automation" | "approval" | "theme"

// ── Theme types & helpers ─────────────────────────────────────────────────────
interface ThemeColors {
  primaryDark:  string
  primaryMid:   string
  primaryLight: string
  accent:       string
}

const DEFAULT_COLORS: ThemeColors = {
  primaryDark:  "#0f1e36",
  primaryMid:   "#1a2d4a",
  primaryLight: "#243d61",
  accent:       "#E8821A",
}

const PRESETS: { name: string; colors: ThemeColors }[] = [
  { name: "Navy & Orange",         colors: { primaryDark: "#0f1e36", primaryMid: "#1a2d4a", primaryLight: "#243d61", accent: "#E8821A" } },
  { name: "Midnight & Emerald",    colors: { primaryDark: "#0a1628", primaryMid: "#122035", primaryLight: "#1a2d4a", accent: "#10b981" } },
  { name: "Slate & Cobalt",        colors: { primaryDark: "#1e293b", primaryMid: "#27374d", primaryLight: "#334155", accent: "#3b82f6" } },
  { name: "Deep Forest & Amber",   colors: { primaryDark: "#14291a", primaryMid: "#1a3320", primaryLight: "#234228", accent: "#f59e0b" } },
  { name: "Charcoal & Crimson",    colors: { primaryDark: "#1c1c1e", primaryMid: "#2c2c2e", primaryLight: "#3a3a3c", accent: "#ef4444" } },
  { name: "Corporate Grey & Teal", colors: { primaryDark: "#243447", primaryMid: "#2f4155", primaryLight: "#3a5068", accent: "#14b8a6" } },
]

function hexToRgb(hex: string): [number, number, number] {
  const c = hex.replace("#", "")
  const n = parseInt(c, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function contrastColor(hex: string): string {
  const [r, g, b] = hexToRgb(hex)
  return (0.299 * r + 0.587 * g + 0.114 * b) > 160 ? "#1a2535" : "#ffffff"
}

function lighten(hex: string, pct: number): string {
  const [r, g, b] = hexToRgb(hex)
  const f = (c: number) => Math.min(255, Math.round(c + (255 - c) * pct))
  return `#${f(r).toString(16).padStart(2,"0")}${f(g).toString(16).padStart(2,"0")}${f(b).toString(16).padStart(2,"0")}`
}

// ── ColorField ────────────────────────────────────────────────────────────────
function ColorField({ label, varName, value, onChange }: {
  label: string; varName: string; value: string; onChange: (v: string) => void
}) {
  const [hex, setHex] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { setHex(value) }, [value])

  function handleHexInput(e: React.ChangeEvent<HTMLInputElement>) {
    let v = e.target.value.replace(/[^0-9a-fA-F#]/g, "")
    if (!v.startsWith("#")) v = "#" + v
    setHex(v)
    if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v)
  }

  return (
    <div className="flex items-center gap-3 py-3" style={{ borderBottom: "1px solid var(--divider)" }}>
      <div className="relative shrink-0">
        <div
          className="h-10 w-10 cursor-pointer rounded-lg border-2 transition-transform hover:scale-105"
          style={{ background: value, borderColor: "var(--card-border)" }}
          onClick={() => inputRef.current?.click()}
          title="Pick colour"
        />
        <input
          ref={inputRef}
          type="color"
          value={value}
          onChange={(e) => { setHex(e.target.value); onChange(e.target.value) }}
          className="absolute inset-0 cursor-pointer opacity-0"
          style={{ width: "100%", height: "100%" }}
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>{label}</p>
        <p className="text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>{varName}</p>
      </div>
      <div className="flex items-center rounded-lg px-2 py-1.5" style={{ background: "var(--table-header-bg)", border: "1px solid var(--card-border)" }}>
        <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>#</span>
        <input
          type="text"
          value={hex.replace("#", "")}
          onChange={handleHexInput}
          maxLength={6}
          className="w-16 bg-transparent text-xs font-mono outline-none"
          style={{ color: "var(--text-primary)" }}
        />
      </div>
    </div>
  )
}

// ── MiniPreview ───────────────────────────────────────────────────────────────
function MiniPreview({ colors }: { colors: ThemeColors }) {
  const navGrad      = `linear-gradient(135deg, ${colors.primaryDark} 0%, ${colors.primaryMid} 60%, ${colors.primaryLight} 100%)`
  const accent       = colors.accent
  const textContrast = contrastColor(colors.primaryDark)

  return (
    <div className="overflow-hidden rounded-xl" style={{ border: "1px solid var(--card-border)", background: "#f0f2f5" }}>
      <div className="flex items-center justify-between px-4 py-2.5" style={{ background: navGrad }}>
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded text-xs font-black" style={{ background: accent + "22", color: accent }}>L</div>
          <span className="text-xs font-black" style={{ color: textContrast }}>
            Logis<span style={{ color: accent }}>tricks</span>
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {["Dashboard","Requests","Carriers"].map((l) => (
            <span key={l} className="rounded px-2 py-0.5 text-[9px]" style={{ color: textContrast + "bb" }}>{l}</span>
          ))}
        </div>
        <div className="h-5 w-5 rounded-full" style={{ background: colors.primaryLight }} />
      </div>
      <div className="grid grid-cols-3 gap-2 p-3">
        {[
          { label: "Total", value: "142", color: accent },
          { label: "Pending", value: "38", color: "#3b82f6" },
          { label: "Quoted", value: "27", color: "#22c55e" },
        ].map((t) => (
          <div key={t.label} className="overflow-hidden rounded-lg bg-white p-2.5" style={{ border: "1px solid #e2e6ec", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <div className="mb-1 h-0.5 rounded-full" style={{ background: t.color }} />
            <p className="text-[8px] font-semibold uppercase tracking-wide" style={{ color: "#5a6a7e" }}>{t.label}</p>
            <p className="text-sm font-black leading-tight tabular-nums" style={{ color: "#1a2535" }}>{t.value}</p>
          </div>
        ))}
      </div>
      <div className="mx-3 mb-3 overflow-hidden rounded-lg bg-white" style={{ border: "1px solid #e2e6ec" }}>
        <div className="px-3 py-2" style={{ background: navGrad }}>
          <span className="text-[9px] font-semibold" style={{ color: textContrast }}>Recent Requests</span>
        </div>
        {[
          { ref: "LTX-2609-001", route: "Shanghai → Dubai", status: "Pending" },
          { ref: "LTX-2609-002", route: "Rotterdam → NYC",  status: "Quoted"  },
        ].map((row) => (
          <div key={row.ref} className="flex items-center justify-between px-3 py-1.5" style={{ borderTop: "1px solid #eaeef2" }}>
            <span className="text-[8px] font-mono" style={{ color: "#1a2535" }}>{row.ref}</span>
            <span className="text-[8px]" style={{ color: "#5a6a7e" }}>{row.route}</span>
            <span className="rounded-full px-1.5 py-0.5 text-[7px] font-semibold" style={{ background: accent + "18", color: accent }}>{row.status}</span>
          </div>
        ))}
      </div>
      <div className="flex justify-end px-3 pb-3">
        <div className="rounded-md px-3 py-1.5 text-[9px] font-semibold text-white" style={{ background: accent }}>Send RFQ →</div>
      </div>
    </div>
  )
}

// ── Shared input style ────────────────────────────────────────────────────────
const inputCls   = "w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-all placeholder:text-[var(--text-muted)]"
const inputStyle = { borderColor: "var(--card-border)", background: "var(--input-bg, var(--card-bg))", color: "var(--text-primary)" }
const inputFocusStyle = { borderColor: "var(--brand-accent)", boxShadow: "0 0 0 3px rgba(232,130,26,0.12)" }

function Input({ value, onChange, onKeyDown, type = "text", placeholder, className = "" }: {
  value: string; onChange: (v: string) => void; onKeyDown?: (e: React.KeyboardEvent) => void
  type?: string; placeholder?: string; className?: string
}) {
  const [focused, setFocused] = useState(false)
  return (
    <input
      type={type} value={value} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      className={`${inputCls} ${className}`}
      style={{ ...inputStyle, ...(focused ? inputFocusStyle : {}) }}
    />
  )
}

// ── Toggle ─────────────────────────────────────────────────────────────────────
function Toggle({ checked, busy, onChange, label }: { checked: boolean; busy: boolean; onChange: () => void; label?: string }) {
  return (
    <button
      type="button" onClick={onChange} disabled={busy} aria-pressed={checked} aria-label={label}
      className={`relative h-6 w-11 shrink-0 overflow-hidden rounded-full transition-colors disabled:opacity-40 ${checked ? "bg-[var(--brand-accent)]" : "bg-[#CBD5E1] dark:bg-[#334155]"}`}
    >
      {busy
        ? <Loader2 className="absolute inset-0 m-auto h-3.5 w-3.5 animate-spin text-white" />
        : <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`} />
      }
    </button>
  )
}

// ── Setting card ──────────────────────────────────────────────────────────────
function SettingCard({ label, description, checked, busy, onToggle, children }: {
  label: string; description: string; checked: boolean; busy: boolean; onToggle: () => void; children?: React.ReactNode
}) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--card-border)", background: "var(--card-bg)" }}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{label}</p>
          <p className="mt-0.5 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{description}</p>
        </div>
        <Toggle checked={checked} busy={busy} onChange={onToggle} label={label} />
      </div>
      {children}
    </div>
  )
}

// ── Channel row ────────────────────────────────────────────────────────────────
function ChannelRow({ primary, secondary, active, busy, onToggle, onDelete }: {
  primary: string; secondary?: string | null; active: boolean; busy: boolean; onToggle: () => void; onDelete: () => void
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--divider)" }}>
      <span className={`h-2 w-2 shrink-0 rounded-full ${active ? "bg-emerald-400" : "bg-[var(--text-muted)]"}`} />
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>{primary}</p>
        {secondary && <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{secondary}</p>}
      </div>
      <Toggle checked={active} busy={busy} onChange={onToggle} label={`Toggle ${primary}`} />
      <button
        onClick={onDelete} disabled={busy} title="Remove"
        className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors disabled:opacity-40"
        style={{ color: "var(--text-muted)" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.1)"; (e.currentTarget as HTMLElement).style.color = "#ef4444" }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; (e.currentTarget as HTMLElement).style.color = "var(--text-muted)" }}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// ── Critical fields picker ─────────────────────────────────────────────────────
function CriticalFieldsPicker({ initial, onSave, onCancel }: {
  initial: string[]; onSave: (f: string[]) => void; onCancel: () => void
}) {
  const [selected, setSelected] = useState<string[]>(initial)
  function toggle(key: string) {
    setSelected((s) => s.includes(key) ? s.filter((k) => k !== key) : [...s, key])
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl shadow-2xl" style={{ background: "var(--card-bg)" }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--divider)" }}>
          <div>
            <h3 className="font-bold" style={{ color: "var(--text-primary)" }}>Select Critical Fields</h3>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>Sending is blocked when these are missing</p>
          </div>
          <button onClick={onCancel} className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors" style={{ color: "var(--text-muted)" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--hover-bg)" }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "" }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4 space-y-1.5">
          {CRITICAL_FIELD_OPTIONS.map((opt) => (
            <button key={opt.key} type="button" onClick={() => toggle(opt.key)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors"
              style={{ color: "var(--text-primary)" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--hover-bg)" }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "" }}
            >
              {selected.includes(opt.key)
                ? <CheckSquare className="h-4 w-4 shrink-0" style={{ color: "var(--brand-accent)" }} />
                : <Square className="h-4 w-4 shrink-0" style={{ color: "var(--text-muted)" }} />
              }
              <span className={selected.includes(opt.key) ? "font-semibold" : ""}>{opt.label}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-3 px-5 py-4" style={{ borderTop: "1px solid var(--divider)" }}>
          <button onClick={onCancel} className="flex-1 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors"
            style={{ borderColor: "var(--card-border)", color: "var(--text-primary)", background: "transparent" }}
          >Cancel</button>
          <button onClick={() => onSave(selected)} disabled={selected.length === 0}
            className="flex-1 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-40"
            style={{ background: "var(--brand-accent)" }}
          >Save ({selected.length})</button>
        </div>
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const [active, setActive]       = useState<SectionKey>("emails")
  const [clientCode, setClientCode] = useState<string>("")
  const [role, setRole]           = useState<UserRole>("operator")
  const [topTab, setTopTab]       = useState<"setup" | "theme" | "templates" | "notifications" | "carriers">("setup")
  const supabase = createClient()

  // Deep-link support: /settings?tab=templates or ?tab=carriers
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const t = params.get("tab")
      if (t === "templates" || t === "carriers" || t === "notifications") setTopTab(t)
    } catch { /* */ }
  }, [])

  // Email state
  const [emails, setEmails]               = useState<ReceiverEmail[]>([])
  const [emailsLoading, setEmailsLoading] = useState(true)
  const [emailBusy, setEmailBusy]         = useState<string | null>(null)
  const [newMail, setNewMail]             = useState("")
  const [newMailLabel, setNewMailLabel]   = useState("")
  const [addingMail, setAddingMail]       = useState(false)
  const [addMailOpen, setAddMailOpen]     = useState(false)
  const [mailCheck, setMailCheck]         = useState<{ state: "idle" | "checking" | "ok" | "bad"; msg?: string }>({ state: "idle" })

  // WhatsApp state
  const [numbers, setNumbers]         = useState<WhatsappNumber[]>([])
  const [numsLoading, setNumsLoading] = useState(true)
  const [numBusy, setNumBusy]         = useState<string | null>(null)
  const [newNum, setNewNum]           = useState("")
  const [newNumLabel, setNewNumLabel] = useState("")
  const [addingNum, setAddingNum]     = useState(false)

  // Automation state
  const [autoSend, setAutoSend]                           = useState(false)
  const [requireCritical, setRequireCritical]             = useState(false)
  const [criticalFields, setCriticalFields]               = useState<string[]>([])
  const [autoReply, setAutoReply]                         = useState(false)
  const [flagsLoading, setFlagsLoading]                   = useState(true)
  const [autoSendBusy, setAutoSendBusy]                   = useState(false)
  const [requireCritBusy, setRequireCritBusy]             = useState(false)
  const [autoReplyBusy, setAutoReplyBusy]                 = useState(false)
  const [autoReplyMissing, setAutoReplyMissing]           = useState(false)
  const [autoReplyMissingBusy, setAutoReplyMissingBusy]   = useState(false)
  const [autoReplyComplete, setAutoReplyComplete]         = useState(false)
  const [autoReplyCompleteBusy, setAutoReplyCompleteBusy] = useState(false)
  const [showPicker, setShowPicker]                       = useState(false)
  const [error, setError]                                 = useState<string | null>(null)

  // Theme state
  const [themeColors, setThemeColors]   = useState<ThemeColors>(DEFAULT_COLORS)
  const [activePreset, setActivePreset] = useState<string>("Navy & Orange")
  const [copied, setCopied]             = useState(false)
  const [themeToast, setThemeToast]     = useState<string | null>(null)

  useEffect(() => {
    const cc = sessionStorage.getItem("portal_client_code") ?? ""
    setClientCode(cc)

    // Fetch user role
    fetch("/api/me").then(r => r.json()).then(data => {
      if (data?.role) setRole(data.role as UserRole)
    }).catch(() => {})

    fetch("/api/settings/emails")
      .then(async (r) => {
        const d = await r.json().catch(() => null)
        if (!r.ok) throw new Error(d?.error ?? "Could not load receiver emails")
        setEmails(Array.isArray(d) ? d : [])
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setEmailsLoading(false))

    supabase.from("client_whatsapp_numbers").select("id, number, active, label").eq("client_code", cc).order("created_at")
      .then(({ data }) => { setNumbers(data ?? []); setNumsLoading(false) })

    fetch("/api/settings").then((r) => r.json()).then((data) => {
      if (data && !data.error) {
        setAutoSend(data.allow_auto_send_to_carrier ?? false)
        setRequireCritical(data.require_critical_data ?? false)
        setCriticalFields(data.critical_fields ?? [])
        setAutoReply(data.auto_reply_enabled ?? false)
        setAutoReplyMissing(data.auto_reply_missing_enabled ?? false)
        setAutoReplyComplete(data.auto_reply_complete_enabled ?? false)
      }
      setFlagsLoading(false)
    }).catch(() => setFlagsLoading(false))

    // Load saved theme — DB first (shared across browsers/devices), localStorage as fallback
    fetch("/api/client-settings?key=theme")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const parsed = data?.value ?? null
        if (parsed && parsed.primaryDark) {
          setThemeColors(parsed)
          const match = PRESETS.find(p =>
            Object.entries(p.colors).every(([k, v]) => (parsed as Record<string,string>)[k]?.toLowerCase() === v.toLowerCase())
          )
          setActivePreset(match?.name ?? "")
          try { localStorage.setItem("portal-theme-colors", JSON.stringify(parsed)) } catch {}
        } else {
          try {
            const saved = localStorage.getItem("portal-theme-colors")
            if (saved) {
              const lsParsed = JSON.parse(saved)
              setThemeColors(lsParsed)
              const match = PRESETS.find(p =>
                Object.entries(p.colors).every(([k, v]) => (lsParsed as Record<string,string>)[k]?.toLowerCase() === v.toLowerCase())
              )
              setActivePreset(match?.name ?? "")
            }
          } catch {}
        }
      })
      .catch(() => {
        try {
          const saved = localStorage.getItem("portal-theme-colors")
          if (saved) {
            const lsParsed = JSON.parse(saved)
            setThemeColors(lsParsed)
          }
        } catch {}
      })
  }, [])

  // Apply theme colors to document root whenever they change
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty("--brand-navy",        themeColors.primaryDark)
    root.style.setProperty("--brand-navy-mid",    themeColors.primaryMid)
    root.style.setProperty("--brand-navy-light",  themeColors.primaryLight)
    root.style.setProperty("--brand-accent",      themeColors.accent)
    root.style.setProperty("--brand-accent-hover", lighten(themeColors.accent, -0.1))
  }, [themeColors])

  // Email actions
  async function emailApi(method: "POST" | "PATCH" | "DELETE", body: object) {
    const res = await fetch("/api/settings/emails", {
      method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.error ?? "Request failed")
    return data
  }
  async function toggleEmail(row: ReceiverEmail) {
    setEmailBusy(row.id); const next = !row.active
    try {
      await emailApi("PATCH", { id: row.id, active: next })
      setEmails((p) => p.map((e) => e.id === row.id ? { ...e, active: next } : e))
    } catch (e) { setError((e as Error).message) }
    setEmailBusy(null)
  }
  async function deleteEmail(id: string) {
    setEmailBusy(id)
    try {
      await emailApi("DELETE", { id })
      setEmails((p) => p.filter((e) => e.id !== id))
    } catch (e) { setError((e as Error).message) }
    setEmailBusy(null)
  }
  function closeAddMail() { setAddMailOpen(false); setNewMail(""); setNewMailLabel(""); setMailCheck({ state: "idle" }) }
  useEffect(() => {
    const v = newMail.trim()
    if (!addMailOpen || !v) { setMailCheck({ state: "idle" }); return }
    setMailCheck({ state: "checking" })
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/settings/emails?check=${encodeURIComponent(v)}`)
        const d = await r.json()
        setMailCheck(d.valid && d.available ? { state: "ok" } : { state: "bad", msg: d.reason ?? d.error ?? "Cannot use this address." })
      } catch { setMailCheck({ state: "bad", msg: "Could not verify this address. Try again." }) }
    }, 400)
    return () => clearTimeout(t)
  }, [newMail, addMailOpen])
  async function addEmail() {
    if (!newMail.trim() || mailCheck.state !== "ok") return; setAddingMail(true)
    try {
      const row = await emailApi("POST", { r_mail: newMail.trim(), label: newMailLabel.trim() || null })
      setEmails((p) => [...p, row]); closeAddMail()
    } catch (e) { setMailCheck({ state: "bad", msg: (e as Error).message }) }
    setAddingMail(false)
  }

  // WhatsApp actions
  async function toggleNumber(row: WhatsappNumber) {
    setNumBusy(row.id); const next = !row.active
    const { error } = await supabase.from("client_whatsapp_numbers").update({ active: next }).eq("id", row.id)
    if (error) setError(error.message)
    else setNumbers((p) => p.map((n) => n.id === row.id ? { ...n, active: next } : n))
    setNumBusy(null)
  }
  async function deleteNumber(id: string) {
    setNumBusy(id)
    const { error } = await supabase.from("client_whatsapp_numbers").delete().eq("id", id)
    if (error) setError(error.message)
    else setNumbers((p) => p.filter((n) => n.id !== id))
    setNumBusy(null)
  }
  async function addNumber() {
    if (!newNum.trim()) return; setAddingNum(true)
    const { data, error } = await supabase.from("client_whatsapp_numbers")
      .insert({ client_code: clientCode, number: newNum.trim(), label: newNumLabel.trim() || null, active: true })
      .select("id, number, active, label").single()
    if (error) setError(error.message)
    else { setNumbers((p) => [...p, data]); setNewNum(""); setNewNumLabel("") }
    setAddingNum(false)
  }

  // Automation helpers
  async function patchSettings(fields: Record<string, unknown>): Promise<string | null> {
    const res = await fetch("/api/settings", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fields),
    })
    const json = await res.json()
    if (!res.ok || json.error) return json.error ?? "Save failed"
    return null
  }

  async function toggleAutoReply() {
    setAutoReplyBusy(true)
    const err = await patchSettings({ auto_reply_enabled: !autoReply })
    if (err) setError(err); else setAutoReply((v) => !v)
    setAutoReplyBusy(false)
  }
  async function toggleAutoReplyMissing() {
    setAutoReplyMissingBusy(true)
    const err = await patchSettings({ auto_reply_missing_enabled: !autoReplyMissing })
    if (err) setError(err); else setAutoReplyMissing((v) => !v)
    setAutoReplyMissingBusy(false)
  }
  async function toggleAutoReplyComplete() {
    setAutoReplyCompleteBusy(true)
    const err = await patchSettings({ auto_reply_complete_enabled: !autoReplyComplete })
    if (err) setError(err); else setAutoReplyComplete((v) => !v)
    setAutoReplyCompleteBusy(false)
  }
  async function toggleAutoSend() {
    setAutoSendBusy(true)
    const err = await patchSettings({ allow_auto_send_to_carrier: !autoSend })
    if (err) setError(err); else setAutoSend((v) => !v)
    setAutoSendBusy(false)
  }
  async function toggleRequireCritical() {
    const next = !requireCritical
    if (next && criticalFields.length === 0) { setShowPicker(true); return }
    setRequireCritBusy(true)
    const patch: Record<string, unknown> = { require_critical_data: next }
    if (!next) { patch.auto_reply_missing_enabled = false; patch.auto_reply_complete_enabled = false }
    const err = await patchSettings(patch)
    if (err) { setError(err) } else {
      setRequireCritical(next)
      if (!next) { setAutoReplyMissing(false); setAutoReplyComplete(false) }
    }
    setRequireCritBusy(false)
  }
  async function saveCriticalFields(fields: string[]) {
    setRequireCritBusy(true)
    const err = await patchSettings({ require_critical_data: true, critical_fields: fields })
    if (err) setError(err)
    else { setCriticalFields(fields); setRequireCritical(true) }
    setShowPicker(false); setRequireCritBusy(false)
  }

  // Theme actions
  function updateThemeColor(key: keyof ThemeColors, value: string) {
    setThemeColors((prev) => ({ ...prev, [key]: value }))
    setActivePreset("")
  }
  function applyPreset(preset: typeof PRESETS[0]) {
    setThemeColors(preset.colors)
    setActivePreset(preset.name)
    showThemeToast(`Applied "${preset.name}"`)
  }
  function resetTheme() {
    setThemeColors(DEFAULT_COLORS)
    setActivePreset("Navy & Orange")
    const root = document.documentElement
    ;["--brand-navy","--brand-navy-mid","--brand-navy-light","--brand-accent","--brand-accent-hover"].forEach(v => root.style.removeProperty(v))
    try { localStorage.removeItem("portal-theme-colors") } catch {}
    fetch("/api/client-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "theme", value: DEFAULT_COLORS }) }).catch(() => {})
    showThemeToast("Reset to default theme")
  }
  async function saveTheme() {
    try { localStorage.setItem("portal-theme-colors", JSON.stringify(themeColors)) } catch {}
    try {
      const res = await fetch("/api/client-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "theme", value: themeColors }),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); showThemeToast(`Save failed: ${e.error ?? res.status}`); return }
    } catch { showThemeToast("Save failed — network error"); return }
    showThemeToast("Theme saved!")
  }
  function copyCss() {
    const css = `/* Logistricks Brand Tokens */\n--brand-navy:        ${themeColors.primaryDark};\n--brand-navy-mid:    ${themeColors.primaryMid};\n--brand-navy-light:  ${themeColors.primaryLight};\n--brand-accent:      ${themeColors.accent};\n--brand-accent-hover:${lighten(themeColors.accent, -0.1)};`
    navigator.clipboard.writeText(css).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  function showThemeToast(msg: string) {
    setThemeToast(msg)
    setTimeout(() => setThemeToast(null), 2500)
  }

  const cssVars = [
    { name: "Primary Dark",  var: "--brand-navy",       key: "primaryDark"  as keyof ThemeColors, value: themeColors.primaryDark  },
    { name: "Primary Mid",   var: "--brand-navy-mid",   key: "primaryMid"   as keyof ThemeColors, value: themeColors.primaryMid   },
    { name: "Primary Light", var: "--brand-navy-light", key: "primaryLight" as keyof ThemeColors, value: themeColors.primaryLight },
    { name: "Accent",        var: "--brand-accent",     key: "accent"       as keyof ThemeColors, value: themeColors.accent       },
  ]

  // Sections — theme only shown to admins
  const SECTIONS: { key: SectionKey; label: string; icon: React.ElementType; desc: string }[] = [
    { key: "emails",     label: "Receiver Emails",  icon: Mail,          desc: "Inbound email addresses"        },
    { key: "smtp",       label: "Email Server (SMTP)", icon: Server,      desc: "Outgoing notification mailbox"  },
    { key: "whatsapp",   label: "WhatsApp Numbers", icon: MessageCircle, desc: "Inbound WhatsApp sources"       },
    { key: "automation", label: "Automation",        icon: Zap,           desc: "Auto-send & auto-reply rules"   },
    { key: "approval",   label: "Approval Workflow", icon: GitBranch,     desc: "Approval cycles & chains"      },
  ]

  // ── Render sections ──────────────────────────────────────────────────────────
  function renderSection() {
    if (active === "emails") return (
      <div>
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Receiver Emails</h2>
            <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>Inbound addresses monitored for incoming freight requests. Only active addresses are processed.</p>
          </div>
          {role !== "viewer" && (
            <button onClick={() => setAddMailOpen(true)} aria-label="Add receiver email" title="Add receiver email"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white transition-all hover:opacity-90"
              style={{ background: "var(--brand-accent)" }}>
              <Plus className="h-5 w-5" />
            </button>
          )}
        </div>
        {addMailOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={closeAddMail}>
            <div className="w-full max-w-sm rounded-xl border p-5 shadow-xl" onClick={(e) => e.stopPropagation()}
              style={{ background: "var(--card-bg)", borderColor: "var(--card-border)" }}>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>Add receiver email</h3>
                <button onClick={closeAddMail} aria-label="Close" style={{ color: "var(--text-muted)" }}><X className="h-4 w-4" /></button>
              </div>
              <label className="mb-1 block text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>Email address</label>
              <Input type="email" placeholder="" value={newMail} onChange={setNewMail}
                onKeyDown={(e) => e.key === "Enter" && addEmail()} className="w-full" />
              <div className="mt-1.5 min-h-[18px] text-xs">
                {mailCheck.state === "checking" && <span style={{ color: "var(--text-muted)" }}>Checking…</span>}
                {mailCheck.state === "ok" && <span className="text-green-600">Available</span>}
                {mailCheck.state === "bad" && <span className="text-red-600">{mailCheck.msg}</span>}
              </div>
              <label className="mb-1 mt-3 block text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>Label (optional)</label>
              <Input value={newMailLabel} onChange={setNewMailLabel} onKeyDown={(e) => e.key === "Enter" && addEmail()} className="w-full" />
              <div className="mt-5 flex justify-end gap-2">
                <button onClick={closeAddMail} className="rounded-lg border px-3 py-2 text-xs font-semibold"
                  style={{ borderColor: "var(--card-border)", color: "var(--text-secondary)" }}>Cancel</button>
                <button onClick={addEmail} disabled={addingMail || mailCheck.state !== "ok"}
                  className="flex items-center gap-1 rounded-lg px-4 py-2 text-xs font-semibold text-white transition-all disabled:opacity-40"
                  style={{ background: "var(--brand-accent)" }}>
                  {addingMail ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}
                </button>
              </div>
            </div>
          </div>
        )}
        {emailsLoading
          ? <div className="flex items-center gap-2 py-6 text-sm" style={{ color: "var(--text-secondary)" }}><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          : (
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--card-border)", background: "var(--card-bg)" }}>
              {emails.length === 0 && (
                <p className="px-4 py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>No email addresses configured.</p>
              )}
              {emails.map((row) => (
                <ChannelRow key={row.id} primary={row.r_mail} secondary={row.label} active={row.active}
                  busy={emailBusy === row.id} onToggle={() => toggleEmail(row)} onDelete={() => deleteEmail(row.id)} />
              ))}
            </div>
          )
        }
      </div>
    )

    if (active === "smtp") return <SmtpPanel canEdit={role === "admin"} />

    if (active === "whatsapp") return (
      <div>
        <div className="mb-5">
          <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>WhatsApp Numbers</h2>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>Sender numbers monitored for inbound WhatsApp rate replies. Use E.164 format (+96612345678).</p>
        </div>
        {numsLoading
          ? <div className="flex items-center gap-2 py-6 text-sm" style={{ color: "var(--text-secondary)" }}><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          : (
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--card-border)", background: "var(--card-bg)" }}>
              {numbers.length === 0 && (
                <p className="px-4 py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>No WhatsApp numbers configured.</p>
              )}
              {numbers.map((row) => (
                <ChannelRow key={row.id} primary={row.number} secondary={row.label} active={row.active}
                  busy={numBusy === row.id} onToggle={() => toggleNumber(row)} onDelete={() => deleteNumber(row.id)} />
              ))}
              <div className="flex items-center gap-2 px-4 py-3" style={{ background: "var(--table-header-bg)" }}>
                <Plus className="h-4 w-4 shrink-0" style={{ color: "var(--text-muted)" }} />
                <Input type="tel" placeholder="+96612345678" value={newNum} onChange={setNewNum}
                  onKeyDown={(e) => e.key === "Enter" && addNumber()} className="flex-1" />
                <Input placeholder="Label (optional)" value={newNumLabel} onChange={setNewNumLabel}
                  onKeyDown={(e) => e.key === "Enter" && addNumber()} className="w-32" />
                <button onClick={addNumber} disabled={addingNum || !newNum.trim()}
                  className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-white transition-all disabled:opacity-40"
                  style={{ background: "var(--brand-accent)" }}>
                  {addingNum ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}
                </button>
              </div>
            </div>
          )
        }
      </div>
    )

    if (active === "automation") return (
      <div>
        <div className="mb-5">
          <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Automation</h2>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>Control how the system handles sending rate requests and replies on your behalf.</p>
        </div>
        {flagsLoading
          ? <div className="flex items-center gap-2 py-6 text-sm" style={{ color: "var(--text-secondary)" }}><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          : (
            <div className="space-y-3">
              <SettingCard
                label="Send auto-reply to sender"
                description="An acknowledgement email is automatically sent after a freight request is received and parsed. Requires an Auto-Reply template."
                checked={autoReply} busy={autoReplyBusy} onToggle={toggleAutoReply}
              />
              <SettingCard
                label="Allow auto send to carrier"
                description="The system can automatically send rate requests to carriers without requiring manual confirmation."
                checked={autoSend} busy={autoSendBusy} onToggle={toggleAutoSend}
              />
              <SettingCard
                label="Block sending if critical data is missing"
                description="The Send to Carrier button is disabled until all critical fields are present in the freight request."
                checked={requireCritical} busy={requireCritBusy} onToggle={toggleRequireCritical}
              >
                {requireCritical && (
                  <div className="mt-3 rounded-lg border p-3" style={{ borderColor: "var(--divider)", background: "var(--table-header-bg)" }}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                        Critical fields <span className="normal-case font-normal">({criticalFields.length} selected)</span>
                      </p>
                      <button onClick={() => setShowPicker(true)} className="text-xs font-semibold hover:underline" style={{ color: "var(--brand-accent)" }}>Edit</button>
                    </div>
                    {criticalFields.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {criticalFields.map((key) => {
                          const opt = CRITICAL_FIELD_OPTIONS.find((o) => o.key === key)
                          return opt ? (
                            <span key={key} className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: "rgba(232,130,26,0.12)", color: "var(--brand-accent)", border: "1px solid rgba(232,130,26,0.25)" }}>
                              <AlertTriangle className="h-3 w-3" />{opt.label}
                            </span>
                          ) : null
                        })}
                      </div>
                    ) : (
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>No fields selected. Click Edit to choose.</p>
                    )}
                    <div className="mt-3 flex items-start justify-between gap-4 pt-3" style={{ borderTop: "1px solid var(--divider)" }}>
                      <div>
                        <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Auto-reply when critical data is missing</p>
                        <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>Sends the missing-data template. Requires a Missing Data template.</p>
                      </div>
                      <Toggle checked={autoReplyMissing} busy={autoReplyMissingBusy} onChange={toggleAutoReplyMissing} label="Auto-reply missing" />
                    </div>
                    <div className="mt-3 flex items-start justify-between gap-4 pt-3" style={{ borderTop: "1px solid var(--divider)" }}>
                      <div>
                        <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Auto-reply when all data is complete</p>
                        <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>Sends the complete-data template when all required fields are present.</p>
                      </div>
                      <Toggle checked={autoReplyComplete} busy={autoReplyCompleteBusy} onChange={toggleAutoReplyComplete} label="Auto-reply complete" />
                    </div>
                  </div>
                )}
              </SettingCard>
            </div>
          )
        }
      </div>
    )

    if (active === "approval") return (
      <div>
        <div className="mb-5">
          <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Approval Workflow</h2>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>Configure named approval cycles and step chains used when submitting freight requests for internal review.</p>
        </div>
        <Link
          href="/settings/approval-cycles"
          className="flex items-center justify-between rounded-xl border px-5 py-4 text-sm font-semibold transition-all"
          style={{ borderColor: "var(--card-border)", color: "var(--text-primary)", background: "var(--card-bg)" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(232,130,26,0.4)"; (e.currentTarget as HTMLAnchorElement).style.background = "rgba(232,130,26,0.04)" }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--card-border)"; (e.currentTarget as HTMLAnchorElement).style.background = "var(--card-bg)" }}
        >
          <span>Manage Approval Cycles</span>
          <ChevronRight className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
        </Link>
      </div>
    )

    if (active === "theme" && role === "admin") return (
      <div>
        {/* Toast */}
        {themeToast && (
          <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-xl"
            style={{ background: "var(--brand-navy)", animation: "fadeIn 0.2s ease" }}>
            <Check className="h-4 w-4" style={{ color: "var(--brand-accent)" }} />
            {themeToast}
          </div>
        )}

        <div className="mb-5">
          <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Theme</h2>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>Customise the portal's colour palette. Changes apply immediately across the portal.</p>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
          {/* Controls */}
          <div className="space-y-4 lg:col-span-2">
            <BrandingCard />

            {/* Color variables */}
            <div className="rounded-xl border p-5" style={{ borderColor: "var(--card-border)", background: "var(--card-bg)" }}>
              <h3 className="mb-0.5 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Color Variables</h3>
              <p className="mb-4 text-xs" style={{ color: "var(--text-secondary)" }}>Click a swatch or enter a hex value</p>
              {cssVars.map((cv) => (
                <ColorField
                  key={cv.var}
                  label={cv.name}
                  varName={cv.var}
                  value={cv.value}
                  onChange={(v) => updateThemeColor(cv.key, v)}
                />
              ))}
              <div className="mt-4 flex gap-2">
                <button onClick={copyCss}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-semibold text-white transition-all"
                  style={{ background: "var(--brand-accent)" }}>
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied!" : "Copy CSS Vars"}
                </button>
                <button onClick={resetTheme}
                  className="flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold transition-all"
                  style={{ background: "var(--table-header-bg)", color: "var(--text-secondary)", border: "1px solid var(--card-border)" }}
                  title="Reset to defaults">
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset
                </button>
              </div>
            </div>

            {/* Presets */}
            <div className="rounded-xl border p-5" style={{ borderColor: "var(--card-border)", background: "var(--card-bg)" }}>
              <h3 className="mb-0.5 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Client Presets</h3>
              <p className="mb-4 text-xs" style={{ color: "var(--text-secondary)" }}>One-click brand configurations</p>
              <div className="space-y-2">
                {PRESETS.map((preset) => {
                  const isActive = activePreset === preset.name
                  return (
                    <button key={preset.name} onClick={() => applyPreset(preset)}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-all"
                      style={{
                        background: isActive ? "rgba(232,130,26,0.08)" : "var(--table-header-bg)",
                        border: `1px solid ${isActive ? "var(--brand-accent)" : "var(--card-border)"}`,
                        color: "var(--text-primary)",
                      }}>
                      <div className="flex shrink-0 gap-0.5">
                        {Object.values(preset.colors).map((c, i) => (
                          <div key={i} className="h-4 w-4 rounded-full" style={{ background: c, marginLeft: i > 0 ? -4 : 0 }} />
                        ))}
                      </div>
                      <span className="flex-1 text-xs font-medium">{preset.name}</span>
                      {isActive && <Check className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--brand-accent)" }} />}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Save */}
            <button onClick={saveTheme}
              className="w-full rounded-lg py-3 text-sm font-semibold text-white transition-all hover:opacity-90"
              style={{ background: `linear-gradient(135deg, ${themeColors.primaryDark} 0%, ${themeColors.primaryMid} 100%)` }}>
              Save Theme
            </button>
          </div>

          {/* Preview */}
          <div className="lg:col-span-3 space-y-4">
            <div className="rounded-xl border p-5" style={{ borderColor: "var(--card-border)", background: "var(--card-bg)" }}>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Live Preview</h3>
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>How the portal looks with your chosen colours</p>
                </div>
                <button onClick={() => setThemeColors({ ...themeColors })} className="rounded-md p-1.5 transition-colors" style={{ color: "var(--text-muted)" }}>
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
              <MiniPreview colors={themeColors} />
            </div>

            {/* Current values */}
            <div className="rounded-xl border p-5" style={{ borderColor: "var(--card-border)", background: "var(--card-bg)" }}>
              <h3 className="mb-3 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Current Values</h3>
              <div className="grid grid-cols-2 gap-3">
                {cssVars.map((cv) => (
                  <div key={cv.var} className="flex items-center gap-2.5 rounded-lg p-3" style={{ background: "var(--table-header-bg)", border: "1px solid var(--card-border)" }}>
                    <div className="h-8 w-8 shrink-0 rounded" style={{ background: cv.value }} />
                    <div className="min-w-0">
                      <p className="truncate text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>{cv.var}</p>
                      <p className="font-mono text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{cv.value.toUpperCase()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <style>{`
          @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        `}</style>
      </div>
    )
  }

  return (
    <div className="portal-page p-6">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-[22px] font-bold" style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}>Settings</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>Manage your organisation's configuration</p>
      </div>

      {error && (
        <p className="mb-5 rounded-lg px-4 py-3 text-sm" style={{ color: "#ef4444", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>{error}</p>
      )}

      {/* Top tab bar: Setup | Theme */}
      <div className="mb-6 flex items-center gap-1 border-b" style={{ borderColor: "var(--card-border)" }}>
        <button
          onClick={() => { setTopTab("setup"); if (active === "theme") setActive("emails") }}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors"
          style={{
            color: topTab === "setup" ? "var(--brand-accent)" : "var(--text-secondary)",
            borderBottom: topTab === "setup" ? "2px solid var(--brand-accent)" : "2px solid transparent",
            marginBottom: -1,
          }}
        >
          <Settings2 className="h-4 w-4" />
          Setup
        </button>
        <button
          onClick={() => { if (role === "admin") { setTopTab("theme"); setActive("theme") } }}
          disabled={role !== "admin"}
          title={role !== "admin" ? "Admin access required" : undefined}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors"
          style={{
            color: role !== "admin"
              ? "var(--text-muted)"
              : topTab === "theme" ? "var(--brand-accent)" : "var(--text-secondary)",
            borderBottom: topTab === "theme" ? "2px solid var(--brand-accent)" : "2px solid transparent",
            marginBottom: -1,
            opacity: role !== "admin" ? 0.45 : 1,
            cursor: role !== "admin" ? "not-allowed" : "pointer",
          }}
        >
          <Palette className="h-4 w-4" />
          Theme
          {role !== "admin" && (
            <span className="ml-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
              style={{ background: "var(--divider)", color: "var(--text-muted)" }}>
              Admin
            </span>
          )}
        </button>
        <button
          onClick={() => setTopTab("templates")}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors"
          style={{
            color: topTab === "templates" ? "var(--brand-accent)" : "var(--text-secondary)",
            borderBottom: topTab === "templates" ? "2px solid var(--brand-accent)" : "2px solid transparent",
            marginBottom: -1,
          }}
        >
          <FileText className="h-4 w-4" />
          Templates
        </button>
        <button
          onClick={() => setTopTab("notifications")}
          className="flex items-center gap-2 whitespace-nowrap px-4 py-2.5 text-sm font-semibold transition-colors"
          style={{
            color: topTab === "notifications" ? "var(--brand-accent)" : "var(--text-secondary)",
            borderBottom: topTab === "notifications" ? "2px solid var(--brand-accent)" : "2px solid transparent",
            marginBottom: -1,
          }}
        >
          <Bell className="h-4 w-4" />
          Notification Templates
        </button>
        <button
          onClick={() => setTopTab("carriers")}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors"
          style={{
            color: topTab === "carriers" ? "var(--brand-accent)" : "var(--text-secondary)",
            borderBottom: topTab === "carriers" ? "2px solid var(--brand-accent)" : "2px solid transparent",
            marginBottom: -1,
          }}
        >
          <Truck className="h-4 w-4" />
          Carriers
        </button>
      </div>

      {/* Setup tab: sidebar + content */}
      {topTab === "setup" && (
        <div className="flex gap-6">
          <aside className="hidden w-56 shrink-0 md:block">
            <nav className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--card-border)", background: "var(--card-bg)" }}>
              {SECTIONS.map((s, i) => {
                const Icon = s.icon
                const isActive = active === s.key
                return (
                  <button
                    key={s.key}
                    onClick={() => setActive(s.key)}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-all"
                    style={{
                      borderBottom: i < SECTIONS.length - 1 ? "1px solid var(--divider)" : "none",
                      background: isActive ? "rgba(232,130,26,0.08)" : "transparent",
                      color: isActive ? "var(--brand-accent)" : "var(--text-secondary)",
                      borderLeft: isActive ? "3px solid var(--brand-accent)" : "3px solid transparent",
                    }}
                    onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "var(--hover-bg)" }}
                    onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent" }}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold leading-tight">{s.label}</p>
                      <p className="text-[11px] leading-tight mt-0.5 truncate" style={{ color: isActive ? "rgba(232,130,26,0.7)" : "var(--text-muted)" }}>{s.desc}</p>
                    </div>
                  </button>
                )
              })}
            </nav>
          </aside>
          <div className="min-w-0 flex-1 max-w-2xl">
            {renderSection()}
          </div>
        </div>
      )}

      {/* Theme tab: full-width */}
      {topTab === "theme" && role === "admin" && renderSection()}

      {/* Templates tab: full-width */}
      {topTab === "templates" && <TemplatesPanel />}

      {/* Notification templates tab: full-width */}
      {topTab === "notifications" && <NotificationTemplatesPanel onOpenSmtp={() => { setActive("smtp"); setTopTab("setup") }} />}

      {/* Carriers tab: full-width */}
      {topTab === "carriers" && <CarriersPanel />}

      {showPicker && (
        <CriticalFieldsPicker
          initial={criticalFields}
          onSave={saveCriticalFields}
          onCancel={() => setShowPicker(false)}
        />
      )}
    </div>
  )
}
