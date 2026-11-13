import type { CalendarData } from '../lib/api'
import { fmt, MONTHS_LONG } from '../lib/format'
import { Badge } from './Badge'
import { CountUp } from './CountUp'
import type { Layer } from './MapPanel'

interface Readout {
  when: string
  value: number | null
  pct: number | null | undefined // undefined = não se aplica
  note: string
}

/** O que o período escolhido na linha do tempo diz sobre a área. */
function readout(d: CalendarData, layer: Layer): Readout {
  if (layer.year == null) {
    const full = d.annual.filter((a) => !a.partial)
    const mean = full.length ? full.reduce((s, a) => s + a.total, 0) / full.length : null
    return { when: `média anual, ${d.years[0]} a ${d.years[d.years.length - 1]}`, value: mean, pct: undefined, note: 'focos por ano' }
  }
  if (layer.month == null) {
    const a = d.annual.find((x) => x.year === layer.year)
    return {
      when: `ano de ${layer.year}`,
      value: a?.total ?? null,
      pct: undefined,
      note: a ? `focos no ano${a.partial ? ' (incompleto)' : ''} · ${a.converted ? 'MODIS convertido' : 'VIIRS medido'}` : 'sem dados',
    }
  }
  const c = d.series.find((x) => x.year === layer.year && x.month === layer.month)
  return {
    when: `${MONTHS_LONG[layer.month - 1]} de ${layer.year}`,
    value: c?.harmonized ?? null,
    pct: c ? c.anomaly_pct : undefined,
    note: c ? `focos no mês${c.partial ? ' (em andamento)' : ''} · mediana ${fmt(d.climatology[layer.month - 1].median)}` : 'sem dados',
  }
}

export function Hud({ d, layer }: { d: CalendarData; layer: Layer }) {
  const r = readout(d, layer)
  return (
    <div className="hud">
      <h1 className="hud-area">{d.area.name}</h1>
      <p className="hud-when">{r.when}</p>
      <p className="hud-value num" aria-live="off">{r.value == null ? '—' : <CountUp value={r.value} />}</p>
      <div className="hud-foot">
        {r.pct !== undefined && <Badge pct={r.pct} />}
        <span>{r.note}</span>
      </div>
    </div>
  )
}
