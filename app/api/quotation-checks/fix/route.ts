/**
 * POST /api/quotation-checks/fix { check_id, finding_id }
 * Asks the AI for an exact-text fix for one finding. Kept only if the text it replaces appears exactly once in the quotation
 * and every number in the replacement already exists in the request, the carrier's reply or the quotation. The person then applies it.
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { sessionWithRole } from "@/lib/api-admin"
import { gemini } from "@/lib/trial-gen"
import { contentHash, loadInputs, numbersInInputs, nums, type Suggestion } from "@/lib/quotation-check"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (s.role === "viewer") return NextResponse.json({ error: "Viewers can't change quotations" }, { status: 403 })
  const b = await req.json().catch(() => null)
  if (!b?.check_id || !b?.finding_id) return NextResponse.json({ error: "check_id and finding_id required" }, { status: 400 })
  const admin = adminClient(), code = s.session.clientCode
  const { data: chk } = await admin.from("quotation_checks").select("*").eq("id", b.check_id).ilike("client_code", code).maybeSingle()
  if (!chk) return NextResponse.json({ error: "Check not found" }, { status: 404 })
  const finding = ((chk.findings ?? []) as any[]).find((f) => f.id === b.finding_id)
  if (!finding) return NextResponse.json({ error: "Finding not found" }, { status: 404 })
  const inputs = await loadInputs(admin, code, chk.quotation_id)
  if (!inputs) return NextResponse.json({ error: "Quotation not found" }, { status: 404 })
  const q = inputs.quotation
  if (q.status === "sent") return NextResponse.json({ error: "This quotation was already sent." }, { status: 400 })
  if (chk.content_hash !== contentHash(q)) return NextResponse.json({ error: "The quotation changed since this check. Review it again." }, { status: 409 })

  const subject = String(q.generated_subject ?? ""), body = String(q.generated_body ?? ""), html = String(q.generated_html ?? "")
  const prompt = `You fix one problem in a freight quotation by changing exact text. PROBLEM: ${finding.topic}: ${finding.message}

Return JSON {"quoted": string, "replacement": string, "explanation": string}.
- "quoted" must be copied character for character from one of the sources below and must appear exactly once in it. Keep it as short as possible but unique (include a few neighbouring words if needed). It may include HTML tags when the problem is in the formatted version.
- "replacement" is the corrected text. Do not write any number that is not already in the sources. Do not change prices.
- If the problem cannot be fixed by changing text (for example it needs the template changed, or new information), return empty quoted and replacement and explain in one sentence.

SUBJECT:\n${subject}\n\nEMAIL TEXT:\n${body.slice(0, 8000)}\n\n${html ? `FORMATTED HTML:\n${html.slice(0, 14000)}` : ""}`
  let r: any
  try {
    r = await gemini(prompt, { type: "OBJECT", properties: { quoted: { type: "STRING" }, replacement: { type: "STRING" }, explanation: { type: "STRING" } }, required: ["quoted", "replacement", "explanation"] }, 0)
  } catch { return NextResponse.json({ error: "The AI is not available right now. Try again in a moment." }, { status: 502 }) }
  const find = String(r?.quoted ?? ""), replace = String(r?.replacement ?? "")
  const once = (t: string) => find.length >= 2 && t.split(find).length === 2
  const where = once(body) ? "body" : once(subject) ? "subject" : once(html) ? "html" : null
  const allowed = numbersInInputs(inputs)
  const okNums = nums(replace).every((n) => allowed.has(n) || nums(find).includes(n))
  if (!find || find === replace || !where || !okNums)
    return NextResponse.json({ error: String(r?.explanation || "").trim() || "The AI could not find a safe text change for this. Edit the quotation or its template by hand." }, { status: 422 })
  const sug: Suggestion = { id: `s${((chk.suggestions ?? []) as any[]).length + 1}`, finding_id: finding.id, find, replace, reason: finding.message }
  const next = [...((chk.suggestions ?? []) as Suggestion[]).filter((x) => x.finding_id !== finding.id || x.applied), sug]
  await admin.from("quotation_checks").update({ suggestions: next }).eq("id", chk.id)
  return NextResponse.json({ ok: true, suggestion: sug })
}
