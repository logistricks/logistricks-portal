export type Source = "Email" | "WhatsApp" | "Voice Note"
export type Confidence = "High" | "Medium" | "Low"
export type RequestStatus = "Pending" | "Sent to Carrier" | "Quoted" | "Closed"
export type Mode = "Sea" | "Air" | "Land"
export type Language = "Arabic" | "English" | "Both"

export type Carrier = {
  id: string
  name: string
  country: string
  flag: string
  contactName: string
  contactRole: string
  email: string
  whatsapp: string
  modes: Mode[]
  language: Language
  routes: string
  notes?: string
  active: boolean
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
  receivedRelative: string
  receivedExact: string
  specialRequirements: string[]
  availabilityQuestions: string[]
  rawMessage: string
  history: StatusEvent[]
}

export const carriers: Carrier[] = [
  {
    id: "c1",
    name: "Gulf Star Logistics",
    country: "UAE",
    flag: "🇦🇪",
    contactName: "Ahmed Al-Rashidi",
    contactRole: "Operations Manager",
    email: "ahmed@gulfstarlog.ae",
    whatsapp: "+971 50 123 4567",
    modes: ["Sea", "Land"],
    language: "Arabic",
    routes: "UAE, Saudi Arabia, Jordan, India",
    notes: "Preferred for GCC road freight. Fast reefer availability.",
    active: true,
  },
  {
    id: "c2",
    name: "Air Arabia Cargo",
    country: "UAE",
    flag: "🇦🇪",
    contactName: "Sara Al-Mansouri",
    contactRole: "Cargo Sales",
    email: "sara.m@airarabiacargo.com",
    whatsapp: "+971 54 987 6543",
    modes: ["Air"],
    language: "English",
    routes: "GCC, Indian Subcontinent, Europe",
    notes: "Strong on time-critical air freight.",
    active: true,
  },
  {
    id: "c3",
    name: "Trans Arabia Freight",
    country: "Saudi Arabia",
    flag: "🇸🇦",
    contactName: "Khaled Abboud",
    contactRole: "Director",
    email: "k.abboud@transarabia.sa",
    whatsapp: "+966 55 222 3344",
    modes: ["Land"],
    language: "Both",
    routes: "Saudi Arabia, Jordan, UAE, Kuwait",
    active: true,
  },
  {
    id: "c4",
    name: "Mediterranean Shipping",
    country: "Jordan",
    flag: "🇯🇴",
    contactName: "Omar Yusuf",
    contactRole: "Key Accounts",
    email: "omar.yusuf@medship.jo",
    whatsapp: "+962 79 555 8899",
    modes: ["Sea"],
    language: "English",
    routes: "Mediterranean, North Europe, Far East",
    active: false,
  },
]

