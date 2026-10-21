/**
 * POST /api/quotation-checks/accept { check_id, suggestion_ids: string[] }
 * Applies the chosen suggested fixes (exact text replacements) to the quotation. The check keeps its remaining findings and stays current
 * (it now belongs to the corrected text), so accepting a fix does not use another check.
 */
import { NextResponse, type NextRequest } from "next/server"
import { adminClient } from "@/lib/api-session"
import { sessionWithRole } from "@/lib/api-admin"
import { contentHash, type Suggestion } from "@/lib/quotation-check"
import { logActivity } from "@/lib/log-activity"

export const dynamic = "force-dynamic"
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

export async function POST(req: NextRequest) {
  const s = await sessionWithRole(req)
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (s.role === "viewer") return NextResponse.json({ error: "Viewers can't change quotations" }, { status: 403 })
  const b = await req.json().catch(() => null)
  const ids = Array.isArray(b?.suggestion_ids) ? (b.suggestion_ids as unknown[]).map(String) : []
  if (!b?.check_id || !ids.length) return NextResponse.json({ error: "check_id and suggestion_ids required" }, { status: 400 })
  const admin = adminClient(), code = s.session.clientCode
  const { data: chk } = await admin.from("quotation_checks").select("*").eq("id", b.check_id).ilike("client_code", code).maybeSingle()
  if (!chk) return NextResponse.json({ error: "Check not found" }, { status: 404 })
  const { data: q } = await admin.from("quotations").select("*").eq("id", chk.quotation_id).ilike("client_code", code).maybeSingle()
  if (!q) return NextResponse.json({ error: "Quotation not found" }, { status: 404 })
  if (q.status === "sent") return NextResponse.json({ error: "This quotation was already sent." }, { status: 400 })
  if (chk.content_hash !== contentHash(q)) return NextResponse.json({ error: "The quotation changed since this check. Run the check again." }, { status: 409 })

  let body = String(q.generated_body ?? ""), subject = String(q.generated_subject ?? ""), html = q.generated_html ? String(q.generated_html) : ""
  const sug = (chk.suggestions ?? []) as Suggestion[]
  const done: string[] = [], skipped: string[] = []
  let htmlMissed = false
  for (const id of ids) {
    const x = sug.find((y) => y.id === id)
    if (!x || x.applied) continue
    const inBody = body.split(x.find).length === 2
    const inSubject = subject.includes(x.find)
    const inHtml = !!html && (html.split(x.find).length === 2 || html.includes(esc(x.find)))
    if (!inBody && !inSubject && !inHtml) { skipped.push(id); continue }
    if (inBody) body = body.replace(x.find, () => x.replace)
    else if (inSubject) subject = subject.replace(x.find, () => x.replace)
    if (html) {
      if (!inBody && !inSubject && !html.includes(x.find) && !html.includes(esc(x.find))) htmlMissed = true
      else if (html.includes(x.find)) html = html.replace(x.find, () => x.replace)
      else if (html.includes(esc(x.find))) html = html.replace(esc(x.find), () => esc(x.replace))
      else htmlMissed = true
    }
    done.push(id)
  }
  if (!done.length) return NextResponse.json({ error: "None of those fixes could be applied (the text is no longer there)." }, { status: 409 })
  const patch: Record<string, unknown> = { generated_body: body, generated_subject: subject }
  if (html) patch.generated_html = html
  const { error } = await admin.from("quotations").update(patch).eq("id", q.id).ilike("client_code", code)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const next = sug.map((x) => (done.includes(x.id) ? { ...x, applied: true } : x))
  const hash = contentHash({ ...q, ...patch })
  const appliedFindings = new Set(next.filter((x) => x.applied).map((x) => x.finding_id))
  const remaining = ((chk.findings ?? []) as { id: string; severity: string }[]).filter((f) => !appliedFindings.has(f.id))
  const verdict = remaining.some((f) => f.severity === "error") ? "problems" : remaining.some((f) => f.severity === "warning") ? "warnings" : "ok"
  await admin.from("quotation_checks").update({ suggestions: next, findings: (chk.findings as any[]).map((f) => (appliedFindings.has(f.id) ? { ...f, resolved: true } : f)), content_hash: hash, verdict }).eq("id", chk.id)
  await logActivity({ clientCode: code, eventType: "quotation_check_fix", actor: s.session.username, requestId: q.freight_request_id, description: `Applied ${done.length} suggested fix${done.length > 1 ? "es" : ""} to quotation ${q.quotation_number ?? q.id}`, meta: { quotation_id: q.id, check_id: chk.id, fixes: done } })
  return NextResponse.json({ ok: true, applied: done, skipped, html_not_updated: htmlMissed, quotation: { ...q, ...patch } })
}
