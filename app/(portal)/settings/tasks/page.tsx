"use client"

import { useEffect, useState } from "react"
import { Loader2, RotateCcw } from "lucide-react"
import { PageHero } from "@/components/portal/page-hero"
import { useToast } from "@/components/ui/toast"

type Limits = Record<string, number>
type Emails = { tz: string; digest: boolean; digest_time: string; days: number[]; digest_roles: string[]; urgent: boolean; urgent_after_h: number; escalate: boolean; escalate_after_h: number; weekly: boolean; weekly_day: number; weekly_time: string }
type Reminders = { popups: boolean; interval_min: number; daily_window: boolean; browser: boolean; quiet_from: string; quiet_to: string }

const LIMIT_ROWS: { key: string; label: string; hint: string; unit: string }[] = [
  { key: "confirm_h", label: "Confirm a new request's fields", hint: "From the request arriving", unit: "hours" },
  { key: "rfq_h", label: "Send it to carriers", hint: "From the fields being confirmed", unit: "hours" },
  { key: "chase_h", label: "Chase carriers that haven't replied", hint: "From the RFQ being sent", unit: "hours" },
  { key: "quotation_h", label: "Prepare the quotation", hint: "From the first carrier quote arriving", unit: "hours" },
  { key: "send_h", label: "Send a prepared quotation", hint: "From the quotation being prepared", unit: "hours" },
  { key: "followup_h", label: "Follow up with the requester", hint: "From the quotation being sent", unit: "hours" },
  { key: "approval_h", label: "Decide an approval", hint: "From the approval being requested", unit: "hours" },
  { key: "daily_goal", label: "Daily goal", hint: "Tasks to clear each day (the progress ring)", unit: "tasks" },
  { key: "health_target", label: "Pipeline Health target", hint: "The score to aim for on the dashboard", unit: "%" },
]

function Switch({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)} className="relative inline-block h-[24px] w-[42px] shrink-0 rounded-full transition-colors disabled:opacity-50"
      style={{ background: on ? "var(--brand-accent)" : "var(--card-border)" }}>
      <span className="absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white shadow transition-all" style={{ left: on ? 21 : 3 }} />
    </button>
  )
}

