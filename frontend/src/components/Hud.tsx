import type { CalendarData } from '../lib/api'
import { readout } from '../lib/readout'
import { Badge } from './Badge'
import { CountUp } from './CountUp'
import type { Layer } from './MapPanel'

/** Leitura curta do período, dentro da linha do tempo que o controla; a leitura principal fica no painel. */
export function Hud({ d, layer }: { d: CalendarData; layer: Layer }) {
  const r = readout(d, layer)
  return (
    <div className="hud">
      <p className="hud-when">{d.area.name} · {r.when}</p>
      <p className="hud-line">
        <b className="hud-value num">{r.value == null ? '—' : <CountUp value={r.value} />}</b>
        <span>focos</span>
        {r.pct !== undefined && <Badge pct={r.pct} />}
      </p>
    </div>
  )
}
