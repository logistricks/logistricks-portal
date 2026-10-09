/**
 * middleware.ts
 * Verifies the HMAC-signed portal_session cookie on every protected route.
 * Must use Web Crypto API — Edge Runtime doesn't support Node.js crypto.
 */
import { NextResponse, type NextRequest } from "next/server"

const PORTAL_PATHS = /^\/(dashboard|requests|carriers|schedule|analytics|settings|trial-leads)(\/|$)/

async function base64urlDecode(str: string): Promise<Uint8Array> {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/")
  const bin = atob(b64)
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

type Verdict = { ok: true } | { ok: false; reason: string }

async function verifySession(cookie: string): Promise<Verdict> {
  try {
    const dotIndex = cookie.lastIndexOf(".")
    if (dotIndex === -1) return { ok: false, reason: "malformed" }

    const payload = cookie.slice(0, dotIndex)
    const sig = cookie.slice(dotIndex + 1)

    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!secret) return { ok: false, reason: "no-secret" }

    const enc = new TextEncoder()
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    )

    const sigBytes = await base64urlDecode(sig)
    const valid = await crypto.subtle.verify("HMAC", key, sigBytes, enc.encode(payload))
    if (!valid) return { ok: false, reason: "bad-signature" }

    const json = new TextDecoder().decode(await base64urlDecode(payload))
    const data = JSON.parse(json)
    if (!data.username || !data.clientCode || !data.exp) return { ok: false, reason: "incomplete" }
    if (Date.now() > data.exp) return { ok: false, reason: "expired" }

    return { ok: true }
  } catch {
    return { ok: false, reason: "error" }
  }
}

/** try.logistricks.com serves only the lead trial page and its own API. Everything else on that host is closed. */
function trialHost(request: NextRequest): boolean {
  const host = (request.headers.get("host") || "").toLowerCase()
  const want = (process.env.TRIAL_HOST || "").toLowerCase()
  return host.startsWith("try.") || (!!want && host === want)
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (trialHost(request)) {
    if (pathname === "/") return NextResponse.rewrite(new URL("/trial", request.url))
    if (pathname.startsWith("/api/trial/")) return NextResponse.next()
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.redirect(new URL("/", request.url))
  }
  if (!PORTAL_PATHS.test(pathname)) return NextResponse.next()

  const cookie = request.cookies.get("portal_session")?.value

  if (!cookie) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = "/login"
    loginUrl.search = "?why=no-cookie"
    return NextResponse.redirect(loginUrl)
  }

  const session = await verifySession(cookie)
  if (!session.ok) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = "/login"
    loginUrl.search = `?why=${session.reason}`
    const res = NextResponse.redirect(loginUrl)
    res.cookies.delete("portal_session")
    return res
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
