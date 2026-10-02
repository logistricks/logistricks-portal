/**
 * lib/quotation-variables.ts
 *
 * Catalogue of every variable a quotation template can use, grouped for the editor's
 * palette, with a realistic example for the live preview. Pure data — safe on client and server.
 *
 * Syntax inside templates:
 *   {{origin_city}}                     value (empty if unknown)
 *   {{free_days|on request}}            value with a fallback
 *   {{#if free_days}} … {{/if}}         only when the value is not empty
 *   {{#unless free_days}} … {{/unless}} only when the value is empty
 *   {{charges_table}}                   "block" variables render a formatted table / list
 */

export type VarKind = "text" | "block"
export interface QuotationVariable { key: string; label: string; example: string; kind?: VarKind; note?: string }
export interface VariableGroup { id: string; label: string; description?: string; vars: QuotationVariable[] }

export const VARIABLE_GROUPS: VariableGroup[] = [
  {
    id: "quotation", label: "Quotation",
    vars: [
      { key: "quotation_number", label: "Quotation number", example: "QT-LT-0017-01" },
      { key: "quotation_date", label: "Today's date", example: "2 Oct 2026" },
      { key: "quotation_valid_until", label: "Quotation valid until", example: "31 Oct 2026", note: "Today + the template's validity days, or the carrier's validity, whichever is earlier." },
      { key: "prepared_by", label: "Prepared by (your name)", example: "Osama" },
      { key: "company_name", label: "Your company", example: "Hijazi Forwarding Co." },
      { key: "company_contact_email", label: "Company contact email", example: "sales@example.com" },
      { key: "company_contact_phone", label: "Company contact phone", example: "+962 6 000 0000" },
    ],
  },
  {
    id: "requester", label: "Requester",
    vars: [
      { key: "sender_name", label: "Requester name", example: "Nour Abuazzam" },
      { key: "sender_first_name", label: "Requester first name", example: "Nour" },
      { key: "sender_email", label: "Requester email", example: "nour@hijazi.example" },
      { key: "sender_phone", label: "Requester phone", example: "+962 7 9000 0000" },
    ],
  },
  {
    id: "request", label: "Shipment request",
    vars: [
      { key: "request_ref", label: "Request reference", example: "LT-0017" },
      { key: "received_date", label: "Date received", example: "30 Sep 2026" },
      { key: "urgency", label: "Urgency", example: "Standard" },
      { key: "origin_city", label: "Origin city", example: "Genoa" },
      { key: "origin_country", label: "Origin country", example: "Italy" },
      { key: "origin", label: "Origin (city, country)", example: "Genoa, Italy" },
      { key: "destination_city", label: "Destination city", example: "Aqaba" },
      { key: "destination_country", label: "Destination country", example: "Jordan" },
      { key: "destination", label: "Destination (city, country)", example: "Aqaba, Jordan" },
      { key: "cargo_type", label: "Cargo / commodity", example: "Electrical heating appliances" },
      { key: "equipment", label: "Equipment requested", example: "1 x 20ft, 1 x 40HC" },
      { key: "weight", label: "Weight (as requested)", example: "18,500 kg" },
      { key: "quantity", label: "Quantity", example: "2 Containers" },
      { key: "dimensions", label: "Dimensions", example: "120 x 100 x 100 cm @ 4" },
      { key: "incoterm", label: "Incoterm (as requested)", example: "EXW" },
      { key: "bl_type", label: "BL type", example: "Telex Release" },
      { key: "mode", label: "Mode(s)", example: "Sea" },
      { key: "special_requirements", label: "Special requirements (text)", example: "Direct service only; mention all fees.", kind: "text" },
      { key: "special_requirements_list", label: "Special requirements (bullet list)", example: "", kind: "block" },
    ],
  },
  {
    id: "service", label: "Service & route",
    description: "From the selected carrier quote.",
    vars: [
      { key: "carrier_name", label: "Carrier name", example: "Med Express Line", note: "Reveals who is carrying the cargo. Leave it out if you don't share carrier names." },
      { key: "carrier_quote_ref", label: "Carrier's quote reference", example: "MX-88123" },
      { key: "quote_mode", label: "Mode (quoted)", example: "Sea" },
      { key: "service_level", label: "Service level", example: "FCL" },
      { key: "quote_status", label: "Quote status", example: "Subject to equipment availability" },
      { key: "route", label: "Route", example: "La Spezia → Aqaba" },
      { key: "origin_port", label: "Origin port / airport", example: "La Spezia" },
      { key: "destination_port", label: "Destination port / airport", example: "Aqaba" },
      { key: "direct_or_connecting", label: "Direct / connecting", example: "Direct" },
      { key: "etd", label: "ETD (departure)", example: "21 Oct 2026" },
      { key: "eta", label: "ETA (arrival)", example: "9 Nov 2026" },
      { key: "transit_days", label: "Transit time (days)", example: "19" },
      { key: "frequency", label: "Sailing / flight frequency", example: "Weekly" },
      { key: "space_status", label: "Space / equipment status", example: "Subject to equipment availability" },
      { key: "incoterm_quoted", label: "Incoterm (as quoted)", example: "EXW" },
    ],
  },
  {
    id: "cargo", label: "Cargo as quoted",
    vars: [
      { key: "container", label: "Container(s)", example: "1 x 40HC" },
      { key: "container_type", label: "Container type", example: "40HC" },
      { key: "container_count", label: "Container count", example: "1" },
      { key: "pieces", label: "Pieces", example: "4" },
      { key: "packaging_type", label: "Packaging", example: "Pallets" },
      { key: "gross_weight", label: "Gross weight", example: "18,500 kg" },
      { key: "volume_cbm", label: "Volume (CBM)", example: "28.4" },
      { key: "chargeable_weight", label: "Chargeable weight", example: "400 kg" },
      { key: "commodity_quoted", label: "Commodity (as quoted)", example: "Dehumidifier devices" },
      { key: "hs_code", label: "HS code", example: "8415.10" },
      { key: "temperature_control", label: "Temperature control", example: "Ambient" },
      { key: "special_handling", label: "Special handling", example: "" },
    ],
  },
  {
    id: "pricing", label: "Pricing",
    vars: [
      { key: "currency", label: "Currency", example: "USD" },
      { key: "final_price", label: "Final price (what you charge)", example: "3,850.00" },
      { key: "final_price_with_currency", label: "Final price with currency", example: "USD 3,850.00" },
      { key: "base_rate", label: "Carrier's price (cost)", example: "3,540.00", note: "Internal cost — don't put in customer-facing templates." },
      { key: "markup", label: "Markup (as entered)", example: "$310.00" },
      { key: "markup_amount", label: "Markup amount", example: "310.00" },
      { key: "price_per_unit", label: "Price per chargeable unit", example: "9.63" },
      { key: "minimum_charge", label: "Minimum charge", example: "150.00" },
      { key: "tax_note", label: "Tax note", example: "Prices exclude VAT" },
      { key: "charges_table", label: "Charges table", kind: "block", example: "", note: "Itemised table. Style (hide carrier cost, show cost + fee, or total only) is set in the template options." },
      { key: "summary_table", label: "Price summary (one line)", kind: "block", example: "" },
      { key: "charges_list", label: "Charges as a text list", kind: "block", example: "" },
      { key: "optional_charges_list", label: "Optional / not-included charges", kind: "block", example: "" },
    ],
  },
  {
    id: "terms", label: "Validity & terms",
    vars: [
      { key: "validity_date", label: "Carrier quote validity", example: "31 Oct 2026" },
      { key: "free_days", label: "Free days", example: "14" },
      { key: "free_days_demurrage", label: "Free days — demurrage", example: "14" },
      { key: "free_days_detention", label: "Free days — detention", example: "14" },
      { key: "per_diem_note", label: "Per-diem after free time", example: "USD 40/day per container" },
      { key: "payment_terms", label: "Payment terms", example: "Net 30 days" },
      { key: "subject_to_conditions", label: "Subject-to conditions", example: "Subject to equipment availability" },
      { key: "exclusions", label: "Exclusions", example: "Destination charges at Aqaba, insurance" },
      { key: "required_documents", label: "Required documents", example: "Commercial invoice, packing list" },
      { key: "liability_limit", label: "Liability limit", example: "" },
      { key: "cancellation_terms", label: "Cancellation terms", example: "" },
      { key: "insurance_note", label: "Insurance", example: "Insurance not included" },
      { key: "quote_notes", label: "Carrier notes", example: "" },
      { key: "terms_block", label: "Terms & conditions (all available terms)", kind: "block", example: "", note: "Builds a list from every term the carrier stated." },
    ],
  },
]

