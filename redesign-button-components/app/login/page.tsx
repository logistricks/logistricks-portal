"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import Link from "next/link"
import { Check, Eye, EyeOff, Hash, Lock, Mail } from "lucide-react"

export default function LoginPage() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [clientCode, setClientCode] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!clientCode || !email || !password) {
      setError(true)
      return
    }
    router.push("/dashboard")
  }

  return (
    <div className="dot-grid flex min-h-screen items-center justify-center bg-[#0D1B2A] p-4">
      <div className="flex w-full max-w-5xl overflow-hidden rounded-2xl">
        {/* Left panel */}
        <div className="hidden w-[45%] flex-col justify-between p-10 lg:flex">
          <div>
            <span className="text-2xl font-black text-white">Logi</span>
            <span className="text-2xl font-black text-[#F97316]">tricks</span>
          </div>
          <div>
            <h2 className="text-3xl font-bold leading-tight text-white text-balance">
              Every carrier. Every rate. One reply.
            </h2>
            <ul className="mt-8 space-y-4">
              {[
                "AI-powered rate collection from WhatsApp & Email",
                "Real-time quote requests from all your carriers",
                "Built for MENA freight forwarding operations",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#F97316]">
                    <Check className="h-3 w-3 text-white" strokeWidth={3} />
                  </span>
                  <span className="text-sm text-[#CBD5E1]">{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-[#64748B]">Trusted by freight forwarders across Jordan, UAE &amp; KSA</p>
        </div>

        {/* Right panel */}
        <div className="flex w-full items-center justify-center p-6 lg:w-[55%]">
          <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
            <div className="text-center">
              <div>
                <span className="text-2xl font-black text-[#0D1B2A]">Logi</span>
                <span className="text-2xl font-black text-[#F97316]">tricks</span>
              </div>
              <p className="mt-1 text-sm text-[#64748B]">Operations Portal</p>
            </div>

            <div className="my-6 h-px bg-[#E2E8F0]" />

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <Field
                id="clientCode"
                label="Client Code"
                icon={Hash}
                placeholder="Your company code"
                value={clientCode}
                onChange={setClientCode}
                error={error && !clientCode}
              />
              <Field
                id="email"
                label="Email Address"
                icon={Mail}
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={setEmail}
                error={error && !email}
              />
              <div>
                <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-[#0F172A]">
                  Password
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className={`h-11 w-full rounded-lg border bg-white pl-10 pr-10 text-sm outline-none transition-colors placeholder:text-[#94A3B8] focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316]/20 ${
                      error && !password ? "border-red-500" : "border-[#E2E8F0]"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#64748B]"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {error && !password ? <p className="mt-1 text-xs text-red-600">Password is required</p> : null}
              </div>

              <button
                type="submit"
                className="h-11 w-full rounded-lg bg-[#F97316] text-sm font-semibold text-white transition-colors hover:bg-[#EA580C]"
              >
                Sign In
              </button>

              <div className="text-right">
                <a href="#" className="text-sm text-[#F97316] hover:underline">
                  Forgot password?
                </a>
              </div>
            </form>

            <p className="mt-6 text-center text-xs text-[#64748B]">
              Need access?{" "}
              <Link href="/dashboard" className="text-[#64748B] underline-offset-2 hover:underline">
                Contact your administrator.
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({
  id,
  label,
  icon: Icon,
  type = "text",
  placeholder,
  value,
  onChange,
  error,
}: {
  id: string
  label: string
  icon: typeof Hash
  type?: string
  placeholder: string
  value: string
  onChange: (v: string) => void
  error?: boolean
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-[#0F172A]">
        {label}
      </label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`h-11 w-full rounded-lg border bg-white pl-10 pr-3 text-sm outline-none transition-colors placeholder:text-[#94A3B8] focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316]/20 ${
            error ? "border-red-500" : "border-[#E2E8F0]"
          }`}
        />
      </div>
      {error ? <p className="mt-1 text-xs text-red-600">This field is required</p> : null}
    </div>
  )
}
