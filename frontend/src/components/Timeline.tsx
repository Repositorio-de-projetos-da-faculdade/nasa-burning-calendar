import { useQuery } from '@tanstack/react-query'
import { Box, Columns2, Pause, Play } from 'lucide-react'
import { type KeyboardEvent, memo, type PointerEvent, useMemo, useState } from 'react'
import { type CalendarData, gridQuery } from '../lib/api'
import { usePreloadGrids } from '../lib/usePreloadGrids'
import { fmt, MONTHS, MONTHS_LONG } from '../lib/format'
import { heat } from '../lib/scales'
import { periodLabel } from '../lib/period'
import type { Layer } from './MapPanel'

interface Props {
  d: CalendarData
  layer: Layer
  setLayer: (l: Layer) => void
  playing: boolean
  setPlaying: (p: boolean) => void
  /** Período fixado para comparar no mapa (ou nenhum). */
  pinned: Layer | null
  onPin: () => void
  relief: boolean
  onRelief: () => void
}

/** As barras só dependem dos dados: memoizadas, arrastar não as recria. */
const Bars = memo(function Bars({ bars }: { bars: number[] }) {
  return bars.map((h, i) => <i key={i} style={{ height: `${h}%`, background: heat(h / 100) }} />)
})

/**
 * Os anos de satélite como uma faixa só: uma barra por mês, altura pelos focos da área.
 * Arrastar sobre ela escolhe o período mostrado no mapa.
 */
export function Timeline({ d, layer, setLayer, playing, setPlaying, pinned, onPin, relief, onRelief }: Props) {
  const y0 = d.years[0]
  const nYears = d.years.length

  const [hover, setHover] = useState<number | null>(null)
  // o mapa do período ainda está a caminho (mesma consulta do mapa, pelo cache)
  const loading = useQuery(gridQuery(layer)).isFetching
  const preloaded = usePreloadGrids(d, layer.year)
  // a linha do tempo só é liberada com o histórico inteiro em memória: daí em diante nada espera a rede
  const locked = preloaded < 1

  const { bars, byKey } = useMemo(() => {
    const byKey = new Map(d.series.map((c) => [(c.year - y0) * 12 + c.month - 1, c.harmonized]))
    const vals = [...byKey.values()].filter((v) => v > 0).sort((a, b) => a - b)
    const top = vals.length ? vals[Math.floor(vals.length * 0.98)] : 1
    const bars = Array.from({ length: nYears * 12 }, (_, i) => {
      const v = byKey.get(i)
      return v == null ? 0 : Math.max(4, Math.min(100, Math.sqrt(v / top) * 100))
    })
    return { bars, byKey }
  }, [d, y0, nYears])

  const byYear = layer.year != null && layer.month == null
  // faixa de destaque: o mês (1 barra) ou o ano inteiro (12 barras)
  const litStart = layer.year == null ? null : (layer.year - y0) * 12 + (layer.month ?? 1) - 1
  const litSpan = layer.month == null ? 12 : 1

  const pick = (i: number) => {
    const year = y0 + Math.floor(i / 12)
    setLayer({ year, month: byYear ? null : (i % 12) + 1 })
  }

  const indexAt = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const t = Math.min(0.9999, Math.max(0, (e.clientX - box.left) / box.width))
    return Math.floor(t * bars.length)
  }

  const onKey = (e: KeyboardEvent) => {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!dir) return
    e.preventDefault()
    const cur = layer.year == null ? 0 : (layer.year - y0) * 12 + (layer.month ?? 1) - 1
    pick(Math.min(bars.length - 1, Math.max(0, cur + dir * (byYear ? 12 : 1))))
  }

  const now = layer.year == null ? 'média de todos os anos' : `${layer.month ? MONTHS_LONG[layer.month - 1] + ' de ' : ''}${layer.year}`
  const lastFull = y0 + nYears - 2

  return (
    <div className="widget timeline" aria-busy={loading}>
      {locked ? <i className="tl-progress" style={{ width: `${preloaded * 100}%` }} /> : loading && <div className="loading-bar" />}
      <div className="tl-controls">
        <button className="play" disabled={locked} onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pausar a passagem do tempo' : 'Passar o tempo'}>
          {playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" style={{ marginLeft: 2 }} />}
        </button>
        <div className="seg" role="group" aria-label="Período no mapa" inert={locked}>
          <button data-active={layer.month != null} onClick={() => setLayer({ year: layer.year ?? lastFull, month: layer.month ?? 9 })}>Mês</button>
          <button data-active={byYear} onClick={() => setLayer({ year: layer.year ?? lastFull, month: null })}>Ano</button>
          <button data-active={layer.year == null} onClick={() => setLayer({ year: null, month: null })}>Média</button>
        </div>
        <div className="seg" role="group" aria-label="Visualização do mapa">
          <button data-active={!!pinned} onClick={onPin} title="Fixa o período atual de um lado do mapa; a linha do tempo muda o outro">
            <Columns2 size={14} />{pinned ? `Comparando com ${periodLabel(pinned)}` : 'Comparar'}
          </button>
          <button data-active={relief} onClick={onRelief} title="Mostra os focos como colunas em relevo">
            <Box size={14} />Relevo
          </button>
        </div>
        {/* o mês sob o cursor, antes de clicar; enquanto o histórico baixa, o quanto falta */}
        <p className="tl-read num" aria-hidden="true">
          {locked && <>Carregando histórico <b>{Math.round(preloaded * 100)}%</b></>}
          {!locked && hover != null && byKey.has(hover) && (
            <>{MONTHS[hover % 12]} {y0 + Math.floor(hover / 12)} <b>{fmt(byKey.get(hover)!)}</b> focos</>
          )}
        </p>
      </div>

      <div
        className="tl-strip"
        inert={locked}
        role="slider"
        tabIndex={0}
        aria-label="Período mostrado no mapa"
        aria-valuemin={y0}
        aria-valuemax={y0 + nYears - 1}
        aria-valuenow={layer.year ?? y0}
        aria-valuetext={now}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          pick(indexAt(e))
        }}
        onPointerMove={(e) => {
          const i = indexAt(e)
          if (i === hover) return // mesmo mês: nada a refazer
          setHover(i)
          if (e.buttons === 1) pick(i)
        }}
        onPointerLeave={() => setHover(null)}
        onKeyDown={onKey}
      >
        <Bars bars={bars} />
        {litStart != null && (
          <b className="tl-lit" style={{ left: `${(litStart / bars.length) * 100}%`, width: `${(litSpan / bars.length) * 100}%` }} />
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
