// Shipment types: the ONE place that says which fields a request has, what they are called and which are
// required, per type. Pages, the quotable check, templates and the auto-reply all read from here.
import { isExw, hasText } from "@/lib/shipment-labels"

export type ShipmentType = "air" | "sea_fcl" | "sea_lcl" | "land"
export const SHIPMENT_TYPES: ShipmentType[] = ["air", "sea_fcl", "sea_lcl", "land"]

export const TYPE_LABEL: Record<ShipmentType, string> = {
  air: "Air",
  sea_fcl: "Sea FCL",
  sea_lcl: "Sea LCL",
  land: "Land",
}

export function isShipmentType(v: unknown): v is ShipmentType {
  return typeof v === "string" && (SHIPMENT_TYPES as string[]).includes(v)
}

/** Field keys. Each one is a column on freight_requests (and a key inside every item of `legs`). */
export type FieldKey =
  | "incoterm" | "pickup_address"
  | "origin" | "destination"            // origin = origin_city/origin_country, destination likewise
  | "cargo_type"                        // commodity
  | "quantity" | "package_type"
  | "weight" | "dimensions" | "cbm" | "chargeable_weight"
  | "equipment" | "truck_type"
  | "temperature_control" | "cargo_ready_date"

export type FieldGroup = "Route" | "Cargo" | "Measurements" | "Conditions"

type Req = true | false | "exw" | "dims_or_cbm"

export interface FieldSpec {
  key: FieldKey
  label: string
  group: FieldGroup
  /** true = always required, "exw" = only when the incoterm is EXW, "dims_or_cbm" = dimensions or CBM */
  required: Req
  /** the field is calculated by the portal (read-only unless overridden) */
  calculated?: boolean
}

const incoterm: FieldSpec      = { key: "incoterm", label: "Incoterm", group: "Route", required: false }
const pickup: FieldSpec        = { key: "pickup_address", label: "Pickup address", group: "Route", required: "exw" }
const commodity: FieldSpec     = { key: "cargo_type", label: "Commodity", group: "Cargo", required: true }
const readyDate: FieldSpec     = { key: "cargo_ready_date", label: "Cargo ready date", group: "Conditions", required: false }
const temperature: FieldSpec   = { key: "temperature_control", label: "Temperature", group: "Conditions", required: false }

export const TYPE_FIELDS: Record<ShipmentType, FieldSpec[]> = {
  air: [
    incoterm, pickup,
    { key: "origin", label: "Airport of Loading (AOL)", group: "Route", required: true },
    { key: "destination", label: "Airport of Destination (AOD)", group: "Route", required: true },
    commodity,
    { key: "quantity", label: "Quantity", group: "Cargo", required: true },
    { key: "package_type", label: "Package type", group: "Cargo", required: true },
    { key: "weight", label: "Gross weight", group: "Measurements", required: true },
    { key: "dimensions", label: "Dimensions", group: "Measurements", required: "dims_or_cbm" },
    { key: "cbm", label: "CBM", group: "Measurements", required: "dims_or_cbm" },
    { key: "chargeable_weight", label: "Chargeable weight", group: "Measurements", required: false, calculated: true },
    temperature, readyDate,
  ],
  sea_fcl: [
    incoterm, pickup,
    { key: "origin", label: "Port of Loading (POL)", group: "Route", required: true },
    { key: "destination", label: "Port of Discharge (POD)", group: "Route", required: true },
    commodity,
    { key: "equipment", label: "Equipment", group: "Cargo", required: true },
    { key: "weight", label: "Gross weight", group: "Measurements", required: false },
    { key: "cbm", label: "CBM", group: "Measurements", required: false },
    temperature, readyDate,
  ],
  sea_lcl: [
    incoterm, pickup,
    { key: "origin", label: "Port of Loading (POL)", group: "Route", required: true },
    { key: "destination", label: "Port of Discharge (POD)", group: "Route", required: true },
    commodity,
    { key: "cbm", label: "CBM", group: "Measurements", required: true },
    { key: "weight", label: "Gross weight", group: "Measurements", required: false },
    { key: "quantity", label: "Quantity", group: "Cargo", required: false },
    { key: "package_type", label: "Package type", group: "Cargo", required: false },
    { key: "dimensions", label: "Dimensions", group: "Measurements", required: false },
    temperature, readyDate,
  ],
  land: [
    incoterm, pickup,
    { key: "origin", label: "From", group: "Route", required: true },
    { key: "destination", label: "To", group: "Route", required: true },
    commodity,
    { key: "truck_type", label: "Truck type", group: "Cargo", required: true },
    { key: "weight", label: "Gross weight", group: "Measurements", required: false },
    { key: "quantity", label: "Quantity", group: "Cargo", required: false },
    { key: "dimensions", label: "Dimensions", group: "Measurements", required: false },
    temperature, readyDate,
  ],
}

