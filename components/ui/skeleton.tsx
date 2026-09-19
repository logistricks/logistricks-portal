import { type HTMLAttributes } from "react"

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  h?: string | number
  w?: string | number
  circle?: boolean
}

export function Skeleton({ h, w, circle, className = "", style, ...props }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded bg-[#E2E8F0] dark:bg-[#1E3A5F] ${circle ? "rounded-full" : ""} ${className}`}
      style={{
        height: h !== undefined ? (typeof h === "number" ? `${h}px` : h) : undefined,
        width:  w !== undefined ? (typeof w === "number" ? `${w}px` : w) : undefined,
        ...style,
      }}
      {...props}
    />
  )
}

export function SkeletonRows({ count = 3, className = "" }: { count?: number; className?: string }) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} h={16} w={i % 3 === 2 ? "60%" : "100%"} />
      ))}
    </div>
  )
}

export function SkeletonTableRow({ cols = 5 }: { cols?: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton h={14} w={i === 0 ? "80%" : i === cols - 1 ? "40%" : "65%"} />
        </td>
      ))}
    </tr>
  )
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="rounded border border-[#E2E8F0] bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)] dark:border-[#1E3A5F] dark:bg-[#111E33]">
      <SkeletonRows count={lines} />
    </div>
  )
}
