export type Source = "Email" | "WhatsApp" | "Voice Note"
export type Confidence = "High" | "Medium" | "Low"
export type RequestStatus = "Pending" | "Waiting for Approval" | "Rejected" | "Approved - Carrier, Pending Send" | "Approved - Carrier, Sent" | "Approved - Reply, Pending Send" | "Approved - Reply, Sent" | "Sent to Carrier" | "Quoted" | "Closed"
export type Mode = "Sea" | "Air" | "Land"

// ──────────────────────────────────────────────────────────────
// Carrier types (Supabase-backed)
// lang: 1=Arabic  2=English  -1=Both
// is_cc rows share the same carrier_id as the main contact row
// ──────────────────────────────────────────────────────────────
export type CarrierRow = {
  id: number
  client_code: string
  carrier_id: number
  carrier_name: string
  person_name: string
  role: string
  email: string
  number: string
  is_sea: boolean
  is_air: boolean
  is_land: boolean
  lang: number
  routes: string
  countries?: string[] | null
  is_cc: boolean
  active: boolean
  auto_send_rfq: boolean
}

/** UI-level carrier — main contact row with CC emails merged in */
export type Carrier = {
  row_id: number       // PK of the main (is_cc=false) row
  carrier_id: number   // logical ID within client
  carrier_name: string
  person_name: string
  role: string
  email: string
  number: string
  is_sea: boolean
  is_air: boolean
  is_land: boolean
  lang: number
  routes: string
  countries: string[]
  active: boolean
  auto_send_rfq: boolean
  cc_emails: string[]  // from is_cc=true rows
}

export function langLabel(lang: number): string {
  if (lang === 1) return "Arabic"
  if (lang === 2) return "English"
  return "Both"
}

export function langValue(label: string): number {
  if (label === "Arabic") return 1
  if (label === "English") return 2
  return -1
}

export function modesFromCarrier(c: Pick<Carrier, "is_sea" | "is_air" | "is_land">): Mode[] {
  const modes: Mode[] = []
  if (c.is_sea) modes.push("Sea")
  if (c.is_air) modes.push("Air")
  if (c.is_land) modes.push("Land")
  return modes
}

// ──────────────────────────────────────────────────────────────
// Template types (Supabase-backed)
// ──────────────────────────────────────────────────────────────
export type TemplateRow = {
  id: number
  client_code: string
  template_id: number
  template_name: string
  type: "Email" | "WhatsApp"
  subject: string | null
  body: string
  linked_carrier_ids: number[]
  is_default: boolean
  mode_sea?: boolean
  mode_air?: boolean
  mode_land?: boolean
  mode_multi?: boolean
  default_sea?: boolean
  default_air?: boolean
  default_land?: boolean
  default_multi?: boolean
  is_reply_template: boolean
  is_missing_reply_template: boolean
  is_complete_reply_template: boolean
  active: boolean
  updated_at: string
}

/** UI-level template */
export type Template = {
  row_id: number
  template_id: number
  template_name: string
  type: "Email" | "WhatsApp"
  subject: string | null
  body: string
  linked_carrier_ids: number[]
  is_default: boolean
  mode_sea?: boolean
  mode_air?: boolean
  mode_land?: boolean
  mode_multi?: boolean
  default_sea?: boolean
  default_air?: boolean
  default_land?: boolean
  default_multi?: boolean
  is_reply_template: boolean
  is_missing_reply_template: boolean
  is_complete_reply_template: boolean
  active: boolean
  updated_at: string
}

export type QuotationTemplate = {
  id: number
  template_id: number
  template_name: string
  subject: string
  body: string
  is_default: boolean
  active: boolean
  created_at: string
  updated_at: string
  format?: "text" | "html"
  body_html?: string | null
  description?: string | null
  applies_to_mode?: "any" | "sea" | "air" | "land"
  source_filename?: string | null
  options?: Record<string, unknown> | null
}

export type ShipmentField = {
  label: string
  value: string | null
}

export type StatusEvent = {
  label: string
  time: string
  done: boolean
}

