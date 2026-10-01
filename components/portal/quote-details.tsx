"use client"

import type { ChargeLineView, CarrierQuoteExt, QuoteFlag } from "@/lib/carrier-quotes-queries"

const fmtNum = (n: number | null | undefined, max = 3) =>
  n === null || n === undefined ? null : n.toLocaleString("en-US", { maximumFractionDigits: max })
const fmtDate = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null
const fmtDateTime = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : null
const yesNo = (b: boolean | null | undefined) => (b === null || b === undefined ? null : b ? "Yes" : "No")
const label = (v: string | null | undefined) => (v ? v.replace(/_/g, " ") : null)

type Row = [string, string | null | undefined]

function Section({ title, rows }: { title: string; rows: Row[] }) {
  const shown = rows.filter(([, v]) => v !== null && v !== undefined && v !== "")
  if (shown.length === 0) return null
  return (
    <div>
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{title}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
        {shown.map(([k, v]) => (
          <div key={k} className="contents">
            <dt style={{ color: "var(--text-secondary)" }}>{k}</dt>
            <dd className="text-right font-semibold" style={{ color: "var(--text-primary)" }}>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

const FLAG_COLORS: Record<QuoteFlag["severity"], { bg: string; fg: string }> = {
  error: { bg: "rgba(220,38,38,0.1)",  fg: "#dc2626" },
  warn:  { bg: "rgba(245,158,11,0.12)", fg: "#b45309" },
  info:  { bg: "rgba(59,130,246,0.1)",  fg: "#2563eb" },
}

/** Small header chips: mode, response type, firm/indicative, review state. */
export function QuoteChips({ ext }: { ext: CarrierQuoteExt }) {
  const chips: { text: string; tone?: "ok" | "warn" | "muted" }[] = []
  if (ext.mode) chips.push({ text: ext.mode.toUpperCase(), tone: "muted" })
  if (ext.responseType && ext.responseType !== "quote") chips.push({ text: label(ext.responseType)!, tone: "warn" })
  if (ext.quoteStatus) chips.push({ text: label(ext.quoteStatus)!, tone: ext.quoteStatus === "firm" ? "ok" : "warn" })
  if (ext.reviewStatus === "needs_review") chips.push({ text: "needs review", tone: "warn" })
  if (ext.reviewStatus === "human_verified") chips.push({ text: "verified", tone: "ok" })
  if (chips.length === 0) return null
  const tone = {
    ok:    { bg: "rgba(16,185,129,0.12)", fg: "#059669" },
    warn:  { bg: "rgba(245,158,11,0.14)", fg: "#b45309" },
    muted: { bg: "var(--table-header-bg)", fg: "var(--text-secondary)" },
  }
  return (
    <div className="flex flex-wrap gap-1">
      {chips.map((c) => (
        <span key={c.text} className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: tone[c.tone ?? "muted"].bg, color: tone[c.tone ?? "muted"].fg }}>{c.text}</span>
      ))}
    </div>
  )
}

/** True when the quote carries anything beyond the basic rate fields. */
export function hasExtendedData(ext: CarrierQuoteExt): boolean {
  return Object.entries(ext).some(([k, v]) => {
    if (k === "version") return false
    if (k === "validationFlags") return Array.isArray(v) && v.length > 0
    return v !== null && v !== undefined && v !== ""
  })
}

export function QuoteDetails({ ext }: { ext: CarrierQuoteExt }) {
  const weightUnit = ext.weightUnit ?? "kg"
  const chargeableUnit = ext.chargeableUnit === "rt" ? "RT (W/M)" : "kg"
  const charges: ChargeLineView[] = ext.charges ?? []

  return (
    <div className="space-y-3 rounded border p-3" style={{ borderColor: "var(--card-border)", background: "var(--table-header-bg)" }}>
      {(ext.validationFlags?.length ?? 0) > 0 && (
        <div className="space-y-1">
          {ext.validationFlags!.map((f, i) => (
            <p key={i} className="rounded px-2 py-1 text-[11px] font-medium"
              style={{ background: FLAG_COLORS[f.severity]?.bg, color: FLAG_COLORS[f.severity]?.fg }}>
              {f.message}
            </p>
          ))}
        </div>
      )}

      <Section title="Quote" rows={[
        ["Carrier reference", ext.carrierQuoteRef],
        ["Service", ext.serviceLevel],
        ["Quote date", fmtDate(ext.quoteDate)],
        ["Valid from", fmtDate(ext.validFrom)],
        ["All-in", yesNo(ext.isAllIn)],
        ["Tax included", yesNo(ext.taxIncluded)],
        ["Tax amount", fmtNum(ext.taxAmount, 2)],
        ["Minimum charge", fmtNum(ext.minimumCharge, 2)],
        ["Version", ext.version && ext.version > 1 ? String(ext.version) : null],
      ]} />

      <Section title="Cargo as quoted" rows={[
        ["Commodity", ext.commodity],
        ["HS code", ext.hsCode],
        ["Pieces", fmtNum(ext.pieces, 0)],
        ["Packaging", ext.packagingType],
        ["Gross weight", ext.grossWeight != null ? `${fmtNum(ext.grossWeight)} ${weightUnit}` : null],
        ["Gross weight (kg)", ext.weightUnit && ext.weightUnit !== "kg" ? fmtNum(ext.grossWeightKg) : null],
        ["Volume", ext.volumeCbm != null ? `${fmtNum(ext.volumeCbm)} m³` : null],
        ["Volumetric weight", ext.volumetricWeightKg != null ? `${fmtNum(ext.volumetricWeightKg)} kg` : null],
        ["Chargeable weight", ext.chargeableWeight != null
          ? `${fmtNum(ext.chargeableWeight)} ${chargeableUnit}${ext.chargeableBasis ? ` · ${label(ext.chargeableBasis)}` : ""}` : null],
        ["Carrier's chargeable", ext.chargeableWeightStated != null && ext.chargeableWeightStated !== ext.chargeableWeight
          ? `${fmtNum(ext.chargeableWeightStated)} kg` : null],
        ["Stackable", yesNo(ext.stackable)],
        ["Declared value", fmtNum(ext.declaredValue, 2)],
        ["Temperature", ext.temperatureControl],
        ["Hazmat", ext.hazmat ? Object.values(ext.hazmat).filter(Boolean).join(" · ") : null],
        ["Special handling", ext.specialHandling],
        ["Container", ext.containerType ? `${ext.containerCount ?? ""} × ${ext.containerType}`.trim() : null],
        ["Equipment", ext.equipmentType],
      ]} />

      <Section title="Route & schedule" rows={[
        ["From", ext.originPlace],
        ["To", ext.destinationPlace],
        ["Incoterm", ext.incoterm ? `${ext.incoterm}${ext.incotermPlace ? ` ${ext.incotermPlace}` : ""}` : null],
        ["ETD", fmtDateTime(ext.etd)],
        ["ETA", fmtDateTime(ext.eta)],
        ["Frequency", ext.frequency],
        ["Routing", label(ext.directOrConnecting)],
        ["Space confirmed", yesNo(ext.spaceConfirmed)],
        ["Free days (demurrage)", fmtNum(ext.freeDaysDemurrage, 0)],
        ["Free days (detention)", fmtNum(ext.freeDaysDetention, 0)],
        ["After free time", ext.perDiemNote],
      ]} />

      {charges.length > 0 && (
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Charges</p>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr style={{ color: "var(--text-secondary)" }}>
                  <th className="pb-1 text-left font-semibold">Charge</th>
                  <th className="pb-1 text-right font-semibold">Rate × qty</th>
                  <th className="pb-1 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {charges.map((c, i) => {
                  const excluded = c.inclusion && c.inclusion !== "included"
                  return (
                    <tr key={i} className="border-t" style={{ borderColor: "var(--card-border)", opacity: excluded ? 0.65 : 1 }}>
                      <td className="py-1 pr-2" style={{ color: "var(--text-primary)" }}>
                        {c.carrier_label ?? c.canonical_code ?? "Charge"}
                        {excluded && <span className="ml-1 text-[10px]" style={{ color: "var(--text-muted)" }}>({label(c.inclusion)})</span>}
                      </td>
                      <td className="py-1 text-right tabular-nums" style={{ color: "var(--text-secondary)" }}>
                        {c.unit_rate != null && c.quantity != null ? `${fmtNum(c.unit_rate, 2)} × ${fmtNum(c.quantity, 3)}${c.basis ? ` / ${c.basis}` : ""}` : (c.basis ?? "")}
                      </td>
                      <td className="py-1 text-right font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
                        {c.amount != null ? `${fmtNum(c.amount, 2)}${c.currency ? ` ${c.currency}` : ""}` : "—"}
                      </td>
                    </tr>
                  )
                })}
                {ext.totalAmount != null && (
                  <tr className="border-t-2" style={{ borderColor: "var(--card-border)" }}>
                    <td className="pt-1 font-bold" style={{ color: "var(--text-primary)" }} colSpan={2}>
                      Total (calculated){ext.totalAmountStated != null && ext.totalAmountStated !== ext.totalAmount ? ` · carrier states ${fmtNum(ext.totalAmountStated, 2)}` : ""}
                    </td>
                    <td className="pt-1 text-right font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{fmtNum(ext.totalAmount, 2)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Section title="Terms" rows={[
        ["Payment", ext.paymentTerms],
        ["Insurance offered", yesNo(ext.insuranceOffered)],
        ["Liability limit", ext.liabilityLimit],
        ["Cancellation", ext.cancellationTerms],
        ["Exclusions", ext.exclusions],
        ["Subject to", ext.subjectToConditions],
        ["Documents required", ext.requiredDocuments],
      ]} />
    </div>
  )
}
