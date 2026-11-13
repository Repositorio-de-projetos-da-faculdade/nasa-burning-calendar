import type { Layer } from '../components/MapPanel'

export type Area =
  | { kind: 'region'; id: string }
  | { kind: 'drawn'; geometry: GeoJSON.Geometry }
  | { kind: 'point'; lat: number; lon: number; r: number }

/**
 * Estado no link: ?area=<id> ou ?p=lat,lon,raio, e ?y=<ano|media>&m=<mês>. A aba vai no #.
 * Áreas desenhadas não entram (a geometria não cabe num link).
 */
export function readShare(): { area?: Area; layer?: Layer } {
  const q = new URLSearchParams(location.search)
  const p = q.get('p')?.split(',').map(Number)
  const id = q.get('area')
  const area: Area | undefined =
    p?.length === 3 && p.every(Number.isFinite) ? { kind: 'point', lat: p[0], lon: p[1], r: p[2] } : id ? { kind: 'region', id } : undefined
  const y = q.get('y')
  const m = Number(q.get('m'))
  const layer: Layer | undefined =
    y === 'media' ? { year: null, month: null }
    : y && Number.isInteger(Number(y)) ? { year: Number(y), month: Number.isInteger(m) && m >= 1 && m <= 12 ? m : null }
    : undefined
  return { area, layer }
}

export function writeShare(area: Area, layer: Layer) {
  const q = new URLSearchParams()
  if (area.kind === 'region') q.set('area', area.id)
  if (area.kind === 'point') q.set('p', `${area.lat},${area.lon},${area.r}`)
  q.set('y', layer.year == null ? 'media' : String(layer.year))
  if (layer.year != null && layer.month != null) q.set('m', String(layer.month))
  history.replaceState(null, '', `${location.pathname}?${q}${location.hash}`)
}
