/** Security regression tests. Run: npm run test:security (no network or database needed). */
import assert from "node:assert/strict"
import { createHash, createHmac } from "node:crypto"
import { burnVerify, hashPassword, verifyPassword } from "../lib/password"
import { safeEqual, sessionSecret } from "../lib/session-secret"
import { blockedHost, isPrivateIp } from "../lib/net-guard"
import { clearFailures, failureCount, recordFailure } from "../lib/rate-limit"

let failed = 0
async function t(name: string, fn: () => Promise<void> | void) {
  try { await fn(); console.log("ok   -", name) } catch (e) { failed++; console.log("FAIL -", name, "\n      ", (e as Error).message) }
}

async function main() {
  await t("hashPassword is salted: same password gives different hashes", async () => {
    const a = await hashPassword("correct horse"), b = await hashPassword("correct horse")
    assert.notEqual(a, b); assert.match(a, /^scrypt\$/)
  })
  await t("verifyPassword accepts the right password and rejects a wrong one", async () => {
    const h = await hashPassword("s3cret-pass")
    assert.equal((await verifyPassword("s3cret-pass", h)).ok, true)
    assert.equal((await verifyPassword("s3cret-pasS", h)).ok, false)
    assert.equal((await verifyPassword("", h)).ok, false)
  })
  await t("old unsalted SHA-256 hashes still verify and are flagged for upgrade", async () => {
    const legacy = createHash("sha256").update("old-pass").digest("hex")
    const r = await verifyPassword("old-pass", legacy)
    assert.deepEqual(r, { ok: true, upgrade: true })
    assert.equal((await verifyPassword("nope", legacy)).ok, false)
  })
  await t("missing or malformed stored hash never verifies", async () => {
    for (const bad of [null, undefined, "", "scrypt$", "scrypt$1$2$3$x", "zzz"]) assert.equal((await verifyPassword("x", bad as any)).ok, false)
    await burnVerify("x")
  })
  await t("safeEqual compares strings in constant time and rejects length or content differences", () => {
    assert.equal(safeEqual("abc", "abc"), true)
    assert.equal(safeEqual("abc", "abd"), false)
    assert.equal(safeEqual("abc", "abcd"), false)
    assert.equal(safeEqual("", ""), true)
  })
  await t("sessionSecret prefers SESSION_SECRET over the service-role key", () => {
    const keep = { s: process.env.SESSION_SECRET, k: process.env.SUPABASE_SERVICE_ROLE_KEY }
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key"; delete process.env.SESSION_SECRET
    assert.equal(sessionSecret(), "service-key")
    process.env.SESSION_SECRET = "own-secret"
    assert.equal(sessionSecret(), "own-secret")
    process.env.SESSION_SECRET = keep.s as any; process.env.SUPABASE_SERVICE_ROLE_KEY = keep.k as any
    if (keep.s === undefined) delete process.env.SESSION_SECRET
  })
  await t("getSession rejects tampered, expired, foreign-key and incomplete cookies", async () => {
    process.env.SESSION_SECRET = "unit-test-secret"
    const { getSession } = await import("../lib/api-session")
    const sign = (d: object, key = "unit-test-secret") => { const p = Buffer.from(JSON.stringify(d)).toString("base64url"); return `${p}.${createHmac("sha256", key).update(p).digest("base64url")}` }
    const good = { username: "a", clientCode: "ACME", userId: "u1", exp: Date.now() + 60_000 }
    assert.equal(getSession(sign(good))?.clientCode, "ACME")
    assert.equal(getSession(sign(good, "other-key")), null)                       // signed with another key
    assert.equal(getSession(sign({ ...good, exp: Date.now() - 1 })), null)         // expired
    assert.equal(getSession(sign({ ...good, userId: undefined })), null)            // no user id
    const c = sign(good); assert.equal(getSession(c.slice(0, -2) + "xx"), null)     // flipped signature
    const [p, s] = c.split("."); const forged = Buffer.from(JSON.stringify({ ...good, clientCode: "OTHER" })).toString("base64url")
    assert.equal(getSession(`${forged}.${s}`), null); void p                        // payload swapped, same signature
  })
  await t("login lockout counts failures per key and clears on success", async () => {
    const db = { from: () => { throw new Error("no table") } } as any              // forces the in-memory fallback
    const key = "login:test:user"
    for (let i = 0; i < 3; i++) await recordFailure(db, key)
    assert.equal(await failureCount(db, key, 60_000), 3)
    assert.equal(await failureCount(db, "login:test:other", 60_000), 0)
    await clearFailures(db, key)
    assert.equal(await failureCount(db, key, 60_000), 0)
  })
  await t("net-guard blocks loopback, private, metadata and bad host names", async () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.0.5", "172.16.0.1", "169.254.169.254", "::1", "fd00::1", "::ffff:10.0.0.1", "0.0.0.0"]) assert.equal(isPrivateIp(ip), true, ip)
    for (const ip of ["8.8.8.8", "1.1.1.1"]) assert.equal(isPrivateIp(ip), false, ip)
    for (const h of ["localhost", "127.0.0.1", "169.254.169.254", "foo.internal", "a b", "", "x@y"]) assert.ok(await blockedHost(h), h)
  })
  if (failed) { console.log(`\n${failed} test(s) failed`); process.exit(1) }
  console.log("\nall security tests passed")
}
main()
