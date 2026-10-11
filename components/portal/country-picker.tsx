"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, ChevronRight, Search } from "lucide-react"
import { ALL_CODES, CONTINENTS } from "@/lib/countries"

/** Countries a carrier covers, grouped by continent, with Select all (world) and Select all per continent. */
export function CountryPicker({ value, onChange }: { value: string[]; onChange: (codes: string[]) => void }) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [q, setQ] = useState("")
  const sel = useMemo(() => new Set(value), [value])
  const query = q.trim().toLowerCase()

  const setMany = (codes: string[], on: boolean) => {
    const next = new Set(sel)
    for (const c of codes) on ? next.add(c) : next.delete(c)
    onChange(ALL_CODES.filter((c) => next.has(c)))
  }
  const toggleOpen = (id: string) => setOpen((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })

  return (
    <div className="rounded-md border border-[#E2E8F0] dark:border-[#1E3A5F]">
      <div className="flex flex-wrap items-center gap-3 border-b border-[#E2E8F0] px-3 py-2 dark:border-[#1E3A5F]">
        <TriCheck label="All countries" count={sel.size} total={ALL_CODES.length} onToggle={(on) => setMany(ALL_CODES, on)} bold />
        <span className="ml-auto text-xs text-[#94A3B8]">{sel.size} of {ALL_CODES.length} selected</span>
      </div>
      <div className="relative border-b border-[#E2E8F0] dark:border-[#1E3A5F]">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#94A3B8]" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search countries"
          className="h-9 w-full bg-transparent pl-9 pr-3 text-sm outline-none placeholder:text-[#94A3B8] text-[#0F172A] dark:text-[#E2E8F0]"
        />
      </div>
      <div className="max-h-64 overflow-y-auto">
        {CONTINENTS.map((ct) => {
          const list = query ? ct.countries.filter((c) => c.name.toLowerCase().includes(query) || c.code.toLowerCase() === query) : ct.countries
          if (query && list.length === 0) return null
          const codes = ct.countries.map((c) => c.code)
          const n = codes.filter((c) => sel.has(c)).length
          const expanded = !!query || open.has(ct.id)
          return (
            <div key={ct.id} className="border-b border-[#F1F5F9] last:border-b-0 dark:border-[#1A2A40]">
              <div className="flex items-center gap-2 px-3 py-2">
                <button type="button" onClick={() => toggleOpen(ct.id)} aria-label={expanded ? "Collapse" : "Expand"} className="text-[#94A3B8]">
                  {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                <TriCheck label={ct.name} count={n} total={codes.length} onToggle={(on) => setMany(codes, on)} />
                <span className="ml-auto text-xs text-[#94A3B8]">{n}/{codes.length}</span>
              </div>
              {expanded && (
                <div className="grid grid-cols-1 gap-x-4 gap-y-1 px-9 pb-3 sm:grid-cols-2">
                  {list.map((c) => (
                    <label key={c.code} className="flex cursor-pointer items-center gap-2 text-sm text-[#0F172A] dark:text-[#E2E8F0]">
                      <input type="checkbox" checked={sel.has(c.code)} onChange={(e) => setMany([c.code], e.target.checked)} className="h-4 w-4 accent-[var(--brand-accent)]" />
                      {c.name}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TriCheck({ label, count, total, onToggle, bold }: { label: string; count: number; total: number; onToggle: (on: boolean) => void; bold?: boolean }) {
  const ref = useRef<HTMLInputElement>(null)
  const all = count === total, some = count > 0 && !all
  useEffect(() => { if (ref.current) ref.current.indeterminate = some }, [some])
  return (
    <label className={`flex cursor-pointer items-center gap-2 text-sm text-[#0F172A] dark:text-[#E2E8F0] ${bold ? "font-semibold" : "font-medium"}`}>
      <input ref={ref} type="checkbox" checked={all} onChange={(e) => onToggle(e.target.checked)} className="h-4 w-4 accent-[var(--brand-accent)]" />
      {label}
    </label>
  )
}
