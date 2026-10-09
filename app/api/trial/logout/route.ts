import { NextResponse } from "next/server"
import { TRIAL_COOKIE } from "@/lib/trial-server"

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.delete(TRIAL_COOKIE)
  return res
}
