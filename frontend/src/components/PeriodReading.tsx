import type { CalendarData } from '../lib/api'
import { readout } from '../lib/readout'
import { Badge } from './Badge'
import { CountUp } from './CountUp'
import type { Layer } from './MapPanel'

/** Value bar with the reference marker. */
function Gauge({ value, expected }: { value: number; expected: number }) {
  const top = Math.max(value, expected, 1) * 1.12
  return (
    <div className="gauge" aria-hidden="true">
      <i style={{ width: `${(value / top) * 100}%` }} />
      <u style={{ left: `${(expected / top) * 100}%` }} />
    </div>
  )
}

/** The panel's main reading: the period the timeline put on the map. */
export function PeriodReading({ d, layer }: { d: CalendarData; layer: Layer }) {
  const r = readout(d, layer)
  return (
    <section className="block">
      <div className="now-row">
        <div>
          <p className="eyebrow">On the map</p>
          <h2 className="w-label">{r.when}</h2>
          <p className="w-value w-value-lg num">{r.value == null ? '—' : <CountUp value={r.value} />}</p>
        </div>
        {r.pct !== undefined && <Badge pct={r.pct} />}
      </div>
      {r.value != null && r.expected != null && <Gauge value={r.value} expected={r.expected} />}
      <p className="w-foot">{r.note}</p>
    </section>
  )
}
