'use client'

import type { ReactNode } from 'react'
import { motion } from 'framer-motion'

/**
 * Fades content up as it enters the viewport. Pass `delay` to stagger
 * siblings in increments (e.g. 0, 0.1, 0.2).
 */
export function FadeUp({
  children,
  delay = 0,
  className,
  as = 'div',
}: {
  children: ReactNode
  delay?: number
  className?: string
  as?: 'div' | 'section' | 'li' | 'span'
}) {
  const MotionTag = motion[as]
  return (
    <MotionTag
      className={className}
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, delay, ease: 'easeOut' }}
    >
      {children}
    </MotionTag>
  )
}
