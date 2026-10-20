/** Builds the trial quotation as a PDF document (HTML) and as an Excel workbook. Server only. */
import { money, pricing, quoteNumber, type QuoteView, type RequestView } from "@/lib/trial-server"
import { buildContext, htmlDocument, renderQuotation, type RequestIn } from "@/lib/quotation-render"
import { STARTER_HTML, STARTER_SUBJECT } from "@/lib/quotation-starter"

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" } as Record<string, string>)[c])
const fmtDate = (d: Date | string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })

export interface TrialDocCtx { company: string; contact?: string; code: string; tryNo: number; req: RequestView; quote: QuoteView; raw?: any; markupType: string; markupValue: number }

/**
 * The quotation exactly as the portal builds it: the portal's own default template, variables and charge rules
 * (lib/quotation-render + lib/quotation-starter), fed with what the trial read from the two emails.
 */
export function renderTrialQuotation(c: TrialDocCtx): { subject: string; html: string; text: string; document: string } {
  const p = pricing(c.quote.lines, c.markupType, c.markupValue)
  const f = (k: string) => c.req.fields.find((x) => x[0] === k)?.[1] ?? ""
  const rt = c.req.route
  const request: RequestIn = {
    requestRef: "", receivedExact: "", urgency: f("Urgency"),
    originCity: rt.from === "Not given" ? "" : rt.from, originCountry: rt.fc ?? "", destinationCity: rt.to === "Not given" ? "" : rt.to, destinationCountry: rt.tc ?? "",
    cargoType: f("Cargo"), equipment: f("Equipment"), weight: f("Weight"), quantity: f("Quantity"), dimensions: f("Dimensions"),
    incoterm: f("Incoterm"), blType: f("B/L type"), modes: [c.req.mode], pickupAddress: f("Pickup address"),
    senderName: c.req.senderName || "", senderEmail: c.req.sender || "", senderPhone: "", specialRequirements: c.req.special,
    shipmentType: c.req.shipmentType, cbm: f("CBM"), packageType: f("Package type"), truckType: f("Truck type"), temperatureControl: f("Temperature"), cargoReadyDate: f("Cargo ready date"),
  }
  const raw = c.raw ?? {
    charges: c.quote.lines.map((l) => ({ carrier_label: l.label, basis: l.basis, quantity: l.qty, unit_rate: l.unit, amount: l.amount, inclusion: "included" })),
    transit_days: parseInt(c.quote.transit) || null, free_days: parseInt(c.quote.free) || null,
  }
  const quote = { ...raw, rate_currency: c.quote.currency, validity_date: c.quote.quoteValid, carrier_quote_ref: raw.carrier_quote_ref ?? null, origin_place: raw.origin_place || request.originCity, destination_place: raw.destination_place || request.destinationCity }
  const { ctx } = buildContext({
    request, quote, carrierName: c.quote.name, markupType: c.markupType === "flat" ? "flat" : "percent", markupAmount: c.markupValue,
    baseRate: p.base, finalPrice: p.final, preparedBy: c.contact || "", company: { name: c.company }, quotationNumber: quoteNumber(c.code, c.tryNo),
  })
  const r = renderQuotation({ subject: STARTER_SUBJECT, body: "", body_html: STARTER_HTML, format: "html" }, ctx, { delivery: "pdf" })
  return { subject: r.subject, html: r.html ?? "", text: r.text, document: htmlDocument(r.html ?? "") }
}

export function quotationHtml(c: TrialDocCtx): string {
  return renderTrialQuotation(c).document.replace("padding:28px", "padding:0")
}

