import { Mail, MessageCircle, Mic } from "lucide-react"
import type { Confidence, Mode, RequestStatus, Source } from "@/lib/portal-data"

export function SourceBadge({ source }: { source: Source }) {
  const config: Record<Source, { bg: string; text: string; icon: typeof Mail }> = {
    Email: { bg: "bg-blue-50", text: "text-blue-700", icon: Mail },
    WhatsApp: { bg: "bg-green-50", text: "text-green-700", icon: MessageCircle },
    "Voice Note": { bg: "bg-purple-50", text: "text-purple-700", icon: Mic },
  }
  const { bg, text, icon: Icon } = config[source]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${bg} ${text}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {source}
    </span>
  )
}

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const config: Record<Confidence, string> = {
    High: "bg-emerald-50 text-emerald-700",
    Medium: "bg-amber-50 text-amber-700",
    Low: "bg-red-50 text-red-700",
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${config[confidence]}`}>
      {confidence}
    </span>
  )
}

export function StatusBadge({ status }: { status: RequestStatus }) {
  const config: Record<RequestStatus, string> = {
    Pending: "bg-orange-50 text-orange-700",
    "Sent to Carrier": "bg-blue-50 text-blue-700",
    Quoted: "bg-emerald-50 text-emerald-700",
    Closed: "bg-slate-100 text-slate-600",
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${config[status]}`}>
      {status}
    </span>
  )
}

export function ModeBadge({ mode }: { mode: Mode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-[#0D1B2A] px-2 py-0.5 text-[11px] font-medium text-white">
      {mode}
    </span>
  )
}

export function UrgencyBadge({ urgency }: { urgency: "Standard" | "Urgent" }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
        urgency === "Urgent" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"
      }`}
    >
      {urgency}
    </span>
  )
}
