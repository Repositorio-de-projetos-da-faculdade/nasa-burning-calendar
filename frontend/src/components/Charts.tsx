import type { EChartsOption } from 'echarts'
import { useMemo, useState } from 'react'
import type { CalendarData, ValidationData } from '../lib/api'
import { missingMonths } from '../lib/coverage'
import { fmt, MONTHS } from '../lib/format'
import { heat, INK, SERIES } from '../lib/scales'
import { axisStyle, baseOption, EChart } from './EChart'

type TipParam = { seriesName: string; value: number | null; marker: string; axisValueLabel: string }

const tipRows = (params: TipParam[], skip: string[] = []) =>
  `<div style="font-weight:600;margin-bottom:4px">${params[0]?.axisValueLabel ?? ''}</div>` +
  params
    .filter((p) => !skip.includes(p.seriesName) && p.value != null)
    .map(
      (p) =>
        `<div style="display:flex;justify-content:space-between;gap:16px">${p.marker}<span style="flex:1;color:${INK.text}">${p.seriesName}</span><b>${fmt(p.value)}</b></div>`,
    )
    .join('')

/** Ano atual vs. faixa historica, mes a mes. */
export function SeasonChart({ data }: { data: CalendarData }) {
  // o recorde estica a escala e achata o ano corrente: fica fora até pedirem
  const [showPeak, setShowPeak] = useState(false)
  const option = useMemo<EChartsOption>(() => {
    const cur = data.current.year
    const peak = data.summary.peak_year
    const byYM = new Map(data.series.map((c) => [`${c.year}-${c.month}`, c.harmonized]))
    const gap = missingMonths(data)
    const line = (y: number) => MONTHS.map((_, i) => (y === cur && gap.includes(i + 1) ? null : (byYM.get(`${y}-${i + 1}`) ?? null)))
    const p25 = data.climatology.map((c) => c.p25)
    const iqr = data.climatology.map((c) => c.p75 - c.p25)
    return {
      ...baseOption,
      grid: { left: 52, right: 12, top: 12, bottom: 28 },
      tooltip: {
        ...(baseOption.tooltip as object),
        formatter: (p: unknown) => tipRows(p as TipParam[], ['_p25', 'Faixa típica (p25–p75)']),
      },
      xAxis: { type: 'category', data: MONTHS, boundaryGap: false, ...axisStyle, splitLine: { show: false } },
      yAxis: { type: 'value', ...axisStyle, axisLabel: { ...axisStyle.axisLabel, formatter: (v: number) => fmt(v) } },
      series: [
        { name: '_p25', type: 'line', data: p25, stack: 'band', lineStyle: { opacity: 0 }, symbol: 'none', silent: true },
        {
          name: 'Faixa típica (p25–p75)', type: 'line', data: iqr, stack: 'band', symbol: 'none',
          lineStyle: { opacity: 0 }, areaStyle: { color: 'rgba(161,161,166,0.14)' }, silent: true,
        },
        {
          name: `Mediana ${data.baseline[0]}–${data.baseline[1]}`, type: 'line', symbol: 'none',
          data: data.climatology.map((c) => c.median), lineStyle: { color: INK.text, width: 2, type: 'dashed' },
          itemStyle: { color: INK.text },
        },
        ...(showPeak && peak && peak !== cur
          ? [{
              name: `${peak} (ano recorde)`, type: 'line' as const, symbol: 'none', data: line(peak),
              lineStyle: { color: INK.hi, width: 1 }, itemStyle: { color: INK.hi },
            }]
          : []),
        {
          name: String(cur), type: 'line', data: line(cur), symbol: 'circle', symbolSize: 6,
          lineStyle: { color: SERIES.accent, width: 2 },
          itemStyle: { color: SERIES.accent, borderColor: INK.surface, borderWidth: 2 },
          z: 10,
        },
      ],
    }
  }, [data, showPeak])

  const peak = data.summary.peak_year
  return (
    <div>
      <div className="chart-legend">
        <span><i style={{ background: SERIES.accent }} />{data.current.year}</span>
        {peak && peak !== data.current.year && (
          <button className="legend-toggle" aria-pressed={showPeak} onClick={() => setShowPeak(!showPeak)}>
            <i style={{ background: INK.hi }} />{peak} (recorde)
          </button>
        )}
        <span style={{ color: INK.text }}><i className="dash" style={{ background: INK.text }} />mediana</span>
        <span><i className="band" style={{ background: INK.text }} />faixa típica</span>
      </div>
      <EChart option={option} height={240} />
    </div>
  )
}

