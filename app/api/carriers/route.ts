/**
 * app/api/carriers/route.ts
 * CRUD for the carriers table — scoped to the caller's client_code via session cookie.
 */
import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createHmac } from "crypto"
import type { Carrier, CarrierRow } from "@/lib/portal-data"

// ── Session helper ─────────────────────────────────────────────────────────────
function getSession(cookie: string): { username: string; clientCode: string } | null {
  try {
    const dotIndex = cookie.lastIndexOf(".")
    if (dotIndex === -1) return null
    const payload  = cookie.slice(0, dotIndex)
    const sig      = cookie.slice(dotIndex + 1)
    const expected = createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY!)
      .update(payload).digest("base64url")
    if (expected !== sig) return null
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
    if (!data.username || !data.clientCode || !data.exp) return null
    if (Date.now() > data.exp) return null
    return { username: data.username, clientCode: data.clientCode }
  } catch { return null }
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

function groupRows(rows: CarrierRow[]): Carrier[] {
  const map = new Map<number, Carrier>()
  for (const row of rows) {
    if (!row.is_cc) {
      map.set(row.carrier_id, {
        row_id: row.id, carrier_id: row.carrier_id, carrier_name: row.carrier_name,
        person_name: row.person_name, role: row.role, email: row.email, number: row.number,
        is_sea: row.is_sea, is_air: row.is_air, is_land: row.is_land,
        lang: row.lang, routes: row.routes, active: row.active, cc_emails: [],
      })
    }
  }
  for (const row of rows) {
    if (row.is_cc && row.email) {
      map.get(row.carrier_id)?.cc_emails.push(row.email)
    }
  }
  return Array.from(map.values())
}

function auth(req: NextRequest) {
  const cookie = req.cookies.get("portal_session")?.value
  if (!cookie) return null
  return getSession(cookie)
}

// ── GET — list ─────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = auth(req)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await admin()
    .from("carriers").select("*")
    .eq("client_code", session.clientCode)
    .order("carrier_id", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(groupRows((data ?? []) as CarrierRow[]))
}

// ── POST — create or update ────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = auth(req)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { carrier, ccEmails = [] }: { carrier: Carrier & { row_id: number }; ccEmails: string[] } = await req.json()
  const db = admin()
  const cc = session.clientCode

  if (carrier.row_id) {
    // UPDATE main row
    const { error } = await db.from("carriers").update({
      carrier_name: carrier.carrier_name, person_name: carrier.person_name,
      role: carrier.role, email: carrier.email, number: carrier.number,
      is_sea: carrier.is_sea, is_air: carrier.is_air, is_land: carrier.is_land,
      lang: carrier.lang, routes: carrier.routes, active: carrier.active,
    }).eq("id", carrier.row_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Re-sync CC rows
    await db.from("carriers").delete().eq("client_code", cc).eq("carrier_id", carrier.carrier_id).eq("is_cc", true)
    if (ccEmails.length > 0) {
      const { error: ccErr } = await db.from("carriers").insert(
        ccEmails.map((e) => ({
          client_code: cc, carrier_id: carrier.carrier_id, carrier_name: carrier.carrier_name,
          email: e, is_cc: true, active: carrier.active,
          is_sea: carrier.is_sea, is_air: carrier.is_air, is_land: carrier.is_land, lang: carrier.lang,
        }))
      )
      if (ccErr) return NextResponse.json({ error: ccErr.message }, { status: 500 })
    }
  } else {
    // INSERT
    const { data: maxRow } = await db.from("carriers").select("carrier_id")
      .eq("client_code", cc).order("carrier_id", { ascending: false }).limit(1).maybeSingle()
    const nextId = (maxRow?.carrier_id ?? 0) + 1

    const { error } = await db.from("carriers").insert({
      client_code: cc, carrier_id: nextId, carrier_name: carrier.carrier_name,
      person_name: carrier.person_name, role: carrier.role, email: carrier.email,
      number: carrier.number, is_sea: carrier.is_sea, is_air: carrier.is_air,
      is_land: carrier.is_land, lang: carrier.lang, routes: carrier.routes,
      is_cc: false, active: carrier.active,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (ccEmails.length > 0) {
      const { error: ccErr } = await db.from("carriers").insert(
        ccEmails.map((e) => ({
          client_code: cc, carrier_id: nextId, carrier_name: carrier.carrier_name,
          email: e, is_cc: true, active: carrier.active,
          is_sea: carrier.is_sea, is_air: carrier.is_air, is_land: carrier.is_land, lang: carrier.lang,
        }))
      )
      if (ccErr) return NextResponse.json({ error: ccErr.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}

// ── PATCH — toggle active ──────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const session = auth(req)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { row_id, active }: { row_id: number; active: boolean } = await req.json()
  const { error } = await admin().from("carriers").update({ active })
    .eq("id", row_id).eq("client_code", session.clientCode)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// ── DELETE — remove carrier and all its rows ───────────────────────────────────
export async function DELETE(req: NextRequest) {
  const session = auth(req)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { carrier_id }: { carrier_id: number } = await req.json()
  const { error } = await admin().from("carriers").delete()
    .eq("client_code", session.clientCode).eq("carrier_id", carrier_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
