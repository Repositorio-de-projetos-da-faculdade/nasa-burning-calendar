import { Circle, Crosshair, MousePointerClick, Pentagon, Square, Undo2 } from 'lucide-react'
import { useState } from 'react'
import type { Region } from '../lib/api'

export type Tool = 'select' | 'rectangle' | 'polygon' | 'circle' | 'coords'

const TOOLS: { id: Tool; label: string; icon: typeof Square; hint: string }[] = [
  { id: 'select', label: 'Município', icon: MousePointerClick, hint: 'Clique no mapa para analisar um município.' },
  { id: 'rectangle', label: 'Retângulo', icon: Square, hint: 'Clique em dois cantos para desenhar o retângulo.' },
  { id: 'polygon', label: 'Polígono', icon: Pentagon, hint: 'Clique para adicionar vértices; clique no primeiro ponto para fechar.' },
  { id: 'circle', label: 'Raio', icon: Circle, hint: 'Clique no centro e arraste/clique para definir o raio.' },
  { id: 'coords', label: 'Coordenadas', icon: Crosshair, hint: '' },
]

interface Props {
  tool: Tool
  onPick: (t: Tool) => void
  onPoint: (lat: number, lon: number, radiusKm: number) => void
  /** Município sob o cursor, com a ferramenta de município ativa. */
  hovered: Region | null
  onReset?: () => void
}

/** Como escolher a área: barra de ferramentas, dica da ferramenta ativa e o formulário de coordenadas. */
export function MapTools({ tool, onPick, onPoint, hovered, onReset }: Props) {
  const [coords, setCoords] = useState({ lat: '-9.0', lon: '-55.0', r: '50' })
  const hint = hovered ? `${hovered.name}${hovered.uf ? ` · ${hovered.uf}` : ''} — clique para analisar` : TOOLS.find((t) => t.id === tool)?.hint
  return (
    <>
      <div className="widget tools" role="toolbar" aria-label="Selecionar área">
        {TOOLS.map((t) => (
          <button key={t.id} className="tool" data-active={tool === t.id} onClick={() => onPick(t.id)} title={t.label}>
            <t.icon size={15} />
            {t.label}
          </button>
        ))}
        {onReset && (
          <button className="tool tool-reset" onClick={onReset}>
            <Undo2 size={15} />
            Visão geral
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
          <label>Raio (km)<input value={coords.r} onChange={(e) => setCoords({ ...coords, r: e.target.value })} inputMode="decimal" /></label>
          <button className="btn btn-primary" type="submit">Analisar</button>
        </form>
      ) : (
        // a dica da ferramenta some sozinha depois de lida; o nome do município sob o cursor fica
        hint && <p className="widget hint" key={hint} data-fades={!hovered}>{hint}</p>
      )}
    </>
  )
}
