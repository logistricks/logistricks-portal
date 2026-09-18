"use client"

import { Moon, Sun } from "lucide-react"
import { useEffect, useState } from "react"

export function ThemeToggle() {
  const [dark, setDark] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const saved = localStorage.getItem("portal-theme")
    // Portal defaults to dark; only go light if user explicitly chose light
    const isDark = saved !== "light"
    apply(isDark)
    setDark(isDark)
  }, [])

  function apply(isDark: boolean) {
    const html = document.documentElement
    if (isDark) {
      html.classList.add("dark")
      html.classList.remove("light")
    } else {
      html.classList.add("light")
      html.classList.remove("dark")
    }
  }

  function toggle() {
    const next = !dark
    setDark(next)
    apply(next)
    localStorage.setItem("portal-theme", next ? "dark" : "light")
  }

  if (!mounted) return null

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="relative flex h-9 w-9 items-center justify-center rounded text-[#64748B] transition-colors hover:bg-[#F0F4F8] hover:text-[#0F172A] dark:text-[#94A3B8] dark:hover:bg-[#1E3A5F] dark:hover:text-white"
    >
      {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
    </button>
  )
}
