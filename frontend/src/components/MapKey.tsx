import { HEAT } from '../lib/scales'

/** Map legend: from ember to yellow, more hotspots per cell. */
export function MapKey() {
  return (
    <div className="map-key" aria-label="Map legend: lighter colors mean more hotspots per 11 km cell">
      <span>fewer</span>
      <span className="map-key-ramp">{HEAT.map((c) => <i key={c} style={{ background: c }} />)}</span>
      <span>more hotspots per 11 km cell</span>
    </div>
  )
}
