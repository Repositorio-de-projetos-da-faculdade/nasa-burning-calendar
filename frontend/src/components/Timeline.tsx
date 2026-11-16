import { useQuery } from '@tanstack/react-query'
import { Box, Columns2, Pause, Play } from 'lucide-react'
import { type KeyboardEvent, memo, type PointerEvent, useMemo, useState } from 'react'
import { type CalendarData, gridQuery } from '../lib/api'
import { usePreloadGrids } from '../lib/usePreloadGrids'
import { fmt, MONTHS, MONTHS_LONG } from '../lib/format'
import { heat } from '../lib/scales'
import { periodLabel } from '../lib/period'
import { Hud } from './Hud'
import { MapKey } from './MapKey'
import type { Layer } from './MapPanel'

interface Props {
  d: CalendarData
  layer: Layer
  setLayer: (l: Layer) => void
  playing: boolean
  setPlaying: (p: boolean) => void
  /** Period pinned for comparison on the map (or none). */
  pinned: Layer | null
  onPin: () => void
  relief: boolean
  onRelief: () => void
}

/** The bars depend only on the data: memoized, so scrubbing does not rebuild them. */
const Bars = memo(function Bars({ bars }: { bars: number[] }) {
  return bars.map((h, i) => <i key={i} style={{ height: `${h}%`, background: heat(h / 100) }} />)
})

/**
 * The satellite years as a single strip: one bar per month, height by the area's hotspots.
 * Dragging across it picks the period shown on the map.
 */
export function Timeline({ d, layer, setLayer, playing, setPlaying, pinned, onPin, relief, onRelief }: Props) {
  const y0 = d.years[0]
  const nYears = d.years.length

  const [hover, setHover] = useState<number | null>(null)
  // the period's map is still on its way (same query as the map, via the cache)
  const loading = useQuery(gridQuery(layer)).isFetching
  const preloaded = usePreloadGrids(d, layer.year)
  // the timeline is unlocked only once the whole history is in memory: from then on nothing waits for the network
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
  // highlight band: the month (1 bar) or the whole year (12 bars)
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

  const now = layer.year == null ? 'mean of all years' : `${layer.month ? MONTHS_LONG[layer.month - 1] + ' ' : ''}${layer.year}`
  const lastFull = y0 + nYears - 2

  return (
    <div className="widget timeline" aria-busy={loading}>
      {locked ? <i className="tl-progress" style={{ width: `${preloaded * 100}%` }} /> : loading && <div className="loading-bar" />}
      <div className="tl-controls">
        <button className="play" disabled={locked} onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause the timelapse' : 'Play the timelapse'}>
          {playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" style={{ marginLeft: 2 }} />}
        </button>
        <Hud d={d} layer={layer} />
        {/* the month under the cursor, before clicking; while the history downloads, how much is left */}
        <p className="tl-read num" aria-hidden="true">
          {locked && <>Loading history <b>{Math.round(preloaded * 100)}%</b></>}
          {!locked && hover != null && byKey.has(hover) && (
            <>{MONTHS[hover % 12]} {y0 + Math.floor(hover / 12)} <b>{fmt(byKey.get(hover)!)}</b> hotspots</>
          )}
        </p>
        <div className="seg" role="group" aria-label="Period on the map" inert={locked}>
          <button data-active={layer.month != null} onClick={() => setLayer({ year: layer.year ?? lastFull, month: layer.month ?? 9 })}>Month</button>
          <button data-active={byYear} onClick={() => setLayer({ year: layer.year ?? lastFull, month: null })}>Year</button>
          <button data-active={layer.year == null} onClick={() => setLayer({ year: null, month: null })}>Mean</button>
        </div>
        <div className="seg" role="group" aria-label="Map view">
          <button data-active={!!pinned} onClick={onPin} title="Pins the current period on one side of the map; the timeline changes the other">
            <Columns2 size={14} />{pinned ? `Comparing with ${periodLabel(pinned)}` : 'Compare'}
          </button>
          <button data-active={relief} onClick={onRelief} title="Shows the hotspots as raised columns">
            <Box size={14} />Relief
          </button>
        </div>
      </div>

      <div
        className="tl-strip"
        inert={locked}
        role="slider"
        tabIndex={0}
        aria-label="Period shown on the map"
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
          if (i === hover) return // same month: nothing to redo
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

      {/* what explains the map lives with what controls it: legend and credits */}
      <div className="tl-foot">
        <MapKey />
        <p>
          © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> · © <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>
        </p>
      </div>
    </div>
  )
}
