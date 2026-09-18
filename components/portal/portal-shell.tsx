"use client"

import { useState } from "react"
import type { ReactNode } from "react"
import { PortalSidebar } from "@/components/portal/portal-sidebar"
import { PortalTabbar } from "@/components/portal/portal-tabbar"
import { PortalTopbar } from "@/components/portal/portal-topbar"

export function PortalShell({ children }: { children: ReactNode }) {
  const [pinned, setPinned] = useState(false)
  const [hovered, setHovered] = useState(false)

  const expanded = pinned || hovered

  return (
    <div className="min-h-screen bg-[#0C1424]">
      <PortalSidebar
        expanded={expanded}
        pinned={pinned}
        onPin={setPinned}
        onHover={setHovered}
      />
      <PortalTabbar />
      {/* Content shifts with sidebar — both on hover AND when pinned */}
      <div className={`overflow-x-hidden transition-[padding-left] duration-200 ${expanded ? "md:pl-60" : "md:pl-14"}`}>
        <PortalTopbar />
        <main className="px-4 pb-24 pt-6 md:px-8 md:pb-10">{children}</main>
      </div>
    </div>
  )
}
