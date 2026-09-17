/**
 * Decorative animated freight vehicles + floating containers for the hero.
 * Hidden on mobile (<768px) for performance. Sits behind hero content.
 */
function CargoShip({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="420"
      viewBox="0 0 420 150"
      fill="currentColor"
      aria-hidden
    >
      {/* containers on deck */}
      <rect x="120" y="46" width="52" height="34" />
      <rect x="176" y="46" width="52" height="34" />
      <rect x="232" y="46" width="52" height="34" />
      <rect x="288" y="52" width="40" height="28" />
      {/* bridge */}
      <rect x="96" y="30" width="20" height="50" />
      {/* hull */}
      <path d="M40 84 H392 L360 126 H84 Q60 126 52 112 Z" />
    </svg>
  )
}

function Airplane({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="180"
      viewBox="0 0 200 200"
      fill="currentColor"
      aria-hidden
    >
      {/* fuselage */}
      <rect x="92" y="20" width="16" height="150" rx="8" />
      {/* main wings */}
      <path d="M100 70 L188 118 L188 132 L100 104 L12 132 L12 118 Z" />
      {/* tail wings */}
      <path d="M100 150 L138 172 L138 180 L100 168 L62 180 L62 172 Z" />
      {/* nose */}
      <path d="M92 24 Q100 4 108 24 Z" />
    </svg>
  )
}

function Truck({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="240"
      viewBox="0 0 260 110"
      fill="currentColor"
      aria-hidden
    >
      {/* trailer */}
      <rect x="4" y="20" width="170" height="60" />
      {/* cab */}
      <path d="M178 42 H214 L242 62 V80 H178 Z" />
      <rect x="184" y="46" width="24" height="16" />
      {/* wheels */}
      <circle cx="54" cy="86" r="14" />
      <circle cx="100" cy="86" r="14" />
      <circle cx="214" cy="86" r="14" />
    </svg>
  )
}

const crates = [
  { w: 74, h: 42, fill: '#F97316', left: '12%', top: '22%', dur: '6.5s' },
  { w: 56, h: 34, fill: '#0D1B2A', left: '78%', top: '18%', dur: '5s' },
  { w: 80, h: 45, fill: '#F97316', left: '68%', top: '58%', dur: '7.5s' },
  { w: 50, h: 30, fill: '#0D1B2A', left: '22%', top: '64%', dur: '4s' },
  { w: 64, h: 40, fill: '#0D1B2A', left: '46%', top: '12%', dur: '8s' },
]

export function HeroBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 hidden overflow-hidden md:block"
    >
      {/* Cargo ship — bottom 15%, right→left */}
      <div className="anim-ship absolute bottom-[15%] left-0 text-[#0D1B2A] opacity-[0.07]">
        <CargoShip />
      </div>

      {/* Airplane — diagonal bottom-left → upper-right */}
      <div className="anim-plane absolute left-0 top-0 text-[#F97316] opacity-[0.12]">
        <Airplane />
      </div>

      {/* Truck — bottom 4%, left→right */}
      <div className="anim-truck absolute bottom-[4%] left-0 text-[#1E3A5F] opacity-[0.14]">
        <Truck />
      </div>

      {/* Floating containers */}
      {crates.map((c, i) => (
        <div
          key={i}
          className="anim-float absolute rounded-[3px]"
          style={{
            width: c.w,
            height: c.h,
            left: c.left,
            top: c.top,
            backgroundColor: c.fill,
            opacity: 0.18,
            // stagger so they don't bob in unison
            ['--float-dur' as string]: c.dur,
            animationDelay: `${i * 0.6}s`,
          }}
        />
      ))}
    </div>
  )
}