/** "Pick from the list or type your own." */
export const TRUCK_TYPES = ["Flatbed", "Curtain-side", "Reefer", "Lowbed"]
export const PACKAGE_TYPES = ["Pallets", "Cartons", "Crates", "Drums"]

/** Fields whose values are flags on the request itself (shared by every leg). */
export const COMMON_FIELDS = ["dgr", "urgency", "preferred_carrier", "special_requirements"] as const

/** Which request columns hold each field. `origin`/`destination` are a city + country pair. */
export const FIELD_COLUMNS: Record<FieldKey, string[]> = {
  incoterm: ["incoterm"],
  pickup_address: ["pickup_address"],
  origin: ["origin_city", "origin_country"],
  destination: ["destination_city", "destination_country"],
  cargo_type: ["cargo_type"],
  quantity: ["quantity"],
  package_type: ["package_type"],
  weight: ["weight"],
  dimensions: ["dimensions"],
  cbm: ["cbm"],
  chargeable_weight: ["chargeable_weight"],
  equipment: ["equipment"],
  truck_type: ["truck_type"],
  temperature_control: ["temperature_control"],
  cargo_ready_date: ["cargo_ready_date"],
}

/** Every column the new type system adds, so APIs can allow-list them in one go. */
export const NEW_EDITABLE_COLUMNS = [
  "shipment_type", "cbm", "chargeable_weight", "chargeable_weight_stated", "package_type",
  "cargo_ready_date", "temperature_control", "truck_type",
]

/** The old is_sea / is_air / is_land flags, derived from the type so carrier matching keeps working. */
export function flagsForType(t: ShipmentType): { is_sea: boolean; is_air: boolean; is_land: boolean } {
  return { is_sea: t === "sea_fcl" || t === "sea_lcl", is_air: t === "air", is_land: t === "land" }
}

/** Label for a field on a given type (falls back to the plain key). */
export function fieldLabel(t: ShipmentType, key: FieldKey): string {
  return TYPE_FIELDS[t].find((f) => f.key === key)?.label ?? key
}

/** A leg is a set of the type-specific fields, using the same keys as the request columns. */
export type LegData = { shipment_type: ShipmentType } & Record<string, unknown>

/** Reads a field from a row/leg: city + country pairs count as present when either part is filled. */
export function fieldValue(data: Record<string, unknown>, key: FieldKey): string {
  return FIELD_COLUMNS[key].map((c) => String(data[c] ?? "").trim()).filter(hasText).join(", ")
}

export interface QuotableResult {
  ready: boolean
  /** labels, in display order, of the required fields that are still missing */
  missing: string[]
  /** field keys of the same */
  missingKeys: FieldKey[]
}

/**
 * Critical (required) fields per shipment type, as chosen in Settings. A list of rule keys per type:
 * a field key = always required, "pickup_address" = required when the incoterm is EXW,
 * "dims_or_cbm" = dimensions OR CBM (either one). A type that is not in the config uses the built-in rules (TYPE_FIELDS).
 * Origin and destination are always required.
 */