export const ALL_VARIABLES: QuotationVariable[] = VARIABLE_GROUPS.flatMap((g) => g.vars)
export const VARIABLE_KEYS = new Set(ALL_VARIABLES.map((v) => v.key))
export const BLOCK_KEYS = new Set(ALL_VARIABLES.filter((v) => v.kind === "block").map((v) => v.key))

/** Variables that must appear in a customer-facing quotation. Used for editor warnings. */
export const RECOMMENDED_KEYS = ["final_price", "final_price_with_currency", "charges_table", "summary_table"]

export interface TemplateOptions {
  charges_style: "marked_up" | "detailed" | "total_only"
  show_unit_rates: boolean
  accent_color: string
  font_family: string
  validity_days: number | null
}

export const DEFAULT_OPTIONS: TemplateOptions = {
  charges_style: "marked_up",
  show_unit_rates: false,
  accent_color: "#0D1B2A",
  font_family: "Arial, Helvetica, sans-serif",
  validity_days: null,
}

export function normalizeOptions(raw: unknown): TemplateOptions {
  const o = (raw && typeof raw === "object" ? raw : {}) as Partial<TemplateOptions>
  const style = o.charges_style === "detailed" || o.charges_style === "total_only" ? o.charges_style : "marked_up"
  const color = typeof o.accent_color === "string" && /^#[0-9a-fA-F]{6}$/.test(o.accent_color) ? o.accent_color : DEFAULT_OPTIONS.accent_color
  const font = typeof o.font_family === "string" && o.font_family.length < 120 && !/[<>{};]/.test(o.font_family) ? o.font_family : DEFAULT_OPTIONS.font_family
  const vd = Number(o.validity_days)
  return {
    charges_style: style,
    show_unit_rates: !!o.show_unit_rates,
    accent_color: color,
    font_family: font,
    validity_days: Number.isFinite(vd) && vd > 0 && vd < 366 ? Math.round(vd) : null,
  }
}