export type FreightRequest = {
  id: string
  /** Per-client serial (1, 2, 3 …). Only unique together with the client. */
  requestNumber?: number | null
  /** Display reference built from the serial, e.g. "LT-0042". */
  requestRef?: string
  source: Source
  senderName: string
  senderEmail: string
  senderPhone: string
  originCity: string
  originCountry: string
  originFlag: string
  destinationCity: string
  destinationCountry: string
  destinationFlag: string
  cargoType: string
  equipment: string
  weight: string
  quantity: string
  dimensions: string
  modes: Mode[]
  incoterm: string
  pickupAddress?: string
  intakeSource?: "automatic" | "manual"
  intakeFilename?: string | null
  blType: string
  preferredCarrier: string
  urgency: "Standard" | "Urgent"
  confidence: Confidence
  status: RequestStatus
  receivedIso: string
  receivedRelative: string
  receivedExact: string
  /** Active (not disregarded) carrier quotes; shown next to the Quoted status. */
  activeQuoteCount?: number
  specialRequirements: string[]
  /** Internal notes: only the team sees them, never sent to carriers (freight_requests.internal_notes). */
  notes?: string[]
  availabilityQuestions: string[]
  missingFields: string[]
  suggestedReply: string | null
  rawMessage: string
  /** Files that came with the request email */
  attachments?: import("@/lib/attachments").RequestAttachment[]
  aog: boolean
  dgr: boolean
  history: StatusEvent[]
  // Reply threading
  gmailThreadId: string | null
  repliedAt: string | null
  replySentType: "missing_fields" | "complete" | "acknowledgement" | "manual" | null
  replyBody: string | null
  conversation: ConversationMessage[]
  // Outcome after quoting (migration 057)
  outcome?: "won" | "lost" | "expired" | "cancelled" | null
  bookingReference?: string | null
  wonSellUsd?: number | null
  wonMarginUsd?: number | null
  paidAt?: string | null
  bookedAt?: string | null
  invoicedAt?: string | null
  // Shipment types (migration 074). null type = an older request, shown with today's layout.
  shipmentType?: import("@/lib/shipment-types").ShipmentType | null
  typeSource?: "ai" | "manual" | null
  cbm?: string
  chargeableWeight?: string
  chargeableWeightStated?: string
  packageType?: string
  cargoReadyDate?: string
  temperatureControl?: string
  truckType?: string
  /** Extra quoted legs of a mixed-mode request (leg 1 is the request itself). Empty = single leg. */
  legs?: import("@/lib/shipment-types").LegData[]
}

export type ConversationMessage = {
  role: "sender" | "system"
  type?: string
  body: string
  sent_at: string
}

export const templateVariables = [
  {
    group: "Shipment Details",
    vars: [
      ["origin_city", "Origin City"],
      ["origin_country", "Origin Country"],
      ["destination_city", "Destination City"],
      ["destination_country", "Destination Country"],
      ["cargo_type", "Cargo Type"],
      ["quantity", "Quantity"],
      ["weight", "Weight"],
      ["dimensions", "Dimensions"],
      ["equipment", "Equipment"],
      ["mode", "Transport Mode"],
      ["incoterm", "Incoterm"],
      ["pickup_address", "Pickup Address (EXW only)"],
      ["bl_type", "BL Type"],
      ["urgency", "Urgency Level"],
      ["shipment_type", "Shipment Type (Air / Sea FCL / Sea LCL / Land)"],
      ["cbm", "CBM (volume)"],
      ["package_type", "Package Type"],
      ["truck_type", "Truck Type"],
      ["temperature", "Temperature"],
      ["cargo_ready_date", "Cargo Ready Date"],
      ["chargeable_weight", "Chargeable Weight (air)"],
      ["legs_summary", "All legs, one line each (multi-leg requests)"],
      ["leg_number", "This leg's number (multi-leg)"],
      ["leg_count", "Number of legs (multi-leg)"],
    ],
  },
  {
    group: "Carrier Info",
    vars: [
      ["carrier_name", "Carrier Company Name"],
      ["contact_name", "Contact Person Name"],
      ["carrier_email", "Carrier Email"],
      ["carrier_phone", "Carrier Phone"],
    ],
  },
  {
    group: "Request Info",
    vars: [
      ["sender_name", "Client Name"],
      ["sender_email", "Client Email"],
      ["request_ref", "Request Ref # (e.g. LT-0034)"],
      ["received_date", "Date Received"],
      ["preferred_carrier", "Preferred Carrier"],
    ],
  },
  {
    group: "Special",
    vars: [
      ["special_requirements", "Special Requirements"],
      ["availability_questions", "Questions to Verify"],
      ["missing_fields", "Missing Information"],
    ],
  },
] as const

export const currentUser = {
  name: "Abdulaziz",
  email: "abd.khayyat@gmail.com",
  initials: "AA",
  company: "Orbit Freight Forwarding",
}

export const dashboardStats = {
  total: 8,
  totalDelta: "+3 from yesterday",
  email: 5,
  whatsapp: 3,
  voiceNote: 0,
  pending: 6,
}
