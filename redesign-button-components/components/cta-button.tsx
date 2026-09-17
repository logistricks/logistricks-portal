'use client'

import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useDemoModal } from '@/components/demo-modal'

export type CtaVariant =
  | 'primary'
  | 'emerald'
  | 'navy'
  | 'outline-navy'
  | 'outline-orange'
  | 'white'

export type CtaSize = 'sm' | 'md' | 'lg' | 'xl'

const sizeClass: Record<CtaSize, string> = {
  sm: 'min-h-[36px] px-3.5 text-xs gap-1.5',
  md: 'min-h-[44px] px-5 text-sm gap-2',
  lg: 'min-h-[52px] px-7 text-base gap-2',
  xl: 'min-h-[60px] px-9 text-lg gap-2.5',
}

type VariantSpec = {
  surface: string
  rivets: 'crate-rivets-light' | 'crate-rivets-dark'
  edge: string // color of the physical bottom "crate" edge
  shadow: string // ambient drop shadow color
}

const variants: Record<CtaVariant, VariantSpec> = {
  primary: {
    surface: 'bg-[#EA580C] text-white border-[#C2410C] hover:bg-[#F97316]',
    rivets: 'crate-rivets-light',
    edge: '#9A3412',
    shadow: 'rgba(154, 52, 18, 0.35)',
  },
  emerald: {
    surface: 'bg-[#059669] text-white border-[#047857] hover:bg-[#0EA271]',
    rivets: 'crate-rivets-light',
    edge: '#065F46',
    shadow: 'rgba(6, 95, 70, 0.35)',
  },
  navy: {
    surface: 'bg-[#0D1B2A] text-white border-[#1E293B] hover:bg-[#16273A]',
    rivets: 'crate-rivets-light',
    edge: '#060F19',
    shadow: 'rgba(13, 27, 42, 0.4)',
  },
  'outline-navy': {
    surface: 'bg-white text-[#0D1B2A] border-slate-300 hover:bg-slate-50',
    rivets: 'crate-rivets-dark',
    edge: '#CBD5E1',
    shadow: 'rgba(13, 27, 42, 0.16)',
  },
  'outline-orange': {
    surface: 'bg-white text-[#EA580C] border-orange-300 hover:bg-orange-50',
    rivets: 'crate-rivets-dark',
    edge: '#FDBA74',
    shadow: 'rgba(234, 88, 12, 0.18)',
  },
  white: {
    surface: 'bg-white text-[#EA580C] border-slate-200 hover:bg-slate-50',
    rivets: 'crate-rivets-dark',
    edge: '#E2E8F0',
    shadow: 'rgba(13, 27, 42, 0.16)',
  },
}

/**
 * Enterprise B2B action button with a subtle shipping-crate character:
 * a solid physical bottom edge that compresses on press, faint corner
 * rivets, a top-light highlight, and a soft ambient drop shadow.
 */
export function CtaButton({
  children,
  href,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
  onClick,
}: {
  children: ReactNode
  href?: string
  variant?: CtaVariant
  size?: CtaSize
  fullWidth?: boolean
  className?: string
  onClick?: () => void
}) {
  const { open } = useDemoModal()
  const spec = variants[variant]

  const classes = cn(
    'group/cta relative inline-flex items-center justify-center overflow-hidden rounded-md border font-semibold text-center select-none',
    'transition-[transform,box-shadow,background-color] duration-150 ease-out',
    // physical crate edge + ambient shadow, compresses downward on press
    'shadow-[0_3px_0_var(--crate-edge),0_7px_12px_-3px_var(--crate-shadow)]',
    'hover:-translate-y-px hover:shadow-[0_4px_0_var(--crate-edge),0_11px_18px_-4px_var(--crate-shadow)]',
    'active:translate-y-[2px] active:shadow-[0_1px_0_var(--crate-edge),0_2px_5px_-1px_var(--crate-shadow)]',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#EA580C]',
    // top-light highlight across the upper half, like a lit crate panel
    'before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-1/2 before:bg-gradient-to-b before:from-white/15 before:to-transparent',
    sizeClass[size],
    spec.surface,
    spec.rivets,
    fullWidth && 'w-full',
    className,
  )

  const style = {
    '--crate-edge': spec.edge,
    '--crate-shadow': spec.shadow,
  } as CSSProperties

  const content = (
    <span className="relative z-10 inline-flex items-center justify-center gap-[inherit]">
      {children}
    </span>
  )

  if (href) {
    const isExternal = href.startsWith('http') || href.startsWith('//')
    return (
      <a
        href={href}
        onClick={onClick}
        target={isExternal ? '_blank' : undefined}
        rel={isExternal ? 'noopener noreferrer' : undefined}
        className={classes}
        style={style}
      >
        {content}
      </a>
    )
  }

  return (
    <button
      type="button"
      onClick={() => {
        onClick?.()
        open()
      }}
      className={classes}
      style={style}
    >
      {content}
    </button>
  )
}
