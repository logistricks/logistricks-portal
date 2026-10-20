import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { adminSession } from "@/lib/trial-admin"
import { DEFAULT_PROMPTS, aiConfigured, PROMPT_KEYS, PROMPT_META, loadPrompts, type PromptKey } from "@/lib/trial-gen"

export const runtime = "nodejs"
const isKey = (k: unknown): k is PromptKey => (PROMPT_KEYS as readonly string[]).includes(String(k))

export async function GET(req: NextRequest) {
  if (!adminSession(req)) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  const cur = await loadPrompts(adminClient())
  return NextResponse.json({
    configured: aiConfigured(),
    prompts: PROMPT_KEYS.map((k) => ({ key: k, ...PROMPT_META[k], body: cur[k].body, custom: cur[k].custom, default: DEFAULT_PROMPTS[k] })),
  })
}
export async function PUT(req: NextRequest) {
  if (!adminSession(req)) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  if (!isKey(b.key)) return NextResponse.json({ error: "Unknown prompt" }, { status: 400 })
  const body = String(b.body ?? "").trim()
  if (body.length < 40 || body.length > 8000) return NextResponse.json({ error: "A prompt needs between 40 and 8000 characters." }, { status: 400 })
  const { error } = await adminClient().from("trial_prompts").upsert({ key: b.key, body, updated_at: new Date().toISOString() })
  if (error) return NextResponse.json({ error: "Could not save. Has migration 067 been run?" }, { status: 500 })
  return NextResponse.json({ ok: true })
}
export async function DELETE(req: NextRequest) {
  if (!adminSession(req)) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  const key = req.nextUrl.searchParams.get("key")
  if (!isKey(key)) return NextResponse.json({ error: "Unknown prompt" }, { status: 400 })
  await adminClient().from("trial_prompts").delete().eq("key", key)
  return NextResponse.json({ ok: true })
}
