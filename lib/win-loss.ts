/**
 * lib/win-loss.ts — won / lost results (server and client safe, pure).
 *   Closed  = dismissed (a request status). It is NOT a result and never counts as a win.
 *   Won     = the requester took a quotation. Stages: Won → Booked (with booking ref) → Invoiced → Paid.
 *   Lost    = the requester did not. Reasons: price, transit time, service, …
 *   Profit  = the markup: won price (sell) minus the carrier's price (cost), stored on the request when it was marked won.
 */
export type WonStage = "won" | "booked" | "invoiced" | "paid"
export const WON_STAGES: WonStage[] = ["won", "booked", "invoiced", "paid"]
export const WON_STAGE_LABEL: Record<WonStage, string> = { won: "Won · to book", booked: "Booked", invoiced: "Invoiced", paid: "Paid" }
export const LOST_REASON_LABEL: Record<string, string> = {
  price: "Price", transit_time: "Transit time", service: "Service", no_response: "No response", cargo_cancelled: "Cargo cancelled", other: "Other",
}
type Row = Record<string, any>

export const wonStage = (r: Row): WonStage => (r.paid_at ? "paid" : r.invoiced_at ? "invoiced" : r.booked_at ? "booked" : "won")
const n = (v: unknown) => (v == null || v === "" || isNaN(Number(v)) ? 0 : Number(v))

export interface WinLossSummary {
  won: number; lost: number; winRate: number | null
  revenue: number; cost: number; profit: number; profitMissing: number
  stages: { stage: WonStage; label: string; count: number; revenue: number; profit: number }[]
  /** profit already invoiced / collected */
  profitInvoiced: number; profitPaid: number
  lostReasons: { label: string; value: number }[]
  profitByCarrier: { label: string; value: number }[]
  profitByMode: { label: string; value: number }[]
}

const modeOf = (r: Row) => (r.is_sea ? "Sea" : r.is_air ? "Air" : r.is_land ? "Land" : "Other")

export function summarizeOutcomes(rows: Row[]): WinLossSummary {
  const won = rows.filter((r) => r.outcome === "won"), lost = rows.filter((r) => r.outcome === "lost")
  const stages = WON_STAGES.map((stage) => {
    const xs = won.filter((r) => wonStage(r) === stage)
    return { stage, label: WON_STAGE_LABEL[stage], count: xs.length, revenue: xs.reduce((s, r) => s + n(r.won_sell_usd), 0), profit: xs.reduce((s, r) => s + n(r.won_margin_usd), 0) }
  })
  const by = (key: (r: Row) => string) => {
    const m = new Map<string, number>()
    for (const r of won) { const k = key(r); if (k) m.set(k, (m.get(k) ?? 0) + n(r.won_margin_usd)) }
    return Array.from(m.entries()).map(([label, value]) => ({ label, value: Math.round(value * 100) / 100 })).sort((a, b) => b.value - a.value).slice(0, 8)
  }
  const reasons = new Map<string, number>()
  for (const r of lost) { const k = LOST_REASON_LABEL[String(r.outcome_reason)] ?? "Not stated"; reasons.set(k, (reasons.get(k) ?? 0) + 1) }
  const profit = won.reduce((s, r) => s + n(r.won_margin_usd), 0)
  return {
    won: won.length, lost: lost.length, winRate: won.length + lost.length ? (won.length / (won.length + lost.length)) * 100 : null,
    revenue: won.reduce((s, r) => s + n(r.won_sell_usd), 0), cost: won.reduce((s, r) => s + n(r.won_cost_usd), 0), profit,
    profitMissing: won.filter((r) => r.won_margin_usd == null).length,
    stages,
    profitInvoiced: stages.filter((x) => x.stage === "invoiced" || x.stage === "paid").reduce((s, x) => s + x.profit, 0),
    profitPaid: stages.find((x) => x.stage === "paid")?.profit ?? 0,
    lostReasons: Array.from(reasons.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    profitByCarrier: by((r) => String(r.won_carrier_name ?? "").trim()),
    profitByMode: by(modeOf),
  }
}
