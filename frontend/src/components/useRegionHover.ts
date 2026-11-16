import { useQueryClient } from '@tanstack/react-query'
import type * as maplibregl from 'maplibre-gl'
import { type RefObject, useEffect, useState } from 'react'
import { api, type Region } from '../lib/api'
import { INK } from '../lib/scales'

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }
/** Espera o cursor assentar antes de perguntar qual município está sob ele. */
const SETTLE_MS = 60

/**
 * Com a ferramenta de município ativa, contorna no mapa o município sob o cursor antes do clique.
 * Devolve o município em destaque (para mostrar o nome).
 */
export function useRegionHover(mapRef: RefObject<maplibregl.Map | null>, ready: boolean, active: boolean) {
  const qc = useQueryClient()
  const [region, setRegion] = useState<Region | null>(null)

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !active || !map || !matchMedia('(hover: hover) and (pointer: fine)').matches) return
    if (!map.getSource('hover')) {
      map.addSource('hover', { type: 'geojson', data: EMPTY })
      map.addLayer({ id: 'hover-fill', type: 'fill', source: 'hover', paint: { 'fill-color': INK.hi, 'fill-opacity': 0.08 } })
      map.addLayer({ id: 'hover-line', type: 'line', source: 'hover', paint: { 'line-color': INK.hi, 'line-opacity': 0.7, 'line-width': 1 } })
    }
    const src = map.getSource('hover') as maplibregl.GeoJSONSource
    let seq = 0
    let timer = 0
    const clear = () => {
      seq++
      clearTimeout(timer)
      src.setData(EMPTY)
      setRegion(null)
    }
    const onMove = (e: maplibregl.MapMouseEvent) => {
      clearTimeout(timer)
      const { lng, lat } = e.lngLat
      timer = window.setTimeout(async () => {
        const mine = ++seq
        try {
          const r = await api.regionAt(lng, lat)
          // mesma chave da seleção: ao clicar, o contorno já está em memória
          const f = await qc.fetchQuery({ queryKey: ['region', r.id], queryFn: () => api.region(r.id), staleTime: Infinity })
          if (mine !== seq) return
          src.setData(f)
          setRegion(r)
        } catch {
          if (mine === seq) clear() // fora do bioma
        }
      }, SETTLE_MS)
    }
    map.on('mousemove', onMove)
    map.on('mouseout', clear)
    return () => {
      map.off('mousemove', onMove)
      map.off('mouseout', clear)
      clear()
    }
  }, [mapRef, ready, active, qc])

  return region
}
