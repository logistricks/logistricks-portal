"use client"

import { createContext, useContext, type ReactNode } from "react"

type Theme = "dark" | "light"

export interface PortalThemeCtx {
  theme: Theme
  toggle: () => void
}

export const PortalThemeContext = createContext<PortalThemeCtx>({
  theme: "dark",
  toggle: () => {},
})

export function usePortalTheme() {
  return useContext(PortalThemeContext)
}
