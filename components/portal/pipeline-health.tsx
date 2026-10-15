"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Activity, ListChecks, Loader2, TrendingDown, TrendingUp } from "lucide-react"
import type { DashRange } from "@/lib/dashboard-range"

type Part = { key: string; label: string; hint: string; weight: number; ok: number; total: number; pct: number | null }
type Health = {
  score: number | null; prevScore: number | null; target: number; parts: Part[]
  trend: { from: number; to: number; count: number; score: number | null }[]
  requests: number; weakest: { key: string; label: string; pct: number } | null
  rightNow: { open: number; overdue: number }
}

const GOOD = "#16a34a", OK = "#d97706", BAD = "#dc2626"
const tone = (v: number | null, target: number) => (v === null ? "var(--text-muted)" : v >= target ? GOOD : v >= target - 20 ? OK : BAD)
const fmt = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" })

function Ring({ value, target }: { value: number | null; target: number }) {
  const R = 74, C = 2 * Math.PI * R
  const pct = value ?? 0
  const ang = (target / 100) * 2 * Math.PI - Math.PI / 2
  return (
    <svg viewBox="0 0 180 180" className="h-[190px] w-[190px]" role="img" aria-label={value === null ? "No score yet" : `Pipeline Health ${value} out of 100`}>
      <circle cx="90" cy="90" r={R} fill="none" stroke="var(--card-border)" strokeWidth="13" />
      <circle cx="90" cy="90" r={R} fill="none" stroke={tone(value, target)} strokeWidth="13" strokeLinecap="round"
        strokeDasharray={`${(pct / 100) * C} ${C}`} transform="rotate(-90 90 90)" style={{ transition: "stroke-dasharray .6s ease" }} />
      <line x1={90 + (R - 11) * Math.cos(ang)} y1={90 + (R - 11) * Math.sin(ang)} x2={90 + (R + 11) * Math.cos(ang)} y2={90 + (R + 11) * Math.sin(ang)} stroke="var(--text-primary)" strokeWidth="2.5" strokeLinecap="round" />
      <text x="90" y="92" textAnchor="middle" fontSize="46" fontWeight="800" fill="var(--text-primary)" style={{ fontFamily: "var(--font-display), sans-serif" }}>{value ?? "–"}</text>
      <text x="90" y="116" textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--text-muted)">out of 100</text>
    </svg>
  )
}

function Trend({ points, target }: { points: Health["trend"]; target: number }) {
  const W = 560, Hh = 150, padX = 14, padY = 14
  const xs = (i: number) => padX + (i / Math.max(1, points.length - 1)) * (W - padX * 2)
  const ys = (v: number) => padY + (1 - v / 100) * (Hh - padY * 2)
  const pts = points.map((p, i) => (p.score === null ? null : { x: xs(i), y: ys(p.score), p }))
  const line = pts.filter(Boolean) as { x: number; y: number; p: Health["trend"][number] }[]
  const path = line.map((q, i) => `${i ? "L" : "M"}${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(" ")
  const [hover, setHover] = useState<number | null>(null)
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${Hh}`} className="h-[150px] w-full" role="img" aria-label="Pipeline Health over the period">
        {[0, 50, 100].map((g) => <line key={g} x1={padX} x2={W - padX} y1={ys(g)} y2={ys(g)} stroke="var(--card-border)" strokeWidth="1" />)}
        <line x1={padX} x2={W - padX} y1={ys(target)} y2={ys(target)} stroke="var(--text-muted)" strokeWidth="1.5" strokeDasharray="5 5" />
        <text x={W - padX} y={ys(target) - 5} textAnchor="end" fontSize="11" fontWeight="600" fill="var(--text-muted)">target {target}</text>
        {line.length > 1 && <path d={path} fill="none" stroke="var(--brand-accent)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />}
        {line.map((q, i) => (
          <circle key={i} cx={q.x} cy={q.y} r={hover === points.indexOf(q.p) ? 6 : 4.5} fill="var(--card-bg)" stroke="var(--brand-accent)" strokeWidth="2.5"
            onMouseEnter={() => setHover(points.indexOf(q.p))} onMouseLeave={() => setHover(null)} />
        ))}
      </svg>
      <div className="mt-1 h-5 text-center text-[12.5px] font-semibold" style={{ color: "var(--text-secondary)" }}>
        {hover !== null && points[hover]?.score !== null
          ? <>{fmt(points[hover].from)} – {fmt(points[hover].to - 1)} · <b style={{ color: "var(--text-primary)" }}>{points[hover].score}</b> · {points[hover].count} request{points[hover].count === 1 ? "" : "s"}</>
          : <span style={{ color: "var(--text-muted)" }}>{fmt(points[0].from)} → {fmt(points[points.length - 1].to - 1)}</span>}
      </div>
    </div>
  )
}

