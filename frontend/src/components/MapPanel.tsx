import { keepPreviousData, useQuery } from '@tanstack/react-query'
import * as maplibregl from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useEffect, useMemo, useRef, useState } from 'react'
import { TerraDraw, TerraDrawCircleMode, TerraDrawPolygonMode, TerraDrawRectangleMode } from 'terra-draw'
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter'
import { api, gridQuery } from '../lib/api'
import { CELL_COORDS, cellColumns, cellKey } from '../lib/cellCanvas'
import { periodLabel } from '../lib/period'
import { INK } from '../lib/scales'
import { CellCard, type CellHover } from './CellCard'
import { MapCompare } from './MapCompare'
import { MapTools, type Tool } from './MapTools'
import { useCellLayer } from './useCellLayer'
import { useRegionHover } from './useRegionHover'

maplibregl.setWorkerUrl(maplibreWorkerUrl)

const BASEMAP = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

/** Space reserved for what sits on top of the map (panel on the right, timeline at the bottom). */
const framing = () =>
  innerWidth > 900
    ? { top: 130, bottom: 190, left: 48, right: (document.getElementById('dossier')?.offsetWidth ?? 520) + 48 }
    : { top: 110, bottom: 280, left: 16, right: 16 }

export interface Layer {
  year: number | null
  month: number | null
}

interface Props {
  selection: GeoJSON.Feature | null
  layer: Layer
  /** Period pinned for comparison: shown left of the divider. */
  pinned: Layer | null
  /** Relief mode: cells as columns, tilted camera. */
  relief: boolean
  onRegion: (id: string) => void
  onDraw: (g: GeoJSON.Geometry) => void
  onPoint: (lat: number, lon: number, radiusKm: number) => void
  /** Goes back to the whole Amazon; absent when it already is the area. */
  onReset?: () => void
}

