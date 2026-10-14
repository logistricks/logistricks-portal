"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { ArrowLeft, X } from "lucide-react"

export const TASK_RETURN_KEY = "lt_task_return"
export type TaskReturn = { path: string; ref: string; title: string }

/** Call when opening a task's request: the pill below then offers a one-click way back to the Tasks page. */
export function rememberTaskReturn(v: TaskReturn) {
  try { sessionStorage.setItem(TASK_RETURN_KEY, JSON.stringify(v)) } catch { /* */ }
}

/** "Back to tasks" pill, bottom right, while the request opened from a task is on screen. */
export function TaskReturnPill() {
  const pathname = usePathname() ?? ""
  const [ret, setRet] = useState<TaskReturn | null>(null)

  useEffect(() => {
    let v: TaskReturn | null = null
    try { v = JSON.parse(sessionStorage.getItem(TASK_RETURN_KEY) || "null") } catch { /* */ }
    // gone back to the tasks page, or moved on to some other page: the pill has done its job
    if (v && (pathname === "/tasks" || !pathname.startsWith(v.path))) { try { sessionStorage.removeItem(TASK_RETURN_KEY) } catch { /* */ }; v = null }
    setRet(v)
  }, [pathname])

  useEffect(() => {
    document.documentElement.style.setProperty("--lt-return-offset", ret ? "72px" : "0px")
    return () => { document.documentElement.style.setProperty("--lt-return-offset", "0px") }
  }, [ret])

  if (!ret) return null
  return (
    <div className="fixed bottom-4 right-4 z-[290] flex w-[min(92vw,380px)] items-center gap-3 rounded-xl px-[18px] py-3 text-white"
      style={{ background: "#0F1E36", border: "1px solid rgba(255,255,255,.2)", boxShadow: "0 8px 24px -12px rgba(15,30,54,.35)", animation: "toast-in .25s ease-out" }}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-semibold">{ret.ref}</p>
        <p className="truncate text-[12px] text-white/70">{ret.title}</p>
      </div>
      <Link href="/tasks" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-bold" style={{ background: "#E8821A", color: "#0F1E36" }}>
        <ArrowLeft className="h-3.5 w-3.5" /> Back to tasks
      </Link>
      <button type="button" aria-label="Hide" onClick={() => { try { sessionStorage.removeItem(TASK_RETURN_KEY) } catch { /* */ }; setRet(null) }}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-white/50 hover:bg-white/10 hover:text-white"><X className="h-3.5 w-3.5" /></button>
      <style>{`@keyframes toast-in { from { transform: translateY(12px); opacity: 0 } to { transform: none; opacity: 1 } }`}</style>
    </div>
  )
}
