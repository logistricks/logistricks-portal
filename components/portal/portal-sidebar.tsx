"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Activity, Building2, FileText, LayoutDashboard, LogOut, Mail, Settings } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { currentUser, requests } from "@/lib/portal-data"

const pendingCount = requests.filter((r) => r.status === "Pending").length

const nav = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Requests", href: "/requests", icon: FileText, badge: pendingCount },
  { label: "Carriers", href: "/carriers", icon: Building2 },
  { label: "Templates", href: "/templates", icon: Mail },
  { label: "Activity Log", href: "/activity", icon: Activity },
  { label: "Settings", href: "/settings", icon: Settings },
]

export function PortalSidebar() {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push("/login")
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-white/5 bg-[#0D1B2A] md:flex">
      {/* Logo */}
      <div className="border-b border-white/5 px-6 py-5">
        <Link href="/dashboard" className="block">
          <span className="text-[22px] font-black tracking-tight text-white" style={{ fontFamily: "var(--font-jakarta), var(--font-inter), system-ui, sans-serif" }}>Logis</span>
          <span className="text-[22px] font-black tracking-tight text-[#F97316]" style={{ fontFamily: "var(--font-jakarta), var(--font-inter), system-ui, sans-serif" }}>tricks</span>
        </Link>
        <p className="mt-0.5 text-[11px] font-medium uppercase tracking-widest text-[#475569]">Operations Portal</p>
      </div>

      <nav className="flex-1 space-y-0.5 px-3 py-3">
        {nav.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/")
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex items-center gap-3 rounded px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-[#F97316] text-white"
                  : "text-[#94A3B8] hover:bg-[#1E3A5F] hover:text-[#E2E8F0]"
              }`}
            >
              <Icon className="h-[17px] w-[17px] shrink-0" aria-hidden="true" />
              <span className="flex-1 tracking-tight">{item.label}</span>
              {item.badge ? (
                <span
                  className={`inline-flex h-5 min-w-5 items-center justify-center rounded px-1.5 text-[11px] font-bold ${
                    active ? "bg-white/20 text-white" : "bg-[#F97316] text-white"
                  }`}
                >
                  {item.badge}
                </span>
              ) : null}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-white/5 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-[#1E3A5F] text-sm font-semibold text-white">
            {currentUser.initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-[#E2E8F0]">{currentUser.name}</p>
            <p className="truncate text-xs text-[#475569]">{currentUser.email}</p>
          </div>
          <button
            onClick={handleLogout}
            aria-label="Log out"
            className="flex h-8 w-8 items-center justify-center rounded text-[#475569] transition-colors hover:bg-[#1E3A5F] hover:text-red-400"
          >
            <LogOut className="h-[16px] w-[16px]" />
          </button>
        </div>
      </div>
    </aside>
  )
}