export default function TaskSetupPage() {
  const { error: toastError } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [canEdit, setCanEdit] = useState(false)
  const [limits, setLimits] = useState<Limits>({})
  const [rem, setRem] = useState<Reminders | null>(null)
  const [em, setEm] = useState<Emails | null>(null)
  const [defaults, setDefaults] = useState<{ limits: Limits; reminders: Reminders; emails: Emails } | null>(null)
  const [perm, setPerm] = useState<string>("")

  useEffect(() => {
    fetch("/api/task-settings", { cache: "no-store" }).then((r) => r.json()).then((j) => {
      if (j.error) throw new Error(j.error)
      setLimits(j.limits); setRem(j.reminders); setEm(j.emails); setDefaults(j.defaults); setCanEdit(!!j.canEdit)
    }).catch((e) => toastError("Could not load the settings", e.message)).finally(() => setLoading(false))
    try { setPerm("Notification" in window ? Notification.permission : "unsupported") } catch { /* */ }
  }, [toastError])

  async function save() {
    setSaving(true)
    try {
      const r = await fetch("/api/task-settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ limits, reminders: rem, emails: em }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { toastError("Could not save", j.error); return }
      setLimits(j.limits); setRem(j.reminders); if (j.emails) setEm(j.emails)
    } finally { setSaving(false) }
  }
  async function allowBrowser() {
    try { setPerm(await Notification.requestPermission()) } catch { /* */ }
  }

  const card = "ds-card mx-auto w-full max-w-[760px] p-7"
  const row = "flex flex-wrap items-center justify-between gap-3 py-3.5"
  const inp = "w-[96px] rounded-xl border px-3 py-2 text-center text-[14px] font-semibold disabled:opacity-60"
  const istyle = { borderColor: "var(--card-border)", background: "var(--card-bg)", color: "var(--text-primary)" } as const

  return (
    <div className="portal-page space-y-5 p-6">
      <PageHero eyebrow="Admin" title="Task Setup" chips={<span className="text-[14px] text-white/80">How long each step should take, and how people are reminded</span>} />
      {loading || !rem || !em ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--text-muted)" }} /></div>
      ) : (
        <>
          {!canEdit && <p className="text-center text-[13px]" style={{ color: "var(--text-muted)" }}>Only admins can change these settings.</p>}

          <div className={card}>
            <h2 className="text-center font-display text-[22px] font-extrabold" style={{ color: "var(--text-primary)" }}>Time limits</h2>
            <p className="mt-1 text-center text-[13.5px]" style={{ color: "var(--text-secondary)" }}>A task turns overdue once its step takes longer than this.</p>
            <div className="mt-3 divide-y" style={{ borderColor: "var(--divider)" }}>
              {LIMIT_ROWS.map((l) => (
                <div key={l.key} className={row} style={{ borderColor: "var(--divider)" }}>
                  <div className="min-w-[220px] flex-1 text-left">
                    <div className="text-[14.5px] font-semibold" style={{ color: "var(--text-primary)" }}>{l.label}</div>
                    <div className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>{l.hint}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="number" min={l.key === "daily_goal" || l.key === "health_target" ? 1 : 0.25} max={l.key === "health_target" ? 100 : undefined} step={l.key === "daily_goal" || l.key === "health_target" ? 1 : 0.25} disabled={!canEdit} value={limits[l.key] ?? ""} className={inp} style={istyle}
                      onChange={(e) => setLimits({ ...limits, [l.key]: e.target.value === "" ? NaN : Number(e.target.value) })} />
                    <span className="w-[44px] text-left text-[12.5px]" style={{ color: "var(--text-muted)" }}>{l.unit}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={card}>
            <h2 className="text-center font-display text-[22px] font-extrabold" style={{ color: "var(--text-primary)" }}>Reminders</h2>
            <div className="mt-3 divide-y" style={{ borderColor: "var(--divider)" }}>
              <div className={row} style={{ borderColor: "var(--divider)" }}>
                <div className="min-w-[220px] flex-1 text-left">
                  <div className="text-[14.5px] font-semibold" style={{ color: "var(--text-primary)" }}>Popups</div>
                  <div className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>A popup when tasks go overdue, and again now and then while they stay overdue</div>
                </div>
                <Switch on={rem.popups} disabled={!canEdit} onChange={(v) => setRem({ ...rem, popups: v })} />
              </div>
              <div className={row} style={{ borderColor: "var(--divider)" }}>
                <div className="min-w-[220px] flex-1 text-left">
                  <div className="text-[14.5px] font-semibold" style={{ color: "var(--text-primary)" }}>Remind again every</div>
                  <div className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>While tasks stay overdue</div>
                </div>
                <div className="flex items-center gap-2">
                  <input type="number" min={5} max={1440} step={5} disabled={!canEdit || !rem.popups} value={rem.interval_min} className={inp} style={istyle}
                    onChange={(e) => setRem({ ...rem, interval_min: Number(e.target.value) })} />
                  <span className="w-[44px] text-left text-[12.5px]" style={{ color: "var(--text-muted)" }}>minutes</span>
                </div>
              </div>
              <div className={row} style={{ borderColor: "var(--divider)" }}>
                <div className="min-w-[220px] flex-1 text-left">
                  <div className="text-[14.5px] font-semibold" style={{ color: "var(--text-primary)" }}>&ldquo;Here&apos;s your day&rdquo; summary</div>
                  <div className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>Shown the first time someone opens the portal each day</div>
                </div>
                <Switch on={rem.daily_window} disabled={!canEdit} onChange={(v) => setRem({ ...rem, daily_window: v })} />
              </div>
              <div className={row} style={{ borderColor: "var(--divider)" }}>
                <div className="min-w-[220px] flex-1 text-left">
                  <div className="text-[14.5px] font-semibold" style={{ color: "var(--text-primary)" }}>Browser notifications</div>
                  <div className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>Also alert people when the portal tab is in the background (each person allows it on their own computer)</div>
                </div>
                <Switch on={rem.browser} disabled={!canEdit} onChange={(v) => setRem({ ...rem, browser: v })} />
              </div>
              <div className={row} style={{ borderColor: "var(--divider)" }}>
                <div className="min-w-[220px] flex-1 text-left">
                  <div className="text-[14.5px] font-semibold" style={{ color: "var(--text-primary)" }}>Quiet hours</div>
                  <div className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>No popups in this window (on each person&apos;s own clock)</div>
                </div>
                <div className="flex items-center gap-2">
                  <input type="time" disabled={!canEdit} value={rem.quiet_from} className={inp} style={istyle} onChange={(e) => setRem({ ...rem, quiet_from: e.target.value })} />
                  <span style={{ color: "var(--text-muted)" }}>to</span>
                  <input type="time" disabled={!canEdit} value={rem.quiet_to} className={inp} style={istyle} onChange={(e) => setRem({ ...rem, quiet_to: e.target.value })} />
                </div>
              </div>
              {perm && perm !== "unsupported" && (
                <div className={row} style={{ borderColor: "var(--divider)" }}>
                  <div className="min-w-[220px] flex-1 text-left">
                    <div className="text-[14.5px] font-semibold" style={{ color: "var(--text-primary)" }}>On this computer</div>
                    <div className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                      {perm === "granted" ? "Browser notifications are allowed." : perm === "denied" ? "Blocked in this browser — allow them in the site settings." : "Not allowed yet."}
                    </div>
                  </div>
                  {perm === "default" && (
                    <button type="button" onClick={() => void allowBrowser()} className="rounded-xl border-[1.5px] px-4 py-2 text-[13.5px] font-bold" style={{ borderColor: "var(--text-secondary)", color: "var(--text-primary)" }}>Allow notifications</button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className={card}>
            <h2 className="text-center font-display text-[22px] font-extrabold" style={{ color: "var(--text-primary)" }}>Email reminders</h2>
            <p className="mt-1 text-center text-[13.5px]" style={{ color: "var(--text-secondary)" }}>Sent from your email server (Settings → Email). Nothing is sent twice.</p>
            <div className="mt-3 divide-y" style={{ borderColor: "var(--divider)" }}>
              <div className={row} style={{ borderColor: "var(--divider)" }}>
                <div className="min-w-[220px] flex-1 text-left">
                  <div className="text-[14.5px] font-semibold" style={{ color: "var(--text-primary)" }}>Morning digest</div>
                  <div className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>What is overdue and due today, to admins and operators, at this time on working days</div>
                </div>
                <div className="flex items-center gap-3">
                  <input type="time" disabled={!canEdit || !em.digest} value={em.digest_time} className={inp} style={istyle} onChange={(e) => setEm({ ...em, digest_time: e.target.value })} />
                  <Switch on={em.digest} disabled={!canEdit} onChange={(v) => setEm({ ...em, digest: v })} />
                </div>
              </div>
              <div className={row} style={{ borderColor: "var(--divider)" }}>
                <div className="min-w-[220px] flex-1 text-left">
                  <div className="text-[14.5px] font-semibold" style={{ color: "var(--text-primary)" }}>Working days</div>
                  <div className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>The digest is only sent on these days</div>
                </div>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => {
                    const on = em.days.includes(i)
                    return (
                      <button key={d} type="button" disabled={!canEdit} onClick={() => setEm({ ...em, days: on ? em.days.filter((x) => x !== i) : [...em.days, i].sort() })}
                        className="rounded-full border-[1.5px] px-3 py-1.5 text-[13px] font-bold disabled:opacity-60"
                        style={on ? { background: "var(--brand-accent)", borderColor: "var(--brand-accent)", color: "var(--brand-navy)" } : { borderColor: "var(--card-border)", color: "var(--text-secondary)" }}>{d}</button>
                    )
                  })}
                </div>
              </div>
              <div className={row} style={{ borderColor: "var(--divider)" }}>
                <div className="min-w-[220px] flex-1 text-left">
                  <div className="text-[14.5px] font-semibold" style={{ color: "var(--text-primary)" }}>Urgent email</div>
                  <div className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>When an urgent, AOG or dangerous-goods task is overdue by this long</div>
                </div>
                <div className="flex items-center gap-2">
                  <input type="number" min={0} max={168} step={0.5} disabled={!canEdit || !em.urgent} value={em.urgent_after_h} className={inp} style={istyle} onChange={(e) => setEm({ ...em, urgent_after_h: Number(e.target.value) })} />
                  <span className="w-[44px] text-left text-[12.5px]" style={{ color: "var(--text-muted)" }}>hours</span>
                  <Switch on={em.urgent} disabled={!canEdit} onChange={(v) => setEm({ ...em, urgent: v })} />
                </div>
              </div>
              <div className={row} style={{ borderColor: "var(--divider)" }}>
                <div className="min-w-[220px] flex-1 text-left">
                  <div className="text-[14.5px] font-semibold" style={{ color: "var(--text-primary)" }}>Escalate to managers</div>
                  <div className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>Email the admins when any task is overdue by this long</div>
                </div>
                <div className="flex items-center gap-2">
                  <input type="number" min={1} max={720} step={1} disabled={!canEdit || !em.escalate} value={em.escalate_after_h} className={inp} style={istyle} onChange={(e) => setEm({ ...em, escalate_after_h: Number(e.target.value) })} />
                  <span className="w-[44px] text-left text-[12.5px]" style={{ color: "var(--text-muted)" }}>hours</span>
                  <Switch on={em.escalate} disabled={!canEdit} onChange={(v) => setEm({ ...em, escalate: v })} />
                </div>
              </div>
              <div className={row} style={{ borderColor: "var(--divider)" }}>
                <div className="min-w-[220px] flex-1 text-left">
                  <div className="text-[14.5px] font-semibold" style={{ color: "var(--text-primary)" }}>Weekly manager summary</div>
                  <div className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>Pipeline Health for the past 7 days, to the admins</div>
                </div>
                <div className="flex items-center gap-2">
                  <select disabled={!canEdit || !em.weekly} value={em.weekly_day} onChange={(e) => setEm({ ...em, weekly_day: Number(e.target.value) })} className="rounded-xl border px-3 py-2 text-[14px] font-semibold disabled:opacity-60" style={istyle}>
                    {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d, i) => <option key={d} value={i}>{d}</option>)}
                  </select>
                  <input type="time" disabled={!canEdit || !em.weekly} value={em.weekly_time} className={inp} style={istyle} onChange={(e) => setEm({ ...em, weekly_time: e.target.value })} />
                  <Switch on={em.weekly} disabled={!canEdit} onChange={(v) => setEm({ ...em, weekly: v })} />
                </div>
              </div>
              <div className={row} style={{ borderColor: "var(--divider)" }}>
                <div className="min-w-[220px] flex-1 text-left">
                  <div className="text-[14.5px] font-semibold" style={{ color: "var(--text-primary)" }}>Company time zone</div>
                  <div className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>Used for the times and working days above, e.g. Asia/Kuwait, Asia/Amman, Asia/Riyadh</div>
                </div>
                <input type="text" disabled={!canEdit} value={em.tz} className={`${inp} !w-[190px]`} style={istyle} onChange={(e) => setEm({ ...em, tz: e.target.value })} />
              </div>
            </div>
          </div>

          {canEdit && (
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex items-center gap-2 rounded-xl px-8 py-3 text-[15px] font-extrabold disabled:opacity-60"
                style={{ background: "var(--brand-accent)", color: "var(--brand-navy)" }}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save settings
              </button>
              <button type="button" onClick={() => { if (defaults) { setLimits(defaults.limits); setRem(defaults.reminders); setEm(defaults.emails) } }}
                className="inline-flex items-center gap-2 rounded-xl border-[1.5px] px-5 py-3 text-[14px] font-bold" style={{ borderColor: "var(--text-secondary)", color: "var(--text-primary)", background: "var(--card-bg)" }}>
                <RotateCcw className="h-4 w-4" /> Reset to defaults
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
