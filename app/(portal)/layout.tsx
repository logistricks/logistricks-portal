import type { ReactNode } from "react"
import { PortalShell } from "@/components/portal/portal-shell"
import { PortalThemeProvider } from "@/components/portal/portal-theme-provider"

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <PortalThemeProvider>
      <PortalShell>{children}</PortalShell>
    </PortalThemeProvider>
  )
}
