import { HEAT } from '../lib/scales'

/** Legenda do mapa: da brasa ao amarelo, mais focos por célula. */
export function MapKey() {
  return (
    <div className="map-key" aria-label="Legenda do mapa: cores mais claras indicam mais focos por célula de 11 km">
      <span>menos</span>
      <span className="map-key-ramp">{HEAT.map((c) => <i key={c} style={{ background: c }} />)}</span>
      <span>mais focos por célula de 11 km</span>
    </div>
  )
}
