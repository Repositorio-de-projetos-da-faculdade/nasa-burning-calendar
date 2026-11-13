import { Pause, Play } from 'lucide-react'
import { type KeyboardEvent, type PointerEvent, useMemo } from 'react'
import type { CalendarData } from '../lib/api'
import { MONTHS_LONG } from '../lib/format'
import { FIRE, fireScale } from '../lib/scales'
import type { Layer } from './MapPanel'

interface Props {
  d: CalendarData
  layer: Layer
  setLayer: (l: Layer) => void
  playing: boolean
  setPlaying: (p: boolean) => void
}

/**
 * Os anos de satélite como uma faixa só: uma barra por mês, altura e cor pelos focos da área.
 * Arrastar sobre ela escolhe o período mostrado no mapa.
 */
export function Timeline({ d, layer, setLayer, playing, setPlaying }: Props) {
  const y0 = d.years[0]
  const nYears = d.years.length

  const bars = useMemo(() => {
    const byKey = new Map(d.series.map((c) => [(c.year - y0) * 12 + c.month - 1, c.harmonized]))
    const vals = [...byKey.values()].filter((v) => v > 0).sort((a, b) => a - b)
    const top = vals.length ? vals[Math.floor(vals.length * 0.98)] : 1
    const scale = fireScale(top)
    return Array.from({ length: nYears * 12 }, (_, i) => {
      const v = byKey.get(i)
      return v == null ? null : { h: Math.max(4, Math.min(100, Math.sqrt(v / top) * 100)), color: scale.color(v) }
    })
  }, [d, y0, nYears])

  const byYear = layer.year != null && layer.month == null
  const lit = (i: number) =>
    layer.year != null && Math.floor(i / 12) === layer.year - y0 && (layer.month == null || i % 12 === layer.month - 1)

  const pick = (i: number) => {
    const year = y0 + Math.floor(i / 12)
    setLayer({ year, month: byYear ? null : (i % 12) + 1 })
  }

  const fromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const t = Math.min(0.9999, Math.max(0, (e.clientX - box.left) / box.width))
    pick(Math.floor(t * bars.length))
  }

  const onKey = (e: KeyboardEvent) => {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!dir) return
    e.preventDefault()
    const cur = layer.year == null ? 0 : (layer.year - y0) * 12 + (layer.month ?? 1) - 1
    pick(Math.min(bars.length - 1, Math.max(0, cur + dir * (byYear ? 12 : 1))))
  }

  const now = layer.year == null ? 'média de todos os anos' : `${layer.month ? MONTHS_LONG[layer.month - 1] + ' de ' : ''}${layer.year}`

  return (
    <div className="timeline">
      <div className="tl-controls">
        <button className="play" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pausar a passagem do tempo' : 'Passar o tempo'}>
          {playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" style={{ marginLeft: 2 }} />}
        </button>
        <div className="seg" role="group" aria-label="Período no mapa">
          <button data-active={layer.month != null} onClick={() => setLayer({ year: layer.year ?? y0 + nYears - 2, month: layer.month ?? 9 })}>Mês</button>
          <button data-active={byYear} onClick={() => setLayer({ year: layer.year ?? y0 + nYears - 2, month: null })}>Ano</button>
          <button data-active={layer.year == null} onClick={() => setLayer({ year: null, month: null })}>Média</button>
        </div>
        <div className="ramp">
          <span>menos</span>
          <div className="ramp-bar">{FIRE.map((c) => <i key={c} style={{ background: c }} />)}</div>
          <span>mais focos</span>
        </div>
      </div>

      <div
        className="tl-strip"
        role="slider"
        tabIndex={0}
        aria-label="Período mostrado no mapa"
        aria-valuemin={y0}
        aria-valuemax={y0 + nYears - 1}
        aria-valuenow={layer.year ?? y0}
        aria-valuetext={now}
        data-scrubbed={layer.year != null}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          fromPointer(e)
        }}
        onPointerMove={(e) => e.buttons === 1 && fromPointer(e)}
        onKeyDown={onKey}
      >
        {bars.map((b, i) => (
          <i key={i} data-lit={lit(i)} style={b ? { height: `${b.h}%`, background: b.color } : { height: 0 }} />
        ))}
        {layer.year != null && (
          <b
            className="tl-head"
            style={{
              left: `${(((layer.year - y0) * 12 + (layer.month ?? 1) - 1) / bars.length) * 100}%`,
              width: `${((layer.month ? 1 : 12) / bars.length) * 100}%`,
            }}
          />
        )}
      </div>

      <div className="tl-years" aria-hidden="true">
        {d.years.map((y) => (
          <span key={y} data-lit={layer.year === y}>{y}</span>
        ))}
      </div>
    </div>
  )
}
