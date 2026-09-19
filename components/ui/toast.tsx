"use client"

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react"
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from "lucide-react"

// ── Types ──────────────────────────────────────────────────────────────────────
export type ToastVariant = "success" | "error" | "warning" | "info"

interface Toast {
  id: string
  variant: ToastVariant
  title: string
  message?: string
  duration?: number
}

interface ToastCtxValue {
  toast:   (opts: Omit<Toast, "id">) => void
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
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const dismiss = useCallback((id: string) => {
    clearTimeout(timers.current[id])
    delete timers.current[id]
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback(
    (opts: Omit<Toast, "id">) => {
      const id       = Math.random().toString(36).slice(2)
      const duration = opts.duration ?? 5000
      setToasts((prev) => [...prev.slice(-4), { ...opts, id }])
      timers.current[id] = setTimeout(() => dismiss(id), duration)
    },
    [dismiss],
  )

  const success = useCallback((title: string, message?: string) => toast({ variant: "success", title, message }), [toast])
  const error   = useCallback((title: string, message?: string) => toast({ variant: "error",   title, message, duration: 7000 }), [toast])
  const warning = useCallback((title: string, message?: string) => toast({ variant: "warning", title, message }), [toast])
  const info    = useCallback((title: string, message?: string) => toast({ variant: "info",    title, message }), [toast])

  return (
    <ToastCtx.Provider value={{ toast, success, error, warning, info }}>
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

// ── Single toast ───────────────────────────────────────────────────────────────
const styles: Record<ToastVariant, { bar: string; icon: React.ElementType; cls: string }> = {
  success: { bar: "bg-emerald-500", icon: CheckCircle,   cls: "text-emerald-500" },
  error:   { bar: "bg-red-500",     icon: AlertCircle,   cls: "text-red-500"     },
  warning: { bar: "bg-amber-400",   icon: AlertTriangle, cls: "text-amber-400"   },
  info:    { bar: "bg-[#3B82F6]",   icon: Info,          cls: "text-[#3B82F6]"  },
}

function ToastItem({ id, variant, title, message, onDismiss }: Toast & { onDismiss: (id: string) => void }) {
  const s = styles[variant]
  const Icon = s.icon
  return (
    <div
      role="alert"
      className="relative flex w-80 overflow-hidden rounded border border-[#E2E8F0] bg-white shadow-xl dark:border-[#1E3A5F] dark:bg-[#111E33]"
      style={{ animation: "toast-in 0.18s ease-out" }}
    >
      <div className={`w-1 shrink-0 ${s.bar}`} />
      <div className="flex flex-1 items-start gap-3 px-3.5 py-3">
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${s.cls}`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#0D1B2A] dark:text-[#E2E8F0]">{title}</p>
          {message && (
            <p className="mt-0.5 text-xs text-[#64748B] dark:text-[#94A3B8]">{message}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onDismiss(id)}
          aria-label="Dismiss notification"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[#94A3B8] transition-colors hover:bg-[#F1F5F9] hover:text-[#0D1B2A] dark:hover:bg-[#1E3A5F] dark:hover:text-[#E2E8F0]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <style>{`
        @keyframes toast-in {
          from { transform: translateX(24px); opacity: 0; }
          to   { transform: none; opacity: 1; }
        }
      `}</style>
    </div>
  )
}
