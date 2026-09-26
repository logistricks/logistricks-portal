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
    // Apply saved brand colors from Theme Settings
    try {
      const savedColors = localStorage.getItem("portal-theme-colors")
      if (savedColors) {
        const colors = JSON.parse(savedColors) as Record<string, string>
        const root = document.documentElement
        if (colors.primaryDark)  root.style.setProperty("--brand-navy",       colors.primaryDark)
        if (colors.primaryMid)   root.style.setProperty("--brand-navy-mid",   colors.primaryMid)
        if (colors.primaryLight) root.style.setProperty("--brand-navy-light", colors.primaryLight)
        if (colors.accent) {
          root.style.setProperty("--brand-accent",       colors.accent)
          root.style.setProperty("--brand-accent-hover", colors.accent)
        }
      }
    } catch { /* */ }
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
