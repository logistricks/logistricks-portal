"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, CheckCircle2, Eye, EyeOff, Loader2, Lock, Send } from "lucide-react"

type Smtp = {
  configured: boolean; host: string; port: number; security: "ssl" | "starttls" | "none"; username: string; has_password: boolean
  from_name: string; from_email: string; reply_to: string; enabled: boolean
  auth_method: "password" | "oauth2_microsoft"; ms_tenant_id: string; ms_client_id: string; has_ms_secret: boolean
  last_test_at?: string | null; last_test_ok?: boolean | null; last_test_error?: string | null
}

const PRESETS: { name: string; host: string; port: number; security: Smtp["security"]; hint: string }[] = [
  { name: "Gmail", host: "smtp.gmail.com", port: 465, security: "ssl", hint: "Turn on 2-step verification, then create an App password in your Google account and use it as the password." },
  { name: "Microsoft 365", host: "smtp.office365.com", port: 587, security: "starttls", hint: "Choose modern authentication (recommended) or a password. SMTP AUTH must be enabled for the mailbox." },
  { name: "Zoho", host: "smtp.zoho.com", port: 465, security: "ssl", hint: "Use an application-specific password if two-factor is on." },
  { name: "Other", host: "", port: 587, security: "starttls", hint: "Ask your email provider for the SMTP server name, port and security type." },
]

const inputCls = "h-10 w-full rounded-md border px-3 text-sm outline-none disabled:opacity-60"
const inputStyle = { borderColor: "var(--card-border)", background: "var(--input-bg, transparent)", color: "var(--text-primary)" } as const

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium" style={{ color: "var(--text-primary)" }}>{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>{hint}</p>}
    </div>
  )
}

