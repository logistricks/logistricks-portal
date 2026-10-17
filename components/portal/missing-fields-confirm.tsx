"use client"

import { AlertTriangle, Mail, MessageCircle } from "lucide-react"

export type Readiness = {
  missing: string[]
  sender_name: string
  sender_email: string
  source: string
  /** the last email we sent the sender (null = none yet), and whether they have written back since */
  asked: { at: string; kind: string; answered: boolean; answered_at: string | null } | null
}

/** Current readiness of a request; null when it cannot be read (the caller then just carries on). */
export async function fetchReadiness(requestId: string): Promise<Readiness | null> {
  try {
    const r = await fetch(`/api/requests/${requestId}/readiness`, { cache: "no-store" })
    return r.ok ? ((await r.json()) as Readiness) : null
  } catch { return null }
}

const when = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
}

/**
 * Pop-up shown before asking carriers for a price (or adding a carrier quote) while mandatory fields are missing.
 * It lists what is missing, says whether the sender was already emailed, and offers to reply to them.
 */
export function MissingFieldsConfirm({ info, action, onContinue, onCancel, onReply }: {
  info: Readiness
  /** what the person is about to do, e.g. "send this request to carriers" */
  action: string
  onContinue: () => void
  onCancel: () => void
  onReply?: () => void
}) {
  const name = info.sender_name || "the sender"
  const asked = info.asked
  const replyLabel = asked && !asked.answered ? `Send a reminder to ${name}` : asked ? `Reply to ${name} again` : `Reply to ${name}`
  const ReplyIcon = info.source === "WhatsApp" ? MessageCircle : Mail
  const btn = "inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-4 text-xs font-bold transition-colors"
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" style={{ background: "rgba(8,15,30,0.55)", backdropFilter: "blur(3px)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel() }}>
      <div role="alertdialog" aria-modal="true" aria-label="Mandatory fields are missing" className="ds-card w-full max-w-[460px] space-y-4 p-6 text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full" style={{ background: "rgb(245 158 11 / 0.14)" }}>
          <AlertTriangle className="h-5 w-5" style={{ color: "#d97706" }} />
        </div>
        <div>
          <h3 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>Mandatory fields are missing</h3>
          <p className="mt-1 text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            You are about to {action}, but this request is still missing the information below. Carriers may not be able to quote properly.
          </p>
        </div>
        <ul className="mx-auto flex flex-wrap justify-center gap-1.5">
          {info.missing.map((m) => (
            <li key={m} className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: "rgb(239 68 68 / 0.1)", color: "#dc2626" }}>{m}</li>
          ))}
        </ul>
        <div className="rounded-xl px-4 py-3 text-[13px] leading-relaxed" style={{ background: "var(--table-header-bg, var(--divider))", color: "var(--text-secondary)" }}>
          {!asked && <>You have not asked {name} for this information yet.</>}
          {asked && !asked.answered && <>You already emailed {name} on <b>{when(asked.at)}</b>{asked.kind === "missing_fields" ? " asking for this information" : ""}. They have not replied yet.</>}
          {asked && asked.answered && <>{name} replied on <b>{when(asked.answered_at ?? asked.at)}</b>, but these fields are still missing.</>}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          {onReply && (
            <button type="button" onClick={onReply} className={`${btn} text-white`} style={{ background: "var(--brand-accent)" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.filter = "brightness(0.93)" }} onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter = "" }}>
              <ReplyIcon className="h-3.5 w-3.5" /> {replyLabel}
            </button>
          )}
          <button type="button" onClick={onContinue} className={btn} style={{ border: "1px solid var(--card-border)", color: "var(--text-primary)", background: "var(--card-bg)" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.filter = "brightness(0.95)" }} onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter = "" }}>
            Continue anyway
          </button>
          <button type="button" onClick={onCancel} className={btn} style={{ color: "var(--text-muted)" }}>Go back</button>
        </div>
      </div>
    </div>
  )
}
