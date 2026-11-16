import type { CalendarData } from '../lib/api'
import { fmt } from '../lib/format'
import { heat } from '../lib/scales'

/** The complete years with the most hotspots, in order; each row takes the map to that year. */
export function RankList({ data, active, onPick, top = 6 }: { data: CalendarData; active: number | null; onPick: (y: number) => void; top?: number }) {
  const rows = data.annual.filter((a) => !a.partial).sort((a, b) => b.total - a.total).slice(0, top)
  const max = rows[0]?.total ?? 1
  return (
    <ol className="rank">
      {rows.map((a, i) => (
        <li key={a.year}>
          <button className="rank-row" data-active={active === a.year} onClick={() => onPick(a.year)}>
            <span className="rank-n">{i + 1}</span>
            <span className="rank-year num">{a.year}</span>
            <span className="rank-bar"><i style={{ width: `${(a.total / max) * 100}%`, background: heat(a.total / max) }} /></span>
            <span className="rank-total num">{fmt(a.total)}</span>
          </button>
        </li>
      ))}
    </ol>
  )
}
