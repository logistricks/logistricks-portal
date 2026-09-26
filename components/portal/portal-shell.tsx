"use client"

import { useEffect, useState, type ReactNode } from "react"
import { PortalSidebar } from "@/components/portal/portal-sidebar"
import { PortalTabbar } from "@/components/portal/portal-tabbar"
import { PortalTopbar } from "@/components/portal/portal-topbar"
import { PortalThemeContext } from "@/components/portal/portal-theme-provider"
import { ToastProvider } from "@/components/ui/toast"

export function PortalShell({ children }: { children: ReactNode }) {
  const [pinned, setPinned]   = useState(false)
  const [hovered, setHovered] = useState(false)
  const [theme, setTheme]     = useState<"dark" | "light">("dark")

  const expanded = pinned || hovered

  useEffect(() => {
    try {
      const saved = localStorage.getItem("portal-theme")
      if (saved === "light") setTheme("light")
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
        <div className={`min-h-screen ${theme === "dark" ? "bg-[#0C1424]" : "bg-[#F0F4F8]"} ${theme}`}>
          <PortalSidebar
            expanded={expanded}
            pinned={pinned}
            onPin={setPinned}
            onHover={setHovered}
          />
          <PortalTabbar />
          <div className={`overflow-x-hidden transition-[padding-left] duration-200 ${expanded ? "md:pl-60" : "md:pl-14"}`}>
            <PortalTopbar />
            <main className="px-4 pb-24 pt-6 md:px-8 md:pb-10">{children}</main>
          </div>
        </div>
      </ToastProvider>
    </PortalThemeContext.Provider>
  )
}
