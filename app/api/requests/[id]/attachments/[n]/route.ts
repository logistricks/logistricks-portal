/**
 * GET /api/requests/:id/attachments/:n — opens the n-th attachment of one of the signed-in client's requests.
 *
 * Small files are streamed through the portal so the browser can show them inline (a PDF or image from the storage
 * domain itself opens as a blank page, because storage serves files with a sandboxing header). Files too large to
 * pass through the portal are handed over as a normal download via a short-lived signed link.
 */
import { NextRequest, NextResponse } from "next/server"
import { getSession, adminClient } from "@/lib/api-session"
import { ATTACHMENT_BUCKET, parseAttachments, storagePath } from "@/lib/attachments"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
const INLINE_MAX = 4 * 1024 * 1024 // stay under the serverless response limit
const INLINE_OK = /^(application\/pdf|image\/(png|jpe?g|gif|webp)|text\/plain)$/i

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; n: string }> }) {
  const { id, n } = await params
  const cookie = req.cookies.get("portal_session")?.value
  const session = cookie ? getSession(cookie) : null
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = adminClient()
  const { data } = await admin.from("freight_requests").select("attachments").eq("id", id).eq("client_code", session.clientCode).maybeSingle()
  const file = parseAttachments((data as { attachments?: unknown } | null)?.attachments)[Number(n)]
  if (!file) return NextResponse.json({ error: "Attachment not found" }, { status: 404 })

  const path = storagePath(file.url)
  if (!path) return NextResponse.redirect(file.url)
  const name = file.filename.replace(/[\r\n"]/g, "_")

  const { data: blob, error } = await admin.storage.from(ATTACHMENT_BUCKET).download(path)
  if (error || !blob) return NextResponse.json({ error: "The file could not be opened. It may have been removed." }, { status: 404 })
  if (blob.size === 0) return NextResponse.json({ error: "This file was saved empty. Ask the sender to send it again." }, { status: 404 })

  const type = file.mimeType || blob.type || "application/octet-stream"
  let bytes = Buffer.from(await blob.arrayBuffer())
  // A file that was uploaded as a multipart form body is stored with the form wrapper around it. Unwrap it.
  if (bytes.subarray(0, 2).toString("latin1") === "--") {
    const head = bytes.subarray(0, Math.min(bytes.length, 2048)).toString("latin1")
    const m = /^(--[^\r\n]+)\r?\n[\s\S]*?\r?\n\r?\n/.exec(head)
    if (m) {
      const start = m[0].length, boundary = Buffer.from("\r\n" + m[1])
      const end = bytes.lastIndexOf(boundary)
      if (end > start) bytes = bytes.subarray(start, end)
    }
  }
  if (/^application\/pdf$/i.test(type) && bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
    const peek = bytes.subarray(0, 60).toString("latin1").replace(/[^\x20-\x7e]/g, "?")
    return NextResponse.json({ error: "The stored file is not a valid PDF, so it cannot be opened. It was probably damaged when it was uploaded.", stored_bytes: bytes.length, starts_with: peek }, { status: 422 })
  }
  if (bytes.length <= INLINE_MAX) {
    const inline = INLINE_OK.test(type)
    return new Response(bytes, {
      headers: {
        "Content-Type": inline ? type : "application/octet-stream",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${name}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    })
  }
  const { data: signed } = await admin.storage.from(ATTACHMENT_BUCKET).createSignedUrl(path, 300, { download: file.filename })
  if (!signed?.signedUrl) return NextResponse.json({ error: "The file could not be opened." }, { status: 404 })
  return NextResponse.redirect(signed.signedUrl)
}
