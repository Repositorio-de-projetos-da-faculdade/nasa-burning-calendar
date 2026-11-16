import type { CalendarData } from '../lib/api'
import { readout } from '../lib/readout'
import { Badge } from './Badge'
import { CountUp } from './CountUp'
import type { Layer } from './MapPanel'

/** Short reading of the period, inside the timeline that controls it; the main reading lives in the panel. */
export function Hud({ d, layer }: { d: CalendarData; layer: Layer }) {
  const r = readout(d, layer)
  return (
    <div className="hud">
      <p className="hud-when">{d.area.name} · {r.when}</p>
      <p className="hud-line">
        <b className="hud-value num">{r.value == null ? '—' : <CountUp value={r.value} />}</b>
        <span>hotspots</span>
        {r.pct !== undefined && <Badge pct={r.pct} />}
      </p>
    </div>
  )
}
