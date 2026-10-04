export type RangeKey = "today" | "week" | "month" | "custom"
export interface DashRange { key: RangeKey; from: number; to: number; label: string }

const d0 = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
const fmt = (t: number, y = false) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(y ? { year: "numeric" } : {}) })

/** Local-time ranges. `to` is exclusive (start of the next day/week/month). */
export function makeRange(key: RangeKey, customFrom?: string, customTo?: string): DashRange {
  const now = new Date()
  if (key === "today") {
    const a = d0(now), b = new Date(a); b.setDate(b.getDate() + 1)
    return { key, from: +a, to: +b, label: "Today" }
  }
  if (key === "week") {
    const a = d0(now); a.setDate(a.getDate() - ((a.getDay() + 6) % 7))
    const b = new Date(a); b.setDate(b.getDate() + 7)
    return { key, from: +a, to: +b, label: `${fmt(+a)} – ${fmt(+b - 1)}` }
  }
  if (key === "month") {
    const a = new Date(now.getFullYear(), now.getMonth(), 1), b = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    return { key, from: +a, to: +b, label: now.toLocaleDateString("en-US", { month: "long", year: "numeric" }) }
  }
  const a = d0(customFrom ? new Date(customFrom + "T00:00:00") : now)
  const b0 = d0(customTo ? new Date(customTo + "T00:00:00") : now)
  const b = new Date(Math.max(+b0, +a)); b.setDate(b.getDate() + 1)
  return { key: "custom", from: +a, to: +b, label: `${fmt(+a, true)} – ${fmt(+b - 1, true)}` }
}

export const money = (n: number | null | undefined) =>
  n == null ? "—" : Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : Math.abs(n) >= 1e4 ? `$${(n / 1e3).toFixed(1)}K` : `$${Math.round(n).toLocaleString("en-US")}`

export const hours = (h: number | null | undefined) =>
  h == null ? "—" : h < 1 ? `${Math.max(1, Math.round(h * 60))}m` : h < 48 ? `${h.toFixed(h < 10 ? 1 : 0)}h` : `${(h / 24).toFixed(1)}d`

export const percent = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n)}%`)
