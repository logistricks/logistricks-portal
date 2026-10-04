/** Report catalogue — shared by the page (cards + filters) and the API. No server imports here. */
export type CellType = "text" | "num" | "money" | "date" | "datetime" | "pct" | "hours"
export interface ColumnDef { key: string; label: string; type?: CellType; align?: "left" | "right" | "center" }
export interface FilterDef {
  key: string; label: string; type: "select" | "text" | "number"
  options?: { value: string; label: string }[]
  dynamic?: "carriers" | "statuses"
  placeholder?: string
}
export interface ReportDef {
  id: string; title: string; description: string
  category: "Operations" | "Carriers" | "Sales" | "Service"
  icon: "list" | "funnel" | "scale" | "truck" | "dollar" | "route" | "users" | "clock" | "mail" | "alert" | "chart"
  /** Snapshot reports ignore the date range. */
  snapshot?: boolean
  filters: FilterDef[]
}
export interface ReportResult {
  title: string
  columns: ColumnDef[]
  rows: Record<string, any>[]
  summary: { label: string; value: number | string | null; type?: CellType }[]
  note?: string
  truncated?: boolean
}

const MODE: FilterDef = { key: "mode", label: "Transport mode", type: "select", options: [
  { value: "", label: "All modes" }, { value: "sea", label: "Sea" }, { value: "air", label: "Air" }, { value: "land", label: "Land" }] }
const STATUS: FilterDef = { key: "status", label: "Status", type: "select", dynamic: "statuses", options: [{ value: "", label: "All statuses" }] }
const CARRIER: FilterDef = { key: "carrier", label: "Carrier", type: "select", dynamic: "carriers", options: [{ value: "", label: "All carriers" }] }
const SOURCE: FilterDef = { key: "source", label: "Channel", type: "select", options: [
  { value: "", label: "All channels" }, { value: "Email", label: "Email" }, { value: "WhatsApp", label: "WhatsApp" }] }
const INTAKE: FilterDef = { key: "intake", label: "Intake", type: "select", options: [
  { value: "", label: "Automatic & manual" }, { value: "automatic", label: "Automatic" }, { value: "manual", label: "Manual" }] }
const TEXT = (label = "Search", placeholder = "Sender, reference, city…"): FilterDef => ({ key: "q", label, type: "text", placeholder })

export const REPORTS: ReportDef[] = [
  { id: "requests", title: "Requests Register", category: "Operations", icon: "list",
    description: "Every freight request received in the period with route, cargo, incoterm and status. The master list for audits and hand-overs.",
    filters: [STATUS, MODE, SOURCE, INTAKE, TEXT()] },
  { id: "pipeline", title: "Pipeline & Conversion", category: "Operations", icon: "funnel",
    description: "How many requests made it from received to RFQ sent, carrier quote, quotation sent and closed — with the drop-off at each stage.",
    filters: [MODE, SOURCE] },
  { id: "activity", title: "Activity Summary", category: "Operations", icon: "chart",
    description: "Requests, carrier quotes, quotations, closed shipments and quoted value grouped by day, week or month.",
    filters: [{ key: "group", label: "Group by", type: "select", options: [{ value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "month", label: "Month" }] }, MODE] },
  { id: "attention", title: "Needs Attention", category: "Operations", icon: "alert", snapshot: true,
    description: "Open requests that are stale, missing information, or EXW without a pickup address. Live snapshot, not period based.",
    filters: [{ key: "issue", label: "Issue", type: "select", options: [
      { value: "", label: "All issues" }, { value: "stale", label: "Stale (no progress)" }, { value: "missing", label: "Missing information" }, { value: "exw", label: "EXW without pickup address" }] },
      { key: "minAge", label: "Older than (days)", type: "number", placeholder: "0" }] },
  { id: "carrier_quotes", title: "Carrier Quotes Comparison", category: "Carriers", icon: "scale",
    description: "All carrier quotes received, per request, with rate, transit time, free days and validity. The lowest rate for each request is flagged.",
    filters: [CARRIER, { key: "q", label: "Request reference", type: "text", placeholder: "e.g. LT-0017" }] },
  { id: "carrier_perf", title: "Carrier Performance", category: "Carriers", icon: "truck",
    description: "Per carrier: RFQs sent, quotes received, response rate, average rate and average time to respond.",
    filters: [CARRIER] },
  { id: "quotations", title: "Quotations & Margin", category: "Sales", icon: "dollar",
    description: "Quotations prepared for requesters with carrier base rate, markup, final price and margin.",
    filters: [{ key: "qstatus", label: "Quotation status", type: "select", options: [{ value: "", label: "Draft & sent" }, { value: "sent", label: "Sent" }, { value: "draft", label: "Draft" }] }, TEXT("Requester", "Name or email")] },
  { id: "lanes", title: "Lane Analysis", category: "Sales", icon: "route",
    description: "Origin → destination lanes ranked by volume, with average carrier rate and average quoted price.",
    filters: [MODE, { key: "minReq", label: "Minimum requests", type: "number", placeholder: "1" }] },
  { id: "customers", title: "Requester Activity", category: "Sales", icon: "users",
    description: "Who is sending you work: requests, quotations sent, quoted value and closed shipments per requester.",
    filters: [TEXT("Requester", "Name or email")] },
  { id: "response_time", title: "Response Time", category: "Service", icon: "clock",
    description: "Hours from request received to first RFQ, first carrier quote and first quotation — per request, with medians.",
    filters: [STATUS] },
  { id: "auto_reply", title: "Auto-reply Log", category: "Service", icon: "mail",
    description: "Every automatic acknowledgement, missing-information and carrier email the portal produced.",
    filters: [{ key: "type", label: "Type", type: "select", options: [
      { value: "", label: "All types" }, { value: "acknowledgement", label: "Acknowledgement" }, { value: "missing_fields", label: "Missing fields" }, { value: "carrier", label: "Carrier" }] },
      TEXT("Sender", "Email or name")] },
]

export const reportById = (id: string) => REPORTS.find((r) => r.id === id)
