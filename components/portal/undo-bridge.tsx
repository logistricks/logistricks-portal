"use client"

import { useEffect } from "react"
import { useToast } from "@/components/ui/toast"

/**
 * Any portal change that the server can reverse answers with x-undo-id / x-undo-label headers.
 * This watches those responses and shows "<label> [Undo]" for 10 seconds, with a countdown bar.
 */
export function UndoBridge() {
  const { toast, success, error } = useToast()
  useEffect(() => {
    const orig = window.fetch
    const patched: typeof window.fetch = async (...args) => {
      const res = await orig(...args)
      try {
        const method = String((args[1] as RequestInit | undefined)?.method ?? (args[0] instanceof Request ? args[0].method : "GET")).toUpperCase()
        const id = method === "GET" || method === "HEAD" ? null : res.headers.get("x-undo-id")
        if (id && res.ok) {
          const label = decodeURIComponent(res.headers.get("x-undo-label") || "Changed")
          toast({
            variant: "success", title: label, duration: 10_000,
            action: {
              label: "Undo",
              onClick: async () => {
                try {
                  const r = await orig("/api/undo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) })
                  const j = await r.json().catch(() => ({}))
                  if (!r.ok) { error("Could not undo", j.error); return }
                  success("Undone", label)
                  setTimeout(() => window.location.reload(), 700)
                } catch { error("Could not undo", "Network error") }
              },
            },
          })
        }
      } catch { /* never break a request */ }
      return res
    }
    window.fetch = patched
    return () => { if (window.fetch === patched) window.fetch = orig }
  }, [toast, success, error])
  return null
}
