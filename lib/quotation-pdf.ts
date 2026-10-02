/**
 * lib/quotation-pdf.ts  (client only)
 * Asks the server to render a quotation to PDF (headless Chromium) and saves the file.
 */
export async function downloadQuotationPdf(
  source: { quotationId: number } | { html: string; pageSize?: "a4" | "letter"; options?: unknown },
  filename: string,
): Promise<void> {
  const res = await fetch("/api/quotations/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify("quotationId" in source
      ? { quotation_id: source.quotationId }
      : { html: source.html, page_size: source.pageSize, options: source.options, name: filename }),
  })
  if (!res.ok) {
    const d = await res.json().catch(() => ({}))
    throw new Error(d.error ?? `Server error ${res.status}`)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${filename.replace(/[\\/:*?"<>|]+/g, "-").replace(/\.pdf$/i, "")}.pdf`
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
