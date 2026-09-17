import type { ReactNode } from "react"
import { PortalSidebar } from "@/components/portal/portal-sidebar"
import { PortalTabbar } from "@/components/portal/portal-tabbar"
import { PortalTopbar } from "@/components/portal/portal-topbar"

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F0F4F8]">
      <PortalSidebar />
      <PortalTabbar />
      <div className="md:pl-60">
        <PortalTopbar />
        <main className="px-4 pb-24 pt-6 md:px-8 md:pb-10">{children}</main>
      </div>
    </div>
  )
}
