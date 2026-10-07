"use client"

import { useEffect, useState, type ReactNode } from "react"
import { PortalTabbar } from "@/components/portal/portal-tabbar"
import { PortalTopbar } from "@/components/portal/portal-topbar"
import { PortalThemeContext } from "@/components/portal/portal-theme-provider"
import { ToastProvider } from "@/components/ui/toast"

export function PortalShell({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<"dark" | "light">("light")

  useEffect(() => {
    try {
      const saved = localStorage.getItem("portal-theme")
      if (saved === "dark") setTheme("dark")
    } catch { /* */ }
    // Apply brand colors: DB first (so all browsers/devices get client's theme), localStorage as instant fallback
    function applyColors(colors: Record<string, string>) {
      const root = document.documentElement
      if (colors.primaryDark)  root.style.setProperty("--brand-navy",        colors.primaryDark)
      if (colors.primaryMid)   root.style.setProperty("--brand-navy-mid",    colors.primaryMid)
      if (colors.primaryLight) root.style.setProperty("--brand-navy-light",  colors.primaryLight)
      if (colors.accent) {
        root.style.setProperty("--brand-accent",       colors.accent)
        const m = /^#?([0-9a-f]{6})$/i.exec(colors.accent.trim())
        if (m) { const v = parseInt(m[1], 16); root.style.setProperty("--brand-accent-rgb", `${(v >> 16) & 255} ${(v >> 8) & 255} ${v & 255}`) }
        const hex = colors.accent.replace("#","")
        const n = parseInt(hex,16)
        const r=Math.min(255,Math.round(((n>>16)&255)*0.9)), g=Math.min(255,Math.round(((n>>8)&255)*0.9)), b=Math.min(255,Math.round((n&255)*0.9))
        root.style.setProperty("--brand-accent-hover", `#${r.toString(16).padStart(2,"0")}${g.toString(16).padStart(2,"0")}${b.toString(16).padStart(2,"0")}`)
      }
    }
    // Instant paint from localStorage while DB loads
    try {
      const savedColors = localStorage.getItem("portal-theme-colors")
      if (savedColors) applyColors(JSON.parse(savedColors) as Record<string, string>)
    } catch { /* */ }
    // Then override with DB value if available
    fetch("/api/client-settings?key=theme")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.value?.primaryDark) {
          applyColors(data.value as Record<string, string>)
          try { localStorage.setItem("portal-theme-colors", JSON.stringify(data.value)) } catch {}
        }
      })
      .catch(() => { /* keep localStorage values */ })
  }, [])

  function toggle() {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark"
      try { localStorage.setItem("portal-theme", next) } catch { /* */ }
      return next
    })
  }

  return (
    <PortalThemeContext.Provider value={{ theme, toggle }}>
      <ToastProvider>
        <div className={`min-h-screen ${theme === "dark" ? "bg-[#0C1424]" : "bg-[#f0f2f5]"} ${theme}`}>
          <PortalTopbar />
          <PortalTabbar />
          <main className="px-4 pb-24 pt-6 md:px-8 md:pb-10">{children}</main>
        </div>
      </ToastProvider>
    </PortalThemeContext.Provider>
  )
}
