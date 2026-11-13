import { AlertTriangle, ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import type { CalendarData } from '../lib/api'
import { fmt, fmtPct, monthRange, MONTHS, MONTHS_LONG, ordinal } from '../lib/format'

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

export function Kpis({ data }: { data: CalendarData }) {
  const { current: c, ytd, summary: s } = data
  const partial = data.series.some((m) => m.partial)
  return (
    <div className="kpis">
      <div className="kpi">
        <span className="kpi-label">
          {MONTHS_LONG[c.month - 1][0].toUpperCase() + MONTHS_LONG[c.month - 1].slice(1)} {c.year}
          {partial ? ` · até dia ${c.day}` : ' · último mês'}
        </span>
        <span className="kpi-value num">{fmt(c.value)}</span>
        <span className="kpi-foot">
          <Badge pct={c.anomaly_pct} />
        </span>
        <span className="kpi-foot">{partial ? 'esperado até esta data' : 'mediana do mês'}: {fmt(c.expected)}</span>
      </div>
      <div className="kpi">
        <span className="kpi-label">Acumulado em {ytd.year}</span>
        <span className="kpi-value num">{fmt(ytd.value)}</span>
        <span className="kpi-foot">
          <Badge pct={ytd.anomaly_pct} />
        </span>
        <span className="kpi-foot">
          {ordinal(ytd.rank)} maior de {ytd.of} anos{partial ? ' até esta data' : ''}
        </span>
      </div>
      <div className="kpi">
        <span className="kpi-label">Temporada de fogo</span>
        <span className="kpi-value">{monthRange(s.fire_season_months)}</span>
        <span className="kpi-foot">concentra {fmt(s.season_share)}% dos focos de um ano típico</span>
        <span className="kpi-foot">pico em {MONTHS_LONG[s.critical_months[0] - 1]}</span>
      </div>
      <div className="kpi">
        <span className="kpi-label">Ano mais crítico</span>
        <span className="kpi-value num">{s.peak_year ?? '—'}</span>
        <span className="kpi-foot num">{fmt(s.peak_year_total)} focos no ano</span>
        <span className="kpi-foot">
          mês recorde: {MONTHS[s.record_month.month - 1]}/{s.record_month.year} ({fmt(s.record_month.value)})
        </span>
      </div>
    </div>
  )
}
