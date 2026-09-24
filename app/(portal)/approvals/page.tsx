"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  Loader2,
  Mail,
  Package,
  MapPin,
  AlertTriangle,
  FileText,
  RefreshCw,
  History,
  Edit3,
} from "lucide-react"
import { useToast } from "@/components/ui/toast"

// ─── Types ───────────────────────────────────────────────────────────────────

interface ApprovalDraft {
  id: string
  edited_by: string
  email_subject: string | null
  email_body: string | null
  email_cc: string[] | null
  email_to: string | null
  created_at: string
}

interface ApprovalStep {
  id: string
  sort_order: number
  step_status: "waiting" | "active" | "approved" | "rejected" | "skipped"
  assigned_to: string
  assigned_usernames: string[]
  can_edit_template: boolean
  can_edit_cc: boolean
  required: boolean
  notes: string | null
  decided_at: string | null
}

interface FreightRequest {
  id: string
  reference_number: string
  status: string
  commodity: string | null
  weight_kg: number | null
  dimensions: string | null
  origin_port: string | null
  destination_port: string | null
  transport_mode: string | null
  incoterms: string | null
  is_aog: boolean
  is_dgr: boolean
  special_instructions: string | null
  submitted_by: string
  submitted_at: string | null
  email_subject: string | null
  email_body: string | null
  email_cc: string[] | null
  sender_name: string | null
  sender_email: string | null
}

interface ApprovalDetail {
  id: string
  sort_order: number
  step_status: string
  assigned_to: string
  assigned_usernames: string[]
  can_edit_template: boolean
  can_edit_cc: boolean
  required: boolean
  notes: string | null
  decided_at: string | null
  email_type: "carrier" | "reply" | null
  freight_request: FreightRequest
  cycle: { id: string; name: string } | null
  drafts: ApprovalDraft[]
  chain: ApprovalStep[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function diffLines(
  a: string | null,
  b: string | null
): Array<{ type: "same" | "removed" | "added"; text: string }> {
  const oldLines = (a ?? "").split("\n")
  const newLines = (b ?? "").split("\n")
  const result: Array<{ type: "same" | "removed" | "added"; text: string }> = []
  const m = oldLines.length
  const n = newLines.length
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0)
  )
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--)
      dp[i][j] =
        oldLines[i] === newLines[j]
          ? 1 + dp[i + 1][j + 1]
          : Math.max(dp[i + 1][j], dp[i][j + 1])
  let i = 0,
    j = 0
  while (i < m && j < n) {
    if (oldLines[i] === newLines[j]) {
      result.push({ type: "same", text: oldLines[i++] })
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ type: "removed", text: oldLines[i++] })
    } else {
      result.push({ type: "added", text: newLines[j++] })
    }
  }
  while (i < m) result.push({ type: "removed", text: oldLines[i++] })
  while (j < n) result.push({ type: "added", text: newLines[j++] })
  return result
}

