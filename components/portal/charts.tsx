"use client"

/**
 * Tiny dependency-free SVG charts for the dashboard.
 * Colours come from the theme (`--brand-accent` etc.), so Settings → Theme recolours them.
 */
import { useEffect, useRef, useState } from "react"
import Link from "next/link"

export const CHART_COLORS = [
  "var(--brand-accent)", "#2F5D9B", "#16a34a", "#C25E0A", "#6B8DB8", "#dc2626", "#eab308", "#64748b",
]

export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

export function CountUp({ value, format = (n: number) => String(Math.round(n)) }: { value: number | null | undefined; format?: (n: number) => string }) {
  const [shown, setShown] = useState(value ?? 0)
  const from = useRef(value ?? 0)
  useEffect(() => {
    if (value == null) return
    const start = from.current, end = value, t0 = performance.now(), dur = 700
    if (start === end) { setShown(end); return }
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3)
      setShown(start + (end - start) * e)
      if (p < 1) raf = requestAnimationFrame(tick); else from.current = end
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return <>{value == null ? "—" : format(shown)}</>
}

const nice = (max: number) => {
  if (max <= 0) return 1
  const p = Math.pow(10, Math.floor(Math.log10(max))), f = max / p
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p
}

export interface TrendSeries { key: string; label: string; color: string; kind?: "bar" | "line" }

/** Bars and/or lines over a shared x axis, hover tooltip. */
export function TrendChart({
  data, series, height = 220, format = (n: number) => String(Math.round(n)),
}: { data: Record<string, any>[]; series: TrendSeries[]; height?: number; format?: (n: number) => string }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const padL = 34, padR = 8, padT = 10, padB = 22
  const W = Math.max(w, 120), H = height
  const iw = W - padL - padR, ih = H - padT - padB
  const max = nice(Math.max(1, ...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0))))
  const n = data.length || 1
  const step = iw / n
  const bars = series.filter((s) => s.kind !== "line"), lines = series.filter((s) => s.kind === "line")
  const y = (v: number) => padT + ih - (v / max) * ih
  const bw = Math.max(2, Math.min(28, (step * 0.7) / Math.max(1, bars.length)))
  const cx = (i: number) => padL + step * i + step / 2
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 56))))
  const ticks = [0, 0.25, 0.5, 0.75, 1]
  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {w > 0 && (
        <svg width={W} height={H} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={W - padR} y1={y(max * t)} y2={y(max * t)} stroke="var(--divider)" strokeDasharray={t === 0 ? undefined : "3 4"} />
              <text x={padL - 6} y={y(max * t) + 3} textAnchor="end" fontSize="10" style={{ fill: "var(--text-muted)" }}>{format(max * t)}</text>
            </g>
          ))}
          {data.map((d, i) => (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <rect x={padL + step * i} y={padT} width={step} height={ih} fill="transparent" />
              {hover === i && <rect x={padL + step * i} y={padT} width={step} height={ih} style={{ fill: "var(--hover-bg)" }} />}
              {bars.map((s, bi) => {
                const v = Number(d[s.key]) || 0
                const x = cx(i) - (bw * bars.length) / 2 + bi * bw
                return <rect key={s.key} x={x} y={y(v)} width={bw - 1} height={Math.max(v > 0 ? 2 : 0, padT + ih - y(v))} rx={2} style={{ fill: s.color, transition: "all .4s" }} />
              })}
              {i % labelEvery === 0 && (
                <text x={cx(i)} y={H - 6} textAnchor="middle" fontSize="10" style={{ fill: "var(--text-muted)" }}>{d.label}</text>
              )}
            </g>
          ))}
          {lines.map((s) => {
            const pts = data.map((d, i) => `${cx(i)},${y(Number(d[s.key]) || 0)}`)
            return (
              <g key={s.key} pointerEvents="none">
                <polyline points={pts.join(" ")} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" style={{ stroke: s.color }} />
                {data.length <= 40 && data.map((d, i) => <circle key={i} cx={cx(i)} cy={y(Number(d[s.key]) || 0)} r={hover === i ? 4 : 2.5} style={{ fill: "var(--card-bg)", stroke: s.color }} strokeWidth={2} />)}
              </g>
            )
          })}
        </svg>
      )}
      {hover != null && data[hover] && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border px-2.5 py-1.5 text-[11.5px] shadow-lg"
          style={{
            left: Math.min(Math.max(cx(hover) - 60, 0), Math.max(0, W - 130)), top: 0,
            background: "var(--card-bg)", borderColor: "var(--card-border)", color: "var(--text-primary)",
          }}
        >
          <div className="mb-0.5 font-semibold">{data[hover].label}</div>
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
              <span className="h-2 w-2 rounded-[2px]" style={{ background: s.color }} />
              {s.label}: <b style={{ color: "var(--text-primary)" }}>{format(Number(data[hover][s.key]) || 0)}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--text-secondary)" }}>
          <span className="h-2 w-2 rounded-[2px]" style={{ background: i.color }} />{i.label}
        </span>
      ))}
    </div>
  )
}

export interface Slice { label: string; value: number }

/** Optional click-through: returns a URL for a slice/row label. `newTab` opens it in a new tab. */
export type HrefFor = (label: string) => string | undefined
function Row({ href, newTab, className, style, children, ...rest }: { href?: string; newTab?: boolean; className?: string; style?: React.CSSProperties; children: React.ReactNode } & React.HTMLAttributes<HTMLElement>) {
  if (!href) return <div className={className} style={style} {...(rest as React.HTMLAttributes<HTMLDivElement>)}>{children}</div>
  return (
    <Link href={href} {...(newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})} className={`chart-link ${className ?? ""}`} style={style} {...(rest as object)}>{children}</Link>
  )
}

