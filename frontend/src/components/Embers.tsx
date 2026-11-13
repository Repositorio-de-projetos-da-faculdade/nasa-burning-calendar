import type { CSSProperties } from 'react'

// Posições fixas (determinísticas): brasas subindo atrás do título, só CSS.
const EMBERS = Array.from({ length: 16 }, (_, i) => ({
  left: `${(i * 37 + 11) % 100}%`,
  size: 2 + (i % 3),
  dur: 5 + (i % 5) * 1.3,
  delay: -((i * 1.7) % 9),
  dx: `${((i * 53) % 60) - 30}px`,
}))

export function Embers() {
  return (
    <div className="embers" aria-hidden="true">
      {EMBERS.map((e, i) => (
        <i
          key={i}
          style={{ left: e.left, width: e.size, height: e.size, animationDuration: `${e.dur}s`, animationDelay: `${e.delay}s`, '--dx': e.dx } as CSSProperties}
        />
      ))}
    </div>
  )
}
