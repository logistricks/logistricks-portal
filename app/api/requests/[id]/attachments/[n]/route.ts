/** GET /api/requests/:id/attachments/:n — opens the n-th attachment of one of the signed-in client's requests (short-lived signed link). */
import { NextRequest, NextResponse } from "next/server"
import { getSession, adminClient } from "@/lib/api-session"
import { ATTACHMENT_BUCKET, parseAttachments, storagePath } from "@/lib/attachments"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest, { params }: { params: { id: string; n: string } }) {
  const cookie = req.cookies.get("portal_session")?.value
  const session = cookie ? getSession(cookie) : null
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = adminClient()
  const { data } = await admin.from("freight_requests").select("attachments").eq("id", params.id).eq("client_code", session.clientCode).maybeSingle()
  const file = parseAttachments((data as { attachments?: unknown } | null)?.attachments)[Number(params.n)]
  if (!file) return NextResponse.json({ error: "Attachment not found" }, { status: 404 })

  const path = storagePath(file.url)
  if (!path) return NextResponse.redirect(file.url)
  const { data: signed, error } = await admin.storage.from(ATTACHMENT_BUCKET).createSignedUrl(path, 300, { download: false })
  if (error || !signed?.signedUrl) return NextResponse.json({ error: "The file could not be opened. It may have been removed." }, { status: 404 })
  return NextResponse.redirect(signed.signedUrl)
}
