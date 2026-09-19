import { NextResponse } from "next/server"
import { createClient }  from "@supabase/supabase-js"
import { createHash }    from "crypto"

export async function POST(req: Request) {
  // Instantiate inside the handler so env vars are read at request time, not build time
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const { clientCode, username, password } = await req.json()

  if (!clientCode || !username || !password) {
    return NextResponse.json({ error: "Please fill in all fields." }, { status: 400 })
  }

  const passwordHash = createHash("sha256").update(password).digest("hex")

  // 1 — look up portal_users using service role (bypasses RLS)
  const { data: portalUser, error } = await adminClient
    .from("portal_users")
    .select("auth_email, is_active, password_hash")
    .eq("username",    username.trim().toLowerCase())
    .eq("client_code", clientCode.trim().toUpperCase())
    .maybeSingle()

  if (error || !portalUser) {
    return NextResponse.json(
      { error: "No account found for that username and client code." },
      { status: 401 },
    )
  }

  if (!portalUser.is_active) {
    return NextResponse.json(
      { error: "Your account has been deactivated. Contact your administrator." },
      { status: 403 },
    )
  }

  if (!portalUser.password_hash || portalUser.password_hash !== passwordHash) {
    return NextResponse.json(
      { error: "Incorrect password. Please try again." },
      { status: 401 },
    )
  }

  // 2 — generate a magic-link token so the browser gets a real Supabase session
  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type: "magiclink",
    email: portalUser.auth_email,
  })

  if (linkError || !linkData?.properties?.action_link) {
    // No auth.users row yet — auto-create it (random password, never used for login)
    const { error: createErr } = await adminClient.auth.admin.createUser({
      email:         portalUser.auth_email,
      password:      crypto.randomUUID(),
      email_confirm: true,
    })
    if (createErr) {
      return NextResponse.json(
        { error: "Session creation failed. Please contact your administrator." },
        { status: 500 },
      )
    }
    const { data: retry, error: retryErr } = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email: portalUser.auth_email,
    })
    if (retryErr || !retry?.properties?.action_link) {
      return NextResponse.json(
        { error: "Session creation failed. Please try again." },
        { status: 500 },
      )
    }
    const token = new URL(retry.properties.action_link).searchParams.get("token")
    return NextResponse.json({ email: portalUser.auth_email, token })
  }

  const token = new URL(linkData.properties.action_link).searchParams.get("token")
  return NextResponse.json({ email: portalUser.auth_email, token })
}
