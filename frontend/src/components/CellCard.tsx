import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { fmt } from '../lib/format'
import { heat } from '../lib/scales'
import { Tooltip } from './Tooltip'

export interface CellHover {
  x: number
  y: number
  lon: number
  lat: number
  v: number
}

const RADIUS_KM = 6 // círculo de área próxima à da célula de 11 km

/** Cartão da célula sob o cursor: focos no período e, depois de uma pausa, os anos daquele ponto. */
export function CellCard({ hover, period }: { hover: CellHover; period: string }) {
  // só busca a história quando o cursor para: passar por cima do mapa não dispara uma consulta por célula
  const [settled, setSettled] = useState<string | null>(null)
  const key = `${hover.lon},${hover.lat}`
  useEffect(() => {
    const id = setTimeout(() => setSettled(key), 250)
    return () => clearTimeout(id)
  }, [key])
  const hist = useQuery({
    queryKey: ['cell', key],
    queryFn: () => api.calendar({ lat: hover.lat, lon: hover.lon, radius_km: RADIUS_KM }),
    enabled: settled === key,
    staleTime: Infinity,
  })
  const annual = hist.data?.annual ?? []
  const max = Math.max(1, ...annual.map((a) => a.total))
  return (
    <Tooltip
      tip={{
        x: hover.x,
        y: hover.y,
        content: (
          <>
            <div className="tip-title">{period}<span>célula de 11 km</span></div>
            <div className="tip-big num">{fmt(hover.v)} focos</div>
            <div className="spark" aria-hidden="true">
              {annual.map((a) => <i key={a.year} style={{ height: `${Math.max(4, (a.total / max) * 100)}%`, background: heat(a.total / max) }} />)}
            </div>
            <div className="tip-row">
              {annual.length ? <><span>{annual[0].year}</span><span>focos por ano neste ponto</span><span>{annual[annual.length - 1].year}</span></> : <span>carregando os anos…</span>}
            </div>
          </>
        ),
      }}
    />
  )
}
