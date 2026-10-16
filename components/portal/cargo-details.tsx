"use client"

import { useMemo, useState } from "react"
import { AlertTriangle, Check, ChevronDown, CheckCircle2, Loader2, Lock, Pencil, Tag } from "lucide-react"
import type { FreightRequest } from "@/lib/portal-data"
import { isExw } from "@/lib/shipment-labels"
import {
  FIELD_COLUMNS, PACKAGE_TYPES, SHIPMENT_TYPES, TRUCK_TYPES, TYPE_FIELDS, TYPE_LABEL, quotableCheck,
  type FieldGroup, type FieldKey, type ShipmentType,
} from "@/lib/shipment-types"

// request column -> where the value lives on the FreightRequest the page loaded
const COL_TO_CAMEL: Record<string, keyof FreightRequest> = {
  origin_city: "originCity", origin_country: "originCountry", destination_city: "destinationCity", destination_country: "destinationCountry",
  cargo_type: "cargoType", equipment: "equipment", weight: "weight", quantity: "quantity", dimensions: "dimensions",
  incoterm: "incoterm", pickup_address: "pickupAddress", bl_type: "blType", preferred_carrier: "preferredCarrier",
  cbm: "cbm", chargeable_weight: "chargeableWeight", chargeable_weight_stated: "chargeableWeightStated",
  package_type: "packageType", truck_type: "truckType", temperature_control: "temperatureControl", cargo_ready_date: "cargoReadyDate",
}
const clean = (v: unknown) => { const s = String(v ?? "").trim(); return s === "—" || s === "-" ? "" : s }
const COLUMN_HINT: Record<string, string> = { origin_city: "City / airport / port", origin_country: "Country", destination_city: "City / airport / port", destination_country: "Country" }
const PICKLISTS: Partial<Record<FieldKey, string[]>> = { truck_type: TRUCK_TYPES, package_type: PACKAGE_TYPES }
const GROUPS: FieldGroup[] = ["Route", "Cargo", "Measurements", "Conditions"]

