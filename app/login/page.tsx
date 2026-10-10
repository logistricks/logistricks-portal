"use client"

/**
 * app/login/page.tsx
 *
 * Sends credentials to /api/auth/login (server-side).
 * The server queries portal_users with the service role key and
 * sets an HTTP-only HMAC-signed cookie on success.
 * No direct Supabase calls here — no anon key exposure.
 */
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Check } from "lucide-react"

export default function LoginPage() {
  const router = useRouter()
  const [clientCode, setClientCode] = useState("")
  const [username, setUsername]     = useState("")
  const [password, setPassword]     = useState("")
  const [error, setError]           = useState("")
  const [loading, setLoading]       = useState(false)
  const [why, setWhy]               = useState("")

  useEffect(() => {
    try { setWhy(new URLSearchParams(window.location.search).get("why") ?? "") } catch { /* */ }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username:   username.trim().toLowerCase(),
          clientCode: clientCode.trim(),
          password,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error === "Invalid credentials"
          ? "Incorrect username, client code, or password."
          : "Login failed. Please try again.")
        setLoading(false)
        return
      }

      // Store display name for sidebar avatar (non-sensitive)
      try {
        sessionStorage.setItem("portal_username", username.trim())
        sessionStorage.setItem("portal_client_code", clientCode.trim())
      } catch { /* */ }

      // Cookie is set by the server (HTTP-only) — just navigate
      router.push("/dashboard")
    } catch {
      setError("Network error. Please check your connection.")
      setLoading(false)
    }
  }

  const label = "font-mono text-[11px] font-semibold uppercase tracking-[0.14em]"
  const input = "h-12 w-full rounded-xl px-4 text-[15px] outline-none transition disabled:cursor-not-allowed disabled:opacity-60"
  const inputStyle = { background: "#f7f9fc", border: "1.5px solid #dce3ee", color: "var(--brand-navy)" } as const
  const focus = (e: React.FocusEvent<HTMLInputElement>) => { e.target.style.borderColor = "var(--brand-accent)"; e.target.style.boxShadow = "0 0 0 4px var(--brand-accent-ring)" }
  const blur = (e: React.FocusEvent<HTMLInputElement>) => { e.target.style.borderColor = "#dce3ee"; e.target.style.boxShadow = "none" }

  return (
    <div
      className="relative min-h-screen overflow-hidden px-5 py-10 sm:px-10"
      style={{ background: "radial-gradient(1000px 520px at 88% -8%, rgb(var(--brand-accent-rgb) / 0.28), transparent 60%), linear-gradient(135deg, var(--brand-navy) 0%, var(--brand-navy-mid) 100%)" }}
    >
      <div className="relative mx-auto grid min-h-[calc(100vh-5rem)] w-full max-w-[1180px] items-center gap-10 lg:grid-cols-[1.15fr_0.85fr]">
        {/* Left: message */}
        <div>
          <div className="mb-5 font-mono text-[13px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--brand-accent)" }}>Operations Portal</div>
          <h1 className="font-display text-[40px] font-extrabold leading-[1.05] text-white sm:text-[58px]">
            Welcome back. <span style={{ color: "var(--brand-accent)" }}>Pick up where you left off.</span>
          </h1>
          <div className="mt-8 max-w-[520px] rounded-[22px] p-7" style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.16)", backdropFilter: "blur(6px)" }}>
            <p className="font-display text-[20px] font-bold text-white">Everything in one place</p>
            <ul className="mt-4 space-y-3.5">
              {["Every freight request in a single inbox", "Carrier quotes compared side by side", "Approvals before a quote is sent", "A full timeline for each shipment"].map((t) => (
                <li key={t} className="flex items-center gap-3.5 text-[16px]" style={{ color: "rgba(255,255,255,0.88)" }}>
                  <Check className="h-5 w-5 shrink-0" strokeWidth={2.6} style={{ color: "var(--brand-accent)" }} />{t}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Right: sign-in card */}
        <div className="w-full max-w-[440px] justify-self-center rounded-[24px] bg-white p-8 sm:p-10 lg:justify-self-end" style={{ boxShadow: "0 40px 80px -30px rgba(0,0,0,0.55)" }}>
          <div className="mb-7 flex items-center gap-3">
            <img src="/logistricks-mark-animated.svg" alt="Logistricks" width={56} height={56} style={{ display: "block", background: "var(--brand-navy)", borderRadius: 14 }} />
            <div>
              <div className="font-display text-[22px] font-extrabold leading-none" style={{ color: "var(--brand-navy)", letterSpacing: "0.06em" }}>LOGIS<span style={{ color: "var(--brand-accent)" }}>TRICKS</span></div>
              <div className="mt-1.5 text-[13px]" style={{ color: "#56667e" }}>Sign in to your portal</div>
            </div>
          </div>

          {why && !error && (
            <div className="mb-4 rounded-xl px-3.5 py-2.5 text-[13px]" style={{ background: "rgb(var(--brand-accent-rgb) / 0.08)", border: "1px solid rgb(var(--brand-accent-rgb) / 0.3)", color: "#9a5a10" }}>
              Please sign in again. <span style={{ opacity: 0.7 }}>({why})</span>
            </div>
          )}
          {error && (
            <div className="mb-4 rounded-xl px-3.5 py-2.5 text-[13px] text-red-600" style={{ background: "rgba(220,38,38,0.05)", border: "1px solid rgba(220,38,38,0.2)" }}>{error}</div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="clientCode" className={label} style={{ color: "#56667e" }}>Client Code</label>
              <input id="clientCode" type="text" autoComplete="organization" autoFocus value={clientCode} onChange={(e) => setClientCode(e.target.value)} required
                className={input} style={{ ...inputStyle, fontFamily: "var(--font-mono), monospace", letterSpacing: "0.06em", textTransform: "uppercase" }} onFocus={focus} onBlur={blur} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="username" className={label} style={{ color: "#56667e" }}>Username</label>
              <input id="username" type="text" autoComplete="username" disabled={!clientCode.trim()} value={username} onChange={(e) => setUsername(e.target.value)} required
                className={input} style={inputStyle} onFocus={focus} onBlur={blur} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className={label} style={{ color: "#56667e" }}>Password</label>
              <input id="password" type="password" autoComplete="current-password" disabled={!clientCode.trim()} value={password} onChange={(e) => setPassword(e.target.value)} required
                className={input} style={inputStyle} onFocus={focus} onBlur={blur} />
            </div>
            <button type="submit" disabled={loading}
              className="mt-2 h-[52px] w-full rounded-xl text-[16px] font-bold transition hover:-translate-y-0.5 hover:brightness-105 disabled:opacity-50"
              style={{ background: "var(--brand-accent)", color: "var(--brand-navy)", boxShadow: "0 12px 24px -10px rgb(var(--brand-accent-rgb) / 0.6)" }}>
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
