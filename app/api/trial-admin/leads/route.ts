import { NextResponse, type NextRequest } from "next/server"
import { randomInt } from "crypto"
import { adminClient } from "@/lib/api-session"
import { adminSession } from "@/lib/trial-admin"
import { RETENTION_DAYS, hashPassword } from "@/lib/trial-server"

export const runtime = "nodejs"
const CH = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
const rnd = (n: number) => Array.from({ length: n }, () => CH[randomInt(CH.length)]).join("")
const trialUrl = () => (process.env.TRIAL_URL || "https://try.logistricks.net").replace(/\/+$/, "")


const SECTION_KEYS = ["s1", "s2", "s3", "export", "what", "roi"]
function insights(mine: any[], lr: any[]) {
  const chron = [...mine].reverse()
  const dwell: Record<string, number> = {}
  const count = (type: string, key: string) => {
    const o: Record<string, number> = {}
    for (const e of mine) if (e.type === type && e.meta?.[key]) o[e.meta[key]] = (o[e.meta[key]] || 0) + 1
    return Object.entries(o).sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n }))
  }
  for (const e of mine) if (e.type === "dwell") for (const [k, v] of Object.entries(e.meta?.s ?? {})) dwell[k] = (dwell[k] || 0) + Number(v)
  const looked = ["s1", "s2", "s3", "export"].filter((k) => (dwell[k] || 0) >= 3).length
  const totalSeconds = Object.values(dwell).reduce((a, b) => a + b, 0)
  const top = SECTION_KEYS.map((k) => [k, dwell[k] || 0] as const).sort((a, b) => b[1] - a[1])[0]
  const tries = lr.sort((a, b) => a.try_no - b.try_no).map((r) => {
    const re = chron.filter((e) => e.run_id === r.id)
    const has = (t: string) => re.some((e) => e.type === t)
    const start = re.find((e) => e.type === "try_start"), mk = [...re].reverse().find((e) => e.type === "markup_set")
    return {
      tryNo: r.try_no, mode: r.mode, source: start?.meta?.source ?? null, requestRead: has("request_read"), quoteRead: has("quote_read"),
      markup: mk ? `${mk.meta?.value}${mk.meta?.type === "percent" ? "%" : " flat"}` : null, pdf: has("pdf_downloaded"), excel: has("excel_exported"),
      replyCopied: has("reply_copied"), emailCopied: has("email_copied"), finished: !!r.finished_at, durationMs: r.duration_ms, price: r.final_price, currency: r.currency,
    }
  })
  return {
    visits: mine.filter((e) => e.type === "login").length, failedLogins: mine.filter((e) => e.type === "login_failed").length,
    firstSeen: chron[0]?.created_at ?? null, totalSeconds, dwell, stepsLooked: looked, topSection: top && top[1] > 0 ? top[0] : null,
    triesStarted: tries.length, triesFinished: tries.filter((t) => t.finished).length, tries,
    samples: count("sample_picked", "feature"), files: mine.filter((e) => e.type === "file_dropped").length,
    locked: count("locked_click", "feature"), ctas: count("cta_click", "feature"), tipsOpened: count("tip_open", "feature"), nextClicks: mine.filter((e) => e.type === "next_click").length,
    timeline: mine.filter((e) => e.type !== "dwell").slice(0, 60).map((e) => ({ at: e.created_at, type: e.type, meta: e.meta })),
  }
}

function admin_(req: NextRequest) {
  if (!adminSession(req)) return { err: NextResponse.json({ error: "Please sign in." }, { status: 401 }) }
  return { by: "owner" }
}

