import { HEAT, heat, LEVELS } from './scales'

/**
 * The heat map drawn on a canvas, which MapLibre uses as a texture.
 * Changing the period becomes a redraw of a few milliseconds instead of reprocessing
 * thousands of polygons: that is what keeps timeline scrubbing smooth.
 */

/** Cells in sequence: lon, lat, hotspots, lon, lat, hotspots… */
export type Cells = Float32Array

const CELL = 0.1 // grid cell side, in degrees
const PX = 2 // canvas pixels per cell; the texture is upscaled with interpolation, which gives the continuous field
// ponytail: fixed rectangle around the biome; cells outside it are not drawn. If the study area grows, derive it from the data.
const W = -75, E = -43, S = -19, N = 6
/** Fixed scale (hotspots per cell in the month): so the map dims in the rainy season and lights up in the dry season. */
const MONTH_BREAKS = [2, 4, 8, 15, 30, 60, 120, 240, 480]

/** Latitude -> Mercator y: the texture is stretched linearly in Mercator between the corners. */
const merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))
const WIDTH = Math.round(((E - W) / CELL) * PX)
const HEIGHT = Math.round((WIDTH * (merc(N) - merc(S))) / (((E - W) * Math.PI) / 180))

/** Texture corners on the map: NW, NE, SE, SW. */
export const CELL_COORDS: [[number, number], [number, number], [number, number], [number, number]] = [[W, N], [E, N], [E, S], [W, S]]

/** Longitude -> texture column (where to cut in the side-by-side comparison). */
export const lonToX = (lon: number) => Math.min(WIDTH, Math.max(0, Math.round(((lon - W) / (E - W)) * WIDTH)))
const latToY = (lat: number) => Math.round(((merc(N) - merc(lat)) / (merc(N) - merc(S))) * HEIGHT)

export function makeCanvas() {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  return canvas
}

/** Hotspots -> level 0..LEVELS-1. Month: fixed scale; year and mean: deciles (each level covers the same number of cells). */
function levels(cells: Cells, monthly: boolean) {
  let breaks = MONTH_BREAKS
  if (!monthly) {
    const sorted = cells.filter((_, i) => i % 3 === 2).sort()
    breaks = Array.from({ length: LEVELS - 1 }, (_, i) => sorted[Math.floor(((i + 1) / LEVELS) * (sorted.length - 1))] ?? 0)
  }
  return (v: number) => {
    let level = 0
    while (level < breaks.length && v >= breaks[level]) level++
    return level
  }
}

/** Intensity (0..255) -> 32-bit RGBA pixel: the interpolated heat ramp, with opacity growing with intensity. */
const PALETTE = (() => {
  const rgb = HEAT.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)))
  const bytes = new Uint8ClampedArray(256 * 4)
  for (let a = 0; a < 256; a++) {
    const pos = (a / 255) * (rgb.length - 1)
    const i = Math.min(rgb.length - 2, Math.floor(pos))
    for (let c = 0; c < 3; c++) bytes[a * 4 + c] = rgb[i][c] + (rgb[i + 1][c] - rgb[i][c]) * (pos - i)
    bytes[a * 4 + 3] = a < 6 ? 0 : 96 + a * 0.62
  }
  return new Uint32Array(bytes.buffer)
})()

// work buffers reused across periods
const intensity = new Uint8Array(WIDTH * HEIGHT)
const blurred = new Uint8Array(WIDTH * HEIGHT)

/**
 * A period as a continuous heat field: intensity per cell, smoothed with its neighbours, then colored by the ramp.
 * Everything in arrays (no filters, no reading back from the canvas): it costs a few milliseconds, which allows redrawing at every month while scrubbing.
 */