export async function quotationXlsx(c: TrialDocCtx): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default
  const wb = new ExcelJS.Workbook()
  const p = pricing(c.quote.lines, c.markupType, c.markupValue), cur = c.quote.currency, no = quoteNumber(c.code, c.tryNo)
  const font = { name: "Arial", size: 10 }
  const hdr = (ws: any, row: number) => { ws.getRow(row).eachCell((cell: any) => { cell.font = { name: "Arial", bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F1E36" } } }) }
  const style = (ws: any) => { ws.eachRow((r: any, i: number) => { if (i > 3) r.eachCell((cell: any) => { if (!cell.font || !cell.font.bold) cell.font = font; cell.alignment = { vertical: "top", wrapText: true } }) }); ws.views = [{ showGridLines: false }] }
  const title = (ws: any, t: string, sub: string) => { ws.getCell("A1").value = t; ws.getCell("A1").font = { name: "Arial", bold: true, size: 14, color: { argb: "FF0F1E36" } }; ws.getCell("A2").value = sub; ws.getCell("A2").font = { name: "Arial", italic: true, size: 9, color: { argb: "FF56667E" } } }
  const money$ = `"${cur}" #,##0.00`
  const L = c.quote.lines, n = L.length
  const s = wb.addWorksheet("Summary"), rq = wb.addWorksheet("Request"), cq = wb.addWorksheet("Carrier quote"), q = wb.addWorksheet("Quotation"), rp = wb.addWorksheet("Reply")

    title(cq, `Carrier quote: ${c.quote.name} (${c.quote.ref})`, `${c.req.route.from} to ${c.req.route.to}. Read from the carrier's email.`)
  cq.addRow([]); cq.addRow(["Charge", "Basis", "Qty", `Unit price (${cur})`, `Amount (${cur})`]); hdr(cq, 4)
  L.forEach((l, i) => { const r = 5 + i; cq.addRow([l.label, l.basis, l.qty, l.unit, { formula: `C${r}*D${r}`, result: l.amount }]); cq.getCell(`D${r}`).numFmt = money$; cq.getCell(`E${r}`).numFmt = money$ })
  const tr = 5 + n
  cq.addRow(["Carrier total", "", "", "", { formula: `SUM(E5:E${tr - 1})`, result: p.base }]); cq.getRow(tr).font = { name: "Arial", bold: true }; cq.getCell(`E${tr}`).numFmt = money$
  if (c.quote.excluded.length) { cq.addRow([]); cq.addRow(["Excluded or optional (not counted)"]); cq.lastRow!.font = { name: "Arial", bold: true }; c.quote.excluded.forEach((l) => cq.addRow([l.label, l.basis, l.qty, l.unit, l.amount])) }
  cq.addRow([]); cq.addRow(["Flags"]); cq.lastRow!.font = { name: "Arial", bold: true }
  c.quote.flags.forEach((f) => cq.addRow([(f[0] === "warn" ? "Warning: " : f[0] === "ok" ? "OK: " : "Note: ") + f[1]]))
  cq.columns = [{ width: 40 }, { width: 18 }, { width: 8 }, { width: 18 }, { width: 18 }]; style(cq)

    title(q, `Quotation ${no}`, "Carrier amounts plus your markup. Change the markup cell and every price updates.")
  q.getCell("A4").value = c.markupType === "flat" ? `Markup (${cur})` : "Markup (%)"; q.getCell("A4").font = { name: "Arial", bold: true }
  q.getCell("B4").value = c.markupType === "flat" ? c.markupValue : c.markupValue / 100
  q.getCell("B4").numFmt = c.markupType === "flat" ? money$ : "0.0%"; q.getCell("B4").font = { name: "Arial", bold: true, color: { argb: "FF0000FF" } }; q.getCell("B4").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } }
  q.getCell("C4").value = "Input: the markup you chose in the trial."; q.getCell("C4").font = { name: "Arial", italic: true, size: 9 }
  q.addRow([]); q.addRow(["Description", "Basis", "Qty", `Amount (${cur})`]); hdr(q, 6)
  const sumRef = `SUM('Carrier quote'!E5:E${tr - 1})`
  p.lines.forEach((l, i) => {
    const r = 7 + i, src = `'Carrier quote'!E${5 + i}`
    const f = c.markupType === "flat" ? `ROUND(${src}*(1+$B$4/${sumRef}),2)` : `ROUND(${src}*(1+$B$4),2)`
    q.addRow([l.label, l.basis, l.qty, { formula: f, result: l.price }]); q.getCell(`D${r}`).numFmt = money$
  })
  const qt = 7 + n
  q.addRow(["Total", "", "", { formula: `SUM(D7:D${qt - 1})`, result: p.final }]); q.getRow(qt).font = { name: "Arial", bold: true }; q.getCell(`D${qt}`).numFmt = money$
  q.addRow(["Valid until", "", "", fmtDate(c.quote.quoteValid)]); q.addRow(["Transit time", "", "", c.quote.transit]); q.addRow(["Free time", "", "", c.quote.free])
  q.columns = [{ width: 40 }, { width: 18 }, { width: 8 }, { width: 28 }]; style(q)

    title(rq, "Parsed request", "What the AI read from the client's email. The sender is masked and never stored.")
  rq.addRow([]); rq.addRow(["Field", "Value"]); hdr(rq, 4)
  const L0 = c.req.mode === "Sea" ? ["Port of loading", "Port of discharge"] : c.req.mode === "Air" ? ["Origin airport", "Destination airport"] : ["Origin", "Destination"]
  rq.addRow(["Mode", c.req.mode]); rq.addRow([L0[0], `${c.req.route.from}${c.req.route.fc ? ", " + c.req.route.fc : ""}`]); rq.addRow([L0[1], `${c.req.route.to}${c.req.route.tc ? ", " + c.req.route.tc : ""}`])
  if (c.req.portWarning) rq.addRow(["Port check", c.req.portWarning])
  c.req.fields.forEach((f) => rq.addRow([f[0], f[1] ?? "Not given"]))
  c.req.special.forEach((x) => rq.addRow(["Special requirement", x])); c.req.missing.forEach((x) => rq.addRow(["Missing", x]))
  rq.addRow(["AI confidence", `${c.req.conf}% (${c.req.confL})`]); rq.addRow(["Sender", c.req.sender])
  rq.columns = [{ width: 26 }, { width: 70 }]; style(rq)

    title(rp, "Reply and email", "Suggested reply to the sender, and the quotation email body.")
  rp.addRow([]); rp.addRow(["Item", "Text"]); hdr(rp, 4)
  rp.addRow(["Suggested reply", c.req.reply || "No reply needed. The request was complete."])
  rp.addRow(["Quotation email subject", `Quotation ${no}: ${c.req.route.from} to ${c.req.route.to}`])
  rp.addRow(["Quotation email body", `Hello ${c.req.senderName || "there"},\n\nPlease find our quotation for ${c.req.route.from} to ${c.req.route.to}. Total: ${money(p.final, cur)}. Valid until ${fmtDate(c.quote.quoteValid)}.\n\nBest regards`])
  rp.columns = [{ width: 26 }, { width: 90 }]; style(rp)

  title(s, "Logistricks trial: summary", "Totals link to the other sheets.")
  s.addRow([]); s.addRow(["Item", "Value"]); hdr(s, 4)
  s.addRow(["Quotation no.", no]); s.addRow(["Mode", c.req.mode]); s.addRow(["Route", `${c.req.route.from} to ${c.req.route.to}`])
  s.addRow(["Cargo", c.req.fields.find((f) => f[0] === "Cargo")?.[1] ?? ""]); s.addRow(["Incoterm", c.req.fields.find((f) => f[0] === "Incoterm")?.[1] ?? ""])
  s.addRow(["Carrier", `${c.quote.name} (${c.quote.ref})`])
  s.addRow([`Carrier total (${cur})`, { formula: `'Carrier quote'!E${tr}`, result: p.base }]) // row 11
  s.addRow([`Your markup (${cur})`, { formula: "B13-B11", result: p.markup }]) // row 12
  s.addRow([`Quoted to client (${cur})`, { formula: `Quotation!D${qt}`, result: p.final }]) // row 13
  s.addRow(["Margin on selling price", { formula: "IFERROR(B12/B13,0)", result: p.final ? p.markup / p.final : 0 }]) // row 14
  s.addRow(["Transit time", c.quote.transit]); s.addRow(["Free time", c.quote.free]); s.addRow(["Valid until", fmtDate(c.quote.quoteValid)])
  s.addRow(["Flags raised (warnings)", c.quote.flags.filter((f) => f[0] === "warn").length]); s.addRow(["Still missing from request", c.req.missing.length ? c.req.missing.join("; ") : "Nothing"])
  for (const a of ["B11", "B12", "B13"]) s.getCell(a).numFmt = money$
  s.getCell("B14").numFmt = "0.0%"
  s.columns = [{ width: 30 }, { width: 54 }]; style(s)
  return Buffer.from(await wb.xlsx.writeBuffer())
}
