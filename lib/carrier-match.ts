/**
 * lib/carrier-match.ts — compare a request with the carriers' setup (modes + countries covered).
 * Pure and client/server safe. Used by the carrier pickers and by the automated-send endpoint.
 *
 * A carrier is eligible when it is active and handles one of the request's modes.
 * Country fit (carriers.countries, ISO-2):
 *   both   – covers the origin AND the destination        → suggested (best)
 *   one    – covers the origin OR the destination         → suggested
 *   unset  – carrier has no countries set yet             → listed, not suggested
 *   none   – countries set, but neither end is covered    → listed last, not suggested
 *   unknown– the request has no recognisable country      → modes only
 */
import { countryName, toCountryCode } from "@/lib/countries"

export type Fit = "both" | "one" | "unset" | "none" | "unknown"
export interface CarrierLike { is_sea: boolean; is_air: boolean; is_land: boolean; countries?: string[] | null; active?: boolean; email?: string }
export interface RequestLike { modes: string[]; originCountry?: string | null; destinationCountry?: string | null }
export interface Match { eligible: boolean; fit: Fit; suggested: boolean; score: number; reason: string }

export function modeMatches(c: CarrierLike, modes: string[]): boolean {
  return (modes.includes("Sea") && c.is_sea) || (modes.includes("Air") && c.is_air) || (modes.includes("Land") && c.is_land)
}

export function matchCarrier(c: CarrierLike, req: RequestLike): Match {
  const eligible = modeMatches(c, req.modes)
  const o = toCountryCode(req.originCountry), d = toCountryCode(req.destinationCountry)
  const set = new Set(c.countries ?? [])
  let fit: Fit, reason: string
  if (!o && !d) { fit = "unknown"; reason = "Matches the mode" }
  else if (set.size === 0) { fit = "unset"; reason = "No countries set for this carrier" }
  else {
    const hasO = !!o && set.has(o), hasD = !!d && set.has(d)
    if (hasO && hasD) { fit = "both"; reason = `Covers ${countryName(o!)} and ${countryName(d!)}` }
    else if (hasO || hasD) { fit = "one"; reason = `Covers ${countryName((hasO ? o : d)!)}` }
    else { fit = "none"; reason = "Doesn't cover this route" }
  }
  const score = !eligible ? -1 : { both: 3, one: 2, unknown: 1, unset: 1, none: 0 }[fit]
  return { eligible, fit, suggested: eligible && (fit === "both" || fit === "one"), score, reason }
}

/** Eligible carriers (active + email + mode), best match first. */
export function rankCarriers<T extends CarrierLike & { carrier_name?: string }>(carriers: T[], req: RequestLike): { carrier: T; match: Match }[] {
  return carriers
    .filter((c) => c.active !== false && (c.email ?? "x") !== "")
    .map((carrier) => ({ carrier, match: matchCarrier(carrier, req) }))
    .filter((x) => x.match.eligible)
    .sort((a, b) => b.match.score - a.match.score || String(a.carrier.carrier_name ?? "").localeCompare(String(b.carrier.carrier_name ?? "")))
}
