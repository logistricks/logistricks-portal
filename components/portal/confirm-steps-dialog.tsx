"use client"

import { useEffect, useState, type ReactNode } from "react"
import { AlertTriangle, Loader2 } from "lucide-react"

export interface ConfirmStep {
  title: string
  body: ReactNode
  confirmLabel: string
}

/**
 * Confirmation dialog with one or more steps. With two steps the user has to
 * click through two separate prompts before `onConfirm` runs (the double
 * confirmation used for unlinking and deleting quotes). Only the last step
 * triggers `onConfirm`; earlier steps just advance.
 */
export function ConfirmStepsDialog({
  open,
  steps,
  destructive = true,
  busy = false,
  error,
  onConfirm,
  onCancel,
}: {
  open: boolean
  steps: ConfirmStep[]
  destructive?: boolean
  busy?: boolean
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
}) {
  const [index, setIndex] = useState(0)

  // Always start from the first prompt when (re)opened.
  useEffect(() => { if (open) setIndex(0) }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === "Escape" && !busy) onCancel() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, busy, onCancel])

  if (!open || steps.length === 0) return null

  const step   = steps[Math.min(index, steps.length - 1)]
  const isLast = index >= steps.length - 1
  const accent = destructive ? "#dc2626" : "var(--brand-accent)"

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-4"
      onClick={() => { if (!busy) onCancel() }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={step.title}
        className="w-full max-w-md rounded-xl shadow-2xl"
        style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-5 pt-5">
          <div
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={{ background: destructive ? "rgba(220,38,38,0.12)" : "var(--table-header-bg)", color: accent }}
          >
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            {steps.length > 1 && (
              <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                Step {index + 1} of {steps.length}
              </p>
            )}
            <h3 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>{step.title}</h3>
            <div className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{step.body}</div>
          </div>
        </div>

        {error && (
          <p
            className="mx-5 mt-3 rounded-lg px-3 py-2 text-sm text-red-700 dark:text-red-400"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
          >
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 px-5 py-4">
          <button
            type="button"
            disabled={busy}
            onClick={() => (index > 0 ? setIndex(index - 1) : onCancel())}
            className="rounded-md border px-3.5 py-2 text-sm font-semibold disabled:opacity-50"
            style={{ borderColor: "var(--card-border)", color: "var(--text-primary)" }}
          >
            {index > 0 ? "Back" : "Cancel"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => (isLast ? onConfirm() : setIndex(index + 1))}
            className="inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: accent }}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {step.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
