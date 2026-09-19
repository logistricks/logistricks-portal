/**
 * middleware.ts
 * Verifies the HMAC-signed portal_session cookie on every protected route.
 * Must use Web Crypto API — Edge Runtime doesn't support Node.js crypto.
 */
import { NextResponse, type NextRequest } from "next/server"

const PORTAL_PATHS = /^\/(dashboard|requests|carriers|schedule|analytics|settings)(\/|$)/

async function base64urlDecode(str: string): Promise<Uint8Array> {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/")
  const bin = atob(b64)
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

async function verifySession(
  cookie: string,
): Promise<{ username: string; clientCode: string } | null> {
  try {
    const dotIndex = cookie.lastIndexOf(".")
    if (dotIndex === -1) return null

    const payload = cookie.slice(0, dotIndex)
    const sig = cookie.slice(dotIndex + 1)

    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!secret) return null

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
    if (!valid) return null

    const json = new TextDecoder().decode(await base64urlDecode(payload))
    const data = JSON.parse(json)
    if (!data.username || !data.clientCode || !data.exp) return null
    if (Date.now() > data.exp) return null

    return { username: data.username, clientCode: data.clientCode }
  } catch {
    return null
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (!PORTAL_PATHS.test(pathname)) return NextResponse.next()

  const cookie = request.cookies.get("portal_session")?.value

  if (!cookie) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = "/login"
    return NextResponse.redirect(loginUrl)
  }

  const session = await verifySession(cookie)
  if (!session) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = "/login"
    const res = NextResponse.redirect(loginUrl)
    res.cookies.delete("portal_session")
    return res
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/(dashboard|requests|carriers|schedule|analytics|settings)(.*)"],
}
