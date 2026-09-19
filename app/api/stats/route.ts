/**
 * app/api/stats/route.ts
 *
 * Returns dashboard stats for the clientCode in the session cookie.
 * Service role key is used server-side — anon key cannot query.
 */
import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createHmac } from "crypto"

function getSession(cookie: string): { username: string; clientCode: string } | null {
  try {
    const dotIndex = cookie.lastIndexOf(".")
    if (dotIndex === -1) return null
    const payload = cookie.slice(0, dotIndex)
    const sig = cookie.slice(dotIndex + 1)
    const expected = createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY!)
      .update(payload)
      .digest("base64url")
    if (expected !== sig) return null
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
    if (!data.username || !data.clientCode || !data.exp) return null
    if (Date.now() > data.exp) return null
    return { username: data.username, clientCode: data.clientCode }
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const sessionCookie = req.cookies.get("portal_session")?.value
  if (!sessionCookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const session = getSession(sessionCookie)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const { data, error } = await admin
    .from("freight_requests")
    .select("status, source, received_at")
    .eq("client_code", session.clientCode)
    .order("received_at", { ascending: false })

  if (error || !data) {
    console.error("[api/stats]", error?.message)
    return NextResponse.json({
      total: 0, email: 0, whatsapp: 0,
      pending: 0, sentToCarrier: 0, quoted: 0,
      todayCount: 0, todayDelta: "+0 from yesterday",
    })
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  const todayCount     = data.filter((r) => new Date(r.received_at) >= today).length
  const yesterdayCount = data.filter((r) => {
    const d = new Date(r.received_at)
    return d >= yesterday && d < today
  }).length
  const delta    = todayCount - yesterdayCount
  const todayDelta = delta >= 0 ? `+${delta} from yesterday` : `${delta} from yesterday`

  return NextResponse.json({
    total:         data.length,
    email:         data.filter((r) => r.source === "Email").length,
    whatsapp:      data.filter((r) => r.source === "WhatsApp").length,
    pending:       data.filter((r) => r.status === "Pending").length,
    sentToCarrier: data.filter((r) => r.status === "Sent to Carrier").length,
    quoted:        data.filter((r) => r.status === "Quoted").length,
    todayCount,
    todayDelta,
  })
}