export function MapPanel({ selection, layer, pinned, relief, onRegion, onDraw, onPoint, onReset }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const drawRef = useRef<TerraDraw | null>(null)
  const [tool, setTool] = useState<Tool>('select')
  const [ready, setReady] = useState(false)
  const [split, setSplit] = useState(0.33)
  const [hover, setHover] = useState<CellHover | null>(null)

  const grid = useQuery({ ...gridQuery(layer), placeholderData: keepPreviousData })
  const pinnedGrid = useQuery({ ...gridQuery(pinned ?? layer), enabled: !!pinned })
  const outlines = useQuery({ queryKey: ['outlines'], queryFn: api.outlines, staleTime: Infinity })

  const monthly = layer.month != null
  const current = useMemo(() => grid.data && { cells: grid.data.cells, monthly }, [grid.data, monthly])
  const pinnedMonthly = pinned?.month != null
  const fixed = useMemo(
    () => (pinned && !relief && pinnedGrid.data ? { cells: pinnedGrid.data.cells, monthly: pinnedMonthly } : undefined),
    [pinned, relief, pinnedGrid.data, pinnedMonthly],
  )
  const cellCanvas = useCellLayer(mapRef, ready, current, fixed, split)
  const hovered = useRegionHover(mapRef, ready, tool === 'select')

  /** Where each cell starts in the sequence, for the card under the cursor. */
  const byCell = useMemo(() => {
    const cells = grid.data?.cells ?? new Float32Array()
    const at = new Map<string, number>()
    for (let i = 0; i < cells.length; i += 3) at.set(cellKey(cells[i], cells[i + 1]), i)
    return { cells, at }
  }, [grid.data])

  // what the map listeners (registered once) must always see up to date
  const live = useRef({ tool, byCell, relief, onRegion, onDraw })
  useEffect(() => {
    live.current = { tool, byCell, relief, onRegion, onDraw }
  })

  // ---- init ----
  useEffect(() => {
    const map = new maplibregl.Map({
      container: el.current!,
      style: BASEMAP,
      bounds: [[-74, -17], [-44, 5.5]],
      fitBoundsOptions: { padding: framing() },
      attributionControl: false, // the credits live in the timeline footer
      // north always up: the comparison divider cuts along a longitude
      dragRotate: false,
      pitchWithRotate: false,
    })
    map.touchZoomRotate.disableRotation()
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left')
    mapRef.current = map

    map.once('load', () => {
      const symbols = map.getStyle().layers?.filter((l) => l.type === 'symbol') ?? []
      const firstSymbol = symbols[0]?.id
      // keep only country and state names from the basemap; cities and rivers compete with the data
      for (const l of symbols) if (!/country|state/.test(l.id)) map.setLayoutProperty(l.id, 'visibility', 'none')
      map.addSource('outlines', { type: 'geojson', data: EMPTY_FC })
      map.addSource('cells', { type: 'canvas', canvas: cellCanvas, coordinates: CELL_COORDS, animate: false })
      map.addSource('columns', { type: 'geojson', data: EMPTY_FC, maxzoom: 6, tolerance: 0 })
      map.addSource('selection', { type: 'geojson', data: EMPTY_FC })

      map.addLayer({ id: 'cells', type: 'raster', source: 'cells', paint: { 'raster-fade-duration': 0 } }, firstSymbol)
      map.addLayer({
        id: 'columns', type: 'fill-extrusion', source: 'columns', layout: { visibility: 'none' },
        paint: { 'fill-extrusion-color': ['get', 'c'], 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-opacity': 0.92 },
      }, firstSymbol)
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
        if (f) live.current.onDraw(f.geometry as GeoJSON.Geometry)
      })
      drawRef.current = draw
      setReady(true)
    })

    map.on('click', async (e) => {
      if (live.current.tool !== 'select') return
      try {
        const r = await api.regionAt(e.lngLat.lng, e.lngLat.lat)
        live.current.onRegion(r.id)
      } catch {
        /* outside the biome */
      }
    })

    // cell card: mouse only, not in relief (the column shifts the point under the cursor)
    if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
      map.on('mousemove', (e) => {
        const { cells, at } = live.current.byCell
        const i = live.current.relief ? undefined : at.get(cellKey(e.lngLat.lng, e.lngLat.lat))
        // rounded lon/lat: the cell is the same from one period to the next, and so is the card's key
        setHover(i == null ? null : { x: e.originalEvent.clientX, y: e.originalEvent.clientY, lon: +cells[i].toFixed(2), lat: +cells[i + 1].toFixed(2), v: cells[i + 2] })
      })
      map.on('mouseout', () => setHover(null))
      map.on('movestart', () => setHover(null))
    }
    return () => {
      drawRef.current?.stop()
      map.remove()
    }
  }, [cellCanvas])

  // ---- data ----
  useEffect(() => {
    if (!ready || !outlines.data) return
    ;(mapRef.current!.getSource('outlines') as maplibregl.GeoJSONSource).setData(outlines.data)
  }, [ready, outlines.data])

  // until the requested period arrives, the previous map stays dimmed (the loading bar is on the timeline)
  const stale = grid.isPlaceholderData
  useEffect(() => {
    if (ready) mapRef.current!.setPaintProperty('cells', 'raster-opacity', stale ? 0.45 : 1)
  }, [ready, stale])

  // relief: swaps the flat texture for the columns and tilts the camera
  useEffect(() => {
    if (!ready) return
    const map = mapRef.current!
    map.setLayoutProperty('cells', 'visibility', relief ? 'none' : 'visible')
    map.setLayoutProperty('columns', 'visibility', relief ? 'visible' : 'none')
    map.easeTo({ pitch: relief ? 55 : 0, duration: 700 })
  }, [ready, relief])

  useEffect(() => {
    if (!ready || !relief || !current) return
    ;(mapRef.current!.getSource('columns') as maplibregl.GeoJSONSource).setData(cellColumns(current.cells, current.monthly))
  }, [ready, relief, current])

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
    const draw = drawRef.current
    if (!draw) return
    draw.setMode(t === 'rectangle' || t === 'polygon' || t === 'circle' ? t : 'static')
    mapRef.current!.getCanvas().style.cursor = t === 'select' ? 'pointer' : ''
  }

  return (
    <div className="map-wrap">
      {!ready && <div className="loading-bar" />}
      <div ref={el} className="map-canvas" />
      <MapTools tool={tool} onPick={pick} onPoint={onPoint} hovered={hovered} onReset={onReset} />
      {fixed && pinned && <MapCompare split={split} setSplit={setSplit} left={periodLabel(pinned)} right={periodLabel(layer)} />}
      {hover && <CellCard hover={hover} period={periodLabel(layer)} />}
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
