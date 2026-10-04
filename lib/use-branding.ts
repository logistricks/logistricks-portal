"use client"
import { useEffect, useState } from "react"

export interface Branding { displayName: string; logo: string | null }
const KEY = "portal-branding"
let cache: Branding | null = null
let inflight: Promise<Branding | null> | null = null

function read(): Branding | null {
  if (cache) return cache
  try { const s = localStorage.getItem(KEY); if (s) cache = JSON.parse(s) } catch { /* */ }
  return cache
}

export function setBranding(b: Branding) {
  cache = b
  try { localStorage.setItem(KEY, JSON.stringify(b)) } catch { /* quota */ }
  window.dispatchEvent(new Event("branding-changed"))
}

async function fetchBranding() {
  inflight ??= fetch("/api/branding", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((b) => { if (b) setBranding(b); return b })
    .catch(() => null)
    .finally(() => { inflight = null })
  return inflight
}

/** Client display name + optional logo (null = no logo). Instant from cache, refreshed from the db. */
export function useBranding(): Branding {
  const [b, setB] = useState<Branding>({ displayName: "", logo: null })
  useEffect(() => {
    const sync = () => { const c = read(); if (c) setB(c) }
    sync()
    fetchBranding()
    window.addEventListener("branding-changed", sync)
    return () => window.removeEventListener("branding-changed", sync)
  }, [])
  return b
}
