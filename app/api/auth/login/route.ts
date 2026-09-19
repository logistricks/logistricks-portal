import { NextResponse } from "next/server"
import { createClient }  from "@supabase/supabase-js"
import { createHash }    from "crypto"

export async function POST(req: Request) {
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

  // 1 — verify credentials against portal_users (service role bypasses RLS)
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

  // 2 — generate a magic-link; auto-create auth.users entry if missing
  async function generateToken(email: string) {
    const { data, error } = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email,
    })
    return { data, error }
  }

  let { data: linkData, error: linkError } = await generateToken(portalUser.auth_email)

  if (linkError) {
    // No auth.users row — create one with a random password (never used for login)
    const { error: createErr } = await adminClient.auth.admin.createUser({
      email:         portalUser.auth_email,
      password:      crypto.randomUUID(),
      email_confirm: true,
    })
    if (createErr) {
      return NextResponse.json(
        { error: "Session creation failed. Contact your administrator." },
        { status: 500 },
      )
    }
    const retry = await generateToken(portalUser.auth_email)
    linkData  = retry.data
    linkError = retry.error
  }

  if (linkError || !linkData?.properties?.hashed_token) {
    return NextResponse.json(
      { error: "Session creation failed. Please try again." },
      { status: 500 },
    )
  }

  // Return hashed_token — client uses verifyOtp({ token_hash }) which works with PKCE
  return NextResponse.json({
    email:      portalUser.auth_email,
    token_hash: linkData.properties.hashed_token,
  })
}