/** Total anual harmonizado; faixa sobre os anos MODIS, ano corrente parcial. */
export function AnnualChart({ data, onPick }: { data: CalendarData; onPick: (y: number) => void }) {
  const { med, option } = useMemo(() => {
    const complete = data.annual.filter((a) => !a.partial && a.year >= data.baseline[0]).map((a) => a.total).sort((a, b) => a - b)
    const med = complete.length ? complete[Math.floor(complete.length / 2)] : 0
    const converted = data.annual.filter((a) => a.converted).map((a) => String(a.year))
    const option: EChartsOption = {
      ...baseOption,
      grid: { left: 52, right: 12, top: 16, bottom: 28 },
      tooltip: {
        ...(baseOption.tooltip as object),
        axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(255,255,255,0.04)' } },
        formatter: (p: unknown) => {
          const [first] = p as { dataIndex: number }[]
          const a = data.annual[first.dataIndex]
          return `<div style="font-weight:600">${a.year}${a.partial ? ' (parcial)' : ''}</div>
            <div style="font-size:18px;font-weight:650">${fmt(a.total)} focos</div>
            <div style="color:${INK.text}">${a.converted ? 'MODIS Aqua convertido' : 'VIIRS S-NPP medido'}</div>`
        },
      },
      xAxis: {
        type: 'category', data: data.annual.map((a) => String(a.year)), ...axisStyle, splitLine: { show: false },
        axisLabel: { ...axisStyle.axisLabel, hideOverlap: true },
      },
      yAxis: { type: 'value', ...axisStyle, axisLabel: { ...axisStyle.axisLabel, formatter: (v: number) => fmt(v) } },
      series: [{
        type: 'bar', barCategoryGap: '25%',
        data: data.annual.map((a) => ({
          value: a.total,
          itemStyle: {
            color: heat(a.total / Math.max(1, ...data.annual.map((x) => x.total))),
            opacity: a.partial ? 0.45 : 1,
            borderRadius: [2, 2, 0, 0],
          },
        })),
        markLine: {
          silent: true, symbol: 'none',
          lineStyle: { color: INK.text, type: 'dashed' },
          label: { show: false },
          data: [{ yAxis: med }],
        },
        markArea: {
          silent: true, itemStyle: { color: 'rgba(255,255,255,0.04)' },
          label: { show: false },
          data: converted.length ? [[{ xAxis: converted[0] }, { xAxis: converted[converted.length - 1] }]] : [],
        },
      }],
    }
    return { med, option }
  }, [data])

  return (
    <div>
      <div className="chart-legend">
        <span style={{ color: INK.text }}><i className="dash" style={{ background: INK.text }} />mediana {fmt(med)}</span>
        <span><i className="band" style={{ background: INK.text }} />anos MODIS convertidos</span>
      </div>
      <EChart option={option} height={240} onClick={(i) => onPick(data.annual[i].year)} />
    </div>
  )
}

/** Validacao da harmonizacao na sobreposicao (Amazonia inteira). */
export function ValidationChart({ data }: { data: ValidationData }) {
  const option = useMemo<EChartsOption>(() => {
    const labels = data.rows.map((r) => `${MONTHS[r.month - 1]} ${r.year}`)
    const s = (name: string, key: 'modis_raw' | 'viirs_raw' | 'modis_harmonized', color: string, dashed = false) => ({
      name, type: 'line' as const, symbol: 'none', data: data.rows.map((r) => r[key]),
      lineStyle: { color, width: 2, type: dashed ? ('dashed' as const) : ('solid' as const) },
      itemStyle: { color },
    })
    const [c0, c1] = data.calibration_years
    const i1 = data.rows.findIndex((r) => r.year > c1)
    return {
      ...baseOption,
      grid: { left: 60, right: 12, top: 16, bottom: 28 },
      tooltip: { ...(baseOption.tooltip as object), formatter: (p: unknown) => tipRows(p as TipParam[]) },
      xAxis: {
        type: 'category', data: labels, boundaryGap: false, ...axisStyle, splitLine: { show: false },
        axisLabel: { ...axisStyle.axisLabel, interval: (i: number) => data.rows[i].month === 1 && data.rows[i].year % 2 === 0, formatter: (v: string) => v.split(' ')[1] },
      },
      yAxis: { type: 'value', ...axisStyle, axisLabel: { ...axisStyle.axisLabel, formatter: (v: number) => fmt(v) } },
      series: [
        s('VIIRS S-NPP (referência)', 'viirs_raw', SERIES.viirs),
        s('MODIS Aqua bruto', 'modis_raw', SERIES.modis),
        {
          ...s('MODIS harmonizado', 'modis_harmonized', SERIES.accent, true),
          markArea: i1 > 0 ? {
            silent: true, itemStyle: { color: 'rgba(255,255,255,0.03)' },
            label: { color: INK.muted, fontSize: 11, position: 'insideTop' },
            data: [[{ name: `calibração ${c0}–${c1}`, xAxis: 0 }, { xAxis: i1 - 1 }], [{ name: 'teste (fora da amostra)', xAxis: i1 }, { xAxis: labels.length - 1 }]],
          } : undefined,
        },
      ],
    }
  }, [data])

  return (
    <div>
      <div className="chart-legend">
        <span><i style={{ background: SERIES.viirs }} />VIIRS S-NPP (referência)</span>
        <span><i style={{ background: SERIES.modis }} />MODIS Aqua bruto</span>
        <span style={{ color: SERIES.accent }}><i className="dash" style={{ background: SERIES.accent }} /><span style={{ color: INK.text }}>MODIS harmonizado</span></span>
      </div>
      <EChart option={option} height={240} />
    </div>
  )
}
