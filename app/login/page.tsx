"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, Loader2 } from "lucide-react"
import { supabase } from "@/lib/supabase"

export default function LoginPage() {
  const router = useRouter()
  const [clientCode, setClientCode] = useState("")
  const [username, setUsername]     = useState("")
  const [password, setPassword]     = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading]  = useState(false)
  const [error, setError]      = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const clientCodeClean = clientCode.trim().toUpperCase()
    const usernameClean   = username.trim().toLowerCase()

    if (!clientCodeClean || !usernameClean || !password) {
      setError("Please fill in all fields.")
      setLoading(false)
      return
    }

    // Step 1 — verify credentials + SHA-256 password hash server-side
    let loginData: { email?: string; token_hash?: string; error?: string }
    try {
      const res = await fetch("/api/auth/login", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ clientCode: clientCodeClean, username: usernameClean, password }),
      })
      loginData = await res.json()
      if (!res.ok) {
        setError(loginData.error ?? "Something went wrong. Please try again.")
        setLoading(false)
        return
      }
    } catch {
      setError("Network error. Please try again.")
      setLoading(false)
      return
    }

    // Step 2 — exchange hashed token for a real Supabase session (PKCE-compatible)
    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: loginData.token_hash!,
      type: "magiclink",
    })

    if (verifyError) {
      setError("Session creation failed. Please try again.")
      setLoading(false)
      return
    }

    // Step 3 — store display context
    try {
      sessionStorage.setItem("portal_username",    usernameClean)
      sessionStorage.setItem("portal_client_code", clientCodeClean)
    } catch {
      // sessionStorage unavailable — continue anyway
    }

    router.push("/dashboard")
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F0F4F8] px-4">
      <div className="w-full max-w-[420px]">
        {/* Logo */}
        <div className="mb-10 text-center">
          <div className="inline-flex items-baseline gap-0">
            <span
              className="text-[32px] font-black leading-none tracking-tight text-[#0D1B2A]"
              style={{ fontFamily: "var(--font-jakarta), var(--font-inter), system-ui, sans-serif" }}
            >
              Logis
            </span>
            <span
              className="text-[32px] font-black leading-none tracking-tight text-[#F97316]"
              style={{ fontFamily: "var(--font-jakarta), var(--font-inter), system-ui, sans-serif" }}
            >
              tricks
            </span>
          </div>
          <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.12em] text-[#94A3B8]">
            Operations Portal
          </p>
        </div>

        <div className="rounded border border-[#D1D9E0] bg-white shadow-[0_4px_20px_rgba(13,27,42,0.08),0_1px_4px_rgba(13,27,42,0.04)]">
          <div className="border-b border-[#E8EDF2] px-8 py-5">
            <h1
              className="text-[17px] font-bold tracking-tight text-[#0D1B2A]"
              style={{ fontFamily: "var(--font-jakarta), var(--font-inter), system-ui, sans-serif" }}
            >
              Sign in to your account
            </h1>
            <p className="mt-0.5 text-sm text-[#64748B]">
              Enter your client code, username, and password
            </p>
          </div>

          <div className="px-8 py-6">
            {error && (
              <div className="mb-5 flex items-start gap-3 rounded border border-red-200 bg-red-50 px-4 py-3">
                <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-red-500" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Client Code */}
              <div>
                <label
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#475569]"
                  htmlFor="client-code"
                >
                  Client Code
                </label>
                <input
                  id="client-code"
                  type="text"
                  required
                  maxLength={15}
                  autoComplete="organization"
                  value={clientCode}
                  onChange={(e) => setClientCode(e.target.value.toUpperCase())}
                  placeholder="e.g. DEMO"
                  className="w-full rounded border border-[#D1D9E0] bg-white px-4 py-2.5 text-sm font-mono uppercase tracking-widest text-[#0D1B2A] outline-none transition-all placeholder:text-[#94A3B8] placeholder:normal-case placeholder:tracking-normal focus:border-[#F97316] focus:shadow-[0_0_0_3px_rgba(249,115,22,0.12)]"
                />
              </div>

              {/* Username */}
              <div>
                <label
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#475569]"
                  htmlFor="username"
                >
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  required
                  maxLength={15}
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  placeholder="yourname"
                  className="w-full rounded border border-[#D1D9E0] bg-white px-4 py-2.5 text-sm text-[#0D1B2A] outline-none transition-all placeholder:text-[#94A3B8] focus:border-[#F97316] focus:shadow-[0_0_0_3px_rgba(249,115,22,0.12)]"
                />
              </div>

              {/* Password */}
              <div>
                <label
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#475569]"
                  htmlFor="password"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded border border-[#D1D9E0] bg-white px-4 py-2.5 pr-10 text-sm text-[#0D1B2A] outline-none transition-all placeholder:text-[#94A3B8] focus:border-[#F97316] focus:shadow-[0_0_0_3px_rgba(249,115,22,0.12)]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] transition-colors hover:text-[#64748B]"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded bg-[#F97316] px-4 py-2.5 text-sm font-bold tracking-wide text-white transition-all hover:bg-[#EA580C] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Signing in…
                  </>
                ) : (
                  "Sign In"
                )}
              </button>
            </form>
          </div>
        </div>

        <p className="mt-8 text-center text-[11px] text-[#94A3B8]">
          Logistricks · AI Rate Collection Platform
        </p>
      </div>
    </div>
  )
}
