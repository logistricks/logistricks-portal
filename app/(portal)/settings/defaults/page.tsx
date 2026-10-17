"use client"

import { useEffect, useState } from "react"
import { Anchor, Loader2, Plane } from "lucide-react"
import { PageHero } from "@/components/portal/page-hero"
import { useToast } from "@/components/ui/toast"
import { ALL_COUNTRIES, countryName, toCountryCode } from "@/lib/countries"
import { AIRPORTS, OTHER_PLACE, PORTS } from "@/lib/world-places"

type Place = { name: string; country: string }
type Val = { port: Place; airport: Place }

export default function DefaultLocationsPage() {
  const { error: toastError } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [canEdit, setCanEdit] = useState(false)
  const [v, setV] = useState<Val>({ port: { name: "", country: "" }, airport: { name: "", country: "" } })

  useEffect(() => {
    fetch("/api/default-locations", { cache: "no-store" }).then((r) => r.json()).then((j) => {
      if (j.error) throw new Error(j.error)
      setV(j.value); setCanEdit(!!j.canEdit)
    }).catch((e) => toastError("Could not load the defaults", e.message)).finally(() => setLoading(false))
  }, [toastError])

  async function save() {
    setSaving(true)
    try {
      const r = await fetch("/api/default-locations", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(v) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { toastError("Could not save", j.error); return }
      setV(j.value)
    } finally { setSaving(false) }
  }

  const inp = "w-full rounded-xl border px-3 py-2 text-center text-[14px] font-semibold disabled:opacity-60"
  const istyle = { borderColor: "var(--card-border)", background: "var(--card-bg)", color: "var(--text-primary)" } as const
  const card = "ds-card mx-auto w-full max-w-[760px] p-7"

  const countries = [...ALL_COUNTRIES].sort((a, b) => a.name.localeCompare(b.name))
  const [otherOn, setOtherOn] = useState<{ port: boolean; airport: boolean }>({ port: false, airport: false })
  const sel = { ...istyle, height: 42 } as const

  const block = (key: "port" | "airport", title: string, hint: string, ph: string, Icon: typeof Anchor) => {
    const code = toCountryCode(v[key].country) ?? ""
    const list = (key === "port" ? PORTS : AIRPORTS)[code] ?? []
    const inList = list.includes(v[key].name)
    const other = otherOn[key] || (!!v[key].name && !inList) || (!!code && list.length === 0)
    const set = (patch: Partial<Place>) => setV({ ...v, [key]: { ...v[key], ...patch } })
    return (
      <div className={card}>
        <div className="flex flex-col items-center text-center">
          <Icon className="h-6 w-6" style={{ color: "var(--brand-accent)" }} />
          <h2 className="mt-1 font-display text-[22px] font-extrabold" style={{ color: "var(--text-primary)" }}>{title}</h2>
          <p className="mt-1 max-w-[520px] text-[13.5px]" style={{ color: "var(--text-secondary)" }}>{hint}</p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-center">
            <span className="text-[12.5px] font-semibold" style={{ color: "var(--text-muted)" }}>Country</span>
            <select disabled={!canEdit} value={code} className={`${inp} ds-select`} style={sel}
              onChange={(e) => { setOtherOn({ ...otherOn, [key]: false }); set({ country: e.target.value ? countryName(e.target.value) : "", name: "" }) }}>
              <option value="">{v[key].country && !code ? v[key].country : "None (turned off)"}</option>
              {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </label>
          <label className="block text-center">
            <span className="text-[12.5px] font-semibold" style={{ color: "var(--text-muted)" }}>{key === "port" ? "Port" : "Airport"}</span>
            <select disabled={!canEdit || !code} value={other ? OTHER_PLACE : v[key].name} className={`${inp} ds-select`} style={sel}
              onChange={(e) => {
                if (e.target.value === OTHER_PLACE) { setOtherOn({ ...otherOn, [key]: true }); set({ name: "" }) }
                else { setOtherOn({ ...otherOn, [key]: false }); set({ name: e.target.value }) }
              }}>
              <option value="">{code ? "Choose…" : "Choose a country first"}</option>
              {list.map((n) => <option key={n} value={n}>{n}</option>)}
              {code && <option value={OTHER_PLACE}>Other (type it)…</option>}
            </select>
          </label>
        </div>
        {other && code && (
          <input disabled={!canEdit} value={v[key].name} placeholder={ph} className={`${inp} mt-3`} style={istyle} onChange={(e) => set({ name: e.target.value })} />
        )}
      </div>
    )
  }

  return (
    <div className="portal-page space-y-5 p-6">
      <PageHero eyebrow="Admin" title="Default Locations" chips={<span className="text-[14px] text-white/80">Where an export starts when the requester doesn&apos;t say</span>} />
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--text-muted)" }} /></div>
      ) : (
        <>
          {!canEdit && <p className="text-center text-[13px]" style={{ color: "var(--text-muted)" }}>Only admins can change these settings.</p>}
          {block("port", "Default port", "Used for sea requests that ask for an export but don't say where from. Leave empty to turn it off.", "e.g. Aqaba (JOAQJ)", Anchor)}
          {block("airport", "Default airport", "Used for air requests that ask for an export but don't say where from. Leave empty to turn it off.", "e.g. Amman (AMM)", Plane)}
          {canEdit && (
            <div className="flex justify-center">
              <button onClick={() => void save()} disabled={saving} className="inline-flex items-center gap-2 rounded-full px-7 py-2.5 text-[14px] font-bold text-white transition-colors hover:brightness-95 disabled:opacity-60" style={{ background: "var(--brand-accent)" }}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}Save
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
