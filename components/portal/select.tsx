"use client"

import { useEffect, useRef, useState } from "react"
import { Check, ChevronDown } from "lucide-react"

export interface SelectOption<T extends string = string> {
  value: T
  label: string
}

interface SelectProps<T extends string = string> {
  value: T
  onChange: (v: T) => void
  options: SelectOption<T>[]
  className?: string
  placeholder?: string
}

export function Select<T extends string = string>({
  value,
  onChange,
  options,
  className = "",
  placeholder,
}: SelectProps<T>) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [])

  const selected = options.find((o) => o.value === value)

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 items-center gap-2 rounded border border-[#D1D9E0] bg-white pl-3 pr-2.5 text-sm text-[#0F172A] outline-none transition-colors hover:border-[var(--brand-accent)]/60 focus:border-[var(--brand-accent)] focus:shadow-[0_0_0_3px_rgb(var(--brand-accent-rgb) / 0.12)] dark:border-[#1E3A5F] dark:bg-[#111E33] dark:text-[#E2E8F0] dark:hover:border-[var(--brand-accent)]/60"
      >
        <span className="min-w-0 flex-1 whitespace-nowrap">
          {selected ? selected.label : (placeholder ?? "Select…")}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[#94A3B8] transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-full overflow-hidden rounded-md border border-[#E2E8F0] bg-white shadow-lg dark:border-[#1E3A5F] dark:bg-[#111E33]">
          {options.map((opt) => {
            const active = opt.value === value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false) }}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors ${
                  active
                    ? "bg-[color-mix(in_srgb,var(--brand-accent)_10%,white)] text-[var(--brand-accent)] dark:bg-[var(--brand-accent)]/10 dark:text-[var(--brand-accent)]"
                    : "text-[#0F172A] hover:bg-[#F8FAFC] dark:text-[#E2E8F0] dark:hover:bg-[#1E3A5F]/40"
                }`}
              >
                <span>{opt.label}</span>
                {active && <Check className="h-3.5 w-3.5 shrink-0" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
