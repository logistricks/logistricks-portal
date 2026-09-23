"use client";

import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, X, ChevronUp, ChevronDown, Bell, CheckSquare } from "lucide-react";

type StepMember = { username: string };

type StepInput = {
  sort_order: number;
  committee_mode: "any_approves" | "notify_only";
  can_edit_template: boolean;
  can_edit_cc: boolean;
  member_usernames: string[];
};

type Cycle = {
  id: string;
  name: string;
  is_default: boolean;
  applies_to_automated_emails: boolean;
  automated_trigger: "carrier_email" | "reply_email" | "both" | null;
  initiator_usernames: string[];
  approval_cycle_steps: Array<{
    id: string;
    sort_order: number;
    committee_mode: "any_approves" | "notify_only";
    can_edit_template: boolean;
    can_edit_cc: boolean;
    member_usernames: string[];
  }>;
};

type PortalUser = { username: string; display_name?: string | null };

type FormStep = {
  sort_order: number;
  committee_mode: "any_approves" | "notify_only";
  can_edit_template: boolean;
  can_edit_cc: boolean;
  member_usernames: string[];
};

type FormState = {
  name: string;
  initiator_usernames: string[];
  applies_to_automated_emails: boolean;
  trigger_carrier: boolean;
  trigger_reply: boolean;
  steps: FormStep[];
};

const defaultForm = (): FormState => ({
  name: "",
  initiator_usernames: [],
  applies_to_automated_emails: false,
  trigger_carrier: false,
  trigger_reply: false,
  steps: [],
});

const triggerLabel = (t: string | null) => {
  if (t === "carrier_email") return "Carrier Email";
  if (t === "reply_email") return "Reply Email";
  if (t === "both") return "Both";
  return "";
};

function UserChip({ username, onRemove }: { username: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF7ED] border border-[#F97316] px-2 py-0.5 text-xs text-[#F97316] font-medium">
      {username}
      {onRemove && (
        <button onClick={onRemove} className="ml-0.5 hover:text-orange-700">
          <X size={10} />
        </button>
      )}
    </span>
  );
}

