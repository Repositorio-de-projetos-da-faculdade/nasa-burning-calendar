import type { CalendarData } from '../lib/api'
import { missingMonths } from '../lib/coverage'
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

/** O estado da área hoje: um widget para o mês corrente e uma lista de três fatos. */
export function Kpis({ data }: { data: CalendarData }) {
  const { current: c, ytd, summary: s } = data
  const partial = data.series.some((m) => m.partial)
  const month = MONTHS_LONG[c.month - 1]
  const gap = missingMonths(data)
  return (
    <>
      <section className="widget">
        <div className="now-row">
          <div>
            <p className="eyebrow">Agora</p>
            <h2 className="w-label">
              {month[0].toUpperCase() + month.slice(1)} de {c.year}
              {partial ? `, até o dia ${c.day}` : ', último mês'}
            </h2>
            <p className="w-value w-value-lg num">{fmt(c.value)}</p>
          </div>
          <Badge pct={c.anomaly_pct} />
        </div>
        <Gauge value={c.value} expected={c.expected} />
        <p className="w-foot">
          {partial ? 'Esperado até esta data' : 'Mediana do mês'}: <b className="num">{fmt(c.expected)}</b> focos
        </p>
      </section>

      <div className="widget facts">
        <section>
          <h2 className="w-label">Acumulado em {ytd.year}</h2>
          <p className="w-value num">{fmt(ytd.value)}</p>
          <p className="w-foot">
            {gap.length ? (
              <>Sem dados de {monthRange(gap).toLowerCase()} de {ytd.year}; o total não é comparável com outros anos</>
            ) : (
              <>
                <Badge pct={ytd.anomaly_pct} />
                {ordinal(ytd.rank)} maior de {ytd.of} anos{partial ? ' até esta data' : ''}
              </>
            )}
          </p>
        </section>
        <section>
          <h2 className="w-label">Temporada de fogo</h2>
          <p className="w-value">
            {monthRange(s.fire_season_months)}
            <SeasonDial climatology={data.climatology} season={s.fire_season_months} size={28} />
          </p>
          <p className="w-foot">
            <b className="num">{fmt(s.season_share)}%</b> dos focos de um ano típico, pico em {MONTHS_LONG[s.critical_months[0] - 1]}
          </p>
        </section>
        <section>
          <h2 className="w-label">Ano mais crítico</h2>
          <p className="w-value num">{s.peak_year ?? '—'}</p>
          <p className="w-foot">
            <b className="num">{fmt(s.peak_year_total)}</b> focos; mês recorde em {MONTHS[s.record_month.month - 1]}/{s.record_month.year}
          </p>
        </section>
      </div>
    </>
  )
}
