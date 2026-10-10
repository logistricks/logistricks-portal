"use client"

import { useState } from "react"
import { AlertTriangle, BarChart3, ChevronRight, Clock, DollarSign, Filter, List, Mail, Route, Scale, Truck, Users } from "lucide-react"
import { REPORTS, type ReportDef } from "@/lib/reports/catalog"
import { ReportModal } from "@/components/portal/report-modal"

const ICONS: Record<ReportDef["icon"], React.ElementType> = {
  list: List, funnel: Filter, scale: Scale, truck: Truck, dollar: DollarSign, route: Route, users: Users, clock: Clock, mail: Mail, alert: AlertTriangle, chart: BarChart3,
}
const CATEGORIES: ReportDef["category"][] = ["Operations", "Sales", "Carriers", "Service"]

export default function ReportsPage() {
  const [open, setOpen] = useState<ReportDef | null>(null)
  return (
    <div className="portal-page space-y-6 p-6">
      <div className="page-band">
        <h2 className="text-[28px] font-extrabold leading-tight" style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}>Reports</h2>
      </div>

      {CATEGORIES.map((cat) => {
        const list = REPORTS.filter((r) => r.category === cat)
        if (!list.length) return null
        return (
          <section key={cat}>
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{cat}</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((r) => {
                const Icon = ICONS[r.icon]
                return (
                  <button key={r.id} type="button" onClick={() => setOpen(r)} className="ds-card group flex flex-col gap-3 p-5 text-left">
                    <div className="flex items-start justify-between">
                      <div className="flex h-10 w-10 items-center justify-center rounded-[10px]" style={{ background: "var(--brand-accent-ring, rgb(var(--brand-accent-rgb) / .14))" }}>
                        <Icon className="h-5 w-5" style={{ color: "var(--brand-accent)" }} />
                      </div>
                      {r.snapshot && <span className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold" style={{ background: "var(--table-header-bg)", color: "var(--text-muted)" }}>Live snapshot</span>}
                    </div>
                    <div>
                      <p className="text-[14.5px] font-semibold" style={{ color: "var(--text-primary)" }}>{r.title}</p>
                      <p className="mt-1 text-[12.5px] leading-[1.5]" style={{ color: "var(--text-secondary)" }}>{r.description}</p>
                    </div>
                    <span className="mt-auto flex items-center gap-1 text-[12px] font-semibold" style={{ color: "var(--brand-accent)" }}>
                      Open report <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
      {open && <ReportModal report={open} onClose={() => setOpen(null)} />}
    </div>
  )
}
