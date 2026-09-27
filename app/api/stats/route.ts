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
    const sig     = cookie.slice(dotIndex + 1)
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
    .select("id, status, source, received_at")
    .eq("client_code", session.clientCode)
    .order("received_at", { ascending: false })

  const empty = {
    total: 0, email: 0, whatsapp: 0,
    pending: 0, sentToCarrier: 0, quoted: 0, active: 0,
    todayCount: 0, todayDelta: "+0 from yesterday",
    dailyCounts: [] as { date: string; shortDate: string; count: number; isToday: boolean }[],
    monthlyCounts: [] as { month: string; shipments: number; delivered: number; isCurrent: boolean }[],
    weekTotal: 0,
    pendingRfqCount: 0,
    deliveredThisMonth: 0,
    revenueThisMonth: 0,
    revenueThisMonthLabel: "$0",
  }

  if (error || !data) {
    console.error("[api/stats]", error?.message)
    return NextResponse.json(empty)
  }

  // Pending carrier RFQ count
  const { count: pendingRfqCount } = await admin
    .from("carrier_quote_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "sent")

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  const todayCount     = data.filter((r) => new Date(r.received_at) >= today).length
  const yesterdayCount = data.filter((r) => {
    const d = new Date(r.received_at)
    return d >= yesterday && d < today
  }).length
  const delta     = todayCount - yesterdayCount
  const todayDelta = delta >= 0 ? `+${delta} from yesterday` : `${delta} from yesterday`

  // Last 7 days daily counts (index 0 = 6 days ago, index 6 = today)
  const dailyCounts = Array.from({ length: 7 }, (_, i) => {
    const start = new Date(today)
    start.setDate(today.getDate() - (6 - i))
    const end = new Date(start)
    end.setDate(start.getDate() + 1)

    const count = data.filter((r) => {
      const t = new Date(r.received_at)
      return t >= start && t < end
    }).length

    const isToday = i === 6
    const date = isToday
      ? "Today"
      : start.toLocaleDateString("en-GB", { weekday: "short" })

    const shortDate = start.toLocaleDateString("en-GB", { day: "numeric", month: "short" })

    return { date, shortDate, count, isToday }
  })

  const weekTotal = dailyCounts.reduce((sum, d) => sum + d.count, 0)

  // Last 6 months: Shipments received vs. Delivered (status = 'Closed') per month.
  // "Delivered" has no dedicated tracking field — this counts requests received
  // in that month whose current status is 'Closed', the closest proxy available.
  const monthlyCounts = Array.from({ length: 6 }, (_, i) => {
    const monthStart = new Date(today.getFullYear(), today.getMonth() - (5 - i), 1)
    const monthEnd   = new Date(today.getFullYear(), today.getMonth() - (5 - i) + 1, 1)
    const inMonth = data.filter((r) => {
      const t = new Date(r.received_at)
      return t >= monthStart && t < monthEnd
    })
    return {
      month: monthStart.toLocaleDateString("en-US", { month: "short" }),
      shipments: inMonth.length,
      delivered: inMonth.filter((r) => r.status === "Closed").length,
      isCurrent: i === 5,
    }
  })

  // "Delivered This Month" — requests received this month, now Closed.
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const closedThisMonthIds = data
    .filter((r) => {
      const t = new Date(r.received_at)
      return t >= monthStart && r.status === "Closed"
    })
    .map((r) => r.id)

  let revenueThisMonth = 0
  if (closedThisMonthIds.length > 0) {
    // "Revenue" has no dedicated tracking field — this sums the lowest carrier
    // quote per closed request as a cost proxy (not true billed revenue/margin).
    const { data: quotes } = await admin
      .from("carrier_quotes")
      .select("freight_request_id, rate_usd")
      .in("freight_request_id", closedThisMonthIds)

    if (quotes) {
      const minByRequest = new Map<string, number>()
      for (const q of quotes) {
        if (q.rate_usd == null) continue
        const cur = minByRequest.get(q.freight_request_id)
        if (cur === undefined || q.rate_usd < cur) minByRequest.set(q.freight_request_id, q.rate_usd)
      }
      revenueThisMonth = Array.from(minByRequest.values()).reduce((s, v) => s + v, 0)
    }
  }

  const revenueThisMonthLabel =
    revenueThisMonth >= 1_000_000
      ? `$${(revenueThisMonth / 1_000_000).toFixed(2)}M`
      : revenueThisMonth >= 1_000
        ? `$${(revenueThisMonth / 1_000).toFixed(1)}K`
        : `$${revenueThisMonth.toFixed(0)}`

  return NextResponse.json({
    total:         data.length,
    email:         data.filter((r) => r.source === "Email").length,
    whatsapp:      data.filter((r) => r.source === "WhatsApp").length,
    pending:       data.filter((r) => r.status === "Pending").length,
    sentToCarrier: data.filter((r) => r.status === "Sent to Carrier").length,
    quoted:        data.filter((r) => r.status === "Quoted").length,
    active:        data.filter((r) => r.status !== "Closed").length,
    todayCount,
    todayDelta,
    dailyCounts,
    monthlyCounts,
    weekTotal,
    pendingRfqCount: pendingRfqCount ?? 0,
    deliveredThisMonth: closedThisMonthIds.length,
    revenueThisMonth,
    revenueThisMonthLabel,
  })
}