export const requests: FreightRequest[] = [
  {
    id: "r1",
    source: "Email",
    senderName: "Fadi Tamimi",
    senderEmail: "fadi.tamimi@orbittrading.com",
    senderPhone: "+962 79 111 2233",
    originCity: "Amman",
    originCountry: "Jordan",
    originFlag: "🇯🇴",
    destinationCity: "Dubai",
    destinationCountry: "UAE",
    destinationFlag: "🇦🇪",
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
    rawMessage:
      "Hi team,\n\nPlease send me your best all-in rate for 2 x 40ft HC of electronics, Amman (FOB) to Dubai. Total 2 pieces, approx 5,234 KG each. Dimensions 380 x 240 x 252 cm. Need telex release. Cargo is fragile, please advise on packing.\n\nBest regards,\nFadi Tamimi\nOrbit Trading",
    history: [
      { label: "Received", time: "Today, 08:12", done: true },
      { label: "Parsed by AI", time: "Today, 08:12", done: true },
      { label: "Sent to Carrier", time: "—", done: false },
      { label: "Quoted", time: "—", done: false },
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
    originFlag: "🇯🇴",
    destinationCity: "Fremantle",
    destinationCountry: "Australia",
    destinationFlag: "🇦🇺",
    cargoType: "Spices",
    equipment: "1 x 20ft",
    weight: "16 TNE",
    quantity: "16 TNE",
    dimensions: "Palletized — 20 pallets",
    modes: ["Sea"],
    incoterm: "CIF",
    blType: "Original BL",
    preferredCarrier: "—",
    urgency: "Standard",
    confidence: "High",
    status: "Pending",
    receivedRelative: "4 hours ago",
    receivedExact: "Today, 06:40",
    specialRequirements: ["Food-grade container required.", "Fumigation certificate needed for Australian customs."],
    availabilityQuestions: ["Confirm AQIS-compliant container availability."],
    rawMessage:
      "Salam, need CIF rate Aqaba to Fremantle for 16 TNE spices, 1x20ft, food grade container. Fumigation cert required. When is next sailing?",
    history: [
      { label: "Received", time: "Today, 06:40", done: true },
      { label: "Parsed by AI", time: "Today, 06:40", done: true },
      { label: "Sent to Carrier", time: "—", done: false },
      { label: "Quoted", time: "—", done: false },
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
    originFlag: "🇮🇳",
    destinationCity: "Amman",
    destinationCountry: "Jordan",
    destinationFlag: "🇯🇴",
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
    specialRequirements: ["DGR handling — engine contains residual fuel.", "Dedicated ULD, no consolidation."],
    availabilityQuestions: ["Confirm next available freighter DEL-AMM.", "Provide DGR surcharge breakdown."],
    rawMessage:
      "Dear team,\n\nUrgent — please quote air freight for 2 aircraft engines, 5,234 KG total, DEL to Amman, EXW. DGR handling required. Need earliest freighter.\n\nRegards,\nRania Khalil",
    history: [
      { label: "Received", time: "Yesterday, 15:20", done: true },
      { label: "Parsed by AI", time: "Yesterday, 15:20", done: true },
      { label: "Sent to Carrier", time: "Yesterday, 16:05", done: true },
      { label: "Quoted", time: "—", done: false },
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
    originFlag: "🇸🇦",
    destinationCity: "Hamburg",
    destinationCountry: "Germany",
    destinationFlag: "🇩🇪",
    cargoType: "General Cargo",
    equipment: "25 x 20ft",
    weight: "18 TNE per container",
    quantity: "25 Nos",
    dimensions: "Standard 20ft",
    modes: ["Sea"],
    incoterm: "FOB",
    blType: "Telex Release",
    preferredCarrier: "—",
    urgency: "Standard",
    confidence: "Medium",
    status: "Pending",
    receivedRelative: "6 hours ago",
    receivedExact: "Today, 04:30",
    specialRequirements: ["Rate needed for full 25-container project shipment."],
    availabilityQuestions: ["Confirm equipment availability for 25 x 20ft at Jeddah.", "Provide free time at destination."],
    rawMessage:
      "Hello, need FOB rate Jeddah to Hamburg, 25 x 20ft general cargo, telex release. Project shipment over 3 weeks. Please advise space and rates.",
    history: [
      { label: "Received", time: "Today, 04:30", done: true },
      { label: "Parsed by AI", time: "Today, 04:31", done: true },
      { label: "Sent to Carrier", time: "—", done: false },
      { label: "Quoted", time: "—", done: false },
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
    originFlag: "🇨🇳",
    destinationCity: "Aqaba",
    destinationCountry: "Jordan",
    destinationFlag: "🇯🇴",
    cargoType: "Furniture",
    equipment: "1 x 40ft HC",
    weight: "12 TNE",
    quantity: "1 Nos",
    dimensions: "Loose loaded",
    modes: ["Sea"],
    incoterm: "CIF",
    blType: "Telex Release",
    preferredCarrier: "—",
    urgency: "Standard",
    confidence: "Low",
    status: "Pending",
    receivedRelative: "1 hour ago",
    receivedExact: "Today, 09:05",
    specialRequirements: [],
    availabilityQuestions: ["Confirm cargo readiness date — not stated in voice note.", "Verify exact commodity for customs."],
    rawMessage: "[Voice note — 0:42] Transcribed: Need a price from China to Aqaba, one 40 foot container of furniture, CIF. Call me back.",
    history: [
      { label: "Received", time: "Today, 09:05", done: true },
      { label: "Parsed by AI", time: "Today, 09:06", done: true },
      { label: "Sent to Carrier", time: "—", done: false },
      { label: "Quoted", time: "—", done: false },
    ],
  },
]

export type Template = {
  id: string
  name: string
  type: "Email" | "WhatsApp"
  subject?: string
  body: string
  linkedCarrierIds: string[]
  isDefault: boolean
}

export const templates: Template[] = [
  {
    id: "t1",
    name: "Standard Rate Request",
    type: "Email",
    subject: "Rate Request: {{origin_city}} → {{destination_city}} ({{mode}})",
    body: "Dear {{contact_name}},\n\nWe have a shipment enquiry and would appreciate your best all-in rate:\n\nOrigin: {{origin_city}}, {{origin_country}}\nDestination: {{destination_city}}, {{destination_country}}\nCargo: {{cargo_type}}\nEquipment: {{equipment}}\nWeight: {{weight}}\nIncoterm: {{incoterm}}\n\nPlease share rates, transit time and validity at your earliest.\n\nBest regards,\nLogistricks Operations",
    linkedCarrierIds: ["c1", "c2", "c3", "c4"],
    isDefault: true,
  },
  {
    id: "t2",
    name: "Urgent Air Freight",
    type: "Email",
    subject: "URGENT Air Rate: {{origin_city}} → {{destination_city}}",
    body: "Dear {{contact_name}},\n\nWe have an urgent air freight requirement:\n\n{{origin_city}} → {{destination_city}}\nCargo: {{cargo_type}} — {{weight}}\nUrgency: {{urgency}}\n\nPlease revert with earliest freighter availability and all-in rate.\n\nRegards,\nLogistricks Operations",
    linkedCarrierIds: ["c2"],
    isDefault: false,
  },
  {
    id: "t3",
    name: "WhatsApp Rate Request",
    type: "WhatsApp",
    body: "Hi {{contact_name}} 👋\nNeed your best rate:\n*{{origin_city}} → {{destination_city}}*\n{{cargo_type}} | {{equipment}}\n{{weight}} | {{incoterm}}\nPls share rate + transit time. Thanks!",
    linkedCarrierIds: ["c1", "c3"],
    isDefault: true,
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
      ["carrier_whatsapp", "Carrier WhatsApp"],
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
  name: "Abdulaziz Al-Otaibi",
  email: "abdulaziz@orbitfreight.com",
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