/** Chip that shows the type of a request and lets the user switch it (undo-able through the portal's Undo popup). */
export function ShipmentTypeChip({ requestId, type, source, locked, onChanged }: { requestId: string; type: ShipmentType | null | undefined; source?: "ai" | "manual" | null; locked?: boolean; onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function pick(t: ShipmentType) {
    setOpen(false)
    if (t === type) return
    setBusy(true); setErr(null)
    try {
      const r = await fetch(`/api/requests/${requestId}/shipment-type`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shipment_type: t }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error ?? "Could not change the type")
      onChanged()
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="relative inline-block">
      <button
        type="button" disabled={busy || locked} onClick={() => setOpen((v) => !v)}
        title={locked ? "Locked — carrier RFQ already sent" : type ? "Switch the type" : "Choose the type of this request"}
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
        style={type
          ? { background: "rgb(var(--brand-accent-rgb, 59 130 246) / 0.12)", color: "var(--brand-accent)", border: "1px solid transparent" }
          : { background: "transparent", color: "var(--text-muted)", border: "1px dashed var(--card-border)" }}
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Tag className="h-3 w-3" />}
        {type ? TYPE_LABEL[type] : "Set type"}
        {type && source && <span className="font-medium opacity-70">· {source === "manual" ? "set by you" : "AI"}</span>}
        {!locked && <ChevronDown className="h-3 w-3" />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <ul className="absolute left-0 z-20 mt-1 w-36 overflow-hidden rounded-lg py-1 shadow-xl" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
            {SHIPMENT_TYPES.map((t) => (
              <li key={t}>
                <button type="button" onClick={() => pick(t)} className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs font-semibold" style={{ color: "var(--text-primary)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-bg)")} onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                  {TYPE_LABEL[t]} {t === type && <Check className="h-3 w-3" />}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {err && <p className="absolute left-0 top-full z-20 mt-1 w-60 rounded-md px-2 py-1 text-[11px]" style={{ background: "rgb(239 68 68 / 0.1)", color: "#ef4444" }}>{err}</p>}
    </div>
  )
}

type RowSpec = { key: string; label: string; columns: string[]; required: boolean; hint?: string; list?: string[]; calculated?: boolean; fieldKey?: FieldKey }

function Row({ requestId, spec, vals, lockReason, onSaved }: { requestId: string; spec: RowSpec; vals: Record<string, string>; lockReason: string | null; onSaved: (v: Record<string, string>) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const shown = spec.columns.map((c) => vals[c]).filter(Boolean).join(", ")
  const stated = spec.key === "chargeable_weight" ? vals.chargeable_weight_stated : ""
  const differs = !!stated && !!shown && clean(stated).replace(/\D+/g, "") !== clean(shown).replace(/\D+/g, "")

  function start() { setDraft(Object.fromEntries(spec.columns.map((c) => [c, vals[c] ?? ""]))); setEditing(true) }
  async function save() {
    setSaving(true)
    try {
      const r = await fetch("/api/requests", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: requestId, fields: draft }) })
      if (!r.ok) throw new Error("Save failed")
      onSaved(Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, v.trim()])))
      setEditing(false)
    } catch { /* stay open so the user can retry */ } finally { setSaving(false) }
  }

  return (
    <div className="flex items-start gap-3 py-2.5" style={{ borderBottom: "1px solid var(--divider)" }}>
      <span className="shrink-0 pt-0.5 text-[13.5px] font-medium" style={{ color: "var(--text-muted)", minWidth: 140 }}>
        {spec.label}{spec.required && <span style={{ color: "#ef4444" }}> *</span>}
      </span>
      {editing ? (
        <div className="flex flex-1 items-center gap-1.5">
          <div className="flex flex-1 flex-wrap gap-1.5">
            {spec.columns.map((c, i) => (
              <input
                key={c} autoFocus={i === 0} value={draft[c] ?? ""} list={spec.list ? `pick-${spec.key}` : undefined}
                placeholder={COLUMN_HINT[c] ?? (spec.list ? "Pick or type your own" : "")}
                onChange={(e) => setDraft((p) => ({ ...p, [c]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false) }}
                className="min-w-[8rem] flex-1 rounded border px-2 py-1 text-sm"
                style={{ borderColor: "var(--brand-accent)", background: "var(--card-bg)", color: "var(--text-primary)", outline: "none" }}
              />
            ))}
            {spec.list && <datalist id={`pick-${spec.key}`}>{spec.list.map((o) => <option key={o} value={o} />)}</datalist>}
          </div>
          <button onClick={save} disabled={saving} className="flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-white disabled:opacity-50" style={{ background: "var(--brand-accent)" }}>
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          </button>
          <button onClick={() => setEditing(false)} className="rounded px-2 py-1 text-xs" style={{ color: "var(--text-muted)" }}>✕</button>
        </div>
      ) : (
        <div className="flex flex-1 items-start justify-end gap-1.5">
          <div className="text-right">
            <span className="whitespace-pre-line text-[15.5px] font-semibold" style={{ color: shown ? "var(--text-primary)" : spec.required ? "#ef4444" : "var(--text-muted)" }}>
              {shown || (spec.required ? "— Missing" : spec.hint ?? "—")}
            </span>
            {stated && (
              <p className="text-[11px] font-medium" style={{ color: differs ? "#d97706" : "var(--text-muted)" }}>
                Requester mentioned: {stated}{differs ? " — differs, please check" : ""}
              </p>
            )}
          </div>
          {lockReason ? (
            <span title={lockReason} className="cursor-not-allowed opacity-40"><Lock className="h-3.5 w-3.5" style={{ color: "var(--text-muted)" }} /></span>
          ) : (
            <button onClick={start} title="Edit field" className="rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100" style={{ color: "var(--text-muted)" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--brand-accent)" }} onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-muted)" }}>
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** Cargo Details for a typed request: fields grouped Route / Cargo / Measurements / Conditions, labelled for the type. */
export function TypedCargoDetails({ request, type, lockReason, lockBadge, banner, onChanged, onFieldSaved }: { request: FreightRequest; type: ShipmentType; lockReason: string | null; lockBadge?: React.ReactNode; banner?: React.ReactNode; onChanged: () => void; onFieldSaved?: () => void }) {
  const initial = useMemo(() => {
    const out: Record<string, string> = {}
    for (const [col, camel] of Object.entries(COL_TO_CAMEL)) out[col] = clean(request[camel])
    return out
  }, [request])
  const [edits, setEdits] = useState<Record<string, string>>({})
  const vals = { ...initial, ...edits }

  const exw = isExw(vals.incoterm)
  const check = quotableCheck(type, vals)

  const rows: Record<FieldGroup, RowSpec[]> = { Route: [], Cargo: [], Measurements: [], Conditions: [] }
  for (const f of TYPE_FIELDS[type]) {
    const isReq = f.required === true || (f.required === "exw" && exw) || (f.required === "dims_or_cbm" && check.missingKeys.includes("dimensions"))
    rows[f.group].push({
      key: f.key, fieldKey: f.key, label: f.label, columns: FIELD_COLUMNS[f.key], required: isReq,
      list: PICKLISTS[f.key], calculated: f.calculated,
      hint: f.key === "pickup_address" ? "— only needed for EXW" : f.key === "chargeable_weight" ? "— calculated from dimensions" : f.key === "dimensions" || f.key === "cbm" ? (f.required === "dims_or_cbm" ? "— or give the other" : "—") : "—",
    })
  }
  if (type === "sea_fcl" || type === "sea_lcl") rows.Conditions.push({ key: "bl_type", label: "BL type", columns: ["bl_type"], required: false, hint: "—" })
  rows.Conditions.push({ key: "preferred_carrier", label: "Preferred carrier", columns: ["preferred_carrier"], required: false, hint: "— none specified" })

  return (
    <div className="ds-card">
      <div className="ds-card-header">
        <div className="flex items-center gap-3">
          <h3 className="font-display text-[20px] font-extrabold" style={{ color: "var(--text-primary)" }}>Cargo Details</h3>
          <ShipmentTypeChip requestId={request.id} type={type} source={request.typeSource} locked={!!lockReason && lockReason.startsWith("Locked")} onChanged={onChanged} />
        </div>
        <div className="flex items-center gap-2">
          {check.ready ? (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: "rgba(16,185,129,0.12)", color: "#059669" }}><CheckCircle2 className="h-3 w-3" /> Ready to quote</span>
          ) : (
            <span title={check.missing.join(", ")} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}><AlertTriangle className="h-3 w-3" /> {check.missing.length} missing</span>
          )}
          {lockBadge}
        </div>
      </div>
      {banner}
      <div className="group px-5 pb-4">
        {GROUPS.map((g) => rows[g].length > 0 && (
          <div key={g} className="pt-3">
            <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{g}</p>
            {rows[g].map((spec) => (
              <Row key={spec.key} requestId={request.id} spec={spec} vals={vals} lockReason={lockReason}
                onSaved={(v) => { setEdits((p) => ({ ...p, ...v })); onFieldSaved?.() }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