export async function GET(req: NextRequest) {
  const g = await admin_(req); if (g.err) return g.err
  const admin = adminClient()
  const [leads, runs, events] = await Promise.all([
    admin.from("trial_leads").select("*").order("created_at", { ascending: false }),
    admin.from("trial_runs").select("id, lead_id, try_no, started_at, finished_at, mode, duration_ms, parse1_ok, parse2_ok, final_price, currency, data_purged_at, last_active_at"),
    admin.from("trial_events").select("id, lead_id, run_id, type, meta, created_at").order("created_at", { ascending: false }).limit(6000),
  ])
  const ev = events.data ?? [], rn = runs.data ?? []
  const signals: Record<string, number> = {}
  const rows = (leads.data ?? []).map((l: any) => {
    const mine = ev.filter((e: any) => e.lead_id === l.id)
    const sig = mine.filter((e: any) => e.type === "locked_click" || e.type === "cta_click")
    for (const e of mine) if (e.type === "locked_click" && e.meta?.feature) signals[e.meta.feature] = (signals[e.meta.feature] || 0) + 1
    const lr = rn.filter((r: any) => r.lead_id === l.id)
    const finished = lr.filter((r: any) => r.finished_at).length
    const hasData = lr.some((r: any) => !r.data_purged_at)
    const status = l.status === "disabled" ? "Disabled" : Date.now() > Date.parse(l.expires_at) ? "Expired" : !l.first_login_at ? "Not opened" : finished >= l.tries_total ? "Finished" : l.tries_used > 0 ? "In progress" : "Active"
    return {
      id: l.id, company: l.company, contact: l.contact_name, code: l.code, triesTotal: l.tries_total, triesUsed: l.tries_used, status,
      expiresAt: l.expires_at, createdAt: l.created_at, lastActive: l.last_active_at, converted: l.converted, notes: l.notes,
      signals: sig.length, hot: finished >= 1 && sig.length >= 3, finishedTries: finished,
      dataDeletedAt: hasData && l.last_active_at ? new Date(Date.parse(l.last_active_at) + RETENTION_DAYS * 86400000).toISOString() : null,
      insights: insights(mine, lr),
      runs: lr.map((r: any) => ({ tryNo: r.try_no, mode: r.mode, finished: !!r.finished_at, durationMs: r.duration_ms, price: r.final_price, currency: r.currency })),
    }
  })
  const names: Record<string, string> = Object.fromEntries((leads.data ?? []).map((l: any) => [l.id, l.company]))
  return NextResponse.json({
    leads: rows, signals: Object.entries(signals).sort((a, b) => b[1] - a[1]).map(([feature, count]) => ({ feature, count })),
    activity: ev.slice(0, 80).map((e: any) => ({ at: e.created_at, lead: names[e.lead_id] ?? "?", type: e.type, meta: e.meta })), retentionDays: RETENTION_DAYS, baseUrl: trialUrl(),
  })
}

export async function POST(req: NextRequest) {
  const g = await admin_(req); if (g.err) return g.err
  const b = await req.json().catch(() => ({}))
  const company = String(b.company ?? "").trim()
  if (!company) return NextResponse.json({ error: "Company is required." }, { status: 400 })
  const contact = String(b.contact ?? "").trim() || null
  const tries = Math.min(Math.max(Number(b.tries) || 2, 1), 10)
  const days = Math.min(Math.max(Number(b.days) || 5, 1), 90)
  const wantCode = String(b.code ?? "").trim().toUpperCase()
  if (wantCode && !/^[A-Z0-9-]{4,20}$/.test(wantCode)) return NextResponse.json({ error: "The code can use letters, numbers and dashes, 4 to 20 characters." }, { status: 400 })
  const wantPw = String(b.password ?? "")
  if (wantPw && (wantPw.length < 6 || wantPw.length > 64)) return NextResponse.json({ error: "The password needs 6 to 64 characters." }, { status: 400 })
  const ini = company.split(/\s+/).map((w) => w[0] ?? "").join("").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3).padEnd(3, "X")
  const admin = adminClient()
  const password = wantPw || rnd(10)
  for (let i = 0; i < 5; i++) {
    const code = wantCode || `${ini}-${rnd(4)}`
    const { data, error } = await admin.from("trial_leads").insert({ company, contact_name: contact, code, password_hash: hashPassword(password), tries_total: tries, expires_at: new Date(Date.now() + days * 86400000).toISOString(), created_by: g.by }).select("id").single()
    if (error?.code === "23505") { if (wantCode) return NextResponse.json({ error: "That code is already in use. Choose another." }, { status: 409 }); continue }
    if (error || !data) return NextResponse.json({ error: error?.message ?? "Could not create the lead." }, { status: 500 })
    const link = `${trialUrl()}/?code=${code}`
    const message = `Subject: A short test of your own request flow\n\nHello ${contact || "there"},\n\nI set up a short trial for ${company}. Drop in a real client email and watch it become a priced quotation.\n\nLink: ${link}\nPassword: ${password}\n\nYou have ${tries} full ${tries === 1 ? "try" : "tries"} and the login is open for ${days} days. Everything you add is deleted ${RETENTION_DAYS} days after your last activity.`
    return NextResponse.json({ id: data.id, code, password, link, message })
  }
  return NextResponse.json({ error: "Could not generate a unique code. Try again." }, { status: 500 })
}
