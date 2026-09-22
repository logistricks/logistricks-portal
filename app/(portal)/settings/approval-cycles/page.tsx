"use client"

import { useEffect, useState, useCallback } from "react"
import {
  ChevronDown, ChevronUp, GripVertical, Loader2, Plus, Star, Trash2, X,
  Settings2, CheckSquare, Square, UserCheck,
} from "lucide-react"
import { useToast } from "@/components/ui/toast"

// ── Types ──────────────────────────────────────────────────────────────────────
type Step = {
  id?:               string
  sort_order:        number
  assigned_to:       string
  can_edit_template: boolean
  can_edit_cc:       boolean
  required:          boolean
  _dirty?:           boolean
}

type Cycle = {
  id:                   string
  name:                 string
  is_default:           boolean
  created_at:           string
  approval_cycle_steps: Step[]
  _expanded?:           boolean
  _saving?:             boolean
}

// ── Step row ───────────────────────────────────────────────────────────────────
function StepRow({
  step, index, total,
  onMove, onChange, onRemove, users,
}: {
  step:     Step
  index:    number
  total:    number
  onMove:   (from: number, to: number) => void
  onChange: (idx: number, patch: Partial<Step>) => void
  onRemove: (idx: number) => void
  users:    string[]
}) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-[#E2E8F0] bg-white p-3 dark:border-[#1E3A5F] dark:bg-[#0D1B2A]">
      {/* Sort controls */}
      <div className="flex flex-col items-center gap-0.5 pt-0.5">
        <button
          type="button"
          onClick={() => onMove(index, index - 1)}
          disabled={index === 0}
          className="flex h-5 w-5 items-center justify-center rounded text-[#94A3B8] hover:bg-[#F1F5F9] disabled:opacity-30 dark:hover:bg-[#1E3A5F]"
        >
          <ChevronUp className="h-3 w-3" />
        </button>
        <span className="text-[10px] font-bold text-[#94A3B8]">{index + 1}</span>
        <button
          type="button"
          onClick={() => onMove(index, index + 1)}
          disabled={index === total - 1}
          className="flex h-5 w-5 items-center justify-center rounded text-[#94A3B8] hover:bg-[#F1F5F9] disabled:opacity-30 dark:hover:bg-[#1E3A5F]"
        >
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>

      {/* Assignee */}
      <div className="flex-1 min-w-0">
        <label className="block text-[10px] font-semibold uppercase tracking-wide text-[#64748B] mb-1">
          Approver username
        </label>
        <input
          type="text"
          value={step.assigned_to}
          onChange={(e) => onChange(index, { assigned_to: e.target.value })}
          placeholder="e.g. azeez"
          list="user-suggestions"
          className="w-full rounded border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 py-1.5 text-sm text-[#0F172A] outline-none focus:border-[#F97316] dark:border-[#1E3A5F] dark:bg-[#111E33] dark:text-[#E2E8F0]"
        />
        <datalist id="user-suggestions">
          {users.map((u) => <option key={u} value={u} />)}
        </datalist>

        {/* Checkboxes */}
        <div className="mt-2 flex flex-wrap gap-3">
          {([
            ["can_edit_template", "Can edit email body"],
            ["can_edit_cc",       "Can edit CC"],
            ["required",          "Required step"],
          ] as [keyof Step, string][]).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => onChange(index, { [key]: !step[key] } as Partial<Step>)}
              className="flex items-center gap-1.5 text-xs text-[#475569] hover:text-[#0F172A] dark:hover:text-[#E2E8F0]"
            >
              {step[key]
                ? <CheckSquare className="h-3.5 w-3.5 text-[#F97316]" />
                : <Square       className="h-3.5 w-3.5 text-[#CBD5E1] dark:text-[#334155]" />}
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Remove */}
      <button
        type="button"
        onClick={() => onRemove(index)}
        className="mt-0.5 flex h-7 w-7 items-center justify-center rounded text-[#94A3B8] hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-900/30 dark:hover:text-red-400"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// ── Cycle card ─────────────────────────────────────────────────────────────────
