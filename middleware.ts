import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

const PORTAL_PATHS = /^\/(dashboard|requests|carriers|schedule|analytics|settings)(\/|$)/

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Only protect portal routes
  if (!PORTAL_PATHS.test(pathname)) {
    return NextResponse.next()
  }

  const response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = "/login"
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: [
    "/(dashboard|requests|carriers|schedule|analytics|settings)(.*)",
  ],
}
