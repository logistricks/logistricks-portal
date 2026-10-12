"use client"

import { Paperclip, FileText, Image as ImageIcon } from "lucide-react"
import type { RequestAttachment } from "@/lib/attachments"

const size = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : b ? `${b} B` : "")

/** The files that came with the request email. Each opens through the portal, so only signed-in users of the client can reach them. */
export function RequestAttachments({ requestId, files }: { requestId: string; files: RequestAttachment[] }) {
  if (!files.length) return null
  return (
    <div className="ds-card p-5">
      <div className="flex items-center gap-2">
        <Paperclip className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
        <h4 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Attachments</h4>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>{files.length}</span>
      </div>
      <ul className="mt-3 grid gap-2">
        {files.map((f, i) => (
          <li key={i}>
            <a href={`/api/requests/${requestId}/attachments/${i}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors"
              style={{ borderColor: "var(--divider)", color: "var(--text-primary)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-bg)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
              {f.mimeType.startsWith("image/") ? <ImageIcon className="h-4 w-4 shrink-0" /> : <FileText className="h-4 w-4 shrink-0" />}
              <span className="min-w-0 flex-1 truncate font-medium">{f.filename}</span>
              {size(f.sizeBytes) && <span className="shrink-0 text-xs" style={{ color: "var(--text-muted)" }}>{size(f.sizeBytes)}</span>}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
