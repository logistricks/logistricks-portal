import { NextResponse, type NextRequest } from "next/server"

const PORTAL_PATHS = /^\/(dashboard|requests|carriers|schedule|analytics|settings)(\/|$)/

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (!PORTAL_PATHS.test(pathname)) return NextResponse.next()

  const session = request.cookies.get("portal_session")
  if (!session?.value) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = "/login"
    return NextResponse.redirect(loginUrl)
  }

  try {
    const parsed = JSON.parse(atob(session.value))
    if (!parsed.clientCode || !parsed.username) throw new Error()
  } catch {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = "/login"
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/(dashboard|requests|carriers|schedule|analytics|settings)(.*)"],
}
