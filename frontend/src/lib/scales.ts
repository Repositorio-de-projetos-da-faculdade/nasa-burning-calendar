/**
 * Escalas visuais.
 * - FIRE: sequencial de um só matiz (do fundo ao laranja e ao quase branco): pouco fogo recua, muito fogo acende.
 * - DIVERGING: azul (abaixo do normal) / neutro / vermelho (acima), sempre do fraco ao forte.
 */
export const LEVELS = 10

/** Tinta da interface (espelha os tokens de app.css). */
export const INK = {
  hi: '#ededee', text: '#a1a1a6', muted: '#7c7c82', line: '#2c2c2f', grid: '#1b1b1d', surface: '#131314', bar: '#46464b',
}

export const SERIES = { modis: '#6ea8ff', viirs: '#3ecf9b', accent: '#ff6a1f' }

export const FIRE = ['#221b18', '#35211a', '#4f271a', '#6e2d18', '#903515', '#b43e13', '#d94c14', '#ff6a1f', '#ff9c63', '#ffd3b3']
export const EMPTY = INK.grid

const DIVERGING = {
  below: ['#1b3152', '#234c8c', '#3a74d4', '#8db8ff'],
  mid: '#38383c',
  above: ['#5c2420', '#96342d', '#d9483c', '#ff8f82'],
}

/** Escala sqrt quantizada em LEVELS classes; 0 = vazio. */
export function fireScale(max: number) {
  const top = Math.max(max, 1)
  const color = (v: number) => (!v || v <= 0 ? EMPTY : FIRE[Math.min(LEVELS - 1, Math.floor(Math.sqrt(v / top) * LEVELS))])
  const breaks = FIRE.map((_, i) => Math.round(top * (i / LEVELS) ** 2))
  return { color, breaks }
}

/** Razão valor/mediana em escala log2, recortada em ±2 (¼× .. 4×). */
export function anomalyColor(ratio: number | null) {
  if (ratio == null || !isFinite(ratio)) return EMPTY
  const l = Math.log2(Math.max(ratio, 1e-3))
  if (Math.abs(l) < 0.25) return DIVERGING.mid
  const steps = DIVERGING.below.length
  const idx = Math.min(steps - 1, Math.floor(((Math.abs(l) - 0.25) / 1.75) * steps))
  return (l < 0 ? DIVERGING.below : DIVERGING.above)[idx]
}

export const ANOMALY_LEGEND = [
  { label: '≤¼×', color: DIVERGING.below[3] },
  { label: '', color: DIVERGING.below[2] },
  { label: '½×', color: DIVERGING.below[1] },
  { label: '', color: DIVERGING.below[0] },
  { label: '1×', color: DIVERGING.mid },
  { label: '', color: DIVERGING.above[0] },
  { label: '2×', color: DIVERGING.above[1] },
  { label: '', color: DIVERGING.above[2] },
  { label: '≥4×', color: DIVERGING.above[3] },
]
