import type { CSSProperties } from 'react'

// Brasas subindo do pé da tela. Posições determinísticas, animação só em CSS (transform + opacity).
const ember = (i: number) => ({
  left: `${(i * 37 + 11) % 100}%`,
  size: 3 + (i % 4),
  dur: 5 + (i % 6) * 1.1,
  delay: -((i * 1.7) % 11),
  dx: `${((i * 53) % 90) - 45}px`,
  rise: `${-(180 + ((i * 71) % 260))}px`,
})

export function Embers({ count = 24 }: { count?: number }) {
  return (
    <div className="embers" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => {
        const e = ember(i)
        return (
          <i
            key={i}
            style={{ left: e.left, width: e.size, height: e.size, animationDuration: `${e.dur}s`, animationDelay: `${e.delay}s`, '--dx': e.dx, '--rise': e.rise } as CSSProperties}
          />
        )
      })}
    </div>
  )
}