function CycleCard({
  cycle, users,
  onSetDefault, onRename, onDelete, onSaveSteps,
}: {
  cycle:       Cycle
  users:       string[]
  onSetDefault: (id: string) => void
  onRename:    (id: string, name: string) => void
  onDelete:    (id: string) => void
  onSaveSteps: (id: string, steps: Step[]) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(cycle._expanded ?? false)
  const [steps, setSteps] = useState<Step[]>(cycle.approval_cycle_steps)
  const [saving, setSaving] = useState(false)
  const [nameEdit, setNameEdit] = useState(false)
  const [name, setName] = useState(cycle.name)
  const { success, error: toastError } = useToast()

  function addStep() {
    setSteps((s) => [
      ...s,
      {
        sort_order:        s.length + 1,
        assigned_to:       "",
        can_edit_template: false,
        can_edit_cc:       false,
        required:          true,
        _dirty:            true,
      },
    ])
  }

  function moveStep(from: number, to: number) {
    if (to < 0 || to >= steps.length) return
    const next = [...steps]
    ;[next[from], next[to]] = [next[to], next[from]]
    setSteps(next.map((s, i) => ({ ...s, sort_order: i + 1 })))
  }

  function changeStep(idx: number, patch: Partial<Step>) {
    setSteps((s) => s.map((step, i) => i === idx ? { ...step, ...patch } : step))
  }

  function removeStep(idx: number) {
    setSteps((s) => s.filter((_, i) => i !== idx).map((step, i) => ({ ...step, sort_order: i + 1 })))
  }

  async function save() {
    if (steps.some((s) => !s.assigned_to.trim())) {
      toastError("Incomplete steps", "All steps need an approver username.")
      return
    }
    setSaving(true)
    try {
      await onSaveSteps(cycle.id, steps)
      success("Saved", "Approval cycle updated.")
    } catch (e: any) {
      toastError("Save failed", e.message ?? "Unknown error")
    } finally {
      setSaving(false)
    }
  }

  async function saveName() {
    if (!name.trim() || name === cycle.name) { setNameEdit(false); return }
    onRename(cycle.id, name.trim())
    setNameEdit(false)
  }

  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] dark:border-[#1E3A5F] dark:bg-[#0D1B2A]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => onSetDefault(cycle.id)}
          title={cycle.is_default ? "Default cycle" : "Set as default"}
          className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
            cycle.is_default
              ? "text-[#F97316]"
              : "text-[#CBD5E1] hover:text-[#F97316] dark:text-[#334155]"
          }`}
        >
          <Star className={`h-4 w-4 ${cycle.is_default ? "fill-current" : ""}`} />
        </button>

        {nameEdit ? (
          <input
            type="text"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") { setNameEdit(false); setName(cycle.name) } }}
            className="flex-1 min-w-0 rounded border border-[#F97316] bg-white px-2 py-0.5 text-sm font-semibold text-[#0F172A] outline-none dark:bg-[#111E33] dark:text-[#E2E8F0]"
          />
        ) : (
          <button
            type="button"
            onClick={() => setNameEdit(true)}
            className="flex-1 min-w-0 text-left text-sm font-semibold text-[#0F172A] hover:text-[#F97316] dark:text-[#E2E8F0]"
          >
            {cycle.name}
            {cycle.is_default && (
              <span className="ml-2 rounded-full bg-[#F97316]/10 px-2 py-0.5 text-[10px] font-semibold text-[#F97316]">Default</span>
            )}
          </button>
        )}

        <span className="text-xs text-[#94A3B8]">
          {cycle.approval_cycle_steps.length} step{cycle.approval_cycle_steps.length !== 1 ? "s" : ""}
        </span>

        <button
          type="button"
          onClick={() => onDelete(cycle.id)}
          className="flex h-7 w-7 items-center justify-center rounded text-[#94A3B8] hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-900/30 dark:hover:text-red-400"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex h-7 w-7 items-center justify-center rounded text-[#94A3B8] hover:bg-[#F1F5F9] dark:hover:bg-[#1E3A5F]"
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {/* Steps */}
      {expanded && (
        <div className="border-t border-[#E2E8F0] px-4 pb-4 pt-3 dark:border-[#1E3A5F]">
          <div className="space-y-2 mb-3">
            {steps.length === 0 && (
              <p className="text-xs text-center text-[#94A3B8] py-4">No steps yet — add at least one approver below.</p>
            )}
            {steps.map((step, i) => (
              <StepRow
                key={i}
                step={step}
                index={i}
                total={steps.length}
                onMove={moveStep}
                onChange={changeStep}
                onRemove={removeStep}
                users={users}
              />
            ))}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={addStep}
              className="flex items-center gap-1.5 rounded border border-dashed border-[#CBD5E1] px-3 py-1.5 text-xs font-medium text-[#475569] hover:border-[#F97316] hover:text-[#F97316] dark:border-[#334155] dark:hover:border-[#F97316]"
            >
              <Plus className="h-3.5 w-3.5" /> Add step
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="ml-auto flex items-center gap-1.5 rounded bg-[#F97316] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#EA580C] disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Save steps
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function ApprovalCyclesPage() {
  const [cycles, setCycles] = useState<Cycle[]>([])
  const [users, setUsers]   = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const { success, error: toastError } = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [cyclesRes, usersRes] = await Promise.all([
        fetch("/api/approval-cycles"),
        fetch("/api/users"),
      ])
      if (cyclesRes.ok) setCycles(await cyclesRes.json())
      if (usersRes.ok) {
        const ud = await usersRes.json()
        setUsers((ud ?? []).map((u: any) => u.username).filter(Boolean))
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function createCycle() {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const res = await fetch("/api/approval-cycles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), is_default: cycles.length === 0 }),
      })
      const data = await res.json()
      if (!res.ok) { toastError("Error", data.error); return }
      setCycles((c) => [...c, { ...data, _expanded: true }])
      setNewName("")
      success("Cycle created", data.name)
    } finally {
      setCreating(false)
    }
  }

  async function setDefault(id: string) {
    const res = await fetch(`/api/approval-cycles/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_default: true }),
    })
    if (res.ok) {
      setCycles((c) => c.map((cy) => ({ ...cy, is_default: cy.id === id })))
    }
  }

  async function renameCycle(id: string, name: string) {
    const res = await fetch(`/api/approval-cycles/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    })
    if (res.ok) {
      setCycles((c) => c.map((cy) => cy.id === id ? { ...cy, name } : cy))
    }
  }

  async function deleteCycle(id: string) {
    if (!confirm("Delete this cycle? This cannot be undone.")) return
    const res = await fetch(`/api/approval-cycles/${id}`, { method: "DELETE" })
    if (res.ok) {
      setCycles((c) => c.filter((cy) => cy.id !== id))
      success("Deleted", "Cycle removed.")
    }
  }

  async function saveSteps(cycleId: string, steps: Step[]) {
    const res = await fetch(`/api/approval-cycles/${cycleId}/steps`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(steps),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? "Save failed")
    setCycles((c) =>
      c.map((cy) =>
        cy.id === cycleId
          ? { ...cy, approval_cycle_steps: data.steps ?? [] }
          : cy
      )
    )
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-2 mb-1">
        <Settings2 className="h-5 w-5 text-[#F97316]" />
        <h1 className="text-xl font-bold text-[#0D1B2A] dark:text-white">Approval Cycles</h1>
      </div>
      <p className="mb-6 text-sm text-[#475569]">
        Configure named approval chains. Freight requests submitted for review follow a cycle's
        steps in order — each approver must sign off before the next is notified.
        Mark one cycle as the default so it's pre-selected when operators submit requests.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-[#475569]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading cycles…
        </div>
      ) : (
        <>
          {cycles.length === 0 && !loading && (
            <div className="mb-6 rounded-lg border border-dashed border-[#E2E8F0] bg-[#F8FAFC] py-8 text-center dark:border-[#1E3A5F] dark:bg-[#0D1B2A]">
              <UserCheck className="mx-auto mb-2 h-8 w-8 text-[#CBD5E1] dark:text-[#334155]" />
              <p className="text-sm font-medium text-[#475569]">No approval cycles yet</p>
              <p className="text-xs text-[#94A3B8] mt-1">Create your first cycle below</p>
            </div>
          )}

          <div className="space-y-3 mb-6">
            {cycles.map((cycle) => (
              <CycleCard
                key={cycle.id}
                cycle={cycle}
                users={users}
                onSetDefault={setDefault}
                onRename={renameCycle}
                onDelete={deleteCycle}
                onSaveSteps={saveSteps}
              />
            ))}
          </div>
        </>
      )}

      {/* Create new cycle */}
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 dark:border-[#1E3A5F] dark:bg-[#0D1B2A]">
        <Plus className="h-4 w-4 shrink-0 text-[#94A3B8]" />
        <input
          type="text"
          placeholder="New cycle name (e.g. Standard, AOG Fast-Track)"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && createCycle()}
          className="min-w-0 flex-1 bg-transparent text-sm text-[#0F172A] outline-none placeholder:text-[#CBD5E1] dark:text-[#E2E8F0] dark:placeholder:text-[#334155]"
        />
        <button
          onClick={createCycle}
          disabled={creating || !newName.trim()}
          className="flex items-center gap-1.5 rounded bg-[#F97316] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#EA580C] disabled:opacity-40"
        >
          {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          Create
        </button>
      </div>
    </div>
  )
}
