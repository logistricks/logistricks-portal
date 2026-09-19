export type Source = "Email" | "WhatsApp" | "Voice Note"
export type Confidence = "High" | "Medium" | "Low"
export type RequestStatus = "Pending" | "Sent to Carrier" | "Quoted" | "Closed"
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
  is_cc: boolean
  active: boolean
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
  active: boolean
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
  is_reply_template: boolean
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
  is_reply_template: boolean
  active: boolean
  updated_at: string
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
  blType: string
  preferredCarrier: string
  urgency: "Standard" | "Urgent"
  confidence: Confidence
  status: RequestStatus
  receivedIso: string
  receivedRelative: string
  receivedExact: string
  specialRequirements: string[]
  availabilityQuestions: string[]
  missingFields: string[]
  suggestedReply: string | null
  rawMessage: string
  aog: boolean
  dgr: boolean
  history: StatusEvent[]
}

export const requests: FreightRequest[] = [
  {
    id: "r1",
    source: "Email",
    senderName: "Fadi Tamimi",
    senderEmail: "fadi.tamimi@orbittrading.com",
    senderPhone: "+962 79 111 2233",
    originCity: "Amman",
    originCountry: "Jordan",
    originFlag: "\u{1F1EF}\u{1F1F4}",
    destinationCity: "Dubai",
    destinationCountry: "UAE",
    destinationFlag: "\u{1F1E6}\u{1F1EA}",
    cargoType: "Electronics",
    equipment: "2 x 40ft HC",
    weight: "5,234 KG per piece",
    quantity: "2 Nos",
    dimensions: "380 x 240 x 252 cm @ 2",
    modes: ["Sea"],
    incoterm: "FOB",
    blType: "Telex Release",
    preferredCarrier: "Gulf Star Logistics",
    urgency: "Standard",
    confidence: "High",
    status: "Pending",
    receivedRelative: "2 hours ago",
    receivedExact: "Today, 08:12",
    specialRequirements: [
      "Goods are fragile — request extra dunnage and corner protection.",
      "Provide temperature-controlled storage if transit exceeds 5 days.",
    ],
    availabilityQuestions: [
      "Confirm earliest vessel cut-off from Aqaba this week.",
      "Is telex release available for this lane?",
    ],
    missingFields: [],
    suggestedReply: null,
    rawMessage: "Hi team,\n\nPlease send me your best all-in rate for 2 x 40ft HC of electronics, Amman (FOB) to Dubai.",
    history: [
      { label: "Received", time: "Today, 08:12", done: true },
      { label: "Parsed by AI", time: "Today, 08:12", done: true },
      { label: "Sent to Carrier", time: "\u2014", done: false },
      { label: "Quoted", time: "\u2014", done: false },
    ],
  },
  {
    id: "r2",
    source: "WhatsApp",
    senderName: "Gulf Cargo Co",
    senderEmail: "ops@gulfcargo.co",
    senderPhone: "+971 52 777 1200",
    originCity: "Aqaba",
    originCountry: "Jordan",
    originFlag: "\u{1F1EF}\u{1F1F4}",
    destinationCity: "Fremantle",
    destinationCountry: "Australia",
    destinationFlag: "\u{1F1E6}\u{1F1FA}",
    cargoType: "Spices",
    equipment: "1 x 20ft",
    weight: "16 TNE",
    quantity: "16 TNE",
    dimensions: "Palletized \u2014 20 pallets",
    modes: ["Sea"],
    incoterm: "CIF",
    blType: "Original BL",
    preferredCarrier: "\u2014",
    urgency: "Standard",
    confidence: "High",
    status: "Pending",
    receivedRelative: "4 hours ago",
    receivedExact: "Today, 06:40",
    specialRequirements: ["Food-grade container required.", "Fumigation certificate needed for Australian customs."],
    availabilityQuestions: ["Confirm AQIS-compliant container availability."],
    missingFields: [],
    suggestedReply: null,
    rawMessage: "Salam, need CIF rate Aqaba to Fremantle for 16 TNE spices.",
    history: [
      { label: "Received", time: "Today, 06:40", done: true },
      { label: "Parsed by AI", time: "Today, 06:40", done: true },
      { label: "Sent to Carrier", time: "\u2014", done: false },
      { label: "Quoted", time: "\u2014", done: false },
    ],
  },
  {
    id: "r3",
    source: "Email",
    senderName: "Rania Khalil",
    senderEmail: "rania.khalil@skyfreight.com",
    senderPhone: "+962 78 444 5566",
    originCity: "Delhi (DEL)",
    originCountry: "India",
    originFlag: "\u{1F1EE}\u{1F1F3}",
    destinationCity: "Amman",
    destinationCountry: "Jordan",
    destinationFlag: "\u{1F1EF}\u{1F1F4}",
    cargoType: "Aircraft Engine",
    equipment: "Air ULD",
    weight: "5,234 KG",
    quantity: "2 Nos",
    dimensions: "310 x 210 x 180 cm",
    modes: ["Air"],
    incoterm: "EXW",
    blType: "AWB",
    preferredCarrier: "Air Arabia Cargo",
    urgency: "Urgent",
    confidence: "High",
    status: "Sent to Carrier",
    receivedRelative: "Yesterday",
    receivedExact: "Yesterday, 15:20",
    specialRequirements: ["DGR handling \u2014 engine contains residual fuel.", "Dedicated ULD, no consolidation."],
    availabilityQuestions: ["Confirm next available freighter DEL-AMM."],
    missingFields: [],
    suggestedReply: null,
    rawMessage: "Dear team, urgent air freight for 2 aircraft engines.",
    history: [
      { label: "Received", time: "Yesterday, 15:20", done: true },
      { label: "Parsed by AI", time: "Yesterday, 15:20", done: true },
      { label: "Sent to Carrier", time: "Yesterday, 16:05", done: true },
      { label: "Quoted", time: "\u2014", done: false },
    ],
  },
  {
    id: "r4",
    source: "WhatsApp",
    senderName: "Ahmed Nasser",
    senderEmail: "ahmed.nasser@levantexports.com",
    senderPhone: "+966 56 333 9911",
    originCity: "Jeddah",
    originCountry: "Saudi Arabia",
    originFlag: "\u{1F1F8}\u{1F1E6}",
    destinationCity: "Hamburg",
    destinationCountry: "Germany",
    destinationFlag: "\u{1F1E9}\u{1F1EA}",
    cargoType: "General Cargo",
    equipment: "25 x 20ft",
    weight: "18 TNE per container",
    quantity: "25 Nos",
    dimensions: "Standard 20ft",
    modes: ["Sea"],
    incoterm: "FOB",
    blType: "Telex Release",
    preferredCarrier: "\u2014",
    urgency: "Standard",
    confidence: "Medium",
    status: "Pending",
    receivedRelative: "6 hours ago",
    receivedExact: "Today, 04:30",
    specialRequirements: ["Rate needed for full 25-container project shipment."],
    availabilityQuestions: ["Confirm equipment availability for 25 x 20ft at Jeddah."],
    missingFields: [],
    suggestedReply: null,
    rawMessage: "Hello, need FOB rate Jeddah to Hamburg, 25 x 20ft.",
    history: [
      { label: "Received", time: "Today, 04:30", done: true },
      { label: "Parsed by AI", time: "Today, 04:31", done: true },
      { label: "Sent to Carrier", time: "\u2014", done: false },
      { label: "Quoted", time: "\u2014", done: false },
    ],
  },
  {
    id: "r5",
    source: "Voice Note",
    senderName: "Yousef Haddad",
    senderEmail: "yousef@haddadimports.jo",
    senderPhone: "+962 77 888 1010",
    originCity: "Shanghai",
    originCountry: "China",
    originFlag: "\u{1F1E8}\u{1F1F3}",
    destinationCity: "Aqaba",
    destinationCountry: "Jordan",
    destinationFlag: "\u{1F1EF}\u{1F1F4}",
    cargoType: "Furniture",
    equipment: "1 x 40ft HC",
    weight: "12 TNE",
    quantity: "1 Nos",
    dimensions: "Loose loaded",
    modes: ["Sea"],
    incoterm: "CIF",
    blType: "Telex Release",
    preferredCarrier: "\u2014",
    urgency: "Standard",
    confidence: "Low",
    status: "Pending",
    receivedRelative: "1 hour ago",
    receivedExact: "Today, 09:05",
    specialRequirements: [],
    availabilityQuestions: ["Confirm cargo readiness date."],
    missingFields: ["cargo_readiness_date"],
    suggestedReply: "Hi Yousef, thanks for reaching out. Could you please confirm the cargo readiness date?",
    rawMessage: "[Voice note \u2014 0:42] Need a price from China to Aqaba, one 40 foot container of furniture, CIF.",
    history: [
      { label: "Received", time: "Today, 09:05", done: true },
      { label: "Parsed by AI", time: "Today, 09:06", done: true },
      { label: "Sent to Carrier", time: "\u2014", done: false },
      { label: "Quoted", time: "\u2014", done: false },
    ],
  },
]

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
      ["bl_type", "BL Type"],
      ["urgency", "Urgency Level"],
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
