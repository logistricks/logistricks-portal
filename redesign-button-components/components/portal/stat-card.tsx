import type { LucideIcon } from "lucide-react"

export function StatCard({
  label,
  value,
  sub,
  subClass = "text-[#64748B]",
  valueClass = "text-[#0D1B2A]",
  icon: Icon,
  iconClass,
}: {
  label: string
  value: string | number
  sub: string
  subClass?: string
  valueClass?: string
  icon: LucideIcon
  iconClass: string
}) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-[#E2E8F0] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.08)] transition-shadow duration-150 hover:shadow-md">
      <span className="absolute inset-y-0 left-0 w-1 bg-[#F97316]" />
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold tracking-widest text-[#64748B]">{label}</p>
        <Icon className={`h-5 w-5 ${iconClass}`} aria-hidden="true" />
      </div>
      <p className={`mt-3 text-4xl font-black tabular-nums ${valueClass}`}>{value}</p>
      <p className={`mt-1 text-xs ${subClass}`}>{sub}</p>
    </div>
  )
}
