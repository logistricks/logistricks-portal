import { Hand, Zap } from "lucide-react"

/** How a request / quote entered the system: from a connected mailbox, or dropped in by a person. */
export function IntakeBadge({ source, light }: { source?: string | null; light?: boolean }) {
  const manual = source === "manual"
  return (
    <span
      title={manual ? "Added manually (email dropped into the portal)" : "Received automatically from a connected mailbox"}
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={manual
        ? { background: light ? "rgba(139,92,246,0.35)" : "rgba(139,92,246,0.12)", color: light ? "#e9d5ff" : "#7c3aed" }
        : { background: light ? "rgba(255,255,255,0.12)" : "var(--table-header-bg)", color: light ? "rgba(255,255,255,0.7)" : "var(--text-secondary)" }}
    >
      {manual ? <Hand className="h-3 w-3" /> : <Zap className="h-3 w-3" />}
      {manual ? "Manual" : "Automatic"}
    </span>
  )
}
