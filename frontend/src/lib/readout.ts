import type { Layer } from '../components/MapPanel'
import type { CalendarData } from './api'
import { fmt, MONTHS_LONG } from './format'

export interface Readout {
  when: string
  value: number | null
  pct: number | null | undefined // undefined = não se aplica
  /** Referência para comparar o valor (mediana do mês, ou o esperado até hoje no mês em andamento). */
  expected?: number
  note: string
}

/** O que o período escolhido na linha do tempo diz sobre a área: a mesma leitura no painel e na linha do tempo. */
export function readout(d: CalendarData, layer: Layer): Readout {
  if (layer.year == null) {
    const full = d.annual.filter((a) => !a.partial)
    const mean = full.length ? full.reduce((s, a) => s + a.total, 0) / full.length : null
    return { when: `Média anual, ${d.years[0]} a ${d.years[d.years.length - 1]}`, value: mean, pct: undefined, note: 'focos por ano, em média' }
  }
  if (layer.month == null) {
    const a = d.annual.find((x) => x.year === layer.year)
    return {
      when: `Ano de ${layer.year}`,
      value: a?.total ?? null,
      pct: undefined,
      note: a ? `focos no ano${a.partial ? ' (incompleto)' : ''}, ${a.converted ? 'MODIS convertido' : 'VIIRS medido'}` : 'sem dados',
    }
  }
  const c = d.series.find((x) => x.year === layer.year && x.month === layer.month)
  const month = MONTHS_LONG[layer.month - 1]
  const when = `${month[0].toUpperCase() + month.slice(1)} de ${layer.year}`
  if (!c) return { when, value: null, pct: undefined, note: 'sem dados' }
  const now = c.partial && layer.year === d.current.year && layer.month === d.current.month
  const expected = now ? d.current.expected : d.climatology[layer.month - 1].median
  return {
    when: now ? `${when}, até o dia ${d.current.day}` : when,
    value: c.harmonized,
    pct: now ? d.current.anomaly_pct : c.anomaly_pct,
    expected,
    note: now ? `focos até hoje; esperado até esta data ${fmt(expected)}` : `focos no mês; mediana do mês ${fmt(expected)}`,
  }
}
