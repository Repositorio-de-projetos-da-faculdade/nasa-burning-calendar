interface Props {
  split: number
  setSplit: (s: number) => void
  left: string
  right: string
}

const clamp = (s: number) => Math.min(0.95, Math.max(0.05, s))

/** Divisor arrastável da comparação: período fixado à esquerda, período da linha do tempo à direita. */
export function MapCompare({ split, setSplit, left, right }: Props) {
  return (
    <div
      className="compare"
      style={{ left: `${split * 100}%` }}
      role="slider"
      tabIndex={0}
      aria-label={`Divisor da comparação entre ${left} e ${right}`}
      aria-valuemin={5}
      aria-valuemax={95}
      aria-valuenow={Math.round(split * 100)}
      onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
      onPointerMove={(e) => {
        if (e.buttons !== 1) return
        const box = e.currentTarget.parentElement!.getBoundingClientRect()
        setSplit(clamp((e.clientX - box.left) / box.width))
      }}
      onKeyDown={(e) => {
        const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
        if (dir) setSplit(clamp(split + dir * 0.02))
      }}
    >
      <span className="compare-tag compare-l">{left}</span>
      <i className="compare-grip" />
      <span className="compare-tag compare-r">{right}</span>
    </div>
  )
}
