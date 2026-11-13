/**
 * Escalas visuais. O calendário usa a mesma linguagem do mapa: um quadrado por valor,
 * cujo tamanho cresce com os focos; a cor reforça com a rampa de calor (brasa = pouco, amarelo = extremo).
 */

/** Número de classes do meio-tom do mapa. */
export const LEVELS = 10

/** Tinta da interface (espelha os tokens de app.css). */
export const INK = {
  hi: '#ededee', text: '#a1a1a6', muted: '#7c7c82', line: '#2c2c2f', grid: '#1b1b1d', surface: '#131314', bar: '#46464b',
}

export const SERIES = { modis: '#6ea8ff', viirs: '#3ecf9b', accent: '#ff6a1f' }

/** Um valor desenhado: lado relativo (0..1) e cor. */
export interface Mark {
  size: number
  color: string
}

const QUIET = '#5c5c62'
/** Rampa de calor, da brasa ao amarelo: a mesma no mapa, no calendário, na linha do tempo e nos anos. */
export const HEAT = ['#8c2a1c', '#c93a1d', '#ff6a1f', '#ffa22e', '#ffe08a']
export const heat = (t: number) => HEAT[Math.min(HEAT.length - 1, Math.max(0, Math.floor(t * HEAT.length)))]
const fireColor = (t: number) => (t < 0.12 ? QUIET : heat(t))

/** Focos -> marca, em escala sqrt (a área do quadrado acompanha o valor). */
export function fireMarks(max: number) {
  const top = Math.max(max, 1)
  const mark = (v: number): Mark => {
    const t = Math.min(1, Math.sqrt(Math.max(v, 0) / top))
    return { size: t, color: fireColor(t) }
  }
  const legend = [0.1, 0.3, 0.5, 0.75, 1].map((t) => ({ mark: { size: t, color: fireColor(t) }, value: top * t * t }))
  return { mark, legend }
}

const BELOW = '#6ea8ff'
const ABOVE = '#ff5a4a'

/** Razão valor/mediana em log2, recortada em ±2 (¼× .. 4×): azul abaixo, vermelho acima, tamanho pela distância do normal. */
export function anomalyMark(ratio: number | null): Mark {
  if (ratio == null || !isFinite(ratio)) return { size: 0, color: QUIET }
  const l = Math.max(-2, Math.min(2, Math.log2(Math.max(ratio, 1e-3))))
  if (Math.abs(l) < 0.25) return { size: 0.12, color: QUIET }
  return { size: 0.2 + 0.8 * (Math.abs(l) / 2), color: l < 0 ? BELOW : ABOVE }
}

export const ANOMALY_LEGEND = [
  { label: '≤¼×', mark: anomalyMark(0.25) },
  { label: '½×', mark: anomalyMark(0.5) },
  { label: '1×', mark: anomalyMark(1) },
  { label: '2×', mark: anomalyMark(2) },
  { label: '≥4×', mark: anomalyMark(4) },
]