export type CriticalConfig = Partial<Record<ShipmentType, string[]>>
export const ALWAYS_CRITICAL: FieldKey[] = ["origin", "destination"]

/** The built-in rule keys of a type (what TYPE_FIELDS marks as required). */
export function defaultCritical(t: ShipmentType): string[] {
  const out: string[] = []
  for (const f of TYPE_FIELDS[t]) {
    if (f.required === true) out.push(f.key)
    else if (f.required === "exw") out.push(f.key)
    else if (f.required === "dims_or_cbm" && !out.includes("dims_or_cbm")) out.push("dims_or_cbm")
  }
  return out
}

/** The rule keys in force for a type: the client's choice, else the built-in rules; origin and destination are always in. */
export function criticalFor(t: ShipmentType, cfg?: CriticalConfig | null): string[] {
  const chosen = cfg?.[t]
  const base = Array.isArray(chosen) ? chosen.filter((x): x is string => typeof x === "string") : defaultCritical(t)
  return Array.from(new Set([...ALWAYS_CRITICAL, ...base]))
}

/** Fields the Settings page offers for a type (origin / destination are fixed, chargeable weight is calculated). */
export function criticalOptions(t: ShipmentType): { key: string; label: string; hint?: string }[] {
  const fields = TYPE_FIELDS[t].filter((f) => !ALWAYS_CRITICAL.includes(f.key) && f.key !== "chargeable_weight")
  const combined = TYPE_FIELDS[t].some((f) => f.required === "dims_or_cbm")
  const out: { key: string; label: string; hint?: string }[] = []
  for (const f of fields) {
    if (combined && (f.key === "dimensions" || f.key === "cbm")) {
      if (!out.some((o) => o.key === "dims_or_cbm")) out.push({ key: "dims_or_cbm", label: "Dimensions or CBM", hint: "either one is enough" })
      continue
    }
    out.push({ key: f.key, label: f.label, hint: f.key === "pickup_address" ? "only when the incoterm is EXW" : undefined })
  }
  return out
}

/** One readable sentence per type for the AI instructions: "Air: origin airport, ...". */
export function criticalText(cfg?: CriticalConfig | null): string {
  const lab = (t: ShipmentType, k: string) => {
    if (k === "dims_or_cbm") return "dimensions or cbm"
    if (k === "pickup_address") return "pickup_address (only when the incoterm is EXW)"
    return fieldLabel(t, k as FieldKey).toLowerCase()
  }
  return SHIPMENT_TYPES.map((t) => `${t}: ${criticalFor(t, cfg).map((k) => lab(t, k)).join(", ")}`).join(". ")
}

/**
 * The quotable check: which critical fields of this type are missing?
 * Rules come from the client's Settings (cfg) or, without it, the built-in rules of the type.
 */
export function quotableCheck(t: ShipmentType, data: Record<string, unknown>, cfg?: CriticalConfig | null): QuotableResult {
  const rules = criticalFor(t, cfg)
  const missingKeys: FieldKey[] = []
  const missing: string[] = []
  const exw = isExw(String(data.incoterm ?? ""))
  const hasDimsOrCbm = !!fieldValue(data, "dimensions") || !!fieldValue(data, "cbm")
  const combined = rules.includes("dims_or_cbm")
  for (const f of TYPE_FIELDS[t]) {
    let isMissing = false
    if (f.key === "pickup_address") isMissing = exw && rules.includes("pickup_address") && !fieldValue(data, f.key)
    else if (combined && (f.key === "dimensions" || f.key === "cbm")) isMissing = f.key === "dimensions" && !hasDimsOrCbm
    else if (rules.includes(f.key)) isMissing = !fieldValue(data, f.key)
    if (isMissing) {
      missingKeys.push(f.key)
      missing.push(f.key === "dimensions" && combined ? "Dimensions or CBM" : f.label)
    }
  }
  return { ready: missing.length === 0, missing, missingKeys }
}

