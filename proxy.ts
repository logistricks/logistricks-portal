import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export async function proxy(req: NextRequest) {
  let res = NextResponse.next({ request: req })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            req.cookies.set(name, value)
          )
          res = NextResponse.next({ request: req })
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = req.nextUrl

  const isPortalRoute =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/requests") ||
    pathname.startsWith("/carriers") ||
    pathname.startsWith("/templates") ||
    pathname.startsWith("/activity") ||
    pathname.startsWith("/settings")

  if (isPortalRoute && !user) {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  if (pathname === "/login" && user) {
    return NextResponse.redirect(new URL("/dashboard", req.url))
  }

  return res
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/requests/:path*",
    "/carriers/:path*",
    "/templates/:path*",
    "/activity/:path*",
    "/settings/:path*",
    "/login",
  ],
}
