/** Shared headless-Chromium PDF renderer (server only). Used by /api/quotations/pdf and /api/quotations/forward (server only). */
export async function renderPdf(documentHtml: string, pageSize: "a4" | "letter"): Promise<Uint8Array> {
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
