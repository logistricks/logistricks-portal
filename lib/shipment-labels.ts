// Shared wording rules: sea shipments use POL / POD (ports), not a "route";
// EXW shipments need a pickup address.

type ModeFlags = { is_sea?: boolean; is_air?: boolean; is_land?: boolean }

/** Sea only (no air/land mixed in) → show POL/POD instead of a route. */
export function isSeaOnly(m: ModeFlags | string[] | null | undefined): boolean {
  if (!m) return false
  if (Array.isArray(m)) {
    const l = m.map(x => String(x).toLowerCase())
    return l.includes("sea") && !l.includes("air") && !l.includes("land")
  }
  return !!m.is_sea && !m.is_air && !m.is_land
}

export function isExw(incoterm: string | null | undefined): boolean {
  return /^\s*(exw|ex[\s-]?works?)\b/i.test(String(incoterm ?? ""))
}

export function hasText(v: unknown): boolean {
  const s = String(v ?? "").trim()
  return !!s && s !== "—" && s !== "-"
}

/** True when EXW and neither the request nor the quote carries a pickup address. */
export function exwNeedsAddress(incoterm: string | null | undefined, ...addresses: unknown[]): boolean {
  return isExw(incoterm) && !addresses.some(hasText)
}

export const POL_LABEL = "Port of Loading (POL)"
export const POD_LABEL = "Port of Discharge (POD)"
export const EXW_ALERT = "EXW — pickup address missing"