/** Every request column that belongs to one leg (the rest of the row is the common block shared by all legs). */
export const LEG_COLUMNS: string[] = [...new Set([...Object.values(FIELD_COLUMNS).flat(), "bl_type"])]

/** Legs stored on a row (leg 2, 3 ...). Accepts an array or a JSON string; anything else = none. */
export function extraLegs(row: Record<string, unknown> | null | undefined): LegData[] {
  let v: unknown = row?.legs
  if (typeof v === "string") { try { v = JSON.parse(v) } catch { v = null } }
  return Array.isArray(v) ? (v as unknown[]).filter((x): x is LegData => !!x && typeof x === "object" && isShipmentType((x as LegData).shipment_type)) : []
}

/** All legs of a request in order: leg 1 is the request's own columns, then the stored extra legs. */
export function allLegs(row: Record<string, unknown>): { type: ShipmentType | null; data: Record<string, unknown> }[] {
  const first = { type: isShipmentType(row.shipment_type) ? row.shipment_type : null, data: row }
  return [first, ...extraLegs(row).map((l) => ({ type: l.shipment_type as ShipmentType | null, data: l as Record<string, unknown> }))]
}

/**
 * The row as seen by ONE leg: common fields (sender, reference, urgency, special requirements ...) from the request,
 * leg fields only from that leg (a leg never inherits another leg's equipment, weight and so on), flags derived from the leg type.
 * Leg 0 is the request itself.
 */
export function rowForLeg(row: Record<string, any>, index: number): Record<string, any> {
  if (index <= 0) return row
  const leg = extraLegs(row)[index - 1]
  if (!leg) return row
  const out: Record<string, any> = { ...row }
  for (const c of LEG_COLUMNS) out[c] = null
  for (const c of LEG_COLUMNS) if (leg[c] != null) out[c] = leg[c]
  // incoterm and pickup are per leg: a leg never inherits another leg's (EXW air + FOB sea in one email is normal)
  out.shipment_type = leg.shipment_type
  Object.assign(out, flagsForType(leg.shipment_type))
  out.legs = row.legs
  out.leg_index = index
  return out
}

/**
 * For a saved request row: the missing required fields according to its type, or null when the request has no type
 * (older request: callers keep using the client's "critical fields" setting).
 * With extra legs every item is prefixed with its leg ("Leg 2: Truck type").
 */
export function typedMissing(row: Record<string, unknown> | null | undefined, cfg?: CriticalConfig | null): string[] | null {
  if (!row || !isShipmentType(row.shipment_type)) return null
  const legs = allLegs(row)
  if (legs.length === 1) return quotableCheck(row.shipment_type, row, cfg).missing
  return legs.flatMap((l, i) => (l.type ? quotableCheck(l.type, l.data, cfg).missing : ["Type"]).map((m) => `Leg ${i + 1}: ${m}`))
}

/** One line per leg for emails: "Leg 2 (Land): Aqaba, Jordan to Abu Dhabi, UAE. Commodity: ... Truck type: ...". */
export function legsSummary(row: Record<string, any>): string {
  const legs = allLegs(row)
  if (legs.length < 2) return ""
  return legs.map((l, i) => {
    const d = rowForLeg(row, i)
    const place = (c: string, k: string) => [d[c], d[k]].filter(hasText).join(", ")
    const parts = [
      `${place("origin_city", "origin_country") || "?"} to ${place("destination_city", "destination_country") || "?"}`,
      ...(["cargo_type", "equipment", "truck_type", "quantity", "package_type", "weight", "cbm", "dimensions", "temperature_control", "cargo_ready_date"] as const)
        .filter((k) => hasText(d[k])).map((k) => `${k === "cargo_type" ? "Commodity" : k === "temperature_control" ? "Temperature" : k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())}: ${d[k]}`),
    ]
    return `Leg ${i + 1}${l.type ? ` (${TYPE_LABEL[l.type]})` : ""}: ${parts.join(". ")}`
  }).join("\n")
}
