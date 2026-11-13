import type { CalendarData } from '../lib/api'
import { fmt, monthRange, MONTHS, MONTHS_LONG, ordinal } from '../lib/format'
import { Badge } from './Badge'
import { SeasonDial } from './SeasonDial'

/** Barra do valor atual com o marcador do esperado. */
function Gauge({ value, expected }: { value: number; expected: number }) {
  const top = Math.max(value, expected, 1) * 1.12
  return (
    <div className="gauge" aria-hidden="true">
      <i style={{ width: `${(value / top) * 100}%` }} />
      <u style={{ left: `${(expected / top) * 100}%` }} />
    </div>
  )
}

/** O estado da área hoje: mês corrente em destaque e três fatos em lista. */
export function Kpis({ data }: { data: CalendarData }) {
  const { current: c, ytd, summary: s } = data
  const partial = data.series.some((m) => m.partial)
  const month = MONTHS_LONG[c.month - 1]
  return (
    <div className="now">
      <div className="now-lead">
        <span className="fact-label">
          {month[0].toUpperCase() + month.slice(1)} de {c.year}
          {partial ? `, até o dia ${c.day}` : ', último mês'}
        </span>
        <span className="now-value num">{fmt(c.value)}</span>
        <Badge pct={c.anomaly_pct} />
        <Gauge value={c.value} expected={c.expected} />
        <span className="fact-foot">
          {partial ? 'esperado até esta data' : 'mediana do mês'}: <b className="num">{fmt(c.expected)}</b>
        </span>
      </div>

      <dl className="facts">
        <div className="fact">
          <dt className="fact-label">Acumulado em {ytd.year}</dt>
          <dd className="fact-value num">{fmt(ytd.value)}</dd>
          <dd className="fact-foot">
            <Badge pct={ytd.anomaly_pct} /> {ordinal(ytd.rank)} maior de {ytd.of} anos{partial ? ' até esta data' : ''}
          </dd>
        </div>
        <div className="fact">
          <dt className="fact-label">Temporada de fogo</dt>
          <dd className="fact-value">
            <SeasonDial climatology={data.climatology} season={s.fire_season_months} />
            {monthRange(s.fire_season_months)}
          </dd>
          <dd className="fact-foot">
            concentra <b className="num">{fmt(s.season_share)}%</b> dos focos de um ano típico, com pico em {MONTHS_LONG[s.critical_months[0] - 1]}
          </dd>
        </div>
        <div className="fact">
          <dt className="fact-label">Ano mais crítico</dt>
          <dd className="fact-value num">{s.peak_year ?? '—'}</dd>
          <dd className="fact-foot">
            <b className="num">{fmt(s.peak_year_total)}</b> focos no ano; mês recorde em {MONTHS[s.record_month.month - 1]}/{s.record_month.year},
            com {fmt(s.record_month.value)}
          </dd>
        </div>
      </dl>
    </div>
  )
}
