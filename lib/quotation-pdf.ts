/**
 * lib/quotation-pdf.ts  (client only)
 * Turns the (server-sanitised) quotation HTML into a downloadable PDF in the browser.
 */
export async function downloadQuotationPdf(html: string, filename: string, pageSize: "a4" | "letter" = "a4"): Promise<void> {
  const mod: any = await import("html2pdf.js")
  const html2pdf = mod.default ?? mod
  const safeName = filename.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim() || "Quotation"

  const host = document.createElement("div")
  // Rendered off-screen at the printable width of the page (A4 ≈ 794px, Letter ≈ 816px at 96 dpi).
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${pageSize === "a4" ? 700 : 720}px;background:#fff;color:#1e293b;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5`
  host.innerHTML = `<style>table{border-collapse:collapse;width:100%} img{max-width:100%} tr,li{page-break-inside:avoid} h1,h2,h3{page-break-after:avoid}</style>${html}`
  document.body.appendChild(host)
  try {
    await html2pdf().set({
      margin: [12, 12, 14, 12],
      filename: `${safeName.replace(/\.pdf$/i, "")}.pdf`,
      image: { type: "jpeg", quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
      jsPDF: { unit: "mm", format: pageSize, orientation: "portrait" },
      pagebreak: { mode: ["css", "legacy"] },
    }).from(host).save()
  } finally {
    host.remove()
  }
}
