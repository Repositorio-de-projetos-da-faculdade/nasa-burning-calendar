import { useQuery } from '@tanstack/react-query'
import { Circle, Crosshair, MousePointerClick, Pause, Pentagon, Play, Square } from 'lucide-react'
import * as maplibregl from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { type CSSProperties, useEffect, useRef, useState } from 'react'
import { TerraDraw, TerraDrawCircleMode, TerraDrawPolygonMode, TerraDrawRectangleMode } from 'terra-draw'
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter'
import { api } from '../lib/api'
import { fmt, MONTHS } from '../lib/format'
import { FIRE, fireQuantileExpression } from '../lib/scales'

maplibregl.setWorkerUrl(maplibreWorkerUrl)

const BASEMAP = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

type Tool = 'select' | 'rectangle' | 'polygon' | 'circle' | 'coords'
export interface Layer {
  year: number | null
  month: number | null
}

interface Props {
  selection: GeoJSON.Feature | null
  layer: Layer
  setLayer: (l: Layer) => void
  yearRange: [number, number]
  onRegion: (id: string) => void
  onDraw: (g: GeoJSON.Geometry) => void
  onPoint: (lat: number, lon: number, radiusKm: number) => void
}

const TOOLS: { id: Tool; label: string; icon: typeof Square; hint: string }[] = [
  { id: 'select', label: 'Município', icon: MousePointerClick, hint: 'Clique no mapa para analisar um município.' },
  { id: 'rectangle', label: 'Retângulo', icon: Square, hint: 'Clique em dois cantos para desenhar o retângulo.' },
  { id: 'polygon', label: 'Polígono', icon: Pentagon, hint: 'Clique para adicionar vértices; clique no primeiro ponto para fechar.' },
  { id: 'circle', label: 'Raio', icon: Circle, hint: 'Clique no centro e arraste/clique para definir o raio.' },
  { id: 'coords', label: 'Coordenadas', icon: Crosshair, hint: '' },
]

