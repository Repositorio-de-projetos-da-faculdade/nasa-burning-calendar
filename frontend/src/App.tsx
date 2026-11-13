import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Dossier } from './components/Dossier'
import type { CalMode } from './components/FireCalendar'
import { type Layer, MapPanel } from './components/MapPanel'
import { Timeline } from './components/Timeline'
import { TopBar } from './components/TopBar'
import { api, type AreaQuery, gridQuery } from './lib/api'
import { type Area, readShare, writeShare } from './lib/share'

function toQuery(a: Area): AreaQuery {
  if (a.kind === 'region') return { region: a.id }
  if (a.kind === 'drawn') return { geometry: a.geometry }
  return { lat: a.lat, lon: a.lon, radius_km: a.r }
}

function circle(lat: number, lon: number, rKm: number): GeoJSON.Geometry {
  const pts: number[][] = []
  for (let i = 0; i <= 64; i++) {
    const t = (i / 64) * 2 * Math.PI
    pts.push([lon + (rKm / (111.32 * Math.cos((lat * Math.PI) / 180))) * Math.cos(t), lat + (rKm / 111.32) * Math.sin(t)])
  }
  return { type: 'Polygon', coordinates: [pts] }
}

const STEP_MS = 900

export default function App() {
  const [shared] = useState(readShare)
  const [area, setArea] = useState<Area>(shared.area ?? { kind: 'region', id: 'amazonia' })
  const [mode, setMode] = useState<CalMode>('count')
  const [layer, setLayerRaw] = useState<Layer>(shared.layer ?? { year: null, month: null })
  const [playing, setPlaying] = useState(false)
  const [pinned, setPinned] = useState<Layer | null>(null)
  const [relief, setRelief] = useState(false)
  const [panelOpen, setPanelOpen] = useState(true)
  const qc = useQueryClient()

  const query = useMemo(() => toQuery(area), [area])
  const regions = useQuery({ queryKey: ['regions'], queryFn: api.regions, staleTime: Infinity })
  const cal = useQuery({ queryKey: ['calendar', query], queryFn: () => api.calendar(query), placeholderData: keepPreviousData })
  const validation = useQuery({ queryKey: ['validation'], queryFn: api.validation, staleTime: Infinity })
  const regionFeature = useQuery({
    queryKey: ['region', area.kind === 'region' ? area.id : null],
    queryFn: () => api.region((area as { id: string }).id),
    enabled: area.kind === 'region',
    staleTime: Infinity,
  })

  const selection: GeoJSON.Feature | null = useMemo(() => {
    if (area.kind === 'region') return regionFeature.data ?? null
    const geometry = area.kind === 'drawn' ? area.geometry : circle(area.lat, area.lon, area.r)
    return { type: 'Feature', properties: {}, geometry }
  }, [area, regionFeature.data])

  const onRegion = useCallback((id: string) => setArea({ kind: 'region', id }), [])
  const onReset = useCallback(() => setArea({ kind: 'region', id: 'amazonia' }), [])
  const onDraw = useCallback((geometry: GeoJSON.Geometry) => setArea({ kind: 'drawn', geometry }), [])
  const onPoint = useCallback((lat: number, lon: number, r: number) => setArea({ kind: 'point', lat, lon, r }), [])

  /** Qualquer escolha manual do período pausa o timelapse. */
  const setLayer = useCallback((l: Layer) => {
    setPlaying(false)
    setLayerRaw(l)
  }, [])

  const d = cal.data

  // primeiro quadro: o período do link; senão o mês recorde
  const started = useRef(false)
  useEffect(() => {
    if (!d || started.current) return
    started.current = true
    if (!shared.layer) setLayerRaw({ year: d.summary.record_month.year, month: d.summary.record_month.month })
  }, [d, shared.layer])

  // o link acompanha a área e o período (parado: durante o timelapse não reescreve a cada passo)
  useEffect(() => {
    if (playing) return
    const id = setTimeout(() => writeShare(area, layer), 300)
    return () => clearTimeout(id)
  }, [area, layer, playing])

  // o ano inteiro do período (e os anos vizinhos, no modo anual) já em cache: arrastar não espera a rede
  useEffect(() => {
    const { year, month } = layer
    if (year == null) return
    const near: Layer[] = month == null
      ? [{ year: year - 1, month }, { year: year + 1, month }]
      : Array.from({ length: 12 }, (_, i) => ({ year, month: i + 1 }))
    for (const n of near) void qc.prefetchQuery(gridQuery(n))
  }, [layer.year, layer.month == null, qc]) // eslint-disable-line react-hooks/exhaustive-deps -- só ao trocar de ano ou de modo

  // timelapse: um mês (ou um ano) por passo, em laço
  const step = useRef(() => {})
  step.current = () => {
    if (!d) return
    const y0 = d.years[0]
    const [yEnd, mEnd] = d.data_until.split('-').map(Number)
    const next = (l: Layer): Layer => {
      if (l.year == null) return { year: y0, month: 1 }
      if (l.month == null) return { year: l.year >= yEnd ? y0 : l.year + 1, month: null }
      const wrap = l.year > yEnd || (l.year === yEnd && l.month >= mEnd)
      return wrap ? { year: y0, month: 1 } : l.month === 12 ? { year: l.year + 1, month: 1 } : { year: l.year, month: l.month + 1 }
    }
    setLayerRaw(next(layer))
  }
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => step.current(), STEP_MS)
    return () => clearInterval(id)
  }, [playing])

  return (
    <div className="app" data-panel={panelOpen ? 'open' : 'closed'}>
      <div className="stage">
        <MapPanel selection={selection} layer={layer} pinned={pinned} relief={relief} onRegion={onRegion} onDraw={onDraw} onPoint={onPoint} onReset={area.kind === 'region' && area.id === 'amazonia' ? undefined : onReset} />
        <TopBar regions={regions.data ?? []} value={area.kind === 'region' ? area.id : ''} onRegion={onRegion} />
        {d && (
          <div className="dock">
            <Timeline
              d={d}
              layer={layer}
              setLayer={setLayer}
              playing={playing}
              setPlaying={setPlaying}
              pinned={pinned}
              onPin={() => {
                setRelief(false)
                setPinned(pinned ? null : layer)
              }}
              relief={relief}
              onRelief={() => {
                setPinned(null)
                setRelief(!relief)
              }}
            />
          </div>
        )}
      </div>

      <Dossier
        cal={cal}
        validation={validation.data}
        query={query}
        mode={mode}
        setMode={setMode}
        layer={layer}
        setLayer={setLayer}
        open={panelOpen}
        setOpen={setPanelOpen}
      />
    </div>
  )
}
