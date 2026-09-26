"use client"

/**
 * app/login/page.tsx
 *
 * Sends credentials to /api/auth/login (server-side).
 * The server queries portal_users with the service role key and
 * sets an HTTP-only HMAC-signed cookie on success.
 * No direct Supabase calls here — no anon key exposure.
 */
import { useState } from "react"
import { useRouter } from "next/navigation"

export default function LoginPage() {
  const router = useRouter()
  const [clientCode, setClientCode] = useState("")
  const [username, setUsername]     = useState("")
  const [password, setPassword]     = useState("")
  const [error, setError]           = useState("")
  const [loading, setLoading]       = useState(false)

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

  return (
    <div
      className="relative flex min-h-screen items-center justify-center px-4 py-12"
      style={{ background: "#e8edf4" }}
    >
      {/* Subtle diagonal-stripe background */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage: `repeating-linear-gradient(
            -45deg,
            transparent 0px,
            transparent 18px,
            rgba(15,30,54,0.022) 18px,
            rgba(15,30,54,0.022) 19px
          )`,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background: "radial-gradient(ellipse 80% 80% at 50% 50%, transparent 50%, rgba(15,30,54,0.07) 100%)",
        }}
      />

      {/* Card */}
      <div
        className="relative z-10 w-full max-w-[380px] overflow-hidden rounded-[4px]"
        style={{
          background: "#ffffff",
          border: "1px solid #d0d8e4",
          boxShadow: "0 1px 2px rgba(15,30,54,0.06), 0 8px 32px rgba(15,30,54,0.10), 0 2px 8px rgba(15,30,54,0.07)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-[22px] py-[18px]"
          style={{
            background: "var(--brand-navy)",
            borderBottom: "2px solid var(--brand-accent)",
          }}
        >
          <div
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[3px] text-[19px] font-extrabold text-white"
            style={{ background: "var(--brand-accent)", fontFamily: "var(--font-sans), system-ui, sans-serif" }}
          >
            L
          </div>
          <div>
            <div
              className="text-[17px] font-extrabold leading-none tracking-tight text-white"
              style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
            >
              Logistricks
            </div>
            <div
              className="mt-[3px] text-[9px] font-medium uppercase tracking-[0.14em]"
              style={{ color: "rgba(255,255,255,0.5)", fontFamily: "var(--font-mono), monospace" }}
            >
              Operations Portal
            </div>
          </div>
        </div>

        {/* Form body */}
        <div className="px-[22px] pb-[26px] pt-6">
          {error && (
            <div
              className="mb-4 rounded-[3px] px-[11px] py-2 text-[12.5px] text-red-600"
              style={{
                background: "rgba(220,38,38,0.05)",
                border: "1px solid rgba(220,38,38,0.2)",
              }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-[14px]">
            {/* Client Code */}
            <div className="flex flex-col gap-[5px]">
              <label
                htmlFor="clientCode"
                className="text-[10px] font-semibold uppercase tracking-[0.12em]"
                style={{ color: "#6b7f96", fontFamily: "var(--font-mono), monospace" }}
              >
                Client Code
              </label>
              <input
                id="clientCode"
                type="text"
                autoComplete="organization"
                placeholder="SABIC-001"
                value={clientCode}
                onChange={(e) => setClientCode(e.target.value)}
                required
                className="h-10 w-full rounded-[3px] px-[11px] text-[13px] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#bdc9d6]"
                style={{
                  background: "#f7f9fc",
                  border: "1px solid #cdd6e2",
                  color: "var(--brand-navy)",
                  fontFamily: "var(--font-mono), monospace",
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "var(--brand-accent)"
                  e.target.style.boxShadow = "0 0 0 3px var(--brand-accent-ring)"
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "#cdd6e2"
                  e.target.style.boxShadow = "none"
                }}
              />
            </div>

            {/* Username */}
            <div className="flex flex-col gap-[5px]">
              <label
                htmlFor="username"
                className="text-[10px] font-semibold uppercase tracking-[0.12em]"
                style={{ color: "#6b7f96", fontFamily: "var(--font-mono), monospace" }}
              >
                Username
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                placeholder="your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="h-10 w-full rounded-[3px] px-[11px] text-sm outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#bdc9d6]"
                style={{
                  background: "#f7f9fc",
                  border: "1px solid #cdd6e2",
                  color: "var(--brand-navy)",
                  fontFamily: "var(--font-sans), system-ui, sans-serif",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "var(--brand-accent)"
                  e.target.style.boxShadow = "0 0 0 3px var(--brand-accent-ring)"
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "#cdd6e2"
                  e.target.style.boxShadow = "none"
                }}
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-[5px]">
              <label
                htmlFor="password"
                className="text-[10px] font-semibold uppercase tracking-[0.12em]"
                style={{ color: "#6b7f96", fontFamily: "var(--font-mono), monospace" }}
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-10 w-full rounded-[3px] px-[11px] text-sm outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#bdc9d6]"
                style={{
                  background: "#f7f9fc",
                  border: "1px solid #cdd6e2",
                  color: "var(--brand-navy)",
                  fontFamily: "var(--font-sans), system-ui, sans-serif",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "var(--brand-accent)"
                  e.target.style.boxShadow = "0 0 0 3px var(--brand-accent-ring)"
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "#cdd6e2"
                  e.target.style.boxShadow = "none"
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-[6px] h-[42px] w-full rounded-[3px] text-[12px] font-bold uppercase tracking-[0.1em] text-white transition-[background,box-shadow] duration-150 disabled:opacity-50"
              style={{
                background: "var(--brand-accent)",
                fontFamily: "var(--font-mono), monospace",
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  (e.target as HTMLButtonElement).style.background = "var(--brand-accent-hover)"
                  ;(e.target as HTMLButtonElement).style.boxShadow = "0 2px 8px rgba(232,130,26,0.3)"
                }
              }}
              onMouseLeave={(e) => {
                ;(e.target as HTMLButtonElement).style.background = "var(--brand-accent)"
                ;(e.target as HTMLButtonElement).style.boxShadow = "none"
              }}
            >
              {loading ? "Signing in…" : "Sign In →"}
            </button>
          </form>
        </div>

        {/* Footer strip */}
        <div
          className="flex items-center justify-between px-[22px] py-[9px]"
          style={{ borderTop: "1px solid #edf1f6" }}
        >
          <span
            className="text-[9px] uppercase tracking-[0.1em]"
            style={{ color: "#b0bcc9", fontFamily: "var(--font-mono), monospace" }}
          >
            TLS 1.3 · Secured
          </span>
          <span
            className="flex items-center gap-[5px] text-[9px] uppercase tracking-[0.1em]"
            style={{ color: "#b0bcc9", fontFamily: "var(--font-mono), monospace" }}
          >
            <span
              className="inline-block h-[5px] w-[5px] rounded-full"
              style={{ background: "#16a34a", boxShadow: "0 0 4px rgba(22,163,74,0.6)" }}
            />
            Operational
          </span>
        </div>
      </div>
    </div>
  )
}
