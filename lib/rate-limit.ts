/**
 * Login throttling. Failed attempts are counted per key (account and IP) over a window.
 * Counts live in the auth_attempts table (migration 078) so they hold across serverless instances; if that table
 * does not exist yet, an in-memory counter on the current instance is used instead (weaker, but still slows guessing).
 */
type Admin = { from: (t: string) => any }
const memory = new Map<string, number[]>()

function memCount(key: string, windowMs: number) {
  const now = Date.now()
  const list = (memory.get(key) ?? []).filter((t) => now - t < windowMs)
  memory.set(key, list)
  return list.length
}

export async function failureCount(db: Admin, key: string, windowMs: number): Promise<number> {
  const mem = memCount(key, windowMs)
  try {
    const { count, error } = await db.from("auth_attempts").select("id", { count: "exact", head: true }).eq("key", key).gte("at", new Date(Date.now() - windowMs).toISOString())
    if (error) return mem
    return Math.max(count ?? 0, mem)
  } catch { return mem }
}

export async function recordFailure(db: Admin, key: string) {
  memory.set(key, [...(memory.get(key) ?? []), Date.now()])
  try { await db.from("auth_attempts").insert({ key }) } catch { /* table not created yet */ }
}

export async function clearFailures(db: Admin, key: string) {
  memory.delete(key)
  try { await db.from("auth_attempts").delete().eq("key", key) } catch { /* ignore */ }
}

export function clientIp(req: Request): string {
  const f = req.headers.get("x-forwarded-for")
  return (f ? f.split(",")[0] : req.headers.get("x-real-ip") ?? "unknown").trim().slice(0, 64)
}
