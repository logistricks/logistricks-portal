/**
 * lib/fx.ts — USD value of one unit of a currency, used ONLY to total a carrier quote whose charge lines are in
 * several currencies (e.g. USD freight + EUR pickup). Indicative defaults; the quotation builder lets the user
 * override any rate per quotation, and the rate used is shown on screen.
 */
export const DEFAULT_USD_PER: Record<string, number> = {
  USD: 1, EUR: 1.08, GBP: 1.27, AED: 0.2723, SAR: 0.2667, JOD: 1.41, KWD: 3.26, QAR: 0.2747, BHD: 2.65, OMR: 2.6,
  EGP: 0.02, TRY: 0.03, CNY: 0.14, INR: 0.012, CHF: 1.12,
}

export type FxOverrides = Record<string, number>

export function usdPer(currency: string, overrides?: FxOverrides | null): number | null {
  const c = currency.toUpperCase()
  const o = overrides?.[c]
  if (typeof o === "number" && o > 0) return o
  return DEFAULT_USD_PER[c] ?? null
}

/** Keep only sane positive numbers from untrusted input. */
export function cleanFx(v: unknown): FxOverrides {
  const out: FxOverrides = {}
  if (v && typeof v === "object") for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    const n = Number(x)
    if (/^[A-Za-z]{3}$/.test(k) && Number.isFinite(n) && n > 0 && n < 100000) out[k.toUpperCase()] = n
  }
  return out
}
