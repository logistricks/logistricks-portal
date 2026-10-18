"use client"

import { Seg } from "@/components/portal/seg"
import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, Check, ChevronDown, CheckCircle2, Loader2, Lock, Pencil, Plus, Tag } from "lucide-react"
import type { FreightRequest } from "@/lib/portal-data"
import { isExw } from "@/lib/shipment-labels"
import { calculatedCbm, chargeableWeight } from "@/lib/shipment-calc"
import {
  FIELD_COLUMNS, PACKAGE_TYPES, SHIPMENT_TYPES, TRUCK_TYPES, TYPE_FIELDS, TYPE_LABEL, criticalFor, quotableCheck,
  type CriticalConfig, type FieldGroup, type FieldKey, type ShipmentType,
} from "@/lib/shipment-types"

// request column -> where the value lives on the FreightRequest the page loaded
const COL_TO_CAMEL: Record<string, keyof FreightRequest> = {
  origin_city: "originCity", origin_country: "originCountry", destination_city: "destinationCity", destination_country: "destinationCountry",
  cargo_type: "cargoType", equipment: "equipment", weight: "weight", quantity: "quantity", dimensions: "dimensions",
  incoterm: "incoterm", pickup_address: "pickupAddress", bl_type: "blType", preferred_carrier: "preferredCarrier",
  cbm: "cbm", chargeable_weight: "chargeableWeight", chargeable_weight_stated: "chargeableWeightStated",
  package_type: "packageType", truck_type: "truckType", temperature_control: "temperatureControl", cargo_ready_date: "cargoReadyDate",
}
// the client's per-type critical fields (Settings), loaded once; null = built-in rules
let critCache: CriticalConfig | null | undefined
function useCriticalConfig(): CriticalConfig | null {
  const [cfg, setCfg] = useState<CriticalConfig | null>(critCache ?? null)
  useEffect(() => {
    if (critCache !== undefined) return
    fetch("/api/settings").then((r) => (r.ok ? r.json() : null)).then((d) => { critCache = (d?.critical_fields_by_type as CriticalConfig | null) ?? null; setCfg(critCache) }).catch(() => {})
  }, [])
  return cfg
}
const clean = (v: unknown) => { const s = String(v ?? "").trim(); return s === "—" || s === "-" ? "" : s }
const COLUMN_HINT: Record<string, string> = { origin_city: "City / airport / port", origin_country: "Country", destination_city: "City / airport / port", destination_country: "Country" }
const PICKLISTS: Partial<Record<FieldKey, string[]>> = { truck_type: TRUCK_TYPES, package_type: PACKAGE_TYPES }
const GROUPS: FieldGroup[] = ["Route", "Cargo", "Measurements", "Conditions"]

/** Chip that shows the type of a request and lets the user switch it (undo-able through the portal's Undo popup). */
export function ShipmentTypeChip({ requestId, type, source, locked, onChanged, onSelect }: { requestId: string; type: ShipmentType | null | undefined; source?: "ai" | "manual" | null; locked?: boolean; onChanged: () => void; onSelect?: (t: ShipmentType) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function pick(t: ShipmentType) {
    setOpen(false)
    if (t === type) return
    setBusy(true); setErr(null)
    try {
      if (onSelect) await onSelect(t)
      else {
        const r = await fetch(`/api/requests/${requestId}/shipment-type`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shipment_type: t }) })
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d.error ?? "Could not change the type")
      }
      onChanged()
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="relative inline-block">
      <button
        type="button" disabled={busy || locked} onClick={() => setOpen((v) => !v)}
        title={locked ? "Locked — carrier RFQ already sent" : type ? "Switch the type" : "Choose the type of this request"}
        className="inline-flex items-center gap-1 rounded-full px-1 py-0 text-[12px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
        style={type
          ? { background: "transparent", color: "var(--text-primary)", border: "1px solid transparent" }
          : { background: "transparent", color: "var(--text-muted)", border: "1px dashed var(--card-border)" }}
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
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

