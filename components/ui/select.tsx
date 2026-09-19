"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronDown, Check } from "lucide-react"

export interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
  className?: string
  id?: string
  name?: string
}

export function Select({
  value,
  onChange,
  options,
  placeholder = "Select…",
  disabled = false,
  className = "",
  id,
}: SelectProps) {
  const [open, setOpen]         = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef      = useRef<HTMLUListElement>(null)

  const selected = options.find((o) => o.value === value)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false)
        setActiveIdx(-1)
      }
    }
    document.addEventListener("mousedown", handle)
    return () => document.removeEventListener("mousedown", handle)
  }, [open])

  // Scroll active item into view
  useEffect(() => {
    if (open && activeIdx >= 0) {
      const el = listRef.current?.children[activeIdx] as HTMLElement | undefined
      el?.scrollIntoView({ block: "nearest" })
    }
  }, [open, activeIdx])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (disabled) return
    switch (e.key) {
      case "Enter":
      case " ":
        e.preventDefault()
        if (!open) {
          setOpen(true)
          setActiveIdx(options.findIndex((o) => o.value === value))
        } else if (activeIdx >= 0) {
          onChange(options[activeIdx].value)
          setOpen(false)
          setActiveIdx(-1)
        }
        break
      case "Escape":
        setOpen(false)
        setActiveIdx(-1)
        break
      case "ArrowDown":
        e.preventDefault()
        if (!open) { setOpen(true); setActiveIdx(0) }
        else setActiveIdx((i) => Math.min(i + 1, options.length - 1))
        break
      case "ArrowUp":
        e.preventDefault()
        setActiveIdx((i) => Math.max(i - 1, 0))
        break
    }
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
        onKeyDown={handleKeyDown}
        onClick={() => {
          if (disabled) return
          const next = !open
          setOpen(next)
          if (next) setActiveIdx(options.findIndex((o) => o.value === value))
        }}
        className={[
          "flex w-full items-center justify-between gap-2 rounded border px-3 py-2 text-sm font-medium transition-colors",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316]/50",
          disabled
            ? "cursor-not-allowed opacity-50 border-[#E2E8F0] bg-[#F8FAFC] text-[#94A3B8] dark:border-[#1E3A5F] dark:bg-[#0A1628] dark:text-[#475569]"
            : open
              ? "border-[#F97316] bg-white text-[#0D1B2A] dark:bg-[#0D1B2A] dark:text-[#E2E8F0]"
              : "border-[#E2E8F0] bg-white text-[#0D1B2A] hover:border-[#F97316]/40 dark:border-[#1E3A5F] dark:bg-[#0D1B2A] dark:text-[#E2E8F0] dark:hover:border-[#F97316]/30",
        ].join(" ")}
      >
        <span className={!selected ? "text-[#94A3B8] dark:text-[#475569]" : ""}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[#94A3B8] transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <ul
          ref={listRef}
          role="listbox"
          className="absolute left-0 top-full z-50 mt-1 max-h-56 w-full overflow-y-auto rounded border border-[#E2E8F0] bg-white shadow-xl dark:border-[#1E3A5F] dark:bg-[#0D1B2A]"
          style={{ animation: "sel-in 0.12s ease-out" }}
        >
          {options.length === 0 ? (
            <li className="px-3 py-2 text-sm text-[#94A3B8]">No options</li>
          ) : (
            options.map((opt, idx) => {
              const isSel    = opt.value === value
              const isActive = idx === activeIdx
              return (
                <li
                  key={opt.value}
                  role="option"
                  aria-selected={isSel}
                  onMouseEnter={() => setActiveIdx(idx)}
                  onClick={() => {
                    onChange(opt.value)
                    setOpen(false)
                    setActiveIdx(-1)
                  }}
                  className={[
                    "flex cursor-pointer items-center justify-between px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-[#FFF7ED] text-[#EA580C] dark:bg-[#F97316]/10 dark:text-[#F97316]"
                      : isSel
                        ? "bg-[#FFF7ED]/50 text-[#EA580C] dark:bg-[#F97316]/5 dark:text-[#FDBA74]"
                        : "text-[#0D1B2A] hover:bg-[#F8FAFC] dark:text-[#E2E8F0] dark:hover:bg-[#1E3A5F]",
                  ].join(" ")}
                >
                  <span>{opt.label}</span>
                  {isSel && <Check className="h-3.5 w-3.5 shrink-0 text-[#F97316]" />}
                </li>
              )
            })
          )}
        </ul>
      )}
      <style>{`
        @keyframes sel-in {
          from { opacity: 0; transform: translateY(-4px) scaleY(0.96); }
          to   { opacity: 1; transform: none; }
        }
      `}</style>
    </div>
  )
}
