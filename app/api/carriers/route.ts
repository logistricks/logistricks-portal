/**
 * app/api/carriers/route.ts
 * CRUD for the carriers table — scoped to the caller's client_code via session cookie.
 */

import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createHmac } from "crypto"
import { logActivity } from "@/lib/log-activity"

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
  } catch {
    return null
  }
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

function auth(req: NextRequest): { username: string; clientCode: string } | null {
  const cookie = req.cookies.get("portal_session")?.value
  if (!cookie) return null
  return getSession(cookie)
}

export async function GET(req: NextRequest) {
  const session = auth(req)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await admin()
    .from("carriers")
    .select("*")
    .eq("client_code", session.clientCode)
    .order("carrier_id", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const session = auth(req)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })

  const db = admin()

  const { data: maxRow } = await db
    .from("carriers")
    .select("carrier_id")
    .eq("client_code", session.clientCode)
    .eq("is_cc", false)
    .order("carrier_id", { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextId = (maxRow?.carrier_id ?? 0) + 1

  const { error: mainErr } = await db.from("carriers").insert({
    client_code:  session.clientCode,
    carrier_id:   nextId,
    carrier_name: body.carrier_name,
    person_name:  body.person_name  ?? "",
    role:         body.role         ?? "",
    email:        body.email        ?? "",
    number:       body.number       ?? "",
    is_sea:       body.is_sea       ?? false,
    is_air:       body.is_air       ?? false,
    is_land:      body.is_land      ?? false,
    lang:         body.lang         ?? -1,
    routes:       body.routes       ?? "",
    active:       body.active       ?? true,
    is_cc:        false,
  })
  if (mainErr) return NextResponse.json({ error: mainErr.message }, { status: 500 })

  const ccEmails: string[] = body.cc_emails ?? []
  if (ccEmails.length > 0) {
    const ccRows = ccEmails.map((email: string) => ({
      client_code:  session.clientCode,
      carrier_id:   nextId,
      carrier_name: body.carrier_name,
      person_name:  "",
      role:         "",
      email,
      number:       "",
      is_sea:       false,
      is_air:       false,
      is_land:      false,
      lang:         -1,
      routes:       "",
      active:       true,
      is_cc:        true,
    }))
    const { error: ccErr } = await db.from("carriers").insert(ccRows)
    if (ccErr) return NextResponse.json({ error: ccErr.message }, { status: 500 })
  }

  await logActivity({
    clientCode:  session.clientCode,
    eventType:   "carrier_added",
    actor:       session.username,
    description: `Added carrier "${body.carrier_name}"`,
    meta: { carrier_id: nextId, carrier_name: body.carrier_name },
  })

  return NextResponse.json({ ok: true, carrier_id: nextId }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const session = auth(req)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.carrier_id) return NextResponse.json({ error: "carrier_id required" }, { status: 400 })

  const db       = admin()
  const carrierId: number = body.carrier_id

  const patch: Record<string, unknown> = {}
  const fields = ["carrier_name","person_name","role","email","number","is_sea","is_air","is_land","lang","routes","active"] as const
  for (const f of fields) {
    if (body[f] !== undefined) patch[f] = body[f]
  }

  if (Object.keys(patch).length > 0) {
    const { error } = await db
      .from("carriers")
      .update(patch)
      .eq("client_code", session.clientCode)
      .eq("carrier_id", carrierId)
      .eq("is_cc", false)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (Array.isArray(body.cc_emails)) {
    const ccEmails: string[] = body.cc_emails

    await db
      .from("carriers")
      .delete()
      .eq("client_code", session.clientCode)
      .eq("carrier_id", carrierId)
      .eq("is_cc", true)

    if (ccEmails.length > 0) {
      const carrierName = body.carrier_name ?? ""
      const ccRows = ccEmails.map((email: string) => ({
        client_code:  session.clientCode,
        carrier_id:   carrierId,
        carrier_name: carrierName,
        person_name:  "",
        role:         "",
        email,
        number:       "",
        is_sea:       false,
        is_air:       false,
        is_land:      false,
        lang:         -1,
        routes:       "",
        active:       true,
        is_cc:        true,
      }))
      const { error: ccErr } = await db.from("carriers").insert(ccRows)
      if (ccErr) return NextResponse.json({ error: ccErr.message }, { status: 500 })
    }
  }

  await logActivity({
    clientCode:  session.clientCode,
    eventType:   "carrier_updated",
    actor:       session.username,
    description: `Updated carrier "${body.carrier_name ?? carrierId}"`,
    meta: { carrier_id: carrierId },
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const session = auth(req)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url       = new URL(req.url)
  const carrierId = Number(url.searchParams.get("carrier_id"))
  if (!carrierId) return NextResponse.json({ error: "carrier_id required" }, { status: 400 })

  const db = admin()

  const { data: nameRow } = await db
    .from("carriers")
    .select("carrier_name")
    .eq("client_code", session.clientCode)
    .eq("carrier_id", carrierId)
    .eq("is_cc", false)
    .maybeSingle()

  const { error } = await db
    .from("carriers")
    .delete()
    .eq("client_code", session.clientCode)
    .eq("carrier_id", carrierId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logActivity({
    clientCode:  session.clientCode,
    eventType:   "carrier_deleted",
    actor:       session.username,
    description: `Deleted carrier "${nameRow?.carrier_name ?? carrierId}"`,
    meta: { carrier_id: carrierId },
  })

  return NextResponse.json({ ok: true })
}
