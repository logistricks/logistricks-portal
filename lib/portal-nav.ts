/**
 * Portal navigation map — the single source of truth for the top bar and its
 * sub bar. Every page of the portal is listed here, so nothing is orphaned.
 *
 *   Home   logo only (goes to the dashboard)
 *   Work   day-to-day: requests, quotes, approvals, dashboard, reports
 *   Builder  what clients receive: quotation templates, carriers, notification templates
 *   Admin  configuration: rules, receivers, emails, approvals, activity, logs, users, theme
 *
 * Pages that live inside /settings are selected with ?tab=…
 */

export type SectionKey = "work" | "builder" | "admin"
export type BadgeKey = "pending" | "unlinked" | "approvals"

export interface NavItem {
  label: string
  href: string
  badge?: BadgeKey
  /** true when the current URL belongs to this item */
  match: (path: string, tab: string) => boolean
}

export interface NavSection {
  key: SectionKey
  label: string
  /** page opened when the section itself is clicked */
  main: string
  items: NavItem[]
}

const startsWith = (base: string) => (p: string) => p === base || p.startsWith(base + "/")
const settingsTab = (...tabs: string[]) => (p: string, t: string) => p === "/settings" && tabs.includes(t)

export const HOME_HREF = "/dashboard"

export const NAV: NavSection[] = [
  {
    key: "work",
    label: "Work",
    main: "/requests",
    items: [
      { label: "Requests",          href: "/requests",        badge: "pending",   match: startsWith("/requests") },
      { label: "Non-Linked Quotes", href: "/unlinked-quotes", badge: "unlinked",  match: startsWith("/unlinked-quotes") },
      { label: "Approvals",         href: "/approvals",       badge: "approvals", match: startsWith("/approvals") },
      { label: "Dashboard",         href: "/dashboard",                            match: startsWith("/dashboard") },
      { label: "Reports",           href: "/reports",                              match: startsWith("/reports") },
    ],
  },
  {
    key: "builder",
    label: "Builder",
    main: "/settings?tab=templates",
    items: [
      { label: "Templates",              href: "/settings?tab=templates",     match: settingsTab("templates") },
      { label: "Carriers",               href: "/settings?tab=carriers",      match: settingsTab("carriers") },
      { label: "Notification Templates", href: "/settings?tab=notifications", match: settingsTab("notifications") },
    ],
  },
  {
    key: "admin",
    label: "Admin",
    main: "/settings?tab=rules",
    items: [
      { label: "Receivers",       href: "/settings?tab=receivers", match: settingsTab("receivers") },
      { label: "Emails",          href: "/settings?tab=emails",    match: (p, t) => settingsTab("emails")(p, t) || p.startsWith("/settings/email-sources") },
      // /settings with no tab opens Rules, so old bookmarks still land somewhere useful
      { label: "Rules",           href: "/settings?tab=rules",     match: (p, t) => p === "/settings" && (t === "rules" || t === "") },
      { label: "Approval Setup",  href: "/settings/approval-cycles", match: startsWith("/settings/approval-cycles") },
      { label: "Activity",        href: "/users?tab=activity",     match: (p, t) => p === "/users" && t === "activity" },
      { label: "Auto-Reply Log",  href: "/auto-reply-logs",        match: startsWith("/auto-reply-logs") },
      { label: "Users",           href: "/users",                  match: (p, t) => p === "/users" && t !== "activity" },
      { label: "Brand & Colours", href: "/settings?tab=theme",     match: (p, t) => settingsTab("theme")(p, t) || p.startsWith("/settings/theme") },
    ],
  },
]

/** Which section does this URL belong to? null → Home (nothing to show). */
export function sectionFor(path: string, tab: string): NavSection | null {
  for (const s of NAV) if (s.items.some((i) => i.match(path, tab))) return s
  return null
}
