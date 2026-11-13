import { HEAT } from '../lib/scales'

/** Legenda do mapa: quadrados maiores e mais claros indicam mais focos por célula. */
export function MapKey() {
  return (
    <div className="map-key" aria-label="Legenda do mapa: quadrados maiores e mais claros indicam mais focos por célula de 11 km">
      <span>menos</span>
      {HEAT.map((c, i) => <i key={c} style={{ width: 2 + i * 2, height: 2 + i * 2, background: c }} />)}
      <span>mais focos por célula de 11 km</span>
    </div>
  )
}
