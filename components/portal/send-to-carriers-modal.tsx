"use client"

import { useEffect, useState } from "react"
import { Loader2, Send, X } from "lucide-react"
import type { Carrier, CarrierRow } from "@/lib/portal-data"

function groupCarrierRows(rows: CarrierRow[]): Carrier[] {
  const map = new Map<number, Carrier>()
  for (const row of rows) {
    if (!row.is_cc) {
      map.set(row.carrier_id, {
        row_id: row.id,
        carrier_id: row.carrier_id,
        carrier_name: row.carrier_name,
        person_name: row.person_name,
        role: row.role,
        email: row.email,
        number: row.number,
        is_sea: row.is_sea,
        is_air: row.is_air,
        is_land: row.is_land,
        lang: row.lang,
        routes: row.routes,
        active: row.active,
        cc_emails: [],
      })
    }
  }
  for (const row of rows) {
    if (row.is_cc && row.email) {
      const c = map.get(row.carrier_id)
      if (c) c.cc_emails.push(row.email)
    }
  }
  return Array.from(map.values())
}

interface Props {
  freightRequestId: string
  modes: string[]
  onClose: () => void
  onSent: () => void
}

export function SendToCarriersModal({ freightRequestId, modes, onClose, onSent }: Props) {
  const [carriers, setCarriers]     = useState<Carrier[]>([])
  const [selected, setSelected]     = useState<Set<number>>(new Set())
  const [sending, setSending]       = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [loadingCarriers, setLoadingCarriers] = useState(true)

  useEffect(() => {
    fetch("/api/carriers")
      .then((r) => r.ok ? r.json() : [])
      .then((rows: CarrierRow[]) => {
        const all = groupCarrierRows(rows)
        const filtered = all.filter((c) => {
          if (!c.email || !c.active) return false
          return (
            (modes.includes("Sea")  && c.is_sea) ||
            (modes.includes("Air")  && c.is_air) ||
            (modes.includes("Land") && c.is_land)
          )
        })
        setCarriers(filtered)
        setLoadingCarriers(false)
      })
      .catch(() => setLoadingCarriers(false))
  }, [modes])

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleSend() {
    if (selected.size === 0) return
    setSending(true)
    setError(null)
    try {
      const webhookUrl = process.env.NEXT_PUBLIC_N8N_RFQ_WEBHOOK_URL
      if (!webhookUrl) throw new Error("n8n webhook URL not configured (NEXT_PUBLIC_N8N_RFQ_WEBHOOK_URL)")
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          freight_request_id: freightRequestId,
          carrier_ids: Array.from(selected),
        }),
      })
      if (!res.ok) {
        const txt = await res.text()
        throw new Error(`Webhook error ${res.status}: ${txt}`)
      }
      onSent()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send RFQ")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-md rounded-xl bg-white shadow-2xl dark:bg-[#0D1B2A]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E2E8F0] px-5 py-4 dark:border-[#1E3A5F]">
          <div>
            <h3 className="font-semibold text-[#0D1B2A] dark:text-[#E2E8F0]">Send RFQ to Carriers</h3>
            <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">Select carriers to request quotes from</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-[#64748B] transition-colors hover:bg-[#F1F5F9] hover:text-[#0D1B2A] dark:hover:bg-[#1E3A5F]">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Carrier list */}
        <div className="max-h-72 overflow-y-auto px-5 py-3">
          {loadingCarriers ? (
            <div className="flex items-center gap-2 py-4 text-sm text-[#94A3B8]">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading carriers…
            </div>
          ) : carriers.length === 0 ? (
            <p className="py-4 text-sm text-[#94A3B8]">No eligible carriers found for the selected modes.</p>
          ) : (
            <ul className="divide-y divide-[#F1F5F9] dark:divide-[#1A2A40]">
              {carriers.map((c) => {
                const checked = selected.has(c.carrier_id)
                return (
                  <li key={c.carrier_id}>
                    <label className={`flex cursor-pointer items-center gap-3 py-3 transition-colors hover:text-[#F97316] ${checked ? "text-[#F97316]" : "text-[#0F172A] dark:text-[#E2E8F0]"}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(c.carrier_id)}
                        className="h-4 w-4 accent-[#F97316]"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{c.carrier_name} <span className="font-normal text-[#64748B]">— {c.person_name}</span></p>
                        <p className="truncate text-xs text-[#94A3B8]">{c.email}</p>
                      </div>
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Error */}
        {error && (
          <p className="mx-5 mb-3 rounded bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-400">{error}</p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[#E2E8F0] px-5 py-4 dark:border-[#1E3A5F]">
          <span className="text-xs text-[#64748B]">
            {selected.size === 0 ? "No carriers selected" : `${selected.size} carrier${selected.size !== 1 ? "s" : ""} selected`}
          </span>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="rounded-md border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-[#64748B] transition-colors hover:border-[#0D1B2A] hover:text-[#0D1B2A] dark:border-[#1E3A5F] dark:hover:border-[#475569]">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={selected.size === 0 || sending}
              className="inline-flex items-center gap-2 rounded-md bg-[#F97316] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#EA580C] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send RFQ
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
