export const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
export const MONTHS_LONG = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const nfc = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })

export const fmt = (v: number | null | undefined) => (v == null ? '—' : nf0.format(v))
export const fmtCompact = (v: number | null | undefined) => (v == null ? '—' : nfc.format(v))
export const fmtPct = (v: number | null | undefined) =>
  v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${nf0.format(Math.abs(v))}%`
export const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTHS[m - 1].toLowerCase()} ${y}`
}

/** Faixa de meses contíguos ("Ago – Out"); trata a virada do ano. */
export function monthRange(months: number[]): string {
  if (!months.length) return '—'
  const s = [...months].sort((a, b) => a - b)
  if (s.length === 1) return MONTHS[s[0] - 1]
  // procura o maior "buraco" para achar o início da temporada
  let start = s[0]
  let gapMax = 12 - s[s.length - 1] + s[0]
  for (let i = 1; i < s.length; i++) {
    const g = s[i] - s[i - 1]
    if (g > gapMax) {
      gapMax = g
      start = s[i]
    }
  }
  const idx = s.indexOf(start)
  const end = s[(idx - 1 + s.length) % s.length]
  return `${MONTHS[start - 1]} – ${MONTHS[end - 1]}`
}

export const ordinal = (n: number) => `${n}º`
