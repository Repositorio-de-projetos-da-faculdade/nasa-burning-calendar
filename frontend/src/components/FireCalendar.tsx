import { type CSSProperties, Fragment, memo, useMemo, useState } from 'react'
import type { CalendarData, MonthCell } from '../lib/api'
import { fmt, fmtCompact, fmtPct, MONTHS, MONTHS_LONG } from '../lib/format'
import { ANOMALY_LEGEND, anomalyMark, fireMarks, type Mark, SERIES } from '../lib/scales'
import { Tooltip, useTooltip } from './Tooltip'

export type CalMode = 'count' | 'anomaly'

interface Props {
  data: CalendarData
  mode: CalMode
  onSelect: (year: number, month: number) => void
}

const markStyle = (m: Mark) => ({ '--s': m.size, '--c': m.color }) as CSSProperties

/**
 * Year × month matrix: each month is a square whose size grows with the hotspots (or with the distance from normal).
 * The selected month is marked from outside, via CSS, through each cell's data-k ("year-month") attribute.
 */
export const FireCalendar = memo(function FireCalendar({ data, mode, onSelect }: Props) {
  const { tip, show, hide } = useTooltip()
  const [hover, setHover] = useState<{ year: number; month: number } | null>(null)

  const byKey = useMemo(() => new Map(data.series.map((c) => [`${c.year}-${c.month}`, c])), [data])

  // robust scale: p98 of the months, so one outlier does not wash out the rest
  const scale = useMemo(() => {
    const vals = data.series.map((c) => c.harmonized).filter((v) => v > 0).sort((a, b) => a - b)
    return fireMarks(vals.length ? vals[Math.floor(vals.length * 0.98)] : 1)
  }, [data])

  const annual = useMemo(() => new Map(data.annual.map((a) => [a.year, a])), [data])
  const maxAnnual = Math.max(1, ...data.annual.filter((a) => !a.partial).map((a) => a.total))
  const season = new Set(data.summary.fire_season_months)
  const years = [...data.years].reverse()
  const viirsYears = years.filter((y) => y >= 2012)
  const modisYears = years.filter((y) => y < 2012)

  const markOf = (c: MonthCell) =>
    mode === 'count' ? scale.mark(c.harmonized) : anomalyMark(c.anomaly_pct == null ? null : 1 + c.anomaly_pct / 100)

  const tipContent = (c: MonthCell) => (
    <>
      <div className="tip-title">
        <span>
          {MONTHS_LONG[c.month - 1]} {c.year}
          {c.partial && ' (partial)'}
        </span>
        <span>{c.source}</span>
      </div>
      <div className="tip-big num">{fmt(c.harmonized)} hotspots</div>
      <div className="tip-row">
        vs. median ({fmt(data.climatology[c.month - 1].median)}) <b className="num">{fmtPct(c.anomaly_pct)}</b>
      </div>
      <div className="tip-row">
        Raw MODIS Aqua <b className="num">{fmt(c.modis_raw)}</b>
      </div>
      <div className="tip-row">
        Raw VIIRS S-NPP <b className="num">{fmt(c.viirs_raw)}</b>
      </div>
    </>
  )

  const row = (y: number, r: number) => {
    const a = annual.get(y)
    return (
      <Fragment key={y}>
        <div className="cal-y num" data-hover={hover?.year === y}>
          {y}
        </div>
        {MONTHS.map((_, i) => {
          const c = byKey.get(`${y}-${i + 1}`)
          if (!c) return <div key={i} className="cal-c" data-na="true" />
          return (
            <div
              key={i}
              className="cal-c"
              style={{ ...markStyle(markOf(c)), '--r': r } as CSSProperties}
              data-lit={hover != null && (hover.year === y || hover.month === i + 1)}
              data-partial={c.partial}
              data-k={`${y}-${i + 1}`}
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
              aria-label={`${MONTHS_LONG[i]} ${y}: ${fmt(c.harmonized)} hotspots`}
            />
          )
        })}
        <div className="cal-bar" data-peak={y === data.summary.peak_year} title={a?.partial ? 'Incomplete year' : undefined}>
          <i style={{ width: `${Math.min(100, ((a?.total ?? 0) / maxAnnual) * 40)}px`, opacity: a?.partial ? 0.4 : undefined }} />
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
        <div className="cal-mh cal-total">Year total</div>

        {viirsYears.length > 0 && <div className="cal-era">VIIRS S-NPP, measured (375 m)</div>}
        {viirsYears.map((y, i) => row(y, i))}
        {modisYears.length > 0 && <div className="cal-era">MODIS Aqua, converted to VIIRS equivalent (1 km)</div>}
        {modisYears.map((y, i) => row(y, viirsYears.length + i))}

        <div className="cal-sep" />
        <div className="cal-y">Median</div>
        {data.climatology.map((c) => (
          <div
            key={c.month}
            className="cal-c"
            data-lit={hover?.month === c.month}
            style={markStyle(mode === 'count' ? scale.mark(c.median) : anomalyMark(1))}
            onMouseMove={(e) =>
              show(
                e,
                <>
                  <div className="tip-title">
                    {MONTHS_LONG[c.month - 1]}, baseline {data.baseline[0]} to {data.baseline[1]}
                  </div>
                  <div className="tip-big num">{fmt(c.median)} hotspots</div>
                  <div className="tip-row">
                    typical range (p25 to p75) <b className="num">{fmt(c.p25)} to {fmt(c.p75)}</b>
                  </div>
                  <div className="tip-row">
                    record <b className="num">{fmt(c.max)} ({c.max_year})</b>
                  </div>
                </>,
              )
            }
            onMouseLeave={hide}
          />
        ))}
        <div className="cal-bar">
          <span>{data.baseline[0]} to {data.baseline[1]}</span>
        </div>
      </div>

      <div className="cal-legend">
        <div className="legend-marks">
          <span>{mode === 'count' ? 'Hotspots in the month' : 'Relative to the median'}</span>
          {(mode === 'count'
            ? scale.legend.map((l) => ({ mark: l.mark, label: fmtCompact(l.value) }))
            : ANOMALY_LEGEND
          ).map((l) => (
            <span key={l.label} className="legend-mark">
              <i className="cal-c" style={markStyle(l.mark)} />
              <span className="num">{l.label}</span>
            </span>
          ))}
        </div>
        <div className="legend-keys">
          <span className="legend-key">
            <i className="cal-c" data-partial="true" style={markStyle({ size: 0.5, color: SERIES.accent })} /> month in progress
          </span>
        </div>
      </div>
      <Tooltip tip={tip} />
    </div>
  )
})
