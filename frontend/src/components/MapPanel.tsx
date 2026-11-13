import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Circle, Crosshair, MousePointerClick, Pentagon, Square } from 'lucide-react'
import * as maplibregl from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useEffect, useRef, useState } from 'react'
import { TerraDraw, TerraDrawCircleMode, TerraDrawPolygonMode, TerraDrawRectangleMode } from 'terra-draw'
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter'
import { api } from '../lib/api'
import { INK, LEVELS, SERIES } from '../lib/scales'

maplibregl.setWorkerUrl(maplibreWorkerUrl)

const BASEMAP = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }
const CELL = 0.1 // lado da celula da grade, em graus
/** Escala fixa (focos por celula no mes): assim o mapa apaga na chuva e acende na seca. */
const MONTH_BREAKS = [2, 4, 8, 15, 30, 60, 120, 240, 480]

/** Espaco reservado ao que fica por cima do mapa (painel a direita, linha do tempo embaixo). */
const framing = () =>
  innerWidth > 900
    ? { top: 110, bottom: 250, left: 150, right: 560 }
    : { top: 110, bottom: 250, left: 16, right: 16 }

type Tool = 'select' | 'rectangle' | 'polygon' | 'circle' | 'coords'
export interface Layer {
  year: number | null
  month: number | null
}

interface Props {
  selection: GeoJSON.Feature | null
  layer: Layer
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

export function MapPanel({ selection, layer, onRegion, onDraw, onPoint }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const drawRef = useRef<TerraDraw | null>(null)
  const toolRef = useRef<Tool>('select')
  const cbs = useRef({ onRegion, onDraw })
  cbs.current = { onRegion, onDraw }
  const [tool, setTool] = useState<Tool>('select')
  const [ready, setReady] = useState(false)
  const monthly = useRef(false)
  monthly.current = layer.month != null
  const [coords, setCoords] = useState({ lat: '-9.0', lon: '-55.0', r: '50' })

  const grid = useQuery({ queryKey: ['grid', layer.year, layer.month], queryFn: () => api.grid(layer.year, layer.month), placeholderData: keepPreviousData })
  const outlines = useQuery({ queryKey: ['outlines'], queryFn: api.outlines, staleTime: Infinity })

  // ---- init ----
  useEffect(() => {
    const map = new maplibregl.Map({
      container: el.current!,
      style: BASEMAP,
      bounds: [[-74, -17], [-44, 5.5]],
      fitBoundsOptions: { padding: framing() },
      attributionControl: { compact: true },
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left')
    mapRef.current = map

    map.once('load', () => {
      const firstSymbol = map.getStyle().layers?.find((l) => l.type === 'symbol')?.id
      map.addSource('outlines', { type: 'geojson', data: EMPTY_FC })
      map.addSource('cells', { type: 'geojson', data: EMPTY_FC })
      map.addSource('selection', { type: 'geojson', data: EMPTY_FC })

      map.addLayer({ id: 'cells', type: 'fill', source: 'cells', paint: { 'fill-color': SERIES.accent, 'fill-antialias': false } }, firstSymbol)
      map.addLayer({
        id: 'states', type: 'line', source: 'outlines', filter: ['==', ['get', 'kind'], 'state'],
        paint: { 'line-color': INK.hi, 'line-opacity': 0.12, 'line-width': 0.8 },
      }, firstSymbol)
      map.addLayer({
        id: 'biome', type: 'line', source: 'outlines', filter: ['==', ['get', 'kind'], 'biome'],
        paint: { 'line-color': INK.hi, 'line-opacity': 0.45, 'line-width': 1 },
      }, firstSymbol)
      map.addLayer({ id: 'sel-line', type: 'line', source: 'selection', paint: { 'line-color': INK.hi, 'line-width': 1.5 } })

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
    // ano e media: classes por decis (cada nivel cobre a mesma quantidade de celulas); mes: escala fixa
    const sorted = grid.data.cells.map((c) => c[2]).sort((a, b) => a - b)
    const deciles = Array.from({ length: LEVELS - 1 }, (_, i) => sorted[Math.floor(((i + 1) / LEVELS) * (sorted.length - 1))] ?? 0)
    const breaks = monthly.current ? MONTH_BREAKS : deciles
    // meio-tom: cada celula vira um quadrado cujo lado cresce com o nivel
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: grid.data.cells.map(([lon, lat, v]) => {
        const level = breaks.filter((b) => v >= b).length // 0..LEVELS-1
        const h = (CELL / 2) * (0.3 + (0.7 * level) / (LEVELS - 1))
        return {
          type: 'Feature', properties: {},
          geometry: { type: 'Polygon', coordinates: [[[lon - h, lat - h], [lon + h, lat - h], [lon + h, lat + h], [lon - h, lat + h], [lon - h, lat - h]]] },
        }
      }),
    }
    ;(map.getSource('cells') as maplibregl.GeoJSONSource).setData(fc)
  }, [ready, grid.data])

  useEffect(() => {
    if (!ready) return
    const map = mapRef.current!
    ;(map.getSource('selection') as maplibregl.GeoJSONSource).setData(selection ?? EMPTY_FC)
    if (selection) {
      const b = bboxOf(selection.geometry)
      if (b) map.fitBounds(b, { padding: framing(), maxZoom: 9, duration: 900 })
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

  return (
    <div className="map-wrap">
      {!ready && <div className="loading-bar" />}
      <div ref={el} className="map-canvas" />

      <div className="tools" role="toolbar" aria-label="Selecionar área">
        {TOOLS.map((t) => (
          <button key={t.id} className="tool" data-active={tool === t.id} onClick={() => pick(t.id)} title={t.label}>
            <t.icon size={15} />
            {t.label}
          </button>
        ))}
      </div>

      {tool === 'coords' ? (
        <form
          className="coord-form"
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
        hint && <p className="hint">{hint}</p>
      )}

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