export function SmtpPanel({ canEdit }: { canEdit: boolean }) {
  const [f, setF] = useState<Smtp | null>(null)
  const [password, setPassword] = useState("")
  const [msSecret, setMsSecret] = useState("")
  const [showHelp, setShowHelp] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [testTo, setTestTo] = useState("")
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => { fetch("/api/settings/smtp").then((r) => r.json()).then(setF).catch(() => setMsg({ ok: false, text: "Couldn't load the email settings." })) }, [])

  if (!f) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--text-muted)" }} /></div>
  const set = (patch: Partial<Smtp>) => setF({ ...f, ...patch })
  const preset = PRESETS.find((p) => p.host && p.host === f.host)
  const oauth = f.auth_method === "oauth2_microsoft"
  const isMs = /office365|outlook\.com/i.test(f.host) || oauth
  const body = () => ({ ...f, password: password || undefined, ms_client_secret: msSecret || undefined })

  async function save() {
    setMsg(null); setSaving(true)
    try {
      const res = await fetch("/api/settings/smtp", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body()) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error ?? "Couldn't save.")
      setF(d); setPassword(""); setMsSecret(""); setMsg({ ok: true, text: "Saved. Now send a test email to make sure it works." })
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }) } finally { setSaving(false) }
  }

  async function test() {
    setMsg(null); setTesting(true)
    try {
      const res = await fetch("/api/settings/smtp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body(), action: "test", to: testTo || undefined }) })
      const d = await res.json().catch(() => ({}))
      setMsg(d.ok ? { ok: true, text: `Test email sent to ${d.to}. Check that inbox (and spam).` } : { ok: false, text: d.error ?? "The test failed." })
      const fresh = await fetch("/api/settings/smtp").then((r) => r.json()).catch(() => null)
      if (fresh) setF((cur) => (cur ? { ...cur, last_test_at: fresh.last_test_at, last_test_ok: fresh.last_test_ok, last_test_error: fresh.last_test_error } : cur))
    } catch { setMsg({ ok: false, text: "The test failed." }) } finally { setTesting(false) }
  }

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Outgoing email (SMTP)</h2>
      </div>

      {f.configured && f.last_test_at && (
        <p className="mb-4 flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs" style={{ background: f.last_test_ok ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.08)", color: "var(--text-primary)" }}>
          {f.last_test_ok ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <AlertTriangle className="h-4 w-4 text-red-600" />}
          {f.last_test_ok ? "Last test email was delivered" : `Last test failed: ${f.last_test_error ?? "unknown error"}`} · {new Date(f.last_test_at).toLocaleString()}
        </p>
      )}

      <div className="space-y-4 rounded-xl border p-5" style={{ borderColor: "var(--card-border)", background: "var(--card-bg)" }}>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Provider</p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => {
              const on = p.host ? f.host === p.host : !preset
              return (
                <button key={p.name} type="button" disabled={!canEdit} onClick={() => set(p.host ? { host: p.host, port: p.port, security: p.security, ...(p.name === "Microsoft 365" ? { auth_method: "oauth2_microsoft" as const } : { auth_method: "password" as const }) } : { port: p.port, security: p.security, auth_method: "password" })}
                  className="rounded-full border px-3.5 py-1.5 text-xs font-semibold disabled:opacity-60"
                  style={{ borderColor: on ? "var(--brand-accent)" : "var(--card-border)", background: on ? "rgb(var(--brand-accent-rgb) / 0.1)" : "transparent", color: on ? "var(--brand-accent)" : "var(--text-secondary)" }}>{p.name}</button>
              )
            })}
          </div>
          <p className="mt-2 text-[11px]" style={{ color: "var(--text-muted)" }}>{(preset ?? PRESETS[3]).hint}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_110px_150px]">
          <Field label="Server"><input value={f.host} disabled={!canEdit} onChange={(e) => set({ host: e.target.value })} placeholder="smtp.example.com" className={inputCls} style={inputStyle} /></Field>
          <Field label="Port"><input type="number" value={f.port} disabled={!canEdit} onChange={(e) => set({ port: Number(e.target.value) })} className={inputCls} style={inputStyle} /></Field>
          <Field label="Security">
            <select value={f.security} disabled={!canEdit} onChange={(e) => set({ security: e.target.value as Smtp["security"], port: e.target.value === "ssl" ? 465 : e.target.value === "starttls" ? 587 : f.port })} className={inputCls} style={inputStyle}>
              <option value="ssl">SSL / TLS (465)</option>
              <option value="starttls">STARTTLS (587)</option>
              <option value="none">None</option>
            </select>
          </Field>
        </div>

        {isMs && (
          <Field label="Sign-in method" hint={oauth ? "Recommended by Microsoft — Basic authentication is being retired for Microsoft 365 mail." : "Works only while Basic authentication is still allowed for your Microsoft 365 tenant."}>
            <select value={f.auth_method} disabled={!canEdit} onChange={(e) => set({ auth_method: e.target.value as Smtp["auth_method"], host: f.host || "smtp.office365.com", port: 587, security: "starttls" })} className={inputCls} style={inputStyle}>
              <option value="oauth2_microsoft">Modern authentication (OAuth 2.0 app)</option>
              <option value="password">Username and password (basic)</option>
            </select>
          </Field>
        )}

        {oauth ? (
          <div className="space-y-4 rounded-lg border p-4" style={{ borderColor: "var(--card-border)", background: "var(--table-header-bg)" }}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Directory (tenant) ID"><input value={f.ms_tenant_id} disabled={!canEdit} onChange={(e) => set({ ms_tenant_id: e.target.value })} placeholder="00000000-0000-0000-0000-000000000000" className={inputCls} style={inputStyle} /></Field>
              <Field label="Application (client) ID"><input value={f.ms_client_id} disabled={!canEdit} onChange={(e) => set({ ms_client_id: e.target.value })} placeholder="00000000-0000-0000-0000-000000000000" className={inputCls} style={inputStyle} /></Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Client secret" hint={f.has_ms_secret && !msSecret ? "A secret is saved. Type here only to replace it." : "The secret's value, not its ID."}>
                <input type="password" value={msSecret} disabled={!canEdit} onChange={(e) => setMsSecret(e.target.value)} autoComplete="new-password" placeholder={f.has_ms_secret ? "••••••••••••" : "Client secret value"} className={inputCls} style={inputStyle} />
              </Field>
              <Field label="Mailbox to send as" hint="The Microsoft 365 mailbox, usually the same as From email."><input value={f.username} disabled={!canEdit} onChange={(e) => set({ username: e.target.value })} autoComplete="off" placeholder="notifications@yourcompany.com" className={inputCls} style={inputStyle} /></Field>
            </div>
            <button type="button" onClick={() => setShowHelp(!showHelp)} className="text-xs font-semibold underline" style={{ color: "var(--text-secondary)" }}>{showHelp ? "Hide" : "Show"} the one-time Microsoft setup steps</button>
            {showHelp && (
              <ol className="ml-4 list-decimal space-y-1.5 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                <li>In <strong>Microsoft Entra admin centre → App registrations</strong>, create a new registration (single tenant). Copy its <em>Application (client) ID</em> and <em>Directory (tenant) ID</em> here.</li>
                <li><strong>Certificates &amp; secrets</strong> → New client secret. Copy the secret <em>value</em> into the field above.</li>
                <li><strong>API permissions</strong> → Add a permission → <em>APIs my organization uses</em> → <em>Office 365 Exchange Online</em> → <em>Application permissions</em> → <code>SMTP.SendAsApp</code>. Then <em>Grant admin consent</em>.</li>
                <li>In <strong>Exchange Online PowerShell</strong>, register the app and give it the mailbox: <code>New-ServicePrincipal -AppId &lt;client id&gt; -ObjectId &lt;object id of the app under Enterprise applications&gt;</code>, then <code>Add-MailboxPermission -Identity &lt;mailbox&gt; -User &lt;object id&gt; -AccessRights FullAccess</code>.</li>
                <li>Make sure SMTP AUTH is on for the mailbox: <code>Set-CASMailbox -Identity &lt;mailbox&gt; -SmtpClientAuthenticationDisabled $false</code>.</li>
                <li>Save here, then press <strong>Send test email</strong>. Permission changes can take up to 30 minutes to apply.</li>
              </ol>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Username"><input value={f.username} disabled={!canEdit} onChange={(e) => set({ username: e.target.value })} autoComplete="off" placeholder="you@example.com" className={inputCls} style={inputStyle} /></Field>
            <Field label="Password" hint={f.has_password && !password ? "A password is saved. Type here only to replace it." : undefined}>
              <div className="relative">
                <input type={showPw ? "text" : "password"} value={password} disabled={!canEdit} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password"
                  placeholder={f.has_password ? "••••••••••••" : "App password"} className={`${inputCls} pr-10`} style={inputStyle} />
                <button type="button" onClick={() => setShowPw(!showPw)} aria-label={showPw ? "Hide password" : "Show password"} className="absolute right-2.5 top-2.5" style={{ color: "var(--text-muted)" }}>
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="From name"><input value={f.from_name} disabled={!canEdit} onChange={(e) => set({ from_name: e.target.value })} placeholder="Logistricks" className={inputCls} style={inputStyle} /></Field>
          <Field label="From email" hint="Most providers only allow your own mailbox here."><input value={f.from_email} disabled={!canEdit} onChange={(e) => set({ from_email: e.target.value })} placeholder="notifications@example.com" className={inputCls} style={inputStyle} /></Field>
        </div>
        <Field label="Reply-to (optional)"><input value={f.reply_to} disabled={!canEdit} onChange={(e) => set({ reply_to: e.target.value })} placeholder="Where replies should go" className={inputCls} style={inputStyle} /></Field>

        <label className="flex items-center gap-3 text-sm" style={{ color: "var(--text-primary)" }}>
          <button type="button" role="switch" aria-checked={f.enabled} disabled={!canEdit} onClick={() => set({ enabled: !f.enabled })}
            className={`relative h-6 w-11 shrink-0 overflow-hidden rounded-full transition-colors disabled:opacity-50 ${f.enabled ? "bg-[var(--brand-accent)]" : "bg-[#CBD5E1]"}`}>
            <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${f.enabled ? "translate-x-5" : "translate-x-0"}`} />
          </button>
          Send notification emails
        </label>

        {msg && (
          <p className="flex items-start gap-2 rounded-md px-3 py-2.5 text-sm" style={{ background: msg.ok ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.08)", color: "var(--text-primary)" }}>
            {msg.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />}{msg.text}
          </p>
        )}

        {canEdit ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4" style={{ borderColor: "var(--divider)" }}>
            <div className="flex items-center gap-2">
              <input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="Send test to (default: you)" className="h-9 w-56 rounded-md border px-3 text-xs outline-none" style={inputStyle} />
              <button type="button" onClick={test} disabled={testing || !f.host} className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-semibold disabled:opacity-50" style={{ borderColor: "var(--card-border)", color: "var(--text-primary)" }}>
                {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Send test email
              </button>
            </div>
            <button type="button" onClick={save} disabled={saving} className="inline-flex h-9 items-center gap-2 rounded-md px-5 text-sm font-semibold text-white disabled:opacity-50" style={{ background: "var(--brand-accent)" }}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
            </button>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}><Lock className="h-3.5 w-3.5" /> Only admins can change the email server.</p>
        )}
      </div>
      <p className="mt-3 text-[11px]" style={{ color: "var(--text-muted)" }}>The password is encrypted before it is stored and is never shown again. Use an app password rather than your normal one where your provider offers it.</p>
    </div>
  )
}