function fmt(d: string | null) {
  if (!d) return "—"
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

// ─── DraftHistory ─────────────────────────────────────────────────────────────

function DraftHistory({
  drafts,
  baseSubject,
  baseBody,
}: {
  drafts: ApprovalDraft[]
  baseSubject: string
  baseBody: string
}) {
  const [open, setOpen] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)

  if (drafts.length === 0) return null

  const selectedDraft = selectedIdx !== null ? drafts[selectedIdx] : null
  const prevBody =
    selectedIdx !== null && selectedIdx > 0
      ? drafts[selectedIdx - 1].email_body
      : baseBody
  const prevSubject =
    selectedIdx !== null && selectedIdx > 0
      ? drafts[selectedIdx - 1].email_subject
      : baseSubject

  return (
    <div className="border border-[var(--border)] rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 bg-[var(--surface-2)] text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-3)] transition-colors"
      >
        <History className="h-4 w-4 text-[var(--text-muted)]" />
        <span>
          Draft History ({drafts.length} revision
          {drafts.length !== 1 ? "s" : ""})
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 ml-auto text-[var(--text-muted)]" />
        ) : (
          <ChevronDown className="h-4 w-4 ml-auto text-[var(--text-muted)]" />
        )}
      </button>

      {open && (
        <div className="divide-y divide-[var(--border)]">
          {drafts.map((draft, idx) => (
            <div key={draft.id} className="p-4">
              <button
                onClick={() =>
                  setSelectedIdx(selectedIdx === idx ? null : idx)
                }
                className="w-full text-left"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">
                      Edited by{" "}
                      <span className="text-[#F97316]">{draft.edited_by}</span>
                    </p>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                      {fmt(draft.created_at)}
                    </p>
                  </div>
                  <span className="text-xs text-[var(--accent)] flex items-center gap-1">
                    {selectedIdx === idx ? "Hide diff" : "View diff"}
                    {selectedIdx === idx ? (
                      <ChevronUp className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                  </span>
                </div>
              </button>

              {selectedIdx === idx && (
                <div className="mt-3 space-y-3">
                  {draft.email_subject !== prevSubject && (
                    <div>
                      <p className="text-xs font-semibold text-[var(--text-muted)] mb-1 uppercase tracking-wide">
                        Subject
                      </p>
                      <div className="rounded bg-[var(--surface-3)] p-3 font-mono text-xs space-y-0.5">
                        {diffLines(prevSubject, draft.email_subject).map(
                          (line, li) => (
                            <div
                              key={li}
                              className={
                                line.type === "removed"
                                  ? "text-red-500 bg-red-500/10 px-1 rounded"
                                  : line.type === "added"
                                  ? "text-green-600 dark:text-green-400 bg-green-500/10 px-1 rounded"
                                  : "text-[var(--text-secondary)]"
                              }
                            >
                              {line.type === "removed"
                                ? "− "
                                : line.type === "added"
                                ? "+ "
                                : "  "}
                              {line.text}
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-semibold text-[var(--text-muted)] mb-1 uppercase tracking-wide">
                      Body
                    </p>
                    <div className="rounded bg-[var(--surface-3)] p-3 font-mono text-xs space-y-0.5 max-h-60 overflow-y-auto">
                      {diffLines(prevBody, draft.email_body).map((line, li) => (
                        <div
                          key={li}
                          className={
                            line.type === "removed"
                              ? "text-red-500 bg-red-500/10 px-1 rounded"
                              : line.type === "added"
                              ? "text-green-600 dark:text-green-400 bg-green-500/10 px-1 rounded"
                              : "text-[var(--text-secondary)]"
                          }
                        >
                          {line.type === "removed"
                            ? "− "
                            : line.type === "added"
                            ? "+ "
                            : "  "}
                          {line.text}
                        </div>
                      ))}
                    </div>
                  </div>
                  {JSON.stringify(draft.email_cc) !==
                    JSON.stringify(
                      idx > 0 ? drafts[idx - 1].email_cc : []
                    ) && (
                    <div>
                      <p className="text-xs font-semibold text-[var(--text-muted)] mb-1 uppercase tracking-wide">
                        CC
                      </p>
                      <p className="text-xs text-[var(--text-secondary)]">
                        {(draft.email_cc ?? []).join(", ") || "(empty)"}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {/* suppress unused-variable warning */}
      {selectedDraft && null}
    </div>
  )
}

// ─── ApprovalCard ─────────────────────────────────────────────────────────────

function ApprovalCard({
  item,
  onDecision,
}: {
  item: ApprovalDetail
  onDecision: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [acting, setActing] = useState(false)
  const [rejectNote, setRejectNote] = useState("")
  const [showReject, setShowReject] = useState(false)
  const [editingEmail, setEditingEmail] = useState(false)
  const [draftSubject, setDraftSubject] = useState("")
  const [draftBody, setDraftBody] = useState("")
  const [draftCc, setDraftCc] = useState("")
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  const req = item.freight_request
  const latestDraft =
    item.drafts.length > 0 ? item.drafts[item.drafts.length - 1] : null
  const currentSubject = latestDraft?.email_subject ?? req.email_subject ?? ""
  const currentBody = latestDraft?.email_body ?? req.email_body ?? ""
  const currentCc = latestDraft?.email_cc ?? req.email_cc ?? []

  function startEdit() {
    setDraftSubject(currentSubject)
    setDraftBody(currentBody)
    setDraftCc(currentCc.join(", "))
    setEditingEmail(true)
  }

  async function saveDraft() {
    setSaving(true)
    try {
      const res = await fetch(`/api/approval-requests/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "draft",
          email_subject: draftSubject,
          email_body: draftBody,
          email_cc: draftCc
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      toast({ title: "Draft saved", description: "Your edits have been saved." })
      setEditingEmail(false)
      onDecision()
    } catch (e: unknown) {
      toast({
        title: "Save failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  async function approve() {
    setActing(true)
    try {
      const body: Record<string, unknown> = { action: "approve" }
      if (editingEmail) {
        body.email_subject = draftSubject
        body.email_body = draftBody
        body.email_cc = draftCc
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      }
      const res = await fetch(`/api/approval-requests/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      toast({
        title: "Approved!",
        description: `Step approved for ${req.reference_number}.`,
      })
      onDecision()
    } catch (e: unknown) {
      toast({
        title: "Approve failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setActing(false)
    }
  }

  async function reject() {
    if (!rejectNote.trim()) {
      toast({
        title: "Note required",
        description: "Please add a rejection note.",
        variant: "destructive",
      })
      return
    }
    setActing(true)
    try {
      const res = await fetch(`/api/approval-requests/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", notes: rejectNote }),
      })
      if (!res.ok) throw new Error(await res.text())
      toast({
        title: "Rejected",
        description: `Request ${req.reference_number} returned to draft.`,
      })
      setShowReject(false)
      setRejectNote("")
      onDecision()
    } catch (e: unknown) {
      toast({
        title: "Reject failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setActing(false)
    }
  }

  const stepPosition = `Step ${item.sort_order}${
    item.cycle ? ` of ${item.chain.length} — ${item.cycle.name}` : ""
  }`

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-5 py-4 flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-bold text-[var(--text-primary)]">
              {req.reference_number}
            </span>
            {req.is_aog && (
              <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 bg-red-500/10 text-red-500 text-xs font-bold">
                <AlertTriangle className="h-3 w-3" /> AOG
              </span>
            )}
            {req.is_dgr && (
              <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 bg-amber-500/10 text-amber-500 text-xs font-bold">
                ⚠ DGR
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">{stepPosition}</p>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Submitted by{" "}
            <span className="text-[var(--text-secondary)] font-medium">
              {req.submitted_by}
            </span>{" "}
            · {fmt(req.submitted_at)}
          </p>
        </div>
        <button
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors shrink-0 pt-1"
        >
          {expanded ? "Collapse" : "Expand"}
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* Quick fields */}
      <div className="px-5 pb-4 grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-4">
        {[
          { icon: Package, label: "Commodity", value: req.commodity },
          { icon: MapPin, label: "Origin", value: req.origin_port },
          { icon: MapPin, label: "Destination", value: req.destination_port },
          { icon: FileText, label: "Mode", value: req.transport_mode },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label}>
            <p className="text-[var(--text-muted)] flex items-center gap-1 mb-0.5">
              <Icon className="h-3 w-3" /> {label}
            </p>
            <p className="font-medium text-[var(--text-primary)] truncate">
              {value || "—"}
            </p>
          </div>
        ))}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-[var(--border)] px-5 py-5 space-y-6">
          {/* Full fields */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">
              Request Details
            </h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              {[
                [
                  "Weight",
                  req.weight_kg != null ? `${req.weight_kg} kg` : null,
                ],
                ["Dimensions", req.dimensions],
                ["Incoterms", req.incoterms],
                ["AOG", req.is_aog ? "Yes" : "No"],
                ["DGR", req.is_dgr ? "Yes" : "No"],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <p className="text-xs text-[var(--text-muted)] mb-0.5">
                    {label}
                  </p>
                  <p className="font-medium text-[var(--text-primary)]">
                    {value || "—"}
                  </p>
                </div>
              ))}
            </div>
            {req.special_instructions && (
              <div className="mt-3">
                <p className="text-xs text-[var(--text-muted)] mb-1">
                  Special Instructions
                </p>
                <p className="text-sm text-[var(--text-primary)] bg-[var(--surface-2)] rounded p-3">
                  {req.special_instructions}
                </p>
              </div>
            )}
          </div>

          {/* Approval chain */}
          {item.chain.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">
                Approval Chain
              </h3>
              <div className="space-y-2">
                {item.chain.map((step) => (
                  <div key={step.id} className="flex items-center gap-3 text-sm">
                    <span
                      className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 ${
                        step.step_status === "approved"
                          ? "bg-green-500/15 text-green-600 dark:text-green-400"
                          : step.step_status === "rejected"
                          ? "bg-red-500/15 text-red-500"
                          : step.step_status === "active"
                          ? "bg-[#F97316]/15 text-[#F97316]"
                          : "bg-[var(--surface-3)] text-[var(--text-muted)]"
                      }`}
                    >
                      {step.step_status === "approved" ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : step.step_status === "rejected" ? (
                        <XCircle className="h-3.5 w-3.5" />
                      ) : step.step_status === "active" ? (
                        <Clock className="h-3.5 w-3.5" />
                      ) : (
                        <span className="text-[10px] font-bold">
                          {step.sort_order}
                        </span>
                      )}
                    </span>
                    <div className="flex-1 flex items-baseline gap-2">
                      <span
                        className={`font-medium ${
                          step.id === item.id
                            ? "text-[#F97316]"
                            : "text-[var(--text-primary)]"
                        }`}
                      >
                        {(step.assigned_usernames?.length
                          ? step.assigned_usernames
                          : [step.assigned_to]
                        ).join(", ")}
                        {(step.assigned_usernames ?? [step.assigned_to]).includes(
                          (() => { try { return sessionStorage.getItem("portal_username") ?? "" } catch { return "" } })()
                        ) && step.id === item.id && (
                          <span className="text-xs text-[var(--text-muted)] font-normal ml-1">
                            (you)
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-[var(--text-muted)] capitalize">
                        {step.step_status}
                      </span>
                      {step.decided_at && (
                        <span className="text-xs text-[var(--text-muted)]">
                          · {fmt(step.decided_at)}
                        </span>
                      )}
                    </div>
                    {step.notes && (
                      <span
                        className="text-xs text-red-500 italic max-w-[200px] truncate"
                        title={step.notes}
                      >
                        {step.notes}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Draft history */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">
              Draft History
            </h3>
            <DraftHistory
              drafts={item.drafts}
              baseSubject={req.email_subject ?? ""}
              baseBody={req.email_body ?? ""}
            />
            {item.drafts.length === 0 && (
              <p className="text-sm text-[var(--text-muted)]">
                No edits made yet — showing original template.
              </p>
            )}
          </div>

          {/* Live email preview */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Email Preview
              </h3>
              {item.can_edit_template && !editingEmail && (
                <button
                  onClick={startEdit}
                  className="flex items-center gap-1.5 text-xs text-[var(--accent)] hover:text-[var(--accent-hover)] font-medium transition-colors"
                >
                  <Edit3 className="h-3.5 w-3.5" /> Edit
                </button>
              )}
            </div>

            {editingEmail ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
                    Subject
                  </label>
                  <input
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    value={draftSubject}
                    onChange={(e) => setDraftSubject(e.target.value)}
                  />
                </div>
                {item.can_edit_cc && (
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
                      CC (comma-separated)
                    </label>
                    <input
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                      value={draftCc}
                      onChange={(e) => setDraftCc(e.target.value)}
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
                    Body
                  </label>
                  <textarea
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] font-mono resize-y"
                    rows={12}
                    value={draftBody}
                    onChange={(e) => setDraftBody(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={saveDraft}
                    disabled={saving}
                    className="flex items-center gap-1.5 rounded-lg bg-[var(--surface-3)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-4)] transition-colors disabled:opacity-50"
                  >
                    {saving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    Save Draft
                  </button>
                  <button
                    onClick={() => setEditingEmail(false)}
                    className="rounded-lg px-3 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] overflow-hidden">
                <div className="px-4 py-3 border-b border-[var(--border)] space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-[var(--text-muted)] w-14">
                      From
                    </span>
                    <span className="text-xs text-[var(--text-secondary)]">
                      noreply@logistricks.com
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-xs font-semibold text-[var(--text-muted)] w-14 pt-px">
                      To
                    </span>
                    <span className="text-xs text-[var(--text-secondary)]">
                      {latestDraft?.email_to ??
                        (item.email_type === "reply" && req.sender_email
                          ? `${req.sender_name ?? ""} <${req.sender_email}>`.trim()
                          : item.email_type === "reply" && req.sender_name
                          ? req.sender_name
                          : "(recipient not set)")}
                    </span>
                  </div>
                  {currentCc.length > 0 && (
                    <div className="flex items-start gap-2">
                      <span className="text-xs font-semibold text-[var(--text-muted)] w-14 pt-px">
                        CC
                      </span>
                      <span className="text-xs text-[var(--text-secondary)]">
                        {currentCc.join(", ")}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-[var(--text-muted)] w-14">
                      Subject
                    </span>
                    <span className="text-xs font-semibold text-[var(--text-primary)]">
                      {currentSubject || "(no subject)"}
                    </span>
                  </div>
                </div>
                <div className="px-4 py-4">
                  <pre className="text-xs text-[var(--text-primary)] whitespace-pre-wrap font-sans leading-relaxed">
                    {currentBody || "(empty body)"}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action bar */}
      <div className="px-5 py-4 border-t border-[var(--border)] bg-[var(--surface-2)] flex flex-col gap-3">
        {showReject ? (
          <div className="space-y-2">
            <textarea
              className="w-full rounded-lg border border-red-400/50 bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
              rows={3}
              placeholder="Rejection note (required)…"
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                onClick={reject}
                disabled={acting || !rejectNote.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {acting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                Confirm Reject
              </button>
              <button
                onClick={() => {
                  setShowReject(false)
                  setRejectNote("")
                }}
                className="rounded-lg px-4 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <button
              onClick={approve}
              disabled={acting}
              className="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              {acting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Approve
            </button>
            <button
              onClick={() => setShowReject(true)}
              disabled={acting}
              className="flex items-center gap-1.5 rounded-lg border border-red-400/50 px-4 py-2 text-sm font-semibold text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50"
            >
              <XCircle className="h-4 w-4" />
              Reject
            </button>
            {!expanded && (
              <button
                onClick={() => setExpanded(true)}
                className="ml-auto flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
              >
                <Mail className="h-3.5 w-3.5" /> View email preview
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ApprovalsPage() {
  const [items, setItems] = useState<ApprovalDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const router = useRouter()

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true)
      else setRefreshing(true)
      try {
        const res = await fetch("/api/approval-requests?view=mine")
        if (res.status === 401) {
          router.push("/login")
          return
        }
        if (!res.ok) throw new Error(await res.text())
        const data = await res.json()
        const details = await Promise.all(
          data.map((row: { id: string }) =>
            fetch(`/api/approval-requests/${row.id}`).then((r) =>
              r.ok ? r.json() : null
            )
          )
        )
        setItems(details.filter(Boolean))
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [router]
  )

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            Pending Approvals
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">
            {loading
              ? "Loading…"
              : `${items.length} item${items.length !== 1 ? "s" : ""} awaiting your review`}
          </p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={loading || refreshing}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-[var(--text-muted)]">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          Loading approvals…
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-14 w-14 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
            <CheckCircle2 className="h-7 w-7 text-green-600 dark:text-green-400" />
          </div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            All caught up
          </h2>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            No pending approvals assigned to you right now.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <ApprovalCard
              key={item.id}
              item={item}
              onDecision={() => load(true)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
