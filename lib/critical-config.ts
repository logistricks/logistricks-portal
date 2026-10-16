import { criticalOptions, isShipmentType, SHIPMENT_TYPES, type CriticalConfig } from "@/lib/shipment-types"

/** Clean a critical-fields config from the database or the Settings page: known types and known rule keys only. */
export function sanitizeCriticalConfig(raw: unknown): CriticalConfig | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const out: CriticalConfig = {}
  for (const t of SHIPMENT_TYPES) {
    const v = (raw as Record<string, unknown>)[t]
    if (!Array.isArray(v) || !isShipmentType(t)) continue
    const allowed = new Set(criticalOptions(t).map((o) => o.key))
    out[t] = Array.from(new Set(v.filter((k): k is string => typeof k === "string" && allowed.has(k))))
  }
  return Object.keys(out).length ? out : null
}

/** The client's per-type critical fields (null = built-in rules; also null before migration 077 is run). */
export async function loadCriticalConfig(admin: any, clientCode: string): Promise<CriticalConfig | null> {
  try {
    const { data, error } = await admin.from("clients").select("critical_fields_by_type").ilike("client_code", clientCode).maybeSingle()
    if (error) return null
    return sanitizeCriticalConfig(data?.critical_fields_by_type)
  } catch {
    return null
  }
}
