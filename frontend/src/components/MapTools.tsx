import { Circle, Crosshair, MousePointerClick, Pentagon, Square, Undo2 } from 'lucide-react'
import { useState } from 'react'
import type { Region } from '../lib/api'

export type Tool = 'select' | 'rectangle' | 'polygon' | 'circle' | 'coords'

const TOOLS: { id: Tool; label: string; icon: typeof Square; hint: string }[] = [
  { id: 'select', label: 'Municipality', icon: MousePointerClick, hint: 'Click the map to analyze a municipality.' },
  { id: 'rectangle', label: 'Rectangle', icon: Square, hint: 'Click two corners to draw the rectangle.' },
  { id: 'polygon', label: 'Polygon', icon: Pentagon, hint: 'Click to add vertices; click the first point to close.' },
  { id: 'circle', label: 'Radius', icon: Circle, hint: 'Click the center, then drag/click to set the radius.' },
  { id: 'coords', label: 'Coordinates', icon: Crosshair, hint: '' },
]

interface Props {
  tool: Tool
  onPick: (t: Tool) => void
  onPoint: (lat: number, lon: number, radiusKm: number) => void
  /** Municipality under the cursor, while the municipality tool is active. */
  hovered: Region | null
  onReset?: () => void
}

/** How to choose the area: toolbar, hint for the active tool and the coordinates form. */
export function MapTools({ tool, onPick, onPoint, hovered, onReset }: Props) {
  const [coords, setCoords] = useState({ lat: '-9.0', lon: '-55.0', r: '50' })
  const hint = hovered ? `${hovered.name}${hovered.state ? ` · ${hovered.state}` : ''} — click to analyze` : TOOLS.find((t) => t.id === tool)?.hint
  return (
    <>
      <div className="widget tools" role="toolbar" aria-label="Select area">
        {TOOLS.map((t) => (
          <button key={t.id} className="tool" data-active={tool === t.id} onClick={() => onPick(t.id)} title={t.label}>
            <t.icon size={15} />
            {t.label}
          </button>
        ))}
        {onReset && (
          <button className="tool tool-reset" onClick={onReset}>
            <Undo2 size={15} />
            Overview
          </button>
        )}
      </div>

      {tool === 'coords' ? (
        <form
          className="widget coord-form"
          onSubmit={(e) => {
            e.preventDefault()
            onPoint(Number(coords.lat), Number(coords.lon), Number(coords.r))
          }}
        >
          <label>Latitude<input value={coords.lat} onChange={(e) => setCoords({ ...coords, lat: e.target.value })} inputMode="decimal" /></label>
          <label>Longitude<input value={coords.lon} onChange={(e) => setCoords({ ...coords, lon: e.target.value })} inputMode="decimal" /></label>
          <label>Radius (km)<input value={coords.r} onChange={(e) => setCoords({ ...coords, r: e.target.value })} inputMode="decimal" /></label>
          <button className="btn btn-primary" type="submit">Analyze</button>
        </form>
      ) : (
        // the tool hint fades on its own once read; the name of the municipality under the cursor stays
        hint && <p className="widget hint" key={hint} data-fades={!hovered}>{hint}</p>
      )}
    </>
  )
}
