import type * as maplibregl from 'maplibre-gl'
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import { type Cell, compose, fade, lonToX, makeCanvas, renderField } from '../lib/cellCanvas'

export interface Field {
  cells: Cell[]
  monthly: boolean
}

const FADE_MS = 180

/**
 * Mantém a textura do mapa de calor: funde um período no seguinte e, com um período fixado,
 * mostra-o à esquerda do divisor (`split`, fração da largura do mapa).
 * Devolve o canvas a registrar como fonte `cells`.
 */
export function useCellLayer(mapRef: RefObject<maplibregl.Map | null>, ready: boolean, current: Field | undefined, pinned: Field | undefined, split: number) {
  const [view] = useState(makeCanvas)
  const fields = useRef<{ a?: HTMLCanvasElement; b?: HTMLCanvasElement }>({})
  const splitRef = useRef(split)
  const cancel = useRef<() => void>(undefined)

  const show = useCallback((fadeIn: boolean) => {
    const map = mapRef.current
    const src = map?.getSource('cells') as maplibregl.CanvasSource | undefined
    const { a, b } = fields.current
    if (!map || !src || !a) return
    cancel.current?.()
    const splitX = b ? lonToX(map.unproject([splitRef.current * map.getContainer().clientWidth, 0]).lng) : 0
    if (!fadeIn || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      compose(view, a, b, splitX)
      // fonte estática: play + pause força o reenvio da textura
      src.play()
      src.pause()
      return
    }
    const from = compose(makeCanvas(), view)
    const to = compose(makeCanvas(), a, b, splitX)
    src.play()
    cancel.current = fade(view, from, to, FADE_MS, () => src.pause())
  }, [mapRef, view])

  useEffect(() => {
    if (!ready || !current) return
    fields.current.a = renderField(current.cells, current.monthly)
    show(true)
  }, [ready, current, show])

  useEffect(() => {
    if (!ready) return
    fields.current.b = pinned && renderField(pinned.cells, pinned.monthly)
    show(true)
  }, [ready, pinned, show])

  // o corte é uma longitude: mover o divisor ou o mapa muda onde ela cai na textura
  useEffect(() => {
    splitRef.current = split
    show(false)
  }, [split, show])

  const comparing = !!pinned
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !comparing || !map) return
    const onMove = () => show(false)
    map.on('move', onMove)
    return () => void map.off('move', onMove)
  }, [ready, comparing, mapRef, show])

  return view
}
