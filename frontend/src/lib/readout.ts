import type { Layer } from '../components/MapPanel'
import type { CalendarData } from './api'
import { fmt, MONTHS_LONG } from './format'

export interface Readout {
  when: string
  value: number | null
  pct: number | null | undefined // undefined = not applicable
  /** Reference to compare the value with (the month's median, or the amount expected so far in the ongoing month). */
  expected?: number
  note: string
}

/** What the period chosen on the timeline says about the area: the same reading in the panel and on the timeline. */
export function readout(d: CalendarData, layer: Layer): Readout {
  if (layer.year == null) {
    const full = d.annual.filter((a) => !a.partial)
    const mean = full.length ? full.reduce((s, a) => s + a.total, 0) / full.length : null
    return { when: `Annual mean, ${d.years[0]} to ${d.years[d.years.length - 1]}`, value: mean, pct: undefined, note: 'hotspots per year, on average' }
  }
  if (layer.month == null) {
    const a = d.annual.find((x) => x.year === layer.year)
    return {
      when: `Year ${layer.year}`,
      value: a?.total ?? null,
      pct: undefined,
      note: a ? `hotspots in the year${a.partial ? ' (incomplete)' : ''}, ${a.converted ? 'converted MODIS' : 'measured VIIRS'}` : 'no data',
    }
  }
  const c = d.series.find((x) => x.year === layer.year && x.month === layer.month)
  const when = `${MONTHS_LONG[layer.month - 1]} ${layer.year}`
  if (!c) return { when, value: null, pct: undefined, note: 'no data' }
  const now = c.partial && layer.year === d.current.year && layer.month === d.current.month
  const expected = now ? d.current.expected : d.climatology[layer.month - 1].median
  return {
    when: now ? `${when}, through day ${d.current.day}` : when,
    value: c.harmonized,
    pct: now ? d.current.anomaly_pct : c.anomaly_pct,
    expected,
    note: now ? `hotspots so far; expected by this date ${fmt(expected)}` : `hotspots in the month; monthly median ${fmt(expected)}`,
  }
}
