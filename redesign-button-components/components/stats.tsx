'use client'

import { useEffect, useRef, useState } from 'react'
import { animate, useInView } from 'framer-motion'
import { ContainerCard } from '@/components/container-card'
import { FadeUp } from '@/components/fade-up'

const stats = [
  { target: 30, suffix: ' min', label: 'Average quote time' },
  { target: 94, suffix: '%', label: 'AI accuracy by week 2' },
  { target: 3, suffix: ' days', label: 'Time to go live' },
  { target: 10, suffix: 'x', label: 'More quotes per day' },
]

function Counter({ target, suffix }: { target: number; suffix: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (!inView) return
    const controls = animate(0, target, {
      duration: 1.4,
      ease: 'easeOut',
      onUpdate: (latest) => setValue(Math.round(latest)),
    })
    return () => controls.stop()
  }, [inView, target])

  return (
    <span ref={ref} className="text-4xl font-black text-[#0D1B2A]">
      {value}
      {suffix}
    </span>
  )
}

export function Stats() {
  return (
    <section className="bg-[#F97316] py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          {stats.map((s, i) => (
            <FadeUp key={s.label} delay={i * 0.1} className="h-full">
              <ContainerCard
                bolts="orange"
                className="min-h-[9rem] bg-white p-6 text-center"
                contentClassName="items-center justify-center"
              >
                <Counter target={s.target} suffix={s.suffix} />
                <span className="mt-2 text-sm text-gray-500">{s.label}</span>
              </ContainerCard>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  )
}
