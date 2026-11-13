import { HEAT, heat, LEVELS } from './scales'

/**
 * O mapa de calor desenhado num canvas, que o MapLibre usa como textura.
 * Trocar de período vira um redesenho de poucos milissegundos, em vez de reprocessar
 * milhares de polígonos: é o que deixa o arrasto da linha do tempo fluido.
 */

/** Células em sequência: lon, lat, focos, lon, lat, focos… */
export type Cells = Float32Array

const CELL = 0.1 // lado da célula da grade, em graus
const PX = 2 // pixels do canvas por célula; a textura é ampliada com interpolação, o que dá o campo contínuo
// ponytail: retângulo fixo ao redor do bioma; células fora dele não são desenhadas. Se a área de estudo crescer, derive dos dados.
const W = -75, E = -43, S = -19, N = 6
/** Escala fixa (focos por célula no mês): assim o mapa apaga na chuva e acende na seca. */
const MONTH_BREAKS = [2, 4, 8, 15, 30, 60, 120, 240, 480]

/** Latitude -> y de Mercator: a textura é esticada linearmente em Mercator entre os cantos. */
const merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))
const WIDTH = Math.round(((E - W) / CELL) * PX)
const HEIGHT = Math.round((WIDTH * (merc(N) - merc(S))) / (((E - W) * Math.PI) / 180))

/** Cantos da textura no mapa: NO, NE, SE, SO. */
export const CELL_COORDS: [[number, number], [number, number], [number, number], [number, number]] = [[W, N], [E, N], [E, S], [W, S]]

/** Longitude -> coluna da textura (onde cortar na comparação lado a lado). */
export const lonToX = (lon: number) => Math.min(WIDTH, Math.max(0, Math.round(((lon - W) / (E - W)) * WIDTH)))
const latToY = (lat: number) => Math.round(((merc(N) - merc(lat)) / (merc(N) - merc(S))) * HEIGHT)

export function makeCanvas() {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  return canvas
}

/** Focos -> nível 0..LEVELS-1. Mês: escala fixa; ano e média: decis (cada nível cobre a mesma quantidade de células). */
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

/** Intensidade (0..255) -> pixel RGBA de 32 bits: a rampa de calor interpolada, com opacidade que cresce com a intensidade. */
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

// buffers de trabalho reaproveitados entre períodos
const intensity = new Uint8Array(WIDTH * HEIGHT)
const blurred = new Uint8Array(WIDTH * HEIGHT)

/**
 * Um período como campo de calor contínuo: intensidade por célula, suavizada com os vizinhos, depois colorida pela rampa.
 * Tudo em arrays (sem filtros nem leitura de volta do canvas): custa poucos milissegundos, o que permite redesenhar a cada mês do arrasto.
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
  // suavização [1 2 1] na horizontal e depois na vertical
  for (let i = 1; i < intensity.length - 1; i++) blurred[i] = (intensity[i - 1] + 2 * intensity[i] + intensity[i + 1]) >> 2
  const img = new ImageData(WIDTH, HEIGHT)
  const px = new Uint32Array(img.data.buffer)
  for (let i = WIDTH; i < px.length - WIDTH; i++) px[i] = PALETTE[(blurred[i - WIDTH] + 2 * blurred[i] + blurred[i + WIDTH]) >> 2]
  const out = makeCanvas()
  out.getContext('2d')!.putImageData(img, 0, 0)
  return out
}

/** Pinta `a` no alvo; com `b`, a metade à esquerda de `splitX` vem de `b` (comparação lado a lado). */
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

/** Funde `from` em `to` no alvo ao longo de `ms`. Devolve o cancelamento. */
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

/** Chave da célula que contém o ponto (os centros ficam em x,x5: floor agrupa certo). */
export const cellKey = (lon: number, lat: number) => `${Math.floor(lon * 10)},${Math.floor(lat * 10)}`

/** Modo relevo: cada célula vira uma coluna cuja altura (em metros) e cor seguem o nível. */
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