export function renderField(cells: Cells, monthly: boolean) {
  const level = levels(cells, monthly)
  intensity.fill(0)
  for (let i = 0; i < cells.length; i += 3) {
    const x0 = lonToX(cells[i] - CELL / 2), y0 = latToY(cells[i + 1] + CELL / 2)
    if (x0 < 1 || y0 < 1 || x0 + PX >= WIDTH || y0 + PX >= HEIGHT) continue
    const a = ((level(cells[i + 2]) + 1) / LEVELS) * 255
    for (let dy = 0; dy < PX; dy++) intensity.fill(a, (y0 + dy) * WIDTH + x0, (y0 + dy) * WIDTH + x0 + PX)
  }
  // [1 2 1] smoothing horizontally, then vertically
  for (let i = 1; i < intensity.length - 1; i++) blurred[i] = (intensity[i - 1] + 2 * intensity[i] + intensity[i + 1]) >> 2
  const img = new ImageData(WIDTH, HEIGHT)
  const px = new Uint32Array(img.data.buffer)
  for (let i = WIDTH; i < px.length - WIDTH; i++) px[i] = PALETTE[(blurred[i - WIDTH] + 2 * blurred[i] + blurred[i + WIDTH]) >> 2]
  const out = makeCanvas()
  out.getContext('2d')!.putImageData(img, 0, 0)
  return out
}

/** Paints `a` onto the target; with `b`, the part left of `splitX` comes from `b` (side-by-side comparison). */
export function compose(target: HTMLCanvasElement, a: HTMLCanvasElement, b?: HTMLCanvasElement, splitX = 0) {
  const ctx = target.getContext('2d')!
  ctx.globalAlpha = 1
  ctx.clearRect(0, 0, WIDTH, HEIGHT)
  if (!b) ctx.drawImage(a, 0, 0)
  else {
    if (splitX > 0) ctx.drawImage(b, 0, 0, splitX, HEIGHT, 0, 0, splitX, HEIGHT)
    if (splitX < WIDTH) ctx.drawImage(a, splitX, 0, WIDTH - splitX, HEIGHT, splitX, 0, WIDTH - splitX, HEIGHT)
  }
  return target
}

/** Cross-fades `from` into `to` on the target over `ms`. Returns the cancel function. */
export function fade(target: HTMLCanvasElement, from: HTMLCanvasElement, to: HTMLCanvasElement, ms: number, done: () => void) {
  const ctx = target.getContext('2d')!
  const start = performance.now()
  let raf = 0
  const frame = (now: number) => {
    const t = Math.min(1, (now - start) / ms)
    ctx.clearRect(0, 0, WIDTH, HEIGHT)
    ctx.globalAlpha = 1 - t
    ctx.drawImage(from, 0, 0)
    ctx.globalAlpha = t
    ctx.drawImage(to, 0, 0)
    ctx.globalAlpha = 1
    if (t < 1) raf = requestAnimationFrame(frame)
    else done()
  }
  raf = requestAnimationFrame(frame)
  return () => cancelAnimationFrame(raf)
}

/** Key of the cell containing the point (centers sit at x.x5: floor groups correctly). */
export const cellKey = (lon: number, lat: number) => `${Math.floor(lon * 10)},${Math.floor(lat * 10)}`

/** Relief mode: each cell becomes a column whose height (in meters) and color follow the level. */
export function cellColumns(cells: Cells, monthly: boolean): GeoJSON.FeatureCollection {
  const level = levels(cells, monthly)
  const h = CELL / 2
  const features: GeoJSON.Feature[] = []
  for (let i = 0; i < cells.length; i += 3) {
    const lon = cells[i], lat = cells[i + 1], l = level(cells[i + 2])
    features.push({
      type: 'Feature',
      properties: { c: heat(l / LEVELS), h: ((l + 1) / LEVELS) * 150_000 },
      geometry: { type: 'Polygon', coordinates: [[[lon - h, lat - h], [lon + h, lat - h], [lon + h, lat + h], [lon - h, lat + h], [lon - h, lat - h]]] },
    })
  }
  return { type: 'FeatureCollection', features }
}
