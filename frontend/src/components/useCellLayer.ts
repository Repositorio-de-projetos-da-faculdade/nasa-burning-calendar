import type * as maplibregl from 'maplibre-gl'
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import { type Cells, compose, fade, lonToX, makeCanvas, renderField } from '../lib/cellCanvas'

export interface Field {
  cells: Cells
  monthly: boolean
}

const FADE_MS = 180
/** Changes closer together than this are a scrub (or the fast timelapse): no cross-fade, each frame is already the period. */
const SCRUB_MS = 300

/**
 * Maintains the heat map texture: cross-fades one period into the next and, with a pinned period,
 * shows it left of the divider (`split`, fraction of the map width).
 * Returns the canvas to register as the `cells` source.
 */
export function useCellLayer(mapRef: RefObject<maplibregl.Map | null>, ready: boolean, current: Field | undefined, pinned: Field | undefined, split: number) {
  const [view] = useState(makeCanvas)
  const fields = useRef<{ a?: HTMLCanvasElement; b?: HTMLCanvasElement }>({})
  const splitRef = useRef(split)
  const cancel = useRef<() => void>(undefined)
  const lastShown = useRef(0)

  const show = useCallback((fadeIn: boolean) => {
    const map = mapRef.current
    const src = map?.getSource('cells') as maplibregl.CanvasSource | undefined
    const { a, b } = fields.current
    if (!map || !src || !a) return
    cancel.current?.()
    const splitX = b ? lonToX(map.unproject([splitRef.current * map.getContainer().clientWidth, 0]).lng) : 0
    const scrubbing = performance.now() - lastShown.current < SCRUB_MS
    if (fadeIn) lastShown.current = performance.now()
    if (!fadeIn || scrubbing || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      compose(view, a, b, splitX)
      // static source: play + pause forces the texture to be re-uploaded
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

  // the cut is a longitude: moving the divider or the map changes where it falls on the texture
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
