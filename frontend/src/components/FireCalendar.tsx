import { Fragment, useMemo, useState } from 'react'
import type { CalendarData, MonthCell } from '../lib/api'
import { fmt, fmtCompact, fmtPct, MONTHS, MONTHS_LONG } from '../lib/format'
import { ANOMALY_LEGEND, anomalyColor, EMPTY, FIRE, fireScale, SERIES } from '../lib/scales'
import { Tooltip, useTooltip } from './Tooltip'

export type CalMode = 'count' | 'anomaly'

interface Props {
  data: CalendarData
  mode: CalMode
  selected: { year: number; month: number } | null
  onSelect: (year: number, month: number) => void
}

export function FireCalendar({ data, mode, selected, onSelect }: Props) {
  const { tip, show, hide } = useTooltip()
  const [hover, setHover] = useState<{ year: number; month: number } | null>(null)

  const byKey = useMemo(() => {
    const m = new Map<string, MonthCell>()
    data.series.forEach((c) => m.set(`${c.year}-${c.month}`, c))
    return m
  }, [data])

  // escala robusta: p98 dos meses, para um outlier nao apagar o resto
  const scale = useMemo(() => {
    const vals = data.series.map((c) => c.harmonized).filter((v) => v > 0).sort((a, b) => a - b)
    const p98 = vals.length ? vals[Math.floor(vals.length * 0.98)] : 1
    return fireScale(p98)
  }, [data])

  const annual = useMemo(() => new Map(data.annual.map((a) => [a.year, a])), [data])
  const maxAnnual = Math.max(1, ...data.annual.filter((a) => !a.partial).map((a) => a.total))
  const season = new Set(data.summary.fire_season_months)
  const years = [...data.years].reverse()
  const viirsYears = years.filter((y) => y >= 2012)
  const modisYears = years.filter((y) => y < 2012)

  const colorOf = (c: MonthCell | undefined) => {
    if (!c) return EMPTY
    if (mode === 'count') return scale.color(c.harmonized)
    return anomalyColor(c.anomaly_pct == null ? null : 1 + c.anomaly_pct / 100)
  }

  const tipContent = (c: MonthCell) => {
    const clim = data.climatology[c.month - 1]
    return (
      <>
        <div className="tip-title">
          <span>
            {MONTHS_LONG[c.month - 1]} de {c.year}
            {c.partial && ' (parcial)'}
          </span>
          <span style={{ color: c.source === 'VIIRS' ? SERIES.viirs : SERIES.modis }}>{c.source}</span>
        </div>
        <div className="tip-big num">{fmt(c.harmonized)} focos</div>
        <div className="tip-row">
          vs. mediana ({fmt(clim.median)}) <b className="num">{fmtPct(c.anomaly_pct)}</b>
        </div>
        <div className="tip-row">
          MODIS Aqua bruto <b className="num">{fmt(c.modis_raw)}</b>
        </div>
        <div className="tip-row">
          VIIRS S-NPP bruto <b className="num">{fmt(c.viirs_raw)}</b>
        </div>
        <div className="tip-row" style={{ marginTop: 4, color: 'var(--text-muted)' }}>
          Clique para ver no mapa
        </div>
      </>
    )
  }

  const row = (y: number) => {
    const a = annual.get(y)
    const isPeak = y === data.summary.peak_year
    return (
      <Fragment key={y}>
        <div className="cal-y num" data-hover={hover?.year === y}>
          <span className="src" style={{ background: y >= 2012 ? SERIES.viirs : SERIES.modis }} />
          {y}
        </div>
        {MONTHS.map((_, i) => {
          const c = byKey.get(`${y}-${i + 1}`)
          if (!c) return <div key={i} className="cal-c" data-na="true" />
          return (
            <div
              key={i}
              className="cal-c"
              style={{ background: colorOf(c) }}
              data-lit={hover != null && (hover.year === y || hover.month === i + 1)}
              data-partial={c.partial}
              data-selected={selected?.year === y && selected?.month === i + 1}
              onMouseMove={(e) => {
                setHover({ year: y, month: i + 1 })
                show(e, tipContent(c))
              }}
              onMouseLeave={() => {
                setHover(null)
                hide()
              }}
              onClick={() => onSelect(y, i + 1)}
              role="button"
              aria-label={`${MONTHS_LONG[i]} de ${y}: ${fmt(c.harmonized)} focos`}
            />
          )
        })}
        <div className="cal-bar" data-peak={isPeak} title={a?.partial ? 'Ano incompleto' : undefined}>
          <i style={{ width: `${Math.min(100, ((a?.total ?? 0) / maxAnnual) * 56)}px`, opacity: a?.partial ? 0.4 : undefined }} />
          <span className="num">{fmtCompact(a?.total)}</span>
        </div>
      </Fragment>
    )
  }

  return (
    <div>
      <div className="cal" data-hovering={hover != null}>
        <div />
        {MONTHS.map((m, i) => (
          <div key={m} className="cal-mh" data-season={season.has(i + 1)} data-hover={hover?.month === i + 1}>
            {m}
          </div>
        ))}
        <div className="cal-mh cal-total" style={{ textAlign: 'left', paddingLeft: 9 }}>
          Total anual
        </div>

        {viirsYears.length > 0 && <div className="cal-era">VIIRS S-NPP, medido (375 m)</div>}
        {viirsYears.map(row)}
        {modisYears.length > 0 && <div className="cal-era">MODIS Aqua, convertido para equivalente VIIRS (1 km)</div>}
        {modisYears.map(row)}

        <div className="cal-sep" />
        <div className="cal-y">Mediana</div>
        {data.climatology.map((c) => (
          <div
            key={c.month}
            className="cal-c"
            data-lit={hover?.month === c.month}
            style={{ background: mode === 'count' ? scale.color(c.median) : anomalyColor(1) }}
            onMouseMove={(e) =>
              show(
                e,
                <>
                  <div className="tip-title">
                    {MONTHS_LONG[c.month - 1]} · referência {data.baseline[0]}–{data.baseline[1]}
                  </div>
                  <div className="tip-big num">{fmt(c.median)} focos</div>
                  <div className="tip-row">
                    faixa típica (p25–p75) <b className="num">{fmt(c.p25)} – {fmt(c.p75)}</b>
                  </div>
                  <div className="tip-row">
                    recorde <b className="num">{fmt(c.max)} ({c.max_year})</b>
                  </div>
                </>,
              )
            }
            onMouseLeave={hide}
          />
        ))}
        <div className="cal-bar">
          <span>
            {data.baseline[0]}–{data.baseline[1]}
          </span>
        </div>
      </div>

      <div className="cal-legend">
        {mode === 'count' ? (
          <div className="legend-ramp">
            <span>Focos/mês</span>
            <div>
              <div className="sw">
                {FIRE.map((c) => (
                  <i key={c} style={{ background: c }} />
                ))}
              </div>
              <div className="lbls">
                {scale.breaks.map((b, i) => (
                  <span key={i} className="num">
                    {i % 3 === 0 ? fmtCompact(b) : ''}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="legend-ramp">
            <span>vs. mediana do mês</span>
            <div>
              <div className="sw">
                {ANOMALY_LEGEND.map((l, i) => (
                  <i key={i} style={{ background: l.color }} />
                ))}
              </div>
              <div className="lbls">
                {ANOMALY_LEGEND.map((l, i) => (
                  <span key={i}>{l.label}</span>
                ))}
              </div>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 14 }}>
          <span className="legend-key">
            <i className="sw-line" style={{ background: SERIES.viirs }} /> VIIRS
          </span>
          <span className="legend-key">
            <i className="sw-line" style={{ background: SERIES.modis }} /> MODIS convertido
          </span>
          <span className="legend-key">
            <i className="hatch" /> mês em andamento
          </span>
        </div>
      </div>
      <Tooltip tip={tip} />
    </div>
  )
}