export function PipelineHealth({ range }: { range: DashRange }) {
  const [data, setData] = useState<Health | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)
  const cache = useRef(new Map<string, Health>())
  const seq = useRef(0)

  useEffect(() => {
    const id = ++seq.current
    const key = `${range.from}-${range.to}`
    const hit = cache.current.get(key)
    if (hit) setData(hit)
    setBusy(true)
    const qs = new URLSearchParams({ from: new Date(range.from).toISOString(), to: new Date(range.to).toISOString() })
    fetch(`/api/pipeline-health?${qs}`, { cache: "no-store" }).then(async (r) => {
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || `Failed (${r.status})`)
      if (id !== seq.current) return
      cache.current.set(key, j); setData(j); setErr(null)
    }).catch((e) => { if (id === seq.current) setErr(e.message) }).finally(() => { if (id === seq.current) setBusy(false) })
  }, [range.from, range.to])

  const delta = data && data.score !== null && data.prevScore !== null ? data.score - data.prevScore : null
  const card = "ds-card mx-auto w-full p-6 md:p-7"

  return (
    <div className={card}>
      <div className="flex flex-col items-center text-center">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5" style={{ color: "var(--brand-accent)" }} />
          <h2 className="font-display text-[22px] font-extrabold" style={{ color: "var(--text-primary)" }}>Pipeline Health</h2>
          {busy && data && <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--text-muted)" }} />}
        </div>
        <p className="mt-1 max-w-[560px] text-[13.5px]" style={{ color: "var(--text-secondary)" }}>
          How many steps were done within the time limits in Task Setup · {range.label}
        </p>
      </div>

      {!data && busy && <div className="flex justify-center py-14"><Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--text-muted)" }} /></div>}
      {!data && !busy && err && <p className="py-10 text-center text-[13.5px]" style={{ color: "#dc2626" }}>Could not work out the score: {err}</p>}

      {data && (
        <>
          <div className="mt-5 grid items-center gap-6 lg:grid-cols-[230px_1fr_1fr]">
            {/* score */}
            <div className="flex flex-col items-center text-center">
              <Ring value={data.score} target={data.target} />
              <div className="mt-1 text-[13px] font-semibold" style={{ color: "var(--text-secondary)" }}>
                {data.score === null ? "Nothing to measure in this period yet" : data.score >= data.target ? "On target" : `${data.target - data.score} below the ${data.target} target`}
              </div>
              {delta !== null && (
                <div className="mt-1 inline-flex items-center gap-1 text-[13px] font-bold" style={{ color: delta >= 0 ? GOOD : BAD }}>
                  {delta >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                  {delta === 0 ? "Same as" : `${delta > 0 ? "+" : ""}${delta} vs`} the previous period
                </div>
              )}
            </div>

            {/* breakdown */}
            <div className="space-y-3.5">
              {data.parts.map((p) => (
                <div key={p.key} title={p.hint}>
                  <div className="mb-1 flex items-baseline justify-between gap-3 text-[13.5px]">
                    <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{p.label}</span>
                    <span style={{ color: "var(--text-muted)" }}>{p.pct === null ? "no data" : <><b style={{ color: "var(--text-primary)" }}>{p.pct}%</b> · {p.ok} of {p.total} on time</>}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full" style={{ background: "var(--card-border)" }}>
                    <div className="h-full rounded-full" style={{ width: `${p.pct ?? 0}%`, background: tone(p.pct, data.target), transition: "width .5s ease" }} />
                  </div>
                </div>
              ))}
            </div>

            {/* trend */}
            <div>
              <div className="mb-1 text-center text-[12.5px] font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Trend</div>
              <Trend points={data.trend} target={data.target} />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 border-t pt-4 text-center text-[13.5px]" style={{ borderColor: "var(--divider)", color: "var(--text-secondary)" }}>
            {data.weakest && data.weakest.pct < data.target && (
              <span>Biggest chance to improve: <b style={{ color: "var(--text-primary)" }}>{data.weakest.label.toLowerCase()}</b> ({data.weakest.pct}%)</span>
            )}
            <Link href="/tasks" className="inline-flex items-center gap-1.5 font-semibold" style={{ color: data.rightNow.overdue ? BAD : "var(--text-secondary)" }}>
              <ListChecks className="h-4 w-4" />
              Right now: {data.rightNow.overdue} overdue of {data.rightNow.open} open tasks
            </Link>
            <span style={{ color: "var(--text-muted)" }}>{data.requests} request{data.requests === 1 ? "" : "s"} received in this period</span>
          </div>
        </>
      )}
    </div>
  )
}
