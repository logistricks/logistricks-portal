"use client"

import { Moon, Sun } from "lucide-react"
import { usePortalTheme } from "@/components/portal/portal-theme-provider"

export function ThemeToggle() {
  const { theme, toggle } = usePortalTheme()
  const dark = theme === "dark"

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="nib"
    >
      {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
    </button>
  )
}
