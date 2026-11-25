/**
 * Password hashing for portal and trial logins: salted scrypt (Node built-in, no dependency).
 * Old accounts hold an unsalted SHA-256 hex digest; those still verify, and the caller re-saves
 * them in the new format after a successful login (verifyPassword returns upgrade: true).
 */
import { createHash, randomBytes, scrypt, timingSafeEqual } from "crypto"
import { promisify } from "util"

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number, opts: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>
const N = 16384, R = 8, P = 1, LEN = 32
const OPTS = { N, r: R, p: P, maxmem: 64 * 1024 * 1024 }

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scryptAsync(password, salt, LEN, OPTS)
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`
}

const equal = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b)

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<{ ok: boolean; upgrade: boolean }> {
  if (!stored) return { ok: false, upgrade: false }
  if (stored.startsWith("scrypt$")) {
    const [, n, r, p, salt, key] = stored.split("$")
    if (!n || !r || !p || !salt || !key) return { ok: false, upgrade: false }
    const want = Buffer.from(key, "base64")
    const got = await scryptAsync(password, Buffer.from(salt, "base64"), want.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 })
    return { ok: equal(got, want), upgrade: false }
  }
  // Legacy: unsalted SHA-256 hex.
  const legacy = createHash("sha256").update(password).digest("hex")
  return { ok: equal(Buffer.from(legacy), Buffer.from(stored.toLowerCase())), upgrade: true }
}

/** Run when the account does not exist, so a wrong username takes as long as a wrong password. */
export async function burnVerify(password: string) { await verifyPassword(password, "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=") }
