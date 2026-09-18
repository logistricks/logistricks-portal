import type { ReactNode } from "react"
import { PortalShell } from "@/components/portal/portal-shell"

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="dark">
      <PortalShell>{children}</PortalShell>
    </div>
  )
}
