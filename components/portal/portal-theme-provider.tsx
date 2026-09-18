"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

type Theme = "dark" | "light"

interface PortalThemeCtx {
  theme: Theme
  toggle: () => void
}

const PortalThemeContext = createContext<PortalThemeCtx>({
  theme: "dark",
  toggle: () => {},
})

export function usePortalTheme() {
  return useContext(PortalThemeContext)
}

export function PortalThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark")

  useEffect(() => {
    const saved = localStorage.getItem("portal-theme")
    // Default to dark; only go light if user explicitly saved "light"
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
      <div className={theme}>{children}</div>
    </PortalThemeContext.Provider>
  )
}
