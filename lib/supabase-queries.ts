/**
 * lib/supabase-queries.ts
 * Typed Supabase fetch / realtime helpers for the portal.
 * All reads use the browser client (anon key + JWT) — RLS
 * automatically scopes every query to the user's client_code.
 */

import { createClient } from "@/lib/supabase"
import type { FreightRequest, RequestStatus, Source, Confidence } from "@/lib/portal-data"

// ─── DB row shape (after migration 007) ────────────────────────────────────

export interface DbFreightRequest {
  id: string
  client_code: string
  sender_name: string | null
  sender_email: string | null
  sender_phone: string | null
  source: string
  received_at: string
  raw_message: string | null
  origin_city: string | null
  origin_country: string | null
  destination_city: string | null
  destination_country: string | null
  cargo_type: string | null
  equipment: string | null
  weight: string | null
  quantity: string | null
  dimensions: string | null
  incoterm: string | null
  bl_type: string | null
  preferred_carrier: string | null
  urgency: string
  confidence: string
  is_sea: boolean
  is_air: boolean
  is_land: boolean
  status: string
  is_done: boolean
  special_requirements: string[]
  availability_questions: string[]
  missing_fields: string[]
  suggested_reply: string | null
  history: { label: string; time: string; done: boolean }[]
  created_at: string
  updated_at: string
}

export interface DashboardStats {
  total: number
  email: number
  whatsapp: number
  pending: number
  sentToCarrier: number
  quoted: number
  todayCount: number
  todayDelta: string
}

// ─── Country → flag emoji ───────────────────────────────────────────────────

const COUNTRY_FLAGS: Record<string, string> = {
  // Middle East & North Africa
  "jordan":              "🇯🇴",
  "united arab emirates":"🇦🇪",
  "uae":                 "🇦🇪",
  "saudi arabia":        "🇸🇦",
  "ksa":                 "🇸🇦",
  "egypt":               "🇪🇬",
  "kuwait":              "🇰🇼",
  "bahrain":             "🇧🇭",
  "qatar":               "🇶🇦",
  "oman":                "🇴🇲",
  "iraq":                "🇮🇶",
  "lebanon":             "🇱🇧",
  "syria":               "🇸🇾",
  "israel":              "🇮🇱",
  "turkey":              "🇹🇷",
  "iran":                "🇮🇷",
  "yemen":               "🇾🇪",
  "libya":               "🇱🇾",
  "tunisia":             "🇹🇳",
  "algeria":             "🇩🇿",
  "morocco":             "🇲🇦",
  // Europe
  "united kingdom":      "🇬🇧",
  "uk":                  "🇬🇧",
  "germany":             "🇩🇪",
  "france":              "🇫🇷",
  "netherlands":         "🇳🇱",
  "italy":               "🇮🇹",
  "spain":               "🇪🇸",
  "belgium":             "🇧🇪",
  "poland":              "🇵🇱",
  "portugal":            "🇵🇹",
  "sweden":              "🇸🇪",
  "norway":              "🇳🇴",
  "denmark":             "🇩🇰",
  "finland":             "🇫🇮",
  "greece":              "🇬🇷",
  "austria":             "🇦🇹",
  "switzerland":         "🇨🇭",
  "czech republic":      "🇨🇿",
  "hungary":             "🇭🇺",
  "romania":             "🇷🇴",
  // Asia-Pacific
  "china":               "🇨🇳",
  "india":               "🇮🇳",
  "japan":               "🇯🇵",
  "south korea":         "🇰🇷",
  "singapore":           "🇸🇬",
  "hong kong":           "🇭🇰",
  "taiwan":              "🇹🇼",
  "thailand":            "🇹🇭",
  "malaysia":            "🇲🇾",
  "indonesia":           "🇮🇩",
  "vietnam":             "🇻🇳",
  "philippines":         "🇵🇭",
  "bangladesh":          "🇧🇩",
  "pakistan":            "🇵🇰",
  "sri lanka":           "🇱🇰",
  "myanmar":             "🇲🇲",
  "cambodia":            "🇰🇭",
  "australia":           "🇦🇺",
  "new zealand":         "🇳🇿",
  // Americas
  "united states":       "🇺🇸",
  "usa":                 "🇺🇸",
  "canada":              "🇨🇦",
  "mexico":              "🇲🇽",
  "brazil":              "🇧🇷",
  "argentina":           "🇦🇷",
  "colombia":            "🇨🇴",
  "chile":               "🇨🇱",
  "peru":                "🇵🇪",
  // Africa
  "south africa":        "🇿🇦",
  "nigeria":             "🇳🇬",
  "kenya":               "🇰🇪",
  "ethiopia":            "🇪🇹",
  "ghana":               "🇬🇭",
  "tanzania":            "🇹🇿",
  "mozambique":          "🇲🇿",
  "djibouti":            "🇩🇯",
  // Russia / CIS
  "russia":              "🇷🇺",
  "ukraine":             "🇺🇦",
  "kazakhstan":          "🇰🇿",
}

