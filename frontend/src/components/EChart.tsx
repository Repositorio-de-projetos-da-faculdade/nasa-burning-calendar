import * as echarts from 'echarts'
import { useEffect, useRef } from 'react'
import { INK } from '../lib/scales'

/** Wrapper minimo do ECharts com resize automatico; onClick recebe o indice do dado clicado. */
export function EChart({ option, height, onClick }: { option: echarts.EChartsOption; height: number; onClick?: (i: number) => void }) {
  const el = useRef<HTMLDivElement>(null)
  const chart = useRef<echarts.ECharts | null>(null)
  const cb = useRef(onClick)
  cb.current = onClick

  useEffect(() => {
    chart.current = echarts.init(el.current!, null, { renderer: 'svg' })
    chart.current.on('click', (p) => cb.current?.(p.dataIndex))
    const ro = new ResizeObserver(() => chart.current?.resize())
    ro.observe(el.current!)
    return () => {
      ro.disconnect()
      chart.current?.dispose()
    }
  }, [])

  useEffect(() => {
    chart.current?.setOption(option, true)
  }, [option])

  return <div ref={el} style={{ height, width: '100%', cursor: onClick ? 'pointer' : undefined }} />
}

/** Base comum: eixos e grid recessivos, tooltip no tema. */
export const baseOption: echarts.EChartsOption = {
  backgroundColor: 'transparent',
  textStyle: { fontFamily: 'Geist Variable, system-ui, sans-serif', color: INK.text },
  animationDuration: 700,
  animationEasing: 'cubicOut',
  tooltip: {
    trigger: 'axis',
    backgroundColor: 'rgba(21,18,15,0.96)',
    borderColor: INK.line,
    padding: [10, 12],
    extraCssText: 'border-radius:12px;box-shadow:0 18px 44px rgba(0,0,0,.6);backdrop-filter:blur(14px)',
    textStyle: { color: INK.hi, fontSize: 12 },
    axisPointer: { type: 'line', lineStyle: { color: INK.muted, type: 'dashed' } },
  },
}

export const axisStyle = {
  axisLine: { lineStyle: { color: INK.line } },
  axisTick: { show: false },
  axisLabel: { color: INK.muted, fontSize: 11, fontFamily: 'Geist Mono Variable, monospace' },
  splitLine: { lineStyle: { color: INK.grid } },
}
