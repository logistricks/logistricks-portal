/** Exact elapsed time: "1h 02m 35s", "3d 4h 05m 09s", "42s". Never rounded to hours. */
export function fmtDuration(ms: number): string {
  if (!Number.isFinite(ms)) return ""
  const neg = ms < 0
  let s = Math.floor(Math.abs(ms) / 1000)
  const d = Math.floor(s / 86400); s -= d * 86400
  const h = Math.floor(s / 3600);  s -= h * 3600
  const m = Math.floor(s / 60);    s -= m * 60
  const p2 = (n: number) => String(n).padStart(2, "0")
  const out = d ? `${d}d ${h}h ${p2(m)}m ${p2(s)}s` : h ? `${h}h ${p2(m)}m ${p2(s)}s` : m ? `${m}m ${p2(s)}s` : `${s}s`
  return neg ? `-${out}` : out
}

/** "07 Oct 2026, 12:34:56" in the viewer's local time. */
export function fmtDateTimeSec(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
}
