"use client"

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react"
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from "lucide-react"

// ── Types ──────────────────────────────────────────────────────────────────────
export type ToastVariant = "success" | "error" | "warning" | "info"

interface Toast {
  id: string
  variant: ToastVariant
  title: string
  message?: string
  duration?: number
  url?: string
  action?: { label: string; onClick: () => void | Promise<void> }
}

interface ToastCtxValue {
  toast:   (opts: Omit<Toast, "id">) => void
  notification: (title: string, message?: string, url?: string) => void
  success: (title: string, message?: string) => void
  error:   (title: string, message?: string) => void
  warning: (title: string, message?: string) => void
  info:    (title: string, message?: string) => void
}

// ── Context ────────────────────────────────────────────────────────────────────
const ToastCtx = createContext<ToastCtxValue | null>(null)

export function useToast(): ToastCtxValue {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error("useToast must be inside <ToastProvider>")
  return ctx
}

// ── Provider ───────────────────────────────────────────────────────────────────
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback(
    (opts: Omit<Toast, "id">) => {
      const id       = Math.random().toString(36).slice(2)
      const duration = opts.duration ?? 5000
      setToasts((prev) => [...prev.slice(-4), { ...opts, duration, id }])
    },
    [],
  )

  const notification = useCallback(
    (title: string, message?: string, url?: string) =>
      toast({ variant: "info", title, message, duration: 300_000, url }),
    [toast],
  )
  const success = useCallback((title: string, message?: string) => toast({ variant: "success", title, message }), [toast])
  const error   = useCallback((title: string, message?: string) => toast({ variant: "error",   title, message, duration: 7000 }), [toast])
  const warning = useCallback((title: string, message?: string) => toast({ variant: "warning", title, message }), [toast])
  const info    = useCallback((title: string, message?: string) => toast({ variant: "info",    title, message }), [toast])

  return (
    <ToastCtx.Provider value={{ toast, notification, success, error, warning, info }}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="fixed bottom-4 right-4 z-[300] flex flex-col gap-2"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} {...t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

// ── Single toast (same look as the trial's popup: navy pill, white text) ──────
const ICONS: Record<ToastVariant, { icon: React.ElementType; color: string }> = {
  success: { icon: CheckCircle,   color: "#34D399" },
  error:   { icon: AlertCircle,   color: "#F87171" },
  warning: { icon: AlertTriangle, color: "#FBBF24" },
  info:    { icon: Info,          color: "#7DB2FF" },
}

function ToastItem({ id, variant, title, message, url, action, duration = 5000, onDismiss }: Toast & { onDismiss: (id: string) => void }) {
  const { icon: Icon, color } = ICONS[variant]
  const [paused, setPaused] = useState(false)
  const left = useRef(duration)          // time still to run
  const startedAt = useRef(Date.now())
  // Hovering pauses the countdown (and the bar); leaving resumes from where it stopped.
  useEffect(() => {
    if (paused) return
    startedAt.current = Date.now()
    const t = setTimeout(() => onDismiss(id), left.current)
    return () => { clearTimeout(t); left.current = Math.max(0, left.current - (Date.now() - startedAt.current)) }
  }, [paused, id, onDismiss])

  return (
    <div
      role="alert"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="relative flex w-[min(92vw,380px)] items-center gap-3 overflow-hidden rounded-xl px-[18px] py-3 text-white"
      style={{ background: "#0F1E36", border: "1px solid rgba(255,255,255,.2)", boxShadow: "0 1px 2px rgba(15,30,54,.06), 0 8px 24px -12px rgba(15,30,54,.35)", animation: "toast-in .25s ease-out" }}
    >
      <Icon className="h-4 w-4 shrink-0" style={{ color }} />
      <button
        type="button"
        onClick={() => { if (url) window.location.href = url; onDismiss(id) }}
        className={`min-w-0 flex-1 text-left ${url ? "cursor-pointer" : "cursor-default"}`}
      >
        <p className="text-[14.5px] font-medium leading-snug">{title}</p>
        {message && <p className="mt-0.5 text-[12.5px] leading-snug text-white/70">{message}</p>}
        {url && <p className="mt-1 text-[10px] text-white/50">Tap to open →</p>}
      </button>
      {action && (
        <button
          type="button"
          onClick={() => { onDismiss(id); void action.onClick() }}
          className="shrink-0 rounded-lg px-3 py-1 text-[13px] font-bold"
          style={{ background: "#E8821A", color: "#0F1E36" }}
        >
          {action.label}
        </button>
      )}
      <button
        type="button"
        onClick={() => onDismiss(id)}
        aria-label="Dismiss notification"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-white/50 transition-colors hover:bg-white/10 hover:text-white"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      {action && (
        <div className="absolute bottom-0 left-0 h-[3px] w-full"
          style={{ background: "#E8821A", transformOrigin: "left", animation: `toast-bar ${duration}ms linear forwards`, animationPlayState: paused ? "paused" : "running" }} />
      )}
      <style>{`
        @keyframes toast-bar { from { transform: scaleX(1); } to { transform: scaleX(0); } }
        @keyframes toast-in {
          from { transform: translateY(12px); opacity: 0; }
          to   { transform: none; opacity: 1; }
        }
      `}</style>
    </div>
  )
}
