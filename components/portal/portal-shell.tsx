"use client"

import { useEffect, useState, type ReactNode } from "react"
import { PortalSidebar } from "@/components/portal/portal-sidebar"
import { PortalTabbar } from "@/components/portal/portal-tabbar"
import { PortalTopbar } from "@/components/portal/portal-topbar"
import { PortalThemeContext } from "@/components/portal/portal-theme-provider"

export function PortalShell({ children }: { children: ReactNode }) {
  const [pinned, setPinned] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [theme, setTheme] = useState<"dark" | "light">("dark")

  const expanded = pinned || hovered

  useEffect(() => {
    const saved = localStorage.getItem("portal-theme")
    if (saved === "light") setTheme("light")
  }, [])

  function toggle() {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark"
      localStorage.setItem("portal-theme", next)
      return next
    })
  }

  return (
    <PortalThemeContext.Provider value={{ theme, toggle }}>
      <div className={`min-h-screen bg-[#0C1424] ${theme}`}>
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
    </PortalThemeContext.Provider>
  )
}