export function Donut({ items, centerValue, centerLabel, size = 150, hrefFor, newTab }: { items: Slice[]; centerValue?: string | number; centerLabel?: string; size?: number; hrefFor?: HrefFor; newTab?: boolean }) {
  const [hover, setHover] = useState<number | null>(null)
  const total = items.reduce((s, i) => s + i.value, 0)
  const r = size / 2 - 12, c = 2 * Math.PI * r
  let acc = 0
  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={14} style={{ stroke: "var(--divider)" }} />
          {total > 0 && items.map((it, i) => {
            const len = (it.value / total) * c
            const el = (
              <circle key={it.label} cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={hover === i ? 17 : 14}
                strokeDasharray={`${Math.max(0, len - 1.5)} ${c}`} strokeDashoffset={-acc}
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
                onClick={() => { const h = hrefFor?.(it.label); if (h) { if (newTab) window.open(h, "_blank", "noopener"); else window.location.assign(h) } }}
                style={{ cursor: hrefFor?.(it.label) ? "pointer" : undefined, stroke: CHART_COLORS[i % CHART_COLORS.length], transition: "stroke-width .15s, stroke-dasharray .5s" }} />
            )
            acc += len
            return el
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <div className="text-[22px] font-bold leading-none tabular-nums" style={{ color: "var(--text-primary)" }}>
            {hover != null ? items[hover].value : centerValue ?? total}
          </div>
          <div className="mt-1 max-w-[80px] truncate text-[10.5px]" style={{ color: "var(--text-muted)" }}>
            {hover != null ? items[hover].label : centerLabel ?? "Total"}
          </div>
        </div>
      </div>
      <div className="min-w-[120px] flex-1 space-y-1">
        {items.length === 0 && <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>No data in this period.</p>}
        {items.map((it, i) => (
          <Row key={it.label} href={hrefFor?.(it.label)} newTab={newTab} className="flex items-center gap-2 text-[12.5px]" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
            <span className="min-w-0 flex-1 truncate" style={{ color: "var(--text-primary)" }}>{it.label}</span>
            <span className="tabular-nums" style={{ color: "var(--text-secondary)" }}>{it.value}</span>
            <span className="w-9 text-right tabular-nums text-[11px]" style={{ color: "var(--text-muted)" }}>{total ? Math.round((it.value / total) * 100) : 0}%</span>
          </Row>
        ))}
      </div>
    </div>
  )
}

export function HBars({ items, color = "var(--brand-accent)", format = (n: number) => String(n), empty = "No data in this period.", hrefFor, newTab }:
  { items: Slice[]; color?: string; format?: (n: number) => string; empty?: string; hrefFor?: HrefFor; newTab?: boolean }) {
  const max = Math.max(1, ...items.map((i) => i.value))
  if (!items.length) return <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>{empty}</p>
  return (
    <div className="space-y-2">
      {items.map((it) => (
        <Row key={it.label} href={hrefFor?.(it.label)} newTab={newTab} className="block">
          <div className="mb-0.5 flex justify-between gap-2 text-[12.5px]">
            <span className="truncate" style={{ color: "var(--text-primary)" }}>{it.label}</span>
            <span className="tabular-nums" style={{ color: "var(--text-secondary)" }}>{format(it.value)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "var(--divider)" }}>
            <div className="h-full rounded-full" style={{ width: `${(it.value / max) * 100}%`, background: color, transition: "width .6s cubic-bezier(.2,.8,.3,1)" }} />
          </div>
        </Row>
      ))}
    </div>
  )
}

export function Funnel({ steps, hrefFor, newTab }: { steps: Slice[]; hrefFor?: HrefFor; newTab?: boolean }) {
  const max = Math.max(1, steps[0]?.value ?? 1)
  return (
    <div className="space-y-1.5">
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].value : null
        return (
          <Row key={s.label} href={hrefFor?.(s.label)} newTab={newTab} className="flex items-center gap-3">
            <span className="w-[92px] shrink-0 text-[12px]" style={{ color: "var(--text-secondary)" }}>{s.label}</span>
            <div className="relative h-6 flex-1 overflow-hidden rounded-[5px]" style={{ background: "var(--divider)" }}>
              <div className="h-full rounded-[5px]" style={{
                width: `${Math.max(s.value > 0 ? 3 : 0, (s.value / max) * 100)}%`,
                background: CHART_COLORS[i % CHART_COLORS.length], opacity: 0.9, transition: "width .6s cubic-bezier(.2,.8,.3,1)",
              }} />
              <span className="absolute inset-y-0 left-2 flex items-center text-[12px] font-semibold tabular-nums" style={{ color: s.value / max > 0.12 ? "#fff" : "var(--text-primary)", mixBlendMode: "normal" }}>{s.value}</span>
            </div>
            <span className="w-10 shrink-0 text-right text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
              {prev != null && prev > 0 ? `${Math.round((s.value / prev) * 100)}%` : ""}
            </span>
          </Row>
        )
      })}
    </div>
  )
}

export function Spark({ values, color = "var(--brand-accent)", height = 28, width = 90 }: { values: number[]; color?: string; height?: number; width?: number }) {
  if (values.length < 2) return null
  const max = Math.max(1, ...values)
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * width},${height - 2 - (v / max) * (height - 4)}`)
  return (
    <svg width={width} height={height} className="shrink-0">
      <polygon points={`0,${height} ${pts.join(" ")} ${width},${height}`} style={{ fill: color, opacity: 0.12 }} />
      <polyline points={pts.join(" ")} fill="none" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" style={{ stroke: color }} />
    </svg>
  )
}
