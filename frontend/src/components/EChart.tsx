import * as echarts from 'echarts'
import { useEffect, useRef } from 'react'

/** Wrapper minimo do ECharts com resize automatico. */
export function EChart({ option, height }: { option: echarts.EChartsOption; height: number }) {
  const el = useRef<HTMLDivElement>(null)
  const chart = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    chart.current = echarts.init(el.current!, null, { renderer: 'svg' })
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

  return <div ref={el} style={{ height, width: '100%' }} />
}

/** Base comum: eixos e grid recessivos, tooltip no tema. */
export const baseOption: echarts.EChartsOption = {
  backgroundColor: 'transparent',
  textStyle: { fontFamily: 'Inter Variable, system-ui, sans-serif', color: '#a9b0bc' },
  animationDuration: 400,
  tooltip: {
    trigger: 'axis',
    backgroundColor: 'rgba(21,25,32,0.97)',
    borderColor: '#313847',
    textStyle: { color: '#eef0f3', fontSize: 12 },
    axisPointer: { type: 'line', lineStyle: { color: '#6c7482', type: 'dashed' } },
  },
}

export const axisStyle = {
  axisLine: { lineStyle: { color: '#313847' } },
  axisTick: { show: false },
  axisLabel: { color: '#6c7482', fontSize: 11 },
  splitLine: { lineStyle: { color: '#1f242d' } },
}
