export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const nfc = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })

export const fmt = (v: number | null | undefined) => (v == null ? '—' : nf0.format(v))
export const fmtCompact = (v: number | null | undefined) => (v == null ? '—' : nfc.format(v))
export const fmtPct = (v: number | null | undefined) =>
  v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${nf0.format(Math.abs(v))}%`
export const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return `${MONTHS[m - 1]} ${d}, ${y}`
}

/** Range of contiguous months ("Aug – Oct"); handles the turn of the year. */
export function monthRange(months: number[]): string {
  if (!months.length) return '—'
  const s = [...months].sort((a, b) => a - b)
  if (s.length === 1) return MONTHS[s[0] - 1]
  // look for the largest "gap" to find where the season starts
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

/** 1st, 2nd, 3rd, 4th… 11th, 12th, 13th… 21st. */
export const ordinal = (n: number) => {
  const v = n % 100
  const suffix = v >= 11 && v <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'
  return `${n}${suffix}`
}
