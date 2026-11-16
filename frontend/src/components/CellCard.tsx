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

const RADIUS_KM = 6 // circle with roughly the area of the 11 km cell

/** Card for the cell under the cursor: hotspots in the period and, after a pause, the years at that spot. */
export function CellCard({ hover, period }: { hover: CellHover; period: string }) {
  // only fetch the history once the cursor rests: moving across the map does not fire one query per cell
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
            <div className="tip-title">{period}<span>11 km cell</span></div>
            <div className="tip-big num">{fmt(hover.v)} hotspots</div>
            <div className="spark" aria-hidden="true">
              {annual.map((a) => <i key={a.year} style={{ height: `${Math.max(4, (a.total / max) * 100)}%`, background: heat(a.total / max) }} />)}
            </div>
            <div className="tip-row">
              {annual.length ? <><span>{annual[0].year}</span><span>hotspots per year at this spot</span><span>{annual[annual.length - 1].year}</span></> : <span>loading the years…</span>}
            </div>
          </>
        ),
      }}
    />
  )
}
