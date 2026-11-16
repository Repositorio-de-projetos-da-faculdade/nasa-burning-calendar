import type { CalendarData } from '../lib/api'
import { missingMonths } from '../lib/coverage'
import { fmt, monthRange, MONTHS, MONTHS_LONG, ordinal } from '../lib/format'
import { Badge } from './Badge'
import { SeasonDial } from './SeasonDial'

/** What does not depend on the period on the map: the current month, the season and the area's record year. */
export function Kpis({ data }: { data: CalendarData }) {
  const { current: c, ytd, summary: s } = data
  const partial = data.series.some((m) => m.partial)
  const gap = missingMonths(data)
  return (
    <div className="block facts">
      <section>
        <h2 className="w-label">Now, {MONTHS_LONG[c.month - 1]} {c.year}</h2>
        <p className="w-value num">{fmt(c.value)}</p>
        <p className="w-foot">
          <Badge pct={c.anomaly_pct} />
          {gap.length ? (
            <>No data for {monthRange(gap)}; the year-to-date total is not comparable</>
          ) : (
            <>
              Year to date <b className="num">{fmt(ytd.value)}</b>, {ordinal(ytd.rank)} highest of {ytd.of} years{partial ? ' by this date' : ''}
            </>
          )}
        </p>
      </section>
      <section>
        <h2 className="w-label">Fire season</h2>
        <p className="w-value">
          {monthRange(s.fire_season_months)}
          <SeasonDial climatology={data.climatology} season={s.fire_season_months} size={28} />
        </p>
        <p className="w-foot">
          <b className="num">{fmt(s.season_share)}%</b> of a typical year's hotspots, peaking in {MONTHS_LONG[s.critical_months[0] - 1]}
        </p>
      </section>
      <section>
        <h2 className="w-label">Worst year</h2>
        <p className="w-value num">{s.peak_year ?? '—'}</p>
        <p className="w-foot">
          <b className="num">{fmt(s.peak_year_total)}</b> hotspots; record month {MONTHS[s.record_month.month - 1]} {s.record_month.year}
        </p>
      </section>
    </div>
  )
}
