"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { HOME_HREF, NAV, sectionFor, type BadgeKey, type SectionKey } from "@/lib/portal-nav"

const PIN_KEY = "portal_nav_pin"

export type NavCounts = Partial<Record<BadgeKey, number>>

/**
 * Top bar navigation with a hover sub bar.
 *
 *  - hover a section  → its sub bar appears; it goes away when the pointer leaves
 *  - click a section  → opens the section's main page
 *  - choose a page    → the sub bar stays put until you move to another section
 *  - Home (logo)      → clears the pin; the dashboard shows with no sub bar
 */
export function PortalNav({ counts, onPinned }: { counts: NavCounts; onPinned?: (pinned: boolean) => void }) {
  const pathname = usePathname() ?? ""
  const tab = useSearchParams()?.get("tab") ?? ""

  const current = sectionFor(pathname, tab)
  const [pinFlag, setPinFlag] = useState(false)
  const [hover, setHover] = useState<SectionKey | null>(null)
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // The dashboard doubles as "Home": it only pins the Work bar if the user got there from the bar.
  useEffect(() => {
    try { setPinFlag(sessionStorage.getItem(PIN_KEY) === "1") } catch { /* */ }
  }, [pathname, tab])

  const pinned = current && (pathname !== HOME_HREF || pinFlag) ? current.key : null

  useEffect(() => { onPinned?.(!!pinned) }, [pinned, onPinned])

  const setPin = useCallback((on: boolean) => {
    try { on ? sessionStorage.setItem(PIN_KEY, "1") : sessionStorage.removeItem(PIN_KEY) } catch { /* */ }
    setPinFlag(on)
  }, [])

  const enter = useCallback((k: SectionKey) => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current)
    setHover(k)
  }, [])
  const leave = useCallback(() => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current)
    leaveTimer.current = setTimeout(() => setHover(null), 180)
  }, [])
  useEffect(() => () => { if (leaveTimer.current) clearTimeout(leaveTimer.current) }, [])

  // Close the hover bar after any navigation
  useEffect(() => { setHover(null) }, [pathname, tab])

  const shownKey = hover ?? pinned
  const shown = NAV.find((s) => s.key === shownKey) ?? null
  const sectionTotal = (k: SectionKey) =>
    NAV.find((s) => s.key === k)!.items.reduce((n, i) => n + (i.badge ? counts[i.badge] ?? 0 : 0), 0)

  return (
    <div onMouseLeave={leave} className="contents">
      {/* ── Section buttons ── */}
      <nav aria-label="Main" className="flex min-w-0 items-center justify-center gap-0.5 sm:gap-1.5">
        <Link
          href={HOME_HREF}
          onClick={() => setPin(false)}
          aria-current={pathname === HOME_HREF && !pinned ? "page" : undefined}
          className="relative flex items-center gap-2 rounded-full px-3 py-2.5 text-[14px] font-bold sm:px-6 sm:text-[15.5px]"
          style={{
            color: pathname === HOME_HREF && !pinned ? "#ffffff" : "rgba(255,255,255,0.72)",
            fontFamily: "var(--font-display), var(--font-sans), system-ui, sans-serif",
            letterSpacing: "0.01em",
          }}
        >
          <span>Home</span>
          {pathname === HOME_HREF && !pinned && (
            <span aria-hidden className="absolute -bottom-[11px] left-1/2 h-[3px] w-7 -translate-x-1/2 rounded-full" style={{ background: "var(--brand-accent)" }} />
          )}
        </Link>
        {NAV.map((s) => {
          const isCurrent = pinned === s.key
          const isShown = shownKey === s.key
          const total = sectionTotal(s.key)
          return (
            <Link
              key={s.key}
              href={s.main}
              onClick={() => setPin(true)}
              onMouseEnter={() => enter(s.key)}
              onFocus={() => enter(s.key)}
              aria-current={isCurrent ? "page" : undefined}
              className="relative flex items-center gap-2 rounded-full px-3 py-2.5 text-[14px] font-bold sm:px-6 sm:text-[15.5px]"
              style={{
                background: isShown ? "rgba(255,255,255,0.14)" : "transparent",
                color: isCurrent || isShown ? "#ffffff" : "rgba(255,255,255,0.72)",
                fontFamily: "var(--font-display), var(--font-sans), system-ui, sans-serif",
                letterSpacing: "0.01em",
              }}
            >
              <span>{s.label}</span>
              {total > 0 && (
                <>
                  <span
                    className="hidden h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10.5px] font-bold sm:inline-flex"
                    style={{ background: "var(--brand-accent)", color: "#fff" }}
                  >
                    {total > 99 ? "99+" : total}
                  </span>
                  {/* phones: a dot instead of the number, so the bell and avatar still fit */}
                  <span aria-hidden className="absolute right-1 top-1 h-2 w-2 rounded-full sm:hidden" style={{ background: "var(--brand-accent)" }} />
                </>
              )}
              {isCurrent && (
                <span aria-hidden className="absolute -bottom-[11px] left-1/2 h-[3px] w-7 -translate-x-1/2 rounded-full" style={{ background: "var(--brand-accent)" }} />
              )}
            </Link>
          )
        })}
      </nav>

      {/* ── Sub bar: floats under the top bar; the top bar reserves its height while a page is pinned ── */}
      <SubBar
        key={shown?.key ?? "none"}
        shown={shown}
        pathname={pathname}
        tab={tab}
        counts={counts}
        onEnter={() => { if (shown) enter(shown.key) }}
        onPick={() => setPin(true)}
      />
    </div>
  )
}

function SubBar({
  shown, pathname, tab, counts, onEnter, onPick,
}: {
  shown: (typeof NAV)[number] | null
  pathname: string
  tab: string
  counts: NavCounts
  onEnter: () => void
  onPick: () => void
}) {
  if (!shown) return null
  return (
    <div
      data-subbar
      onMouseEnter={onEnter}
      className="nav-sub-in absolute left-0 right-0 top-full z-40 border-b"
      style={{
        background: "var(--card-bg)",
        borderColor: "var(--card-border)",
        boxShadow: "0 14px 28px -18px rgba(15,30,54,0.35)",
      }}
    >
      <div className="mx-auto flex h-[54px] items-center gap-1 overflow-x-auto px-3 sm:justify-center sm:gap-1.5 md:px-6" role="menu" aria-label={`${shown.label} pages`}>
        {shown.items.map((i) => {
          const active = i.match(pathname, tab)
          const n = i.badge ? counts[i.badge] ?? 0 : 0
          return (
            <Link
              key={i.href}
              href={i.href}
              onClick={onPick}
              role="menuitem"
              aria-current={active ? "page" : undefined}
              className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-[14px] font-semibold"
              style={{
                background: active ? "rgb(var(--brand-accent-rgb) / 0.12)" : "transparent",
                color: active ? "var(--brand-accent)" : "var(--text-secondary)",
                boxShadow: active ? "inset 0 0 0 1px rgb(var(--brand-accent-rgb) / 0.28)" : "none",
              }}
              onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "var(--hover-bg)" }}
              onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent" }}
            >
              {i.label}
              {n > 0 && (
                <span className="inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold" style={{ background: "var(--brand-accent)", color: "#fff" }}>
                  {n > 99 ? "99+" : n}
                </span>
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
