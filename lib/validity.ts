/** A validity date (YYYY-MM-DD, valid THROUGH that day) that is before today is expired. Works in browser and server. */
export function isExpiredDate(d: string | null | undefined): boolean {
  if (!d) return false
  const s = String(d).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const t = new Date()
  const p = (n: number) => String(n).padStart(2, "0")
  return s < `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`
}
