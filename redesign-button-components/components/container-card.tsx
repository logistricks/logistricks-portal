import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type BoltColor = 'dark' | 'orange' | 'white' | 'navy'

const boltClass: Record<BoltColor, string> = {
  dark: 'bg-[#0D1B2A]',
  navy: 'bg-[#0D1B2A]',
  orange: 'bg-[#F97316]',
  white: 'bg-white',
}

/**
 * A content box styled to look like a shipping container:
 * sharp 6px corners, four corner "bolts", optional ridge lines,
 * and a soft lifted shadow.
 *
 * `className` styles the outer box (background, border, aspect ratio, padding).
 * `contentClassName` styles the inner flex column that holds the children.
 */
export function ContainerCard({
  children,
  className,
  contentClassName,
  bolts = 'dark',
  ridges = true,
  serial,
  sealBadge,
}: {
  children: ReactNode
  className?: string
  contentClassName?: string
  bolts?: BoltColor
  ridges?: boolean
  serial?: string
  sealBadge?: string
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[6px]',
        'shadow-[0_8px_32px_rgba(13,27,42,0.12)]',
        className,
      )}
    >
      {ridges && (
        <div
          aria-hidden
          className="container-ridges absolute inset-0 z-0 rounded-[6px]"
        />
      )}

      {/* ISO Container Stencil / Serial */}
      {serial && (
        <div
          aria-hidden
          className="pointer-events-none absolute right-3 top-2.5 z-20 select-none font-stencil text-[9px] font-bold uppercase tracking-widest opacity-40"
        >
          {serial}
        </div>
      )}

      {/* Seal Badge if provided */}
      {sealBadge && (
        <div className="absolute right-3 top-3 z-20 flex items-center gap-1 rounded border border-current/20 px-1.5 py-0.5 font-stencil text-[10px] font-bold uppercase tracking-wider">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          {sealBadge}
        </div>
      )}

      {/* Corner lock bolts */}
      <span
        aria-hidden
        className={cn(
          'absolute left-2 top-2 z-20 h-1.5 w-1.5 rounded-full shadow-xs',
          boltClass[bolts],
        )}
      />
      <span
        aria-hidden
        className={cn(
          'absolute right-2 top-2 z-20 h-1.5 w-1.5 rounded-full shadow-xs',
          boltClass[bolts],
        )}
      />
      <span
        aria-hidden
        className={cn(
          'absolute bottom-2 left-2 z-20 h-1.5 w-1.5 rounded-full shadow-xs',
          boltClass[bolts],
        )}
      />
      <span
        aria-hidden
        className={cn(
          'absolute bottom-2 right-2 z-20 h-1.5 w-1.5 rounded-full shadow-xs',
          boltClass[bolts],
        )}
      />

      <div
        className={cn(
          'relative z-10 flex h-full w-full flex-col',
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  )
}
