/**
 * POST /api/quotations/pdf
 *   { quotation_id }                 → PDF of a saved quotation
 *   { html, page_size?, options? }   → PDF of template HTML (editor preview); HTML is sanitised first
 * Returns application/pdf. Rendered by headless Chromium, so the PDF is real text with a proper layout.
 */
import { NextResponse, type NextRequest } from "next/server"
import { getSession, adminClient } from "@/lib/api-session"
import { htmlDocument } from "@/lib/quotation-render"
import { normalizeOptions } from "@/lib/quotation-variables"
import { sanitizeQuotationHtml } from "@/lib/quotation-html"

export const runtime = "nodejs"
export const maxDuration = 60

async function renderPdf(documentHtml: string, pageSize: "a4" | "letter"): Promise<Uint8Array> {
  const puppeteer = (await import("puppeteer-core")).default
  const localChrome = process.env.CHROMIUM_PATH
  let launchOpts: Record<string, unknown>
  if (localChrome) {
    launchOpts = { executablePath: localChrome, args: ["--no-sandbox"], headless: true }
  } else {
    const chromium = (await import("@sparticuz/chromium")).default
    launchOpts = { executablePath: await chromium.executablePath(), args: chromium.args, headless: "shell" }
  }
  const browser = await puppeteer.launch(launchOpts as any)
  try {
    const page = await browser.newPage()
    await page.setJavaScriptEnabled(false)
    await page.setRequestInterception(true)
    // Only inline content: block every network request (no remote images, no SSRF).
    page.on("request", (r: any) => (r.url().startsWith("data:") || r.url() === "about:blank") ? r.continue() : r.abort())
    await page.setContent(documentHtml, { waitUntil: "load", timeout: 20000 })
    return await page.pdf({
      format: pageSize === "letter" ? "Letter" : "A4",
      printBackground: true,
      margin: { top: "14mm", right: "14mm", bottom: "16mm", left: "14mm" },
    })
  } finally {
    await browser.close()
  }
}

export async function POST(req: NextRequest) {
  const cookie = req.cookies.get("portal_session")?.value
  const session = cookie ? getSession(cookie) : null
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })

  let html = ""
  let optionsRaw: unknown = body.options
  let name = "Quotation"

  if (body.quotation_id) {
    const admin = adminClient()
    const { data: q } = await admin.from("quotations").select("*").eq("id", body.quotation_id).ilike("client_code", session.clientCode).maybeSingle()
    if (!q || !q.generated_html) return NextResponse.json({ error: "Quotation not found or has no formatted layout" }, { status: 404 })
    html = String(q.generated_html)
    name = q.quotation_number ? `Quotation ${q.quotation_number}` : `Quotation ${q.id}`
    const { data: t } = await admin.from("quotation_templates").select("options").eq("client_code", session.clientCode).eq("template_id", q.quotation_template_id).maybeSingle()
    optionsRaw = (t as { options?: unknown } | null)?.options
  } else if (typeof body.html === "string") {
    if (body.html.length > 3_000_000) return NextResponse.json({ error: "Too large" }, { status: 413 })
    html = sanitizeQuotationHtml(body.html)
    name = typeof body.name === "string" ? body.name.slice(0, 80) : "Quotation preview"
  } else {
    return NextResponse.json({ error: "quotation_id or html required" }, { status: 400 })
  }

  const options = normalizeOptions(optionsRaw)
  const pageSize = body.page_size === "letter" || options.page_size === "letter" ? "letter" : "a4"
  try {
    const pdf = await renderPdf(htmlDocument(html, options).replace("padding:28px", "padding:0"), pageSize)
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${name.replace(/[^\w .-]+/g, "-")}.pdf"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (e) {
    return NextResponse.json({ error: `PDF generation failed: ${(e as Error).message}` }, { status: 500 })
  }
}
