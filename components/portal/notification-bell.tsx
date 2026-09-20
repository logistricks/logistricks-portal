"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Bell, BellOff, Package, CheckCheck, X } from "lucide-react"

interface Notification {
  id: string
  type: string
  title: string
  body: string | null
  request_id: string | null
  read_at: string | null
  created_at: string
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function urlB64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const [pushState, setPushState] = useState<"idle" | "requesting" | "enabled" | "denied" | "unsupported">("idle")
  const trayRef = useRef<HTMLDivElement>(null)

  const unread = notifications.filter((n) => !n.read_at).length

  // ─── Fetch notifications ───────────────────────────────────────────────────
  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications")
      if (res.ok) setNotifications(await res.json())
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    fetchNotifications()
    const id = setInterval(fetchNotifications, 30_000)
    const onFocus = () => fetchNotifications()
    window.addEventListener("focus", onFocus)
    return () => { clearInterval(id); window.removeEventListener("focus", onFocus) }
  }, [fetchNotifications])

  // ─── Close on outside click ────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (trayRef.current && !trayRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handle)
    return () => document.removeEventListener("mousedown", handle)
  }, [open])

  // ─── Detect current push state ─────────────────────────────────────────────
  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setPushState("unsupported")
      return
    }
    if (Notification.permission === "denied") setPushState("denied")
    else if (Notification.permission === "granted") {
      // Check if actually subscribed
      navigator.serviceWorker.ready.then((reg) =>
        reg.pushManager.getSubscription().then((sub) => {
          setPushState(sub ? "enabled" : "idle")
        })
      )
    }
  }, [])

  // ─── Enable push ──────────────────────────────────────────────────────────
  async function enablePush() {
    if (!("Notification" in window)) return
    setPushState("requesting")

    const permission = await Notification.requestPermission()
    if (permission !== "granted") {
      setPushState(permission === "denied" ? "denied" : "idle")
      return
    }

    try {
      const reg = await navigator.serviceWorker.ready
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidKey) throw new Error("VAPID public key not configured")

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(vapidKey),
      })

      const json = sub.toJSON()
      await fetch("/api/notifications/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          p256dh:   (json.keys as Record<string, string>).p256dh,
          auth:     (json.keys as Record<string, string>).auth,
        }),
      })
      setPushState("enabled")
    } catch (err) {
      console.error("Push subscription failed:", err)
      setPushState("idle")
    }
  }

  // ─── Disable push ─────────────────────────────────────────────────────────
  async function disablePush() {
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await fetch("/api/notifications/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
      setPushState("idle")
    } catch {
      setPushState("idle")
    }
  }

  // ─── Mark read ─────────────────────────────────────────────────────────────
  async function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })))
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ read_all: true }),
    })
  }

  async function markOneRead(id: string) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read_at: n.read_at ?? new Date().toISOString() } : n))
    )
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
  }

  return (
    <div className="relative" ref={trayRef}>
      {/* Bell button */}
      <button
        type="button"
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded text-[#64748B] transition-colors hover:bg-[#F0F4F8] hover:text-[#0F172A] dark:text-[#94A3B8] dark:hover:bg-[#1E3A5F] dark:hover:text-white"
      >
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#F97316] text-[9px] font-bold leading-none text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {/* Tray */}
      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 rounded-xl border border-[#E2E8F0] bg-white shadow-xl dark:border-[#1E3A5F] dark:bg-[#0D1B2A] sm:w-96">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#E2E8F0] px-4 py-3 dark:border-[#1E3A5F]">
            <span className="text-sm font-semibold text-[#0F172A] dark:text-white">Notifications</span>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A] dark:text-[#94A3B8] dark:hover:bg-[#1E3A5F] dark:hover:text-white"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Mark all read
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded p-1 text-[#94A3B8] hover:bg-[#F8FAFC] dark:hover:bg-[#1E3A5F]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Push toggle */}
          {pushState !== "unsupported" && (
            <div className="border-b border-[#E2E8F0] px-4 py-2.5 dark:border-[#1E3A5F]">
              {pushState === "enabled" ? (
                <button
                  type="button"
                  onClick={disablePush}
                  className="flex w-full items-center gap-2 text-left text-xs text-[#64748B] hover:text-[#0F172A] dark:text-[#94A3B8] dark:hover:text-white"
                >
                  <BellOff className="h-3.5 w-3.5 shrink-0 text-[#22C55E]" />
                  <span><span className="font-medium text-[#22C55E]">Push enabled</span> — tap to disable</span>
                </button>
              ) : pushState === "denied" ? (
                <p className="text-xs text-[#EF4444]">Push blocked in browser settings</p>
              ) : (
                <button
                  type="button"
                  onClick={enablePush}
                  disabled={pushState === "requesting"}
                  className="flex w-full items-center gap-2 text-left text-xs font-medium text-[#F97316] hover:text-[#EA6E0D] disabled:opacity-60"
                >
                  <Bell className="h-3.5 w-3.5 shrink-0" />
                  {pushState === "requesting" ? "Requesting permission…" : "Enable push notifications"}
                </button>
              )}
            </div>
          )}

          {/* List */}
          <div className="max-h-[400px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <Package className="h-8 w-8 text-[#CBD5E1]" />
                <p className="text-sm text-[#94A3B8]">No notifications yet</p>
              </div>
            ) : (
              <ul>
                {notifications.map((n) => (
                  <li
                    key={n.id}
                    className={`relative border-b border-[#F1F5F9] last:border-0 dark:border-[#1A2D4A] ${
                      !n.read_at ? "bg-[#FFF7ED] dark:bg-[#1E2D1A]" : ""
                    }`}
                  >
                    <button
                      type="button"
                      className="w-full px-4 py-3 text-left"
                      onClick={() => {
                        if (!n.read_at) markOneRead(n.id)
                        if (n.request_id) {
                          window.location.href = `/requests`
                          setOpen(false)
                        }
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                          !n.read_at
                            ? "bg-[#F97316]/15 text-[#F97316]"
                            : "bg-[#F1F5F9] text-[#94A3B8] dark:bg-[#1E3A5F]"
                        }`}>
                          <Package className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`text-xs font-semibold leading-tight ${!n.read_at ? "text-[#0F172A] dark:text-white" : "text-[#64748B] dark:text-[#94A3B8]"}`}>
                            {n.title}
                          </p>
                          {n.body && (
                            <p className="mt-0.5 line-clamp-1 text-[11px] text-[#94A3B8]">{n.body}</p>
                          )}
                          <p className="mt-1 text-[10px] text-[#CBD5E1]">{timeAgo(n.created_at)}</p>
                        </div>
                        {!n.read_at && (
                          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#F97316]" />
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
