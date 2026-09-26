"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Check, Copy, RefreshCw, RotateCcw } from "lucide-react"

// ─── Types ─────────────────────────────────────────────────────────────────────
interface ThemeColors {
  primaryDark:  string  // --brand-navy
  primaryMid:   string  // --brand-navy-mid
  primaryLight: string  // --brand-navy-light
  accent:       string  // --brand-accent
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
function hexToRgb(hex: string): [number, number, number] {
  const c = hex.replace("#", "")
  const n = parseInt(c, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function contrastColor(hex: string): string {
  const [r, g, b] = hexToRgb(hex)
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b
  return luminance > 160 ? "#1a2535" : "#ffffff"
}

function lighten(hex: string, pct: number): string {
  const [r, g, b] = hexToRgb(hex)
  const f = (c: number) => Math.min(255, Math.round(c + (255 - c) * pct))
  return `#${f(r).toString(16).padStart(2,"0")}${f(g).toString(16).padStart(2,"0")}${f(b).toString(16).padStart(2,"0")}`
}

// ─── Color Field ──────────────────────────────────────────────────────────────
function ColorField({
  label, varName, value, onChange,
}: {
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
      {/* Color swatch / native picker */}
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
      {/* Labels + hex input */}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>{label}</p>
        <p className="text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>{varName}</p>
      </div>
      <div
        className="flex items-center rounded-lg px-2 py-1.5"
        style={{ background: "var(--table-header-bg)", border: "1px solid var(--card-border)" }}
      >
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

// ─── Mini Preview ─────────────────────────────────────────────────────────────
function MiniPreview({ colors }: { colors: ThemeColors }) {
  const navGrad = `linear-gradient(135deg, ${colors.primaryDark} 0%, ${colors.primaryMid} 60%, ${colors.primaryLight} 100%)`
  const accent   = colors.accent
  const textContrast = contrastColor(colors.primaryDark)

  return (
    <div
      className="overflow-hidden rounded-xl"
      style={{ border: "1px solid var(--card-border)", background: "#f0f2f5", fontFamily: "var(--font-sans)" }}
    >
      {/* Navbar */}
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

      {/* Body */}
      <div className="grid grid-cols-3 gap-2 p-3">
        {/* KPI tiles */}
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

      {/* Table preview */}
      <div className="mx-3 mb-3 overflow-hidden rounded-lg bg-white" style={{ border: "1px solid #e2e6ec" }}>
        <div className="px-3 py-2" style={{ background: navGrad }}>
          <span className="text-[9px] font-semibold" style={{ color: textContrast }}>Recent Requests</span>
        </div>
        {[
          { ref: "LTX-2609-001", route: "Shanghai → Dubai", status: "Pending" },
          { ref: "LTX-2609-002", route: "Rotterdam → NYC", status: "Quoted" },
        ].map((row) => (
          <div key={row.ref} className="flex items-center justify-between px-3 py-1.5" style={{ borderTop: "1px solid #eaeef2" }}>
            <span className="text-[8px] font-mono" style={{ color: "#1a2535" }}>{row.ref}</span>
            <span className="text-[8px]" style={{ color: "#5a6a7e" }}>{row.route}</span>
            <span className="rounded-full px-1.5 py-0.5 text-[7px] font-semibold" style={{ background: accent + "18", color: accent }}>{row.status}</span>
          </div>
        ))}
      </div>

      {/* Accent button sample */}
      <div className="flex justify-end px-3 pb-3">
        <div className="rounded-md px-3 py-1.5 text-[9px] font-semibold text-white" style={{ background: accent }}>
          Send RFQ →
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ThemeSettingsPage() {
  const [colors, setColors] = useState<ThemeColors>(DEFAULT_COLORS)
  const [copied, setCopied] = useState(false)
  const [toast, setToast]   = useState<string | null>(null)
  const [activePreset, setActivePreset] = useState<string>("Navy & Orange")

  // Load saved theme on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("portal-theme-colors")
      if (saved) {
        const parsed = JSON.parse(saved)
        setColors(parsed)
        // Figure out if it matches a preset
        const match = PRESETS.find(p =>
          Object.entries(p.colors).every(([k, v]) => parsed[k]?.toLowerCase() === v.toLowerCase())
        )
        setActivePreset(match?.name ?? "")
      }
    } catch {}
  }, [])

  // Apply colors to document root for live preview of the whole portal
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty("--brand-navy",       colors.primaryDark)
    root.style.setProperty("--brand-navy-mid",   colors.primaryMid)
    root.style.setProperty("--brand-navy-light",  colors.primaryLight)
    root.style.setProperty("--brand-accent",      colors.accent)
    root.style.setProperty("--brand-accent-hover", lighten(colors.accent, -0.1))
  }, [colors])

  function updateColor(key: keyof ThemeColors, value: string) {
    setColors((prev) => {
      const next = { ...prev, [key]: value }
      return next
    })
    setActivePreset("")
  }

  function applyPreset(preset: typeof PRESETS[0]) {
    setColors(preset.colors)
    setActivePreset(preset.name)
    showToast(`Applied "${preset.name}"`)
  }

  function reset() {
    setColors(DEFAULT_COLORS)
    setActivePreset("Navy & Orange")
    // Remove CSS overrides
    const root = document.documentElement
    ;["--brand-navy","--brand-navy-mid","--brand-navy-light","--brand-accent","--brand-accent-hover"].forEach(v => root.style.removeProperty(v))
    try { localStorage.removeItem("portal-theme-colors") } catch {}
    showToast("Reset to default theme")
  }

  function save() {
    try {
      localStorage.setItem("portal-theme-colors", JSON.stringify(colors))
    } catch {}
    showToast("Theme saved!")
  }

  function copyCss() {
    const css = `/* Logistricks Brand Tokens */
--brand-navy:        ${colors.primaryDark};
--brand-navy-mid:    ${colors.primaryMid};
--brand-navy-light:  ${colors.primaryLight};
--brand-accent:      ${colors.accent};
--brand-accent-hover:${lighten(colors.accent, -0.1)};`
    navigator.clipboard.writeText(css).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  const cssVars: { name: string; var: string; value: string }[] = [
    { name: "Primary Dark",  var: "--brand-navy",        value: colors.primaryDark },
    { name: "Primary Mid",   var: "--brand-navy-mid",    value: colors.primaryMid },
    { name: "Primary Light", var: "--brand-navy-light",  value: colors.primaryLight },
    { name: "Accent",        var: "--brand-accent",      value: colors.accent },
  ]

  return (
    <div className="portal-page min-h-full p-6">
      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-xl"
          style={{ background: "var(--brand-navy)", animation: "fadeIn 0.2s ease" }}
        >
          <Check className="h-4 w-4" style={{ color: "var(--brand-accent)" }} />
          {toast}
        </div>
      )}

      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-sans)" }}>
          Theme Settings
        </h1>
        <p className="mt-0.5 text-sm" style={{ color: "var(--text-secondary)" }}>
          Customise the portal's colour palette. Changes apply immediately across the portal.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* ── Left: Controls ── */}
        <div className="space-y-5 lg:col-span-2">
          {/* Color variables */}
          <div className="ds-card p-5">
            <h2 className="mb-0 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Color Variables</h2>
            <p className="mb-4 text-xs" style={{ color: "var(--text-secondary)" }}>Click a swatch or enter a hex value</p>
            {cssVars.map((cv, i) => (
              <ColorField
                key={cv.var}
                label={cv.name}
                varName={cv.var}
                value={cv.value}
                onChange={(v) => {
                  const keys: (keyof ThemeColors)[] = ["primaryDark","primaryMid","primaryLight","accent"]
                  updateColor(keys[i], v)
                }}
              />
            ))}
            <div className="mt-4 flex gap-2">
              <button
                onClick={copyCss}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-semibold text-white transition-all"
                style={{ background: "var(--brand-accent)" }}
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied!" : "Copy CSS Variables"}
              </button>
              <button
                onClick={reset}
                className="flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold transition-all"
                style={{ background: "var(--table-header-bg)", color: "var(--text-secondary)", border: "1px solid var(--card-border)" }}
                title="Reset to defaults"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </button>
            </div>
          </div>

          {/* Client Presets */}
          <div className="ds-card p-5">
            <h2 className="mb-1 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Client Presets</h2>
            <p className="mb-4 text-xs" style={{ color: "var(--text-secondary)" }}>One-click brand configurations</p>
            <div className="space-y-2">
              {PRESETS.map((preset) => {
                const isActive = activePreset === preset.name
                return (
                  <button
                    key={preset.name}
                    onClick={() => applyPreset(preset)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-all"
                    style={{
                      background: isActive ? "var(--brand-accent)10" : "var(--table-header-bg)",
                      border: `1px solid ${isActive ? "var(--brand-accent)" : "var(--card-border)"}`,
                      color: "var(--text-primary)",
                    }}
                  >
                    {/* Color swatches */}
                    <div className="flex shrink-0 gap-0.5">
                      {Object.values(preset.colors).map((c, i) => (
                        <div key={i} className="h-4 w-4 rounded-full first:rounded-l-full last:rounded-r-full" style={{ background: c, marginLeft: i > 0 ? -4 : 0, zIndex: 4 - i }} />
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
          <button
            onClick={save}
            className="w-full rounded-lg py-3 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.99]"
            style={{ background: `linear-gradient(135deg, ${colors.primaryDark} 0%, ${colors.primaryMid} 100%)` }}
          >
            Save Theme
          </button>
        </div>

        {/* ── Right: Live Preview ── */}
        <div className="lg:col-span-3">
          <div className="ds-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Live Preview</h2>
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>How the portal looks with your chosen colours</p>
              </div>
              <button onClick={() => setColors({ ...colors })} className="rounded-md p-1.5 transition-colors" style={{ color: "var(--text-muted)" }}>
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
            <MiniPreview colors={colors} />
          </div>

          {/* Current Values */}
          <div className="ds-card mt-5 p-5">
            <h2 className="mb-3 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Current Values</h2>
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
