import { heat, LEVELS } from './scales'

/**
 * O meio-tom do mapa desenhado num canvas, que o MapLibre usa como textura.
 * Trocar de período vira um redesenho de poucos milissegundos, em vez de reprocessar
 * milhares de polígonos GeoJSON: é o que deixa o arrasto da linha do tempo fluido.
 */

const CELL = 0.1 // lado da célula da grade, em graus
const PX = 8 // pixels do canvas por célula
// ponytail: retângulo fixo ao redor do bioma; células fora dele não são desenhadas. Se a área de estudo crescer, derive dos dados.
const W = -75, E = -43, S = -19, N = 6
const MONTH_BREAKS = [2, 4, 8, 15, 30, 60, 120, 240, 480]

/** Latitude -> y de Mercator: a textura é esticada linearmente em Mercator entre os cantos. */
const merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))
const WIDTH = Math.round(((E - W) / CELL) * PX)
const HEIGHT = Math.round((WIDTH * (merc(N) - merc(S))) / (((E - W) * Math.PI) / 180))

/** Cantos da textura no mapa: NO, NE, SE, SO. */
export const CELL_COORDS: [[number, number], [number, number], [number, number], [number, number]] = [[W, N], [E, N], [E, S], [W, S]]

export function makeCellCanvas() {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  return canvas
}

/** Cada célula [lon, lat, focos] vira um quadrado cujo lado e cor crescem com o nível. */
export function drawCells(canvas: HTMLCanvasElement, cells: [number, number, number][], monthly: boolean) {
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, WIDTH, HEIGHT)
  // mês: escala fixa (meses comparáveis entre si); ano e média: decis (cada nível cobre a mesma quantidade de células)
  let breaks = MONTH_BREAKS
  if (!monthly) {
    const sorted = cells.map((c) => c[2]).sort((a, b) => a - b)
    breaks = Array.from({ length: LEVELS - 1 }, (_, i) => sorted[Math.floor(((i + 1) / LEVELS) * (sorted.length - 1))] ?? 0)
  }
  const x = (lon: number) => Math.round(((lon - W) / (E - W)) * WIDTH)
  const y = (lat: number) => Math.round(((merc(N) - merc(lat)) / (merc(N) - merc(S))) * HEIGHT)
  for (const [lon, lat, v] of cells) {
    let level = 0
    while (level < breaks.length && v >= breaks[level]) level++ // 0..LEVELS-1
    const h = (CELL / 2) * (0.3 + (0.7 * level) / (LEVELS - 1))
    const x0 = x(lon - h), y0 = y(lat + h)
    ctx.fillStyle = heat(level / LEVELS)
    ctx.fillRect(x0, y0, Math.max(1, x(lon + h) - x0), Math.max(1, y(lat - h) - y0))
  }
}
