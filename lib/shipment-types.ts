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
    readyDate,
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
    readyDate,
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
 * The quotable check: which required fields of this type are missing?
 * Rules: required = always; "exw" = only when the incoterm is EXW; "dims_or_cbm" = dimensions OR CBM
 * (reported once, under the Dimensions label).
 */
export function quotableCheck(t: ShipmentType, data: Record<string, unknown>): QuotableResult {
  const missingKeys: FieldKey[] = []
  const missing: string[] = []
  const exw = isExw(String(data.incoterm ?? ""))
  const hasDimsOrCbm = !!fieldValue(data, "dimensions") || !!fieldValue(data, "cbm")
  for (const f of TYPE_FIELDS[t]) {
    let isMissing = false
    if (f.required === true) isMissing = !fieldValue(data, f.key)
    else if (f.required === "exw") isMissing = exw && !fieldValue(data, f.key)
    else if (f.required === "dims_or_cbm") isMissing = !hasDimsOrCbm && f.key === "dimensions"
    if (isMissing) {
      missingKeys.push(f.key)
      missing.push(f.key === "dimensions" && f.required === "dims_or_cbm" ? "Dimensions or CBM" : f.label)
    }
  }
  return { ready: missing.length === 0, missing, missingKeys }
}
