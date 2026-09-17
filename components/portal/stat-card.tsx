import type { LucideIcon } from "lucide-react"

export function StatCard({
  label,
  value,
  sub,
  subClass = "text-[#64748B] dark:text-[#94A3B8]",
  valueClass = "text-[#0D1B2A] dark:text-[#E2E8F0]",
  icon: Icon,
  iconClass,
  glowColor = "rgba(249,115,22,0.18)",
}: {
  label: string
  value: string | number
  sub: string
  subClass?: string
  valueClass?: string
  icon: LucideIcon
  iconClass: string
  glowColor?: string
}) {
  return (
    <div
      className="relative overflow-hidden rounded border border-[#E2E8F0] bg-white p-6 dark:border-[#1E3A5F] dark:bg-[#111E33]"
      style={{
        boxShadow: `0 0 0 1px rgba(0,0,0,0.04), 0 2px 8px rgba(0,0,0,0.06), 0 0 24px ${glowColor}, inset 0 0 24px ${glowColor.replace("0.18", "0.07")}`,
        transition: "box-shadow 0.2s ease",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 0 1px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.1), 0 0 40px ${glowColor.replace("0.18", "0.28")}, inset 0 0 32px ${glowColor.replace("0.18", "0.12")}`
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 0 1px rgba(0,0,0,0.04), 0 2px 8px rgba(0,0,0,0.06), 0 0 24px ${glowColor}, inset 0 0 24px ${glowColor.replace("0.18", "0.07")}`
      }}
    >
      {/* Accent bar */}
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: glowColor.includes("249,115,22") ? "#F97316" : glowColor.includes("59,130,246") ? "#3b82f6" : glowColor.includes("34,197,94") ? "#22c55e" : "#F97316" }} />
      <div className="flex items-start justify-between">
        <p className="text-[10px] font-bold tracking-[0.12em] uppercase text-[#64748B] dark:text-[#94A3B8]">{label}</p>
        <div className="flex h-9 w-9 items-center justify-center rounded" style={{ background: glowColor.replace("0.18", "0.12") }}>
          <Icon className={`h-5 w-5 ${iconClass}`} aria-hidden="true" />
        </div>
      </div>
      <p className={`mt-4 font-display text-5xl font-extrabold tabular-nums leading-none tracking-tight ${valueClass}`}
         style={{ fontFamily: "var(--font-jakarta), var(--font-inter), system-ui, sans-serif" }}>
        {value}
      </p>
      <p className={`mt-2 text-xs ${subClass}`}>{sub}</p>
    </div>
  )
}