function UserMultiSelect({
  label,
  selected,
  users,
  onChange,
}: {
  label: string;
  selected: string[];
  users: PortalUser[];
  onChange: (next: string[]) => void;
}) {
  const available = users.filter((u) => !selected.includes(u.username));
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-[#0F172A] dark:text-[#E2E8F0]">{label}</label>
      <div className="flex flex-wrap gap-1.5 min-h-[2rem]">
        {selected.map((u) => (
          <UserChip key={u} username={u} onRemove={() => onChange(selected.filter((s) => s !== u))} />
        ))}
      </div>
      {available.length > 0 && (
        <select
          className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm dark:border-[#1E3A5F] dark:bg-[#0D1B2A] dark:text-[#E2E8F0] w-full"
          value=""
          onChange={(e) => {
            if (e.target.value) onChange([...selected, e.target.value]);
          }}
        >
          <option value="">+ Add user…</option>
          {available.map((u) => (
            <option key={u.username} value={u.username}>
              {u.display_name || u.username}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function StepCard({
  step,
  index,
  total,
  users,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  step: FormStep;
  index: number;
  total: number;
  users: PortalUser[];
  onChange: (s: FormStep) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <div className="rounded-lg border border-[#E2E8F0] dark:border-[#1E3A5F] p-4 space-y-3 bg-white dark:bg-[#0D1B2A]">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-[#0F172A] dark:text-[#E2E8F0]">Step {index + 1}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={index === 0}
            onClick={onMoveUp}
            className="p-1 rounded text-[#475569] dark:text-[#64748B] hover:text-[#0F172A] dark:hover:text-[#E2E8F0] disabled:opacity-30"
          >
            <ChevronUp size={16} />
          </button>
          <button
            type="button"
            disabled={index === total - 1}
            onClick={onMoveDown}
            className="p-1 rounded text-[#475569] dark:text-[#64748B] hover:text-[#0F172A] dark:hover:text-[#E2E8F0] disabled:opacity-30"
          >
            <ChevronDown size={16} />
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="p-1 rounded text-red-500 hover:text-red-700"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <UserMultiSelect
        label="Approvers"
        selected={step.member_usernames}
        users={users}
        onChange={(next) => onChange({ ...step, member_usernames: next })}
      />

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-[#0F172A] dark:text-[#E2E8F0]">Committee mode</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onChange({ ...step, committee_mode: "any_approves" })}
            className={`px-3 py-1.5 text-xs rounded-lg border font-medium transition-colors ${
              step.committee_mode === "any_approves"
                ? "bg-blue-50 border-blue-400 text-blue-700 dark:bg-blue-900/30 dark:border-blue-500 dark:text-blue-300"
                : "border-[#E2E8F0] text-[#475569] dark:border-[#1E3A5F] dark:text-[#64748B]"
            }`}
          >
            Any approves
          </button>
          <button
            type="button"
            onClick={() => onChange({ ...step, committee_mode: "notify_only" })}
            className={`px-3 py-1.5 text-xs rounded-lg border font-medium transition-colors flex items-center gap-1 ${
              step.committee_mode === "notify_only"
                ? "bg-slate-100 border-slate-400 text-slate-700 dark:bg-slate-800 dark:border-slate-500 dark:text-slate-300"
                : "border-[#E2E8F0] text-[#475569] dark:border-[#1E3A5F] dark:text-[#64748B]"
            }`}
          >
            <Bell size={12} /> Notify only
          </button>
        </div>
      </div>

      <label className="flex items-center gap-2 cursor-pointer text-sm text-[#0F172A] dark:text-[#E2E8F0]">
        <input
          type="checkbox"
          checked={step.can_edit_template}
          onChange={(e) => onChange({ ...step, can_edit_template: e.target.checked })}
          className="rounded border-[#E2E8F0]"
        />
        <CheckSquare size={14} className="text-[#475569] dark:text-[#64748B]" />
        Can edit template
      </label>
      <label className="flex items-center gap-2 cursor-pointer text-sm text-[#0F172A] dark:text-[#E2E8F0]">
        <input
          type="checkbox"
          checked={step.can_edit_cc}
          onChange={(e) => onChange({ ...step, can_edit_cc: e.target.checked })}
          className="rounded border-[#E2E8F0]"
        />
        <CheckSquare size={14} className="text-[#475569] dark:text-[#64748B]" />
        Can edit CC
      </label>
    </div>
  );
}

export default function ApprovalCyclesPage() {
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Cycle | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [cRes, uRes] = await Promise.all([
        fetch("/api/approval-cycles"),
        fetch("/api/users"),
      ]);
      if (cRes.ok) setCycles(await cRes.json());
      if (uRes.ok) setUsers(await uRes.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(defaultForm());
    setError("");
    setShowForm(true);
  };

  const openEdit = (cycle: Cycle) => {
    setEditing(cycle);
    const trigger = cycle.automated_trigger;
    setForm({
      name: cycle.name,
      initiator_usernames: cycle.initiator_usernames,
      applies_to_automated_emails: cycle.applies_to_automated_emails,
      trigger_carrier: trigger === "carrier_email" || trigger === "both",
      trigger_reply: trigger === "reply_email" || trigger === "both",
      steps: cycle.approval_cycle_steps
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((s) => ({
          sort_order: s.sort_order,
          committee_mode: s.committee_mode,
          can_edit_template: s.can_edit_template,
          can_edit_cc: s.can_edit_cc,
          member_usernames: s.member_usernames,
        })),
    });
    setError("");
    setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setEditing(null); };

  const addStep = () => {
    setForm((f) => ({
      ...f,
      steps: [
        ...f.steps,
        {
          sort_order: f.steps.length + 1,
          committee_mode: "any_approves",
          can_edit_template: false,
          can_edit_cc: false,
          member_usernames: [],
        },
      ],
    }));
  };

  const updateStep = (i: number, s: FormStep) => {
    setForm((f) => {
      const steps = [...f.steps];
      steps[i] = s;
      return { ...f, steps };
    });
  };

  const removeStep = (i: number) => {
    setForm((f) => ({ ...f, steps: f.steps.filter((_, idx) => idx !== i) }));
  };

  const moveStep = (i: number, dir: -1 | 1) => {
    setForm((f) => {
      const steps = [...f.steps];
      const j = i + dir;
      if (j < 0 || j >= steps.length) return f;
      [steps[i], steps[j]] = [steps[j], steps[i]];
      return { ...f, steps };
    });
  };

  const handleSave = async () => {
    setError("");
    if (!form.name.trim()) { setError("Name is required."); return; }
    for (let i = 0; i < form.steps.length; i++) {
      if (form.steps[i].member_usernames.length === 0) {
        setError(`Step ${i + 1} must have at least one approver.`);
        return;
      }
    }

    let automated_trigger: Cycle["automated_trigger"] = null;
    if (form.applies_to_automated_emails) {
      if (form.trigger_carrier && form.trigger_reply) automated_trigger = "both";
      else if (form.trigger_carrier) automated_trigger = "carrier_email";
      else if (form.trigger_reply) automated_trigger = "reply_email";
    }

    const body = {
      name: form.name.trim(),
      applies_to_automated_emails: form.applies_to_automated_emails,
      automated_trigger,
      initiator_usernames: form.initiator_usernames,
      steps: form.steps.map((s, i) => ({ ...s, sort_order: i + 1 })),
    };

    setBusy(true);
    try {
      const url = editing ? `/api/approval-cycles/${editing.id}` : "/api/approval-cycles";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.message || "Failed to save. Please try again.");
        return;
      }
      await loadData();
      closeForm();
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/approval-cycles/${id}`, { method: "DELETE" });
    if (res.ok) {
      setConfirmDelete(null);
      await loadData();
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#0D1B2A] text-[#0F172A] dark:text-[#E2E8F0]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A] dark:text-[#E2E8F0]">Approval Cycles</h1>
            <p className="mt-1 text-sm text-[#475569] dark:text-[#64748B]">
              Configure who approves freight requests before they are sent
            </p>
          </div>
          <button onClick={openCreate} className="flex items-center gap-2 bg-[#F97316] text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-orange-500 shrink-0">
            <Plus size={16} /> New Cycle
          </button>
        </div>

        {/* List */}
        {loading ? (
          <div className="text-center py-16 text-[#475569] dark:text-[#64748B]">Loading…</div>
        ) : cycles.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <p className="text-[#475569] dark:text-[#64748B]">No approval cycles yet</p>
            <button onClick={openCreate} className="bg-[#F97316] text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-orange-500">
              Create your first cycle
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {cycles.map((cycle) => (
              <div key={cycle.id} className="rounded-xl border border-[#E2E8F0] dark:border-[#1E3A5F] bg-white dark:bg-[#0D1B2A] p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-[#0F172A] dark:text-[#E2E8F0]">{cycle.name}</span>
                    {cycle.applies_to_automated_emails && cycle.automated_trigger && (
                      <span className="inline-flex items-center rounded-full bg-[#FFF7ED] border border-[#F97316] px-2 py-0.5 text-xs text-[#F97316] font-medium">
                        Auto: {triggerLabel(cycle.automated_trigger)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => openEdit(cycle)} className="p-1.5 rounded-lg border border-[#E2E8F0] dark:border-[#1E3A5F] text-[#475569] dark:text-[#64748B] hover:text-[#F97316] hover:border-[#F97316]">
                      <Pencil size={15} />
                    </button>
                    {confirmDelete === cycle.id ? (
                      <span className="flex items-center gap-1.5 text-sm">
                        <span className="text-red-500 font-medium">Confirm delete?</span>
                        <button onClick={() => handleDelete(cycle.id)} className="text-xs bg-red-500 text-white rounded px-2 py-1 hover:bg-red-600">Yes</button>
                        <button onClick={() => setConfirmDelete(null)} className="text-xs border border-[#E2E8F0] dark:border-[#1E3A5F] rounded px-2 py-1">No</button>
                      </span>
                    ) : (
                      <button onClick={() => setConfirmDelete(cycle.id)} className="p-1.5 rounded-lg border border-[#E2E8F0] dark:border-[#1E3A5F] text-[#475569] dark:text-[#64748B] hover:text-red-500 hover:border-red-200">
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-medium text-[#475569] dark:text-[#64748B] uppercase tracking-wide">Linked users</p>
                  <div className="flex flex-wrap gap-1.5">
                    {cycle.initiator_usernames.length > 0
                      ? cycle.initiator_usernames.map((u) => <UserChip key={u} username={u} />)
                      : <span className="text-sm text-[#475569] dark:text-[#64748B]">No users linked</span>}
                  </div>
                </div>

                {cycle.approval_cycle_steps.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-[#475569] dark:text-[#64748B] uppercase tracking-wide">Steps</p>
                    <ol className="space-y-2">
                      {cycle.approval_cycle_steps
                        .slice()
                        .sort((a, b) => a.sort_order - b.sort_order)
                        .map((step, i) => (
                          <li key={step.id} className="flex items-start gap-3 rounded-lg border border-[#E2E8F0] dark:border-[#1E3A5F] px-3 py-2">
                            <span className="shrink-0 w-5 h-5 rounded-full bg-[#F97316] text-white text-xs flex items-center justify-center font-bold mt-0.5">{i + 1}</span>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`text-xs rounded-full px-2 py-0.5 font-medium border ${step.committee_mode === "any_approves" ? "bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/30 dark:border-blue-600 dark:text-blue-300" : "bg-slate-100 border-slate-300 text-slate-600 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-300"}`}>
                                {step.committee_mode === "any_approves" ? "Any approves" : "Notify only"}
                              </span>
                              {step.member_usernames.map((u) => <UserChip key={u} username={u} />)}
                              {step.can_edit_template && (
                                <span className="text-xs text-[#475569] dark:text-[#64748B] italic">Can edit template</span>
                              )}
                              {step.can_edit_cc && (
                                <span className="text-xs text-[#475569] dark:text-[#64748B] italic">Can edit CC</span>
                              )}
                            </div>
                          </li>
                        ))}
                    </ol>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 overflow-y-auto py-8 px-4">
          <div className="w-full max-w-2xl bg-white dark:bg-[#0D1B2A] rounded-2xl shadow-2xl border border-[#E2E8F0] dark:border-[#1E3A5F]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0] dark:border-[#1E3A5F]">
              <h2 className="text-lg font-semibold text-[#0F172A] dark:text-[#E2E8F0]">
                {editing ? "Edit Cycle" : "New Approval Cycle"}
              </h2>
              <button onClick={closeForm} className="p-1.5 rounded-lg text-[#475569] dark:text-[#64748B] hover:text-[#0F172A] dark:hover:text-[#E2E8F0]">
                <X size={18} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-6">
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-[#0F172A] dark:text-[#E2E8F0]">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Standard Approval"
                  className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm dark:border-[#1E3A5F] dark:bg-[#0D1B2A] dark:text-[#E2E8F0] w-full"
                />
              </div>

              <div className="space-y-1">
                <UserMultiSelect
                  label="Who can initiate this cycle"
                  selected={form.initiator_usernames}
                  users={users}
                  onChange={(next) => setForm((f) => ({ ...f, initiator_usernames: next }))}
                />
                <p className="text-xs text-[#475569] dark:text-[#64748B]">Each user can only be linked to one cycle.</p>
              </div>

              <div className="space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.applies_to_automated_emails}
                    onChange={(e) => setForm((f) => ({ ...f, applies_to_automated_emails: e.target.checked }))}
                    className="rounded border-[#E2E8F0]"
                  />
                  <span className="text-sm font-medium text-[#0F172A] dark:text-[#E2E8F0]">Applies to automated emails</span>
                </label>
                {form.applies_to_automated_emails && (
                  <div className="ml-6 space-y-2 border-l-2 border-[#F97316] pl-4">
                    <p className="text-xs font-medium text-[#475569] dark:text-[#64748B]">Trigger on</p>
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-[#0F172A] dark:text-[#E2E8F0]">
                      <input type="checkbox" checked={form.trigger_carrier} onChange={(e) => setForm((f) => ({ ...f, trigger_carrier: e.target.checked }))} />
                      Carrier email
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-[#0F172A] dark:text-[#E2E8F0]">
                      <input type="checkbox" checked={form.trigger_reply} onChange={(e) => setForm((f) => ({ ...f, trigger_reply: e.target.checked }))} />
                      Reply email
                    </label>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium text-[#0F172A] dark:text-[#E2E8F0]">Steps</p>
                {form.steps.map((step, i) => (
                  <StepCard
                    key={i}
                    step={step}
                    index={i}
                    total={form.steps.length}
                    users={users}
                    onChange={(s) => updateStep(i, s)}
                    onRemove={() => removeStep(i)}
                    onMoveUp={() => moveStep(i, -1)}
                    onMoveDown={() => moveStep(i, 1)}
                  />
                ))}
                <button
                  type="button"
                  onClick={addStep}
                  className="w-full rounded-lg border-2 border-dashed border-[#E2E8F0] dark:border-[#1E3A5F] py-3 text-sm text-[#475569] dark:text-[#64748B] hover:border-[#F97316] hover:text-[#F97316] transition-colors"
                >
                  + Add Step
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-[#E2E8F0] dark:border-[#1E3A5F]">
              <button onClick={closeForm} className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm dark:border-[#1E3A5F] text-[#475569] dark:text-[#64748B]">
                Cancel
              </button>
              <button onClick={handleSave} disabled={busy} className="bg-[#F97316] text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-orange-500 disabled:opacity-60">
                {busy ? "Saving…" : "Save Cycle"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
