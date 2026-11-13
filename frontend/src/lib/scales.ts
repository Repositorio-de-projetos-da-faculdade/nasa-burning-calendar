/**
 * Escalas visuais. Em vez de rampas de cor, a intensidade é desenhada em dither ordenado
 * (matriz de Bayer 4×4) numa tinta só: quanto mais focos, mais pixels acesos.
 */
export const LEVELS = 10

/** Tinta da interface (espelha os tokens de app.css). */
export const INK = {
  hi: '#ededee', text: '#a1a1a6', muted: '#7c7c82', line: '#2c2c2f', grid: '#1b1b1d', surface: '#131314', bar: '#46464b',
}

export const SERIES = {
  modis: '#6ea8ff',
  viirs: '#3ecf9b',
  accent: '#ff6a1f',
  below: '#6ea8ff',
  above: '#ff5a4a',
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
const PX = 2 // lado de cada pixel do dither, em px de tela
const cache = new Map<string, string>()

/** Fundo CSS com `level` de LEVELS pixels acesos na tinta `ink`. Nível 0 = célula vazia. */
export function dither(level: number, ink: string = SERIES.accent): string {
  const key = `${level}|${ink}`
  let bg = cache.get(key)
  if (!bg) {
    const on = Math.round((Math.min(LEVELS, Math.max(0, level)) / LEVELS) * 16)
    const rects = BAYER.map((t, i) => (t < on ? `<rect x='${i % 4}' y='${Math.floor(i / 4)}' width='1' height='1'/>` : '')).join('')
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 4 4' shape-rendering='crispEdges' fill='${ink}'>${rects}</svg>`
    bg = `url("data:image/svg+xml,${encodeURIComponent(svg)}") 0 0 / ${PX * 4}px ${PX * 4}px, ${INK.grid}`
    cache.set(key, bg)
  }
  return bg
}

export const EMPTY = dither(0)
/** Os dez níveis, do mais ralo ao cheio (legendas). */
export const FIRE = Array.from({ length: LEVELS }, (_, i) => dither(i + 1))

/** Escala sqrt quantizada em LEVELS classes; 0 = vazio. */
export function fireScale(max: number) {
  const top = Math.max(max, 1)
  const level = (v: number) => (!v || v <= 0 ? 0 : Math.min(LEVELS, Math.floor(Math.sqrt(v / top) * LEVELS) + 1))
  const color = (v: number) => dither(level(v))
  const breaks = FIRE.map((_, i) => Math.round(top * (i / LEVELS) ** 2))
  return { color, level, breaks }
}

/** Razão valor/mediana em escala log2, recortada em ±2 (¼× .. 4×): azul abaixo, vermelho acima. */
export function anomalyColor(ratio: number | null) {
  if (ratio == null || !isFinite(ratio)) return EMPTY
  const l = Math.log2(Math.max(ratio, 1e-3))
  if (Math.abs(l) < 0.25) return dither(1, INK.muted)
  const level = Math.min(LEVELS, 2 + Math.floor(((Math.abs(l) - 0.25) / 1.75) * (LEVELS - 1)))
  return dither(level, l < 0 ? SERIES.below : SERIES.above)
}

export const ANOMALY_LEGEND = [
  { label: '≤¼×', color: anomalyColor(0.2) },
  { label: '', color: anomalyColor(0.4) },
  { label: '½×', color: anomalyColor(0.55) },
  { label: '', color: anomalyColor(0.75) },
  { label: '1×', color: anomalyColor(1) },
  { label: '', color: anomalyColor(1.35) },
  { label: '2×', color: anomalyColor(1.9) },
  { label: '', color: anomalyColor(2.6) },
  { label: '≥4×', color: anomalyColor(5) },
]
