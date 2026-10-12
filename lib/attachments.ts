/**
 * Attachments of a freight request, as saved by the n8n intake: [{ filename, url, mime_type, size_bytes }].
 * The column may hold a real array, or the same array as text (sometimes with a stray leading "="), so read it defensively.
 */
export interface RequestAttachment { filename: string; url: string; mimeType: string; sizeBytes: number }

export const ATTACHMENT_BUCKET = "freight-attachments"

export function parseAttachments(raw: unknown): RequestAttachment[] {
  let v: unknown = raw
  for (let i = 0; i < 3 && typeof v === "string"; i++) {
    const t = v.trim().replace(/^=+/, "").trim()
    if (!t) return []
    try { v = JSON.parse(t) } catch { return [] }
  }
  if (!Array.isArray(v)) return []
  return v.flatMap((a): RequestAttachment[] => {
    if (!a || typeof a !== "object") return []
    const o = a as Record<string, unknown>
    const url = String(o.url ?? "").trim()
    if (!url) return []
    return [{ filename: String(o.filename ?? o.name ?? "attachment").slice(0, 200), url, mimeType: String(o.mime_type ?? o.mimeType ?? ""), sizeBytes: Number(o.size_bytes ?? o.sizeBytes) || 0 }]
  })
}

/** Path inside the bucket, from a public or authenticated storage URL. Null when it is not one of ours. */
export function storagePath(url: string): string | null {
  const m = new RegExp(`/storage/v1/object/(?:public/|authenticated/)?${ATTACHMENT_BUCKET}/(.+)$`).exec(url)
  if (!m) return null
  try { return decodeURIComponent(m[1].split("?")[0]) } catch { return m[1].split("?")[0] }
}
