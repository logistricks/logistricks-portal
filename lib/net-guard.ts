/**
 * lib/net-guard.ts (server only) — stops user-supplied mail hosts from pointing the server at internal systems (SSRF).
 * A host is refused when it is, or resolves to, a loopback, private, link-local (cloud metadata) or other non-public address.
 */
import { lookup } from "node:dns/promises"
import { isIP } from "node:net"

function privateV4(ip: string) {
  const [a, b] = ip.split(".").map(Number)
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224
}
export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip)
  if (v === 4) return privateV4(ip)
  if (v === 6) {
    const x = ip.toLowerCase()
    if (x === "::" || x === "::1" || x.startsWith("fe8") || x.startsWith("fe9") || x.startsWith("fea") || x.startsWith("feb") || x.startsWith("fc") || x.startsWith("fd")) return true
    const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(x)
    return m ? privateV4(m[1]) : false
  }
  return true
}

/** Returns an error message when the host must not be contacted, otherwise null. */
export async function blockedHost(host: string): Promise<string | null> {
  const h = String(host ?? "").trim().toLowerCase()
  if (!h || h.length > 253 || /[\s/@#?]/.test(h)) return "That host name is not valid."
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return "That host is not allowed."
  try {
    const addrs = isIP(h) ? [{ address: h }] : await lookup(h, { all: true })
    if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) return "That host is not allowed (it must be a public mail server)."
  } catch { return "Host not found. Check the host name." }
  return null
}
