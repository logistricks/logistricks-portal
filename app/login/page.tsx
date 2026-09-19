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
    <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] dark:bg-[#0A0F1A] px-4">
      <div className="w-full max-w-sm">
        {/* Logo / brand */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#F97316]">
            <span className="text-2xl font-black text-white">L</span>
          </div>
          <h1
            className="text-2xl font-black tracking-tight text-[#0D1B2A] dark:text-[#E2E8F0]"
            style={{ fontFamily: "var(--font-jakarta), system-ui, sans-serif" }}
          >
            Logistricks Portal
          </h1>
          <p className="mt-1 text-sm text-[#64748B] dark:text-[#475569]">
            Sign in to your workspace
          </p>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-[#E2E8F0] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)] dark:border-[#1E3A5F] dark:bg-[#111E33]">
          <form onSubmit={handleSubmit} className="space-y-4 p-6">
            {error && (
              <div className="rounded border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
                {error}
              </div>
            )}

            <div>
              <label
                htmlFor="clientCode"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8]"
              >
                Client Code
              </label>
              <input
                id="clientCode"
                type="text"
                autoComplete="organization"
                placeholder=""
                value={clientCode}
                onChange={(e) => setClientCode(e.target.value)}
                required
                className="h-10 w-full rounded border border-[#D1D9E0] bg-white px-3 text-sm text-[#0D1B2A] outline-none placeholder:text-[#CBD5E1] focus:border-[#F97316] focus:shadow-[0_0_0_3px_rgba(249,115,22,0.12)] dark:border-[#1E3A5F] dark:bg-[#0E1A2E] dark:text-[#E2E8F0]"
              />
            </div>

            <div>
              <label
                htmlFor="username"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8]"
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
                className="h-10 w-full rounded border border-[#D1D9E0] bg-white px-3 text-sm text-[#0D1B2A] outline-none placeholder:text-[#CBD5E1] focus:border-[#F97316] focus:shadow-[0_0_0_3px_rgba(249,115,22,0.12)] dark:border-[#1E3A5F] dark:bg-[#0E1A2E] dark:text-[#E2E8F0]"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8]"
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
                className="h-10 w-full rounded border border-[#D1D9E0] bg-white px-3 text-sm text-[#0D1B2A] outline-none placeholder:text-[#CBD5E1] focus:border-[#F97316] focus:shadow-[0_0_0_3px_rgba(249,115,22,0.12)] dark:border-[#1E3A5F] dark:bg-[#0E1A2E] dark:text-[#E2E8F0]"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 h-10 w-full rounded bg-[#F97316] text-sm font-bold text-white transition-colors hover:bg-[#EA580C] disabled:opacity-60"
            >
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
