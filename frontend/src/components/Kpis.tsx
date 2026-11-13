import { AlertTriangle, ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import type { CalendarData } from '../lib/api'
import { fmt, fmtPct, monthRange, MONTHS, MONTHS_LONG, ordinal } from '../lib/format'
import { CountUp } from './CountUp'
import { SeasonDial } from './SeasonDial'

function tone(pct: number | null): { tone: string; label: string; Icon: typeof Minus } {
  if (pct == null) return { tone: 'normal', label: 'sem referência', Icon: Minus }
  if (pct >= 100) return { tone: 'critical', label: 'muito acima do normal', Icon: AlertTriangle }
  if (pct >= 25) return { tone: 'serious', label: 'acima do normal', Icon: ArrowUpRight }
  if (pct <= -25) return { tone: 'good', label: 'abaixo do normal', Icon: ArrowDownRight }
  return { tone: 'normal', label: 'dentro do normal', Icon: Minus }
}

function Badge({ pct }: { pct: number | null }) {
  const t = tone(pct)
  return (
    <span className="badge" data-tone={t.tone}>
      <t.Icon size={13} />
      <span className="num">{fmtPct(pct)}</span>
      <span style={{ fontWeight: 500 }}>{t.label}</span>
    </span>
  )
}

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

export function Kpis({ data }: { data: CalendarData }) {
  const { current: c, ytd, summary: s } = data
  const partial = data.series.some((m) => m.partial)
  const month = MONTHS_LONG[c.month - 1]
  return (
    <div className="stats">
      <div className="stat" data-lead="true">
        <div className="stat-main">
          <span className="stat-label">
            {month[0].toUpperCase() + month.slice(1)} {c.year}
            {partial ? ` · até dia ${c.day}` : ' · último mês'}
          </span>
          <span className="stat-value num"><CountUp value={c.value} /></span>
        </div>
        <div className="stat-side">
          <Badge pct={c.anomaly_pct} />
          <Gauge value={c.value} expected={c.expected} />
          <span className="stat-foot">
            {partial ? 'esperado até esta data' : 'mediana do mês'}: <b className="num">{fmt(c.expected)}</b>
          </span>
        </div>
      </div>
      <div className="stat">
        <span className="stat-label">Acumulado em {ytd.year}</span>
        <span className="stat-value num"><CountUp value={ytd.value} /></span>
        <Badge pct={ytd.anomaly_pct} />
        <span className="stat-foot">
          {ordinal(ytd.rank)} maior de {ytd.of} anos{partial ? ' até esta data' : ''}
        </span>
      </div>
      <div className="stat">
        <span className="stat-label">Temporada de fogo</span>
        <span className="stat-value">{monthRange(s.fire_season_months)}</span>
        <SeasonDial climatology={data.climatology} season={s.fire_season_months} />
        <span className="stat-foot">
          concentra <b className="num">{fmt(s.season_share)}%</b> dos focos de um ano típico, com pico em{' '}
          {MONTHS_LONG[s.critical_months[0] - 1]}
        </span>
      </div>
      <div className="stat">
        <span className="stat-label">Ano mais crítico</span>
        <span className="stat-value num">{s.peak_year ?? '—'}</span>
        <span className="stat-foot">
          <b className="num">{fmt(s.peak_year_total)}</b> focos no ano. Mês recorde: {MONTHS[s.record_month.month - 1]}/
          {s.record_month.year} ({fmt(s.record_month.value)})
        </span>
      </div>
    </div>
  )
}
