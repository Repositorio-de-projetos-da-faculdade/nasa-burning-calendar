/**
 * Rampas de cor.
 * - FIRE: sequencial de um só matiz (laranja/brasa), escuro -> claro sobre fundo escuro:
 *   pouco fogo recua para o fundo, muito fogo "acende".
 * - DIVERGING: azul (abaixo do normal) <-> cinza neutro <-> vermelho (acima do normal).
 */
export const FIRE = [
  '#2b1a12', '#43200f', '#5f2810', '#7f3110', '#a23c0f',
  '#c44a12', '#e05e1d', '#f47b35', '#ff9d5c', '#ffc496',
]
export const EMPTY = '#1b1f26'

export const DIVERGING = {
  below: ['#0d366b', '#1c5cab', '#3987e5', '#86b6ef'], // muito abaixo -> pouco abaixo
  mid: '#3a3b40',
  above: ['#f2a39b', '#e66767', '#d03b3b', '#8f1d1d'], // pouco acima -> muito acima
}

export const SERIES = {
  modis: '#3987e5',
  viirs: '#199e70',
  harmonized: '#d95926',
  accent: '#ff7a2f',
}

export const STATUS = { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b' }

/** Escala sqrt quantizada em FIRE.length classes, com 0 = EMPTY. */
export function fireScale(max: number) {
  const n = FIRE.length
  const top = Math.max(max, 1)
  const color = (v: number) => {
    if (!v || v <= 0) return EMPTY
    const t = Math.sqrt(v / top)
    return FIRE[Math.min(n - 1, Math.floor(t * n))]
  }
  const breaks = FIRE.map((_, i) => Math.round(top * (i / n) ** 2))
  return { color, breaks }
}

/** Razão valor/mediana em escala log2, recortada em ±2 (¼× .. 4×). */
export function anomalyColor(ratio: number | null) {
  if (ratio == null || !isFinite(ratio)) return EMPTY
  const l = Math.log2(Math.max(ratio, 1e-3))
  if (Math.abs(l) < 0.25) return DIVERGING.mid
  const steps = DIVERGING.below.length
  const idx = Math.min(steps - 1, Math.floor(((Math.abs(l) - 0.25) / 1.75) * steps))
  return l < 0 ? DIVERGING.below[steps - 1 - idx] : DIVERGING.above[idx]
}

export const ANOMALY_LEGEND = [
  { label: '≤¼×', color: DIVERGING.below[0] },
  { label: '', color: DIVERGING.below[1] },
  { label: '½×', color: DIVERGING.below[2] },
  { label: '', color: DIVERGING.below[3] },
  { label: 'normal', color: DIVERGING.mid },
  { label: '', color: DIVERGING.above[0] },
  { label: '2×', color: DIVERGING.above[1] },
  { label: '', color: DIVERGING.above[2] },
  { label: '≥4×', color: DIVERGING.above[3] },
]

/** Expressão MapLibre: cor por classes de quantil (breaks crescentes, um a menos que FIRE). */
export function fireQuantileExpression(breaks: number[]): unknown[] {
  const expr: unknown[] = ['step', ['get', 'v'], FIRE[0]]
  let last = -Infinity
  breaks.forEach((b, i) => {
    const v = b > last ? b : last + 1e-6 // step exige valores estritamente crescentes
    expr.push(v, FIRE[i + 1])
    last = v
  })
  return expr
}