export function countryToFlag(country: string): string {
  if (!country) return "🌍"
  return COUNTRY_FLAGS[country.toLowerCase()] ?? "🌍"
}

// ─── Date formatters ────────────────────────────────────────────────────────

export function formatRelative(date: Date): string {
  const now = Date.now()
  const diff = now - date.getTime()
  const mins = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days = Math.floor(diff / 86_400_000)

  if (mins < 1)    return "Just now"
  if (mins < 60)   return `${mins} min ago`
  if (hours < 24)  return `${hours} hour${hours > 1 ? "s" : ""} ago`
  if (days === 1)  return "Yesterday"
  if (days < 7)    return `${days} days ago`
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

export function formatExact(date: Date): string {
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  const timeStr = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })

  if (date.toDateString() === today.toDateString())     return `Today, ${timeStr}`
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday, ${timeStr}`
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) + `, ${timeStr}`
}

// ─── Field normalisers ──────────────────────────────────────────────────────

function normalizeSource(src: string): Source {
  if (src === "WhatsApp") return "WhatsApp"
  if (src === "Phone")    return "Voice Note"
  return "Email"
}

function normalizeUrgency(u: string): "Urgent" | "Standard" {
  return u?.toLowerCase() === "urgent" ? "Urgent" : "Standard"
}

function normalizeConfidence(c: string): Confidence {
  const lower = c?.toLowerCase()
  if (lower === "high")   return "High"
  if (lower === "low")    return "Low"
  return "Medium"
}

function normalizeStatus(s: string): RequestStatus {
  if (s === "Sent to Carrier") return "Sent to Carrier"
  if (s === "Quoted")          return "Quoted"
  if (s === "Closed")          return "Closed"
  return "Pending"
}


function buildDefaultHistory(status: string) {
  const done = (label: string, time: string) => ({ label, time, done: true })
  const pending = (label: string) => ({ label, time: "—", done: false })

  const base = [done("Received", "—"), done("Parsed by AI", "—")]
  if (status === "Sent to Carrier") return [...base, done("Sent to Carrier", "—"), pending("Quoted")]
  if (status === "Quoted")          return [...base, done("Sent to Carrier", "—"), done("Quoted", "—")]
  if (status === "Closed")          return [...base, done("Sent to Carrier", "—"), done("Quoted", "—")]
  return [...base, pending("Sent to Carrier"), pending("Quoted")]
}

// ─── Row → FreightRequest mapper ────────────────────────────────────────────

export function mapDbToRequest(row: DbFreightRequest): FreightRequest {
  const receivedAt = new Date(row.received_at)

  return {
    id: row.id,
    source: normalizeSource(row.source),
    senderName:        row.sender_name        ?? "Unknown",
    senderEmail:       row.sender_email       ?? "",
    senderPhone:       row.sender_phone       ?? "",
    originCity:        row.origin_city        ?? "—",
    originCountry:     row.origin_country     ?? "—",
    originFlag:        countryToFlag(row.origin_country ?? ""),
    destinationCity:   row.destination_city   ?? "—",
    destinationCountry:row.destination_country ?? "—",
    destinationFlag:   countryToFlag(row.destination_country ?? ""),
    cargoType:         row.cargo_type         ?? "—",
    equipment:         row.equipment          ?? "—",
    weight:            row.weight             ?? "—",
    quantity:          row.quantity           ?? "—",
    dimensions:        row.dimensions         ?? "—",
    modes: [
      ...(row.is_sea  ? ["Sea"  as const] : []),
      ...(row.is_air  ? ["Air"  as const] : []),
      ...(row.is_land ? ["Land" as const] : []),
    ],
    incoterm:          row.incoterm           ?? "—",
    blType:            row.bl_type            ?? "—",
    preferredCarrier:  row.preferred_carrier  ?? "—",
    urgency:           normalizeUrgency(row.urgency),
    confidence:        normalizeConfidence(row.confidence),
    status:            normalizeStatus(row.status),
    receivedRelative:  formatRelative(receivedAt),
    receivedExact:     formatExact(receivedAt),
    specialRequirements:  Array.isArray(row.special_requirements)  ? row.special_requirements  as string[] : [],
    availabilityQuestions:Array.isArray(row.availability_questions) ? row.availability_questions as string[] : [],
    missingFields:     Array.isArray(row.missing_fields)           ? row.missing_fields           as string[] : [],
    suggestedReply:    row.suggested_reply ?? null,
    rawMessage:        row.raw_message     ?? "",
    history:           Array.isArray(row.history) && row.history.length > 0
                         ? row.history as FreightRequest["history"]
                         : buildDefaultHistory(row.status),
  }
}

// ─── Query helpers ──────────────────────────────────────────────────────────

type SupabaseClient = ReturnType<typeof createClient>

/** Fetch all freight_requests, newest first. */
export async function fetchRequests(supabase: SupabaseClient): Promise<FreightRequest[]> {
  const { data, error } = await supabase
    .from("freight_requests")
    .select("*")
    .order("received_at", { ascending: false })

  if (error) {
    console.error("[supabase] fetchRequests:", error.message)
    return []
  }

  return (data as DbFreightRequest[]).map(mapDbToRequest)
}

/** Fetch aggregate dashboard stats. */
export async function fetchDashboardStats(supabase: SupabaseClient): Promise<DashboardStats> {
  const { data, error } = await supabase
    .from("freight_requests")
    .select("status, source, received_at")
    .order("received_at", { ascending: false })

  if (error || !data) {
    console.error("[supabase] fetchDashboardStats:", error?.message)
    return { total: 0, email: 0, whatsapp: 0, pending: 0, sentToCarrier: 0, quoted: 0, todayCount: 0, todayDelta: "+0 from yesterday" }
  }

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)

  const todayCount     = data.filter(r => new Date(r.received_at) >= today).length
  const yesterdayCount = data.filter(r => {
    const d = new Date(r.received_at)
    return d >= yesterday && d < today
  }).length

  const delta = todayCount - yesterdayCount
  const todayDelta = delta >= 0 ? `+${delta} from yesterday` : `${delta} from yesterday`

  return {
    total:        data.length,
    email:        data.filter(r => r.source === "Email").length,
    whatsapp:     data.filter(r => r.source === "WhatsApp").length,
    pending:      data.filter(r => r.status === "Pending").length,
    sentToCarrier:data.filter(r => r.status === "Sent to Carrier").length,
    quoted:       data.filter(r => r.status === "Quoted").length,
    todayCount,
    todayDelta,
  }
}

/**
 * Subscribe to realtime inserts/updates on freight_requests.
 * Returns an unsubscribe function — call it on component unmount.
 */
export function subscribeToRequests(
  supabase: SupabaseClient,
  onInsert: (row: FreightRequest) => void,
  onUpdate?: (row: FreightRequest) => void,
): () => void {
  const channel = supabase
    .channel("freight_requests_realtime")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "freight_requests" },
      (payload) => onInsert(mapDbToRequest(payload.new as DbFreightRequest)),
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "freight_requests" },
      (payload) => onUpdate?.(mapDbToRequest(payload.new as DbFreightRequest)),
    )
    .subscribe()

  return () => { supabase.removeChannel(channel) }
}