export function MapPanel({ selection, layer, setLayer, yearRange, onRegion, onDraw, onPoint }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const drawRef = useRef<TerraDraw | null>(null)
  const toolRef = useRef<Tool>('select')
  const cbs = useRef({ onRegion, onDraw })
  cbs.current = { onRegion, onDraw }
  const [tool, setTool] = useState<Tool>('select')
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [coords, setCoords] = useState({ lat: '-9.0', lon: '-55.0', r: '50' })

  const grid = useQuery({ queryKey: ['grid', layer.year, layer.month], queryFn: () => api.grid(layer.year, layer.month) })
  const outlines = useQuery({ queryKey: ['outlines'], queryFn: api.outlines, staleTime: Infinity })

  // ---- init ----
  useEffect(() => {
    const map = new maplibregl.Map({
      container: el.current!,
      style: BASEMAP,
      bounds: [[-74, -17], [-44, 5.5]],
      fitBoundsOptions: { padding: { top: 70, bottom: 190, left: 20, right: 20 } },
      attributionControl: { compact: true },
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    mapRef.current = map

    map.once('load', () => {
      const firstSymbol = map.getStyle().layers?.find((l) => l.type === 'symbol')?.id
      map.addSource('outlines', { type: 'geojson', data: EMPTY_FC })
      map.addSource('cells', { type: 'geojson', data: EMPTY_FC })
      map.addSource('selection', { type: 'geojson', data: EMPTY_FC })

      map.addLayer({
        id: 'cells-glow', type: 'circle', source: 'cells',
        paint: {
          'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 3, 3.5, 6, 26, 9, 200],
          'circle-color': FIRE[5],
          'circle-opacity': 0.16,
          'circle-blur': 1,
        },
      }, firstSymbol)
      map.addLayer({
        id: 'cells', type: 'circle', source: 'cells',
        paint: {
          'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 3, 1.0, 6, 8, 9, 64],
          'circle-color': FIRE[5],
          'circle-opacity': 0.9,
          'circle-blur': 0.5,
        },
        layout: { 'circle-sort-key': ['get', 'v'] },
      }, firstSymbol)
      map.addLayer({
        id: 'states', type: 'line', source: 'outlines', filter: ['==', ['get', 'kind'], 'state'],
        paint: { 'line-color': '#f6f1ea', 'line-opacity': 0.14, 'line-width': 0.8 },
      }, firstSymbol)
      map.addLayer({
        id: 'biome', type: 'line', source: 'outlines', filter: ['==', ['get', 'kind'], 'biome'],
        paint: { 'line-color': '#ffb24c', 'line-opacity': 0.55, 'line-width': 1.4 },
      }, firstSymbol)
      map.addLayer({ id: 'sel-fill', type: 'fill', source: 'selection', paint: { 'fill-color': '#ffb24c', 'fill-opacity': 0.04 } })
      map.addLayer({ id: 'sel-glow', type: 'line', source: 'selection', paint: { 'line-color': '#ff7a1f', 'line-width': 7, 'line-opacity': 0.35, 'line-blur': 6 } })
      map.addLayer({ id: 'sel-line', type: 'line', source: 'selection', paint: { 'line-color': '#fff3e4', 'line-width': 1.4, 'line-opacity': 0.95 } })

      const draw = new TerraDraw({
        adapter: new TerraDrawMapLibreGLAdapter({ map }),
        modes: [new TerraDrawRectangleMode(), new TerraDrawPolygonMode(), new TerraDrawCircleMode()],
      })
      draw.start()
      draw.setMode('static')
      draw.on('finish', (id) => {
        const f = draw.getSnapshot().find((x) => x.id === id)
        draw.clear()
        if (f) cbs.current.onDraw(f.geometry as GeoJSON.Geometry)
      })
      drawRef.current = draw
      setReady(true)
    })

    map.on('click', async (e) => {
      if (toolRef.current !== 'select') return
      try {
        const r = await api.regionAt(e.lngLat.lng, e.lngLat.lat)
        cbs.current.onRegion(r.id)
      } catch {
        /* fora do bioma */
      }
    })
    return () => {
      drawRef.current?.stop()
      map.remove()
    }
  }, [])

  // ---- dados ----
  useEffect(() => {
    if (!ready || !outlines.data) return
    ;(mapRef.current!.getSource('outlines') as maplibregl.GeoJSONSource).setData(outlines.data)
  }, [ready, outlines.data])

  useEffect(() => {
    if (!ready || !grid.data) return
    const map = mapRef.current!
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: grid.data.cells.map(([lon, lat, v]) => ({
        type: 'Feature', properties: { v }, geometry: { type: 'Point', coordinates: [lon, lat] },
      })),
    }
    ;(map.getSource('cells') as maplibregl.GeoJSONSource).setData(fc)
    // classes por decis: cada cor cobre a mesma quantidade de celulas, o mapa nao "apaga"
    const sorted = grid.data.cells.map((c) => c[2]).sort((a, b) => a - b)
    const breaks = FIRE.slice(1).map((_, i) => sorted[Math.floor(((i + 1) / FIRE.length) * (sorted.length - 1))] ?? 0)
    const color = fireQuantileExpression(breaks) as maplibregl.ExpressionSpecification
    map.setPaintProperty('cells', 'circle-color', color)
    map.setPaintProperty('cells-glow', 'circle-color', color)
  }, [ready, grid.data])

  useEffect(() => {
    if (!ready) return
    const map = mapRef.current!
    ;(map.getSource('selection') as maplibregl.GeoJSONSource).setData(selection ?? EMPTY_FC)
    if (selection) {
      const b = bboxOf(selection.geometry)
      if (b) map.fitBounds(b, { padding: { top: 80, bottom: 200, left: 40, right: 40 }, maxZoom: 9, duration: 700 })
    }
  }, [ready, selection])

  const pick = (t: Tool) => {
    setTool(t)
    toolRef.current = t
    const draw = drawRef.current
    if (!draw) return
    draw.setMode(t === 'rectangle' || t === 'polygon' || t === 'circle' ? t : 'static')
    mapRef.current!.getCanvas().style.cursor = t === 'select' ? 'pointer' : ''
  }

  const hint = TOOLS.find((t) => t.id === tool)?.hint
  const [y0, y1] = yearRange
  const shownYear = layer.year ?? y1

  // timelapse: avanca um ano por passo e volta ao inicio
  const step = useRef(() => {})
  step.current = () => setLayer({ year: shownYear >= y1 ? y0 : shownYear + 1, month: layer.month })
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => step.current(), 1100)
    return () => clearInterval(id)
  }, [playing])

  return (
    <div className="map-wrap">
      {(grid.isFetching || !ready) && <div className="loading-bar" />}
      <div ref={el} className="map-canvas" />

      <div className="float-card tools" role="toolbar" aria-label="Selecionar área">
        {TOOLS.map((t) => (
          <button key={t.id} className="tool" data-active={tool === t.id} onClick={() => pick(t.id)} title={t.label}>
            <t.icon size={15} />
            {t.label}
          </button>
        ))}
      </div>

      {tool === 'coords' ? (
        <form
          className="float-card coord-form"
          onSubmit={(e) => {
            e.preventDefault()
            onPoint(Number(coords.lat), Number(coords.lon), Number(coords.r))
          }}
        >
          <label>Latitude<input value={coords.lat} onChange={(e) => setCoords({ ...coords, lat: e.target.value })} inputMode="decimal" /></label>
          <label>Longitude<input value={coords.lon} onChange={(e) => setCoords({ ...coords, lon: e.target.value })} inputMode="decimal" /></label>
          <label>Raio (km)<input value={coords.r} onChange={(e) => setCoords({ ...coords, r: e.target.value })} inputMode="decimal" /></label>
          <button className="btn btn-primary" type="submit">Analisar</button>
        </form>
      ) : (
        hint && <div className="float-card hint">{hint}</div>
      )}

      <div className="float-card layer-card">
        <div className="layer-row">
          <div className="layer-now">
            <small>Focos no mapa</small>
            <b className="num">
              {layer.year ? `${layer.month ? MONTHS[layer.month - 1] + ' ' : ''}${layer.year}` : `Média ${y0 + 1}–${y1 - 1}`}
            </b>
          </div>
          <div className="seg">
            <button data-active={layer.year == null} onClick={() => { setPlaying(false); setLayer({ year: null, month: null }) }}>Média</button>
            <button data-active={layer.year != null && layer.month == null} onClick={() => setLayer({ year: shownYear, month: null })}>Ano</button>
          </div>
          <select
            className="select"
            value={layer.month ?? ''}
            onChange={(e) => setLayer({ year: shownYear, month: e.target.value ? Number(e.target.value) : null })}
            aria-label="Mês"
          >
            <option value="">Ano todo</option>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div className="layer-row">
          <button className="play" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pausar animação dos anos' : 'Animar os anos'} title={playing ? 'Pausar' : 'Animar os anos'}>
            {playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" style={{ marginLeft: 2 }} />}
          </button>
          <span className="layer-tick">{y0}</span>
          <input
            className="year-slider"
            type="range"
            min={y0}
            max={y1}
            value={shownYear}
            style={{ '--p': `${((shownYear - y0) / Math.max(1, y1 - y0)) * 100}%` } as CSSProperties}
            onChange={(e) => setLayer({ year: Number(e.target.value), month: layer.month })}
            aria-label="Ano da camada"
          />
          <span className="layer-tick">{y1}</span>
        </div>
        <div className="ramp">
          <span>menos</span>
          <div className="ramp-bar">{FIRE.map((c) => <i key={c} style={{ background: c }} />)}</div>
          <span>mais focos por célula de ~11 km{grid.data ? ` (máx. ${fmt(grid.data.max)})` : ''}</span>
        </div>
      </div>
    </div>
  )
}

function bboxOf(g: GeoJSON.Geometry): [[number, number], [number, number]] | null {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity
  const walk = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === 'number') {
      const [x, y] = c as number[]
      w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y)
    } else if (Array.isArray(c)) c.forEach(walk)
  }
  if ('coordinates' in g) walk(g.coordinates)
  return isFinite(w) ? [[w, s], [e, n]] : null
}
