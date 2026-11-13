import type { CalendarData } from '../lib/api'
import { missingMonths } from '../lib/coverage'
import { fmt, monthRange, MONTHS, MONTHS_LONG, ordinal } from '../lib/format'
import { Badge } from './Badge'
import { SeasonDial } from './SeasonDial'

/** O que não depende do período no mapa: o mês corrente, a temporada e o ano recorde da área. */
export function Kpis({ data }: { data: CalendarData }) {
  const { current: c, ytd, summary: s } = data
  const partial = data.series.some((m) => m.partial)
  const gap = missingMonths(data)
  return (
    <div className="block facts">
      <section>
        <h2 className="w-label">Agora, {MONTHS_LONG[c.month - 1]} de {c.year}</h2>
        <p className="w-value num">{fmt(c.value)}</p>
        <p className="w-foot">
          <Badge pct={c.anomaly_pct} />
          {gap.length ? (
            <>Sem dados de {monthRange(gap).toLowerCase()}; o acumulado do ano não é comparável</>
          ) : (
            <>
              Acumulado no ano <b className="num">{fmt(ytd.value)}</b>, {ordinal(ytd.rank)} maior de {ytd.of} anos{partial ? ' até esta data' : ''}
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
  )
}