type RowSpec = { suggest?: string | null; key: string; label: string; columns: string[]; required: boolean; hint?: string; list?: string[]; calculated?: boolean; fieldKey?: FieldKey }

function Row({ spec, vals, lockReason, persist, onSaved }: { spec: RowSpec; vals: Record<string, string>; lockReason: string | null; persist: (fields: Record<string, string>) => Promise<boolean>; onSaved: (v: Record<string, string>) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const shown = spec.columns.map((c) => vals[c]).filter(Boolean).join(", ")
  const stated = spec.key === "chargeable_weight" ? vals.chargeable_weight_stated : ""
  const differs = !!stated && !!shown && clean(stated).replace(/\D+/g, "") !== clean(shown).replace(/\D+/g, "")

  async function useSuggestion() {
    if (!spec.suggest) return
    setSaving(true)
    try {
      if (await persist({ [spec.columns[0]]: spec.suggest })) onSaved({ [spec.columns[0]]: spec.suggest })
    } catch { /* ignore */ } finally { setSaving(false) }
  }
  const overrides = !!spec.suggest && !!shown && spec.calculated && clean(spec.suggest) !== clean(shown)

  function start() { setDraft(Object.fromEntries(spec.columns.map((c) => [c, vals[c] ?? ""]))); setEditing(true) }
  async function save() {
    setSaving(true)
    try {
      if (!(await persist(draft))) throw new Error("Save failed")
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
            {!shown && spec.suggest && (
              <p className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
                ≈ {spec.suggest} · calculated{" "}
                {!lockReason && <button type="button" onClick={useSuggestion} disabled={saving} className="font-bold underline disabled:opacity-50" style={{ color: "var(--brand-accent)" }}>Use this</button>}
              </p>
            )}
            {overrides && <p className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Manual — calculated would be {spec.suggest}</p>}
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

function buildRows(type: ShipmentType, vals: Record<string, string>, opts: { first: boolean }, cfg: CriticalConfig | null): Record<FieldGroup, RowSpec[]> {
  const exw = isExw(vals.incoterm)
  const rules = criticalFor(type, cfg)
  const combined = rules.includes("dims_or_cbm")
  const check = quotableCheck(type, vals, cfg)
  const rows: Record<FieldGroup, RowSpec[]> = { Route: [], Cargo: [], Measurements: [], Conditions: [] }
  for (const f of TYPE_FIELDS[type]) {
    const isReq = f.key === "pickup_address" ? exw && rules.includes(f.key) : combined && (f.key === "dimensions" || f.key === "cbm") ? check.missingKeys.includes("dimensions") : rules.includes(f.key)
    rows[f.group].push({
      key: f.key, fieldKey: f.key, label: f.label, columns: FIELD_COLUMNS[f.key], required: isReq,
      list: PICKLISTS[f.key], calculated: f.calculated,
      suggest: f.key === "cbm" ? calculatedCbm(vals) : f.key === "chargeable_weight" ? chargeableWeight(vals) : null,
      hint: f.key === "pickup_address" ? "— only needed for EXW" : f.key === "chargeable_weight" ? "— calculated from dimensions" : f.key === "dimensions" || f.key === "cbm" ? (combined ? "— or give the other" : "—") : "—",
    })
  }
  if (opts.first) {
    if (type === "sea_fcl" || type === "sea_lcl") rows.Conditions.push({ key: "bl_type", label: "BL type", columns: ["bl_type"], required: false, hint: "—" })
    rows.Conditions.push({ key: "preferred_carrier", label: "Preferred carrier", columns: ["preferred_carrier"], required: false, hint: "— none specified" })
  }
  return rows
}

/** Small table under the Cargo Details title: one row per tag (type, readiness, lock, confirmation). */
export function TagTable({ rows, title }: { rows: [string, React.ReactNode][]; title?: string }) {
  const shown = rows.filter(([, v]) => v)
  return (
    <div className="relative z-20 mx-auto mt-4 w-full rounded-2xl" style={{ background: "var(--table-header-bg, var(--divider))", border: "1px solid var(--card-border)" }}>
      {title && <h3 className="font-display px-4 py-3 text-center text-[20px] font-extrabold" style={{ color: "var(--text-primary)", borderBottom: "1px solid var(--card-border)" }}>{title}</h3>}
      <div className="flex flex-wrap items-stretch justify-center">
        {shown.map(([k, v], i) => (
          <div key={k} className="flex min-w-[130px] flex-1 flex-col items-center justify-center gap-0.5 px-3 py-2 text-center" style={{ borderLeft: i ? "1px solid var(--card-border)" : "none" }}>
            <span className="text-[9.5px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{k}</span>
            <span className="flex flex-wrap items-center justify-center gap-1.5 text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function GroupedRows({ rows, vals, lockReason, save, onSaved }: { rows: Record<FieldGroup, RowSpec[]>; vals: Record<string, string>; lockReason: string | null; save: (f: Record<string, string>) => Promise<boolean>; onSaved: (v: Record<string, string>) => void }) {
  return (
    <div className="group px-5 pb-4">
      {GROUPS.map((g) => rows[g].length > 0 && (
        <div key={g} className="pt-3">
          <p className="pb-0.5 text-[12px] font-extrabold uppercase tracking-[0.12em]" style={{ color: "var(--text-primary)" }}>{g}</p>
          {rows[g].map((spec) => <Row key={spec.key} spec={spec} vals={vals} lockReason={lockReason} persist={save} onSaved={onSaved} />)}
        </div>
      ))}
    </div>
  )
}

async function post(url: string, body: unknown): Promise<boolean> {
  try { return (await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).ok } catch { return false }
}

/** Cargo Details for a typed request: one tab per quoted leg; fields grouped Route / Cargo / Measurements / Conditions, labelled for the type. */
export function TypedCargoDetails({ request, type, lockReason, lockBadge, banner, confirmation, onChanged, onFieldSaved }: { request: FreightRequest; type: ShipmentType; lockReason: string | null; lockBadge?: React.ReactNode; banner?: React.ReactNode; confirmation?: React.ReactNode; onChanged: () => void; onFieldSaved?: () => void }) {
  const initial = useMemo(() => {
    const out: Record<string, string> = {}
    for (const [col, camel] of Object.entries(COL_TO_CAMEL)) out[col] = clean(request[camel])
    return out
  }, [request])
  const legs = request.legs ?? []
  const crit = useCriticalConfig()
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [legEdits, setLegEdits] = useState<Record<number, Record<string, string>>>({})
  const [active, setActive] = useState(0)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const tab = Math.min(active, legs.length) // 0 = leg 1

  const first = { ...initial, ...edits }
  const legVals = (i: number): Record<string, string> => ({ ...Object.fromEntries(Object.entries(legs[i - 1] ?? {}).map(([k, v]) => [k, clean(v)])), ...(legEdits[i] ?? {}) })
  const legType = (i: number) => (i === 0 ? type : (legs[i - 1]?.shipment_type as ShipmentType))
  // readiness over ALL legs
  const checks = [quotableCheck(type, first, crit), ...legs.map((l, i) => quotableCheck(legType(i + 1), { ...legVals(i + 1) }, crit))]
  const missing = checks.flatMap((c, i) => c.missing.map((m) => (legs.length ? `Leg ${i + 1}: ${m}` : m)))

  const vals = tab === 0 ? first : legVals(tab)
  const curType = legType(tab)
  const rows = buildRows(curType, vals, { first: tab === 0 }, crit)
  const saveFirst = async (fields: Record<string, string>) => {
    try { return (await fetch("/api/requests", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: request.id, fields }) })).ok } catch { return false }
  }
  const saveLeg = (fields: Record<string, string>) => post(`/api/requests/${request.id}/legs`, { action: "update", index: tab, fields })
  const locked = !!lockReason && lockReason.startsWith("Locked")

  async function addLeg(t: ShipmentType) {
    setAdding(false); setBusy(true)
    const ok = await post(`/api/requests/${request.id}/legs`, { action: "add", shipment_type: t })
    setBusy(false)
    if (ok) { setActive(legs.length + 1); onChanged() }
  }
  async function removeLeg() {
    if (tab === 0) return
    setBusy(true)
    const ok = await post(`/api/requests/${request.id}/legs`, { action: "remove", index: tab })
    setBusy(false)
    if (ok) { setActive(0); setLegEdits({}); onChanged() }
  }

  return (
    <div className="ds-card">
      <div className="px-5 pt-1">
        <TagTable title="Cargo Details" rows={[
          ["Type", tab === 0 ? (
            <ShipmentTypeChip requestId={request.id} type={type} source={request.typeSource} locked={locked} onChanged={onChanged} />
          ) : (
            <ShipmentTypeChip requestId={request.id} type={curType} locked={locked} onChanged={() => { setLegEdits({}); onChanged() }}
              onSelect={async (t) => { if (!(await post(`/api/requests/${request.id}/legs`, { action: "type", index: tab, shipment_type: t }))) throw new Error("Could not change the type") }} />
          )],
          ["Quote status", missing.length === 0 ? (
            <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Ready to quote</span>
          ) : (
            <span title={missing.join(", ")} className="inline-flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> {missing.length} missing</span>
          )],
          ["Access", lockBadge],
          ["Fields", confirmation],
        ]} />
      </div>
      {banner}

      <div className="flex flex-wrap items-center justify-center gap-2 px-5 pt-3">
        <Seg label="Legs" items={[type, ...legs.map((l) => l.shipment_type as ShipmentType)].map((t, i) => ({
          key: String(i), on: i === tab, onClick: () => setActive(i),
          label: <>{legs.length ? `Leg ${i + 1} · ` : ""}{TYPE_LABEL[t]}{checks[i] && !checks[i].ready && <span className="inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: i === tab ? "#fff" : "#ef4444" }} title="Missing required fields" />}</>,
        }))} />
        {!locked && (
          <div className="relative">
            <button type="button" disabled={busy} onClick={() => setAdding((v) => !v)} className="inline-flex items-center gap-1 rounded-2xl px-3.5 py-2 text-[13px] font-bold transition-colors hover:bg-[rgb(var(--brand-accent-rgb)/0.12)] disabled:opacity-50" style={{ border: "1px dashed var(--card-border)", color: "var(--text-secondary)" }}>
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} {legs.length ? "Add leg" : "Quote another leg"}
            </button>
            {adding && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setAdding(false)} />
                <ul className="absolute left-1/2 z-20 mt-1 w-36 -translate-x-1/2 overflow-hidden rounded-lg py-1 shadow-xl" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
                  {SHIPMENT_TYPES.map((t) => (
                    <li key={t}><button type="button" onClick={() => addLeg(t)} className="w-full px-3 py-1.5 text-left text-xs font-semibold" style={{ color: "var(--text-primary)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-bg)")} onMouseLeave={(e) => (e.currentTarget.style.background = "")}>{TYPE_LABEL[t]}</button></li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>
      {legs.length > 0 && missing.length > 0 && (
        <p className="mx-5 mt-2 rounded-lg px-3 py-2 text-center text-xs font-semibold" style={{ background: "rgba(245,158,11,0.1)", color: "#b45309" }}>
          Needed to quote: {missing.join(", ")}
        </p>
      )}

      <GroupedRows
        key={tab} rows={rows} vals={vals} lockReason={lockReason} save={tab === 0 ? saveFirst : saveLeg}
        onSaved={(v) => { if (tab === 0) setEdits((p) => ({ ...p, ...v })); else setLegEdits((p) => ({ ...p, [tab]: { ...(p[tab] ?? {}), ...v } })); onFieldSaved?.() }}
      />
      {tab > 0 && !locked && (
        <div className="px-5 pb-4 text-center">
          <button type="button" onClick={removeLeg} disabled={busy} className="text-[11.5px] font-semibold underline disabled:opacity-50" style={{ color: "#ef4444" }}>Remove this leg</button>
        </div>
      )}
    </div>
  )
}
