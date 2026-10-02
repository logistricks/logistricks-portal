/**
 * lib/quotation-docx.ts  (client only)
 *
 * Imports a Word (.docx) document as the starting point of a quotation template:
 *   - headings, bold / italic / underline, lists, tables, images and links come across
 *   - paragraph alignment (centred / right / justified) is kept
 *   - text written as [Origin City], <<Origin City>>, {Origin City} or [[origin_city]] is converted to
 *     {{origin_city}} when it matches a known variable
 * Word colours, shading, fonts, headers/footers and page layout are NOT carried over (the editor's
 * brand colour / font options restyle the document).
 */
import { ALL_VARIABLES } from "@/lib/quotation-variables"

const norm = (s: string) => s.toLowerCase().replace(/&amp;/g, "and").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")

const ALIASES: Record<string, string> = {
  name: "sender_name", customer: "sender_name", customer_name: "sender_name", client_name: "sender_name", client: "sender_name",
  requester: "sender_name", attention: "sender_name", attn: "sender_name", to: "sender_name", first_name: "sender_first_name",
  email: "sender_email", customer_email: "sender_email", phone: "sender_phone", mobile: "sender_phone",
  date: "quotation_date", today: "quotation_date", quote_date: "quotation_date", quotation_no: "quotation_number",
  quote_no: "quotation_number", quote_number: "quotation_number", qt_no: "quotation_number",
  ref: "request_ref", reference: "request_ref", request_no: "request_ref", request_number: "request_ref", our_ref: "request_ref",
  validity: "quotation_valid_until", valid_until: "quotation_valid_until", valid_till: "quotation_valid_until", offer_validity: "quotation_valid_until",
  commodity: "cargo_type", cargo: "cargo_type", goods: "cargo_type", description_of_goods: "cargo_type",
  pol: "origin_port", port_of_loading: "origin_port", pod: "destination_port", port_of_discharge: "destination_port",
  from: "origin", to_city: "destination_city", origin_city_country: "origin", destination_city_country: "destination",
  price: "final_price_with_currency", total: "final_price_with_currency", total_price: "final_price_with_currency",
  amount: "final_price_with_currency", rate: "final_price_with_currency", freight: "final_price_with_currency", total_amount: "final_price_with_currency",
  transit: "transit_days", transit_time: "transit_days", shipping_line: "carrier_name", carrier: "carrier_name", airline: "carrier_name",
  charges: "charges_table", rates: "charges_table", breakdown: "charges_table", terms: "terms_block", terms_and_conditions: "terms_block",
  payment: "payment_terms", incoterms: "incoterm", free_time: "free_days", container_size: "container_type", signature: "prepared_by",
  company: "company_name", prepared_by_name: "prepared_by",
}

const LOOKUP = new Map<string, string>()
for (const v of ALL_VARIABLES) { LOOKUP.set(norm(v.key), v.key); LOOKUP.set(norm(v.label), v.key) }
for (const [k, v] of Object.entries(ALIASES)) if (!LOOKUP.has(k)) LOOKUP.set(k, v)

/** [x], [[x]], <<x>>, {x}, «x» → {{key}} when x matches a variable. Returns the new HTML and how many were converted. */
export function convertBracketPlaceholders(html: string): { html: string; converted: number } {
  let converted = 0
  const swap = (_m: string, label: string) => {
    const key = LOOKUP.get(norm(label))
    if (!key) return _m
    converted++
    return `{{${key}}}`
  }
  let out = html
  out = out.replace(/\[\[([^\]\n<]{2,60})\]\]/g, swap)
  out = out.replace(/&lt;&lt;\s*([^<>&\n]{2,60}?)\s*&gt;&gt;/g, swap)
  out = out.replace(/«\s*([^»\n<]{2,60}?)\s*»/g, swap)
  out = out.replace(/\[([^\]\n<]{2,60})\]/g, swap)
  out = out.replace(/(?<!\{)\{([^{}\n<]{2,60})\}(?!\})/g, swap)
  return { html: out, converted }
}

/** Word tables arrive without borders; alignment classes become inline styles. */
export function styleImportedHtml(html: string): string {
  return html
    .replace(/<table>/g, '<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;border:1px solid #cbd5e1">')
    .replace(/<(td|th)>/g, '<$1 style="border:1px solid #cbd5e1;padding:6px 8px;vertical-align:top">')
    .replace(/<(td|th) ((?:colspan|rowspan)="\d+")>/g, '<$1 $2 style="border:1px solid #cbd5e1;padding:6px 8px;vertical-align:top">')
    .replace(/<(p|h[1-6]) class="x-(center|right|justify)">/g, (_m, tag: string, a: string) => `<${tag} style="text-align:${a === "justify" ? "justify" : a}">`)
}

const ALIGN_STYLES = ["Heading 1", "Heading 2", "Heading 3", "Heading 4", "Title", "Subtitle"]

export function buildMammothOptions(mammoth: any) {
  const styleMap: string[] = ["u => u", "strike => s"]
  for (const a of ["center", "right", "justify"]) {
    styleMap.push(`p[style-name='X:${a}:'] => p.x-${a}:fresh`)
    ALIGN_STYLES.forEach((s, i) => {
      const tag = s === "Title" ? "h1" : s === "Subtitle" ? "h2" : `h${i + 1}`
      styleMap.push(`p[style-name='X:${a}:${s}'] => ${tag}.x-${a}:fresh`)
    })
  }
  const transformDocument = mammoth.transforms?.paragraph
    ? mammoth.transforms.paragraph((p: any) => {
        const a = p.alignment === "both" ? "justify" : p.alignment
        if (a === "center" || a === "right" || a === "justify") {
          const base = p.styleName ?? ""
          if (base === "" || ALIGN_STYLES.includes(base)) return { ...p, styleName: `X:${a}:${base}` }
        }
        return p
      })
    : undefined
  return {
    styleMap,
    transformDocument,
    convertImage: mammoth.images.imgElement((image: any) =>
      image.read("base64").then((data: string) => ({ src: `data:${image.contentType};base64,${data}` }))),
  }
}

export interface DocxImport { html: string; warnings: string[]; converted: number; bytes: number }

export async function importDocxFile(file: File): Promise<DocxImport> {
  if (!/\.docx$/i.test(file.name)) throw new Error("Please choose a .docx file (save older .doc files as .docx in Word first).")
  if (file.size > 8 * 1024 * 1024) throw new Error("That file is over 8 MB. Reduce the images in Word and try again.")
  const mod: any = await import("mammoth/mammoth.browser")
  const mammoth = mod.default ?? mod
  const buffer = await file.arrayBuffer()
  const result = await mammoth.convertToHtml({ arrayBuffer: buffer }, buildMammothOptions(mammoth))
  const styled = styleImportedHtml(result.value as string)
  const { html, converted } = convertBracketPlaceholders(styled)
  const warnings = ((result.messages ?? []) as { type: string; message: string }[])
    .filter((m) => m.type === "warning").map((m) => m.message)
  return { html, warnings: [...new Set(warnings)].slice(0, 6), converted, bytes: html.length }
}
