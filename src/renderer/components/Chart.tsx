import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { BarChart, LineChart } from 'echarts/charts'
import {
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsCoreOption } from 'echarts/core'

// Gráfico ECharts com o tema dos tokens (eixos, grade, tooltip e fonte). Quem usa passa só
// séries e eixos; as cores das séries vêm de `chartColors()`.

echarts.use([
  BarChart,
  LineChart,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
  CanvasRenderer,
])

function token(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

export function chartColors() {
  return {
    accent: token('--accent', '#22d3ee'),
    series2: token('--series-2', '#93c5fd'),
    ok: token('--ok', '#34d399'),
    warn: token('--warn', '#fbbf24'),
    danger: token('--danger', '#f87171'),
    muted: token('--text-muted', '#8d97a7'),
    text: token('--text', '#e6eaf0'),
    line: 'rgba(255,255,255,0.08)',
  }
}

function theme(): EChartsCoreOption {
  const c = chartColors()
  const axis = {
    axisLine: { lineStyle: { color: c.line } },
    axisTick: { show: false },
    axisLabel: { color: c.muted, fontSize: 11 },
    splitLine: { lineStyle: { color: c.line } },
  }
  return {
    textStyle: { fontFamily: 'Geist Variable, system-ui, sans-serif', color: c.text },
    grid: { left: 8, right: 12, top: 16, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: token('--surface', '#10141b'),
      borderColor: 'rgba(255,255,255,0.14)',
      textStyle: { color: c.text },
    },
    xAxis: axis,
    yAxis: axis,
  }
}

export function Chart({
  option,
  label,
  height = 220,
}: {
  option: EChartsCoreOption
  label: string
  height?: number
}): React.JSX.Element {
  const el = useRef<HTMLDivElement>(null)
  const chart = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!el.current) return
    const instance = echarts.init(el.current)
    chart.current = instance
    const resize = new ResizeObserver(() => instance.resize())
    resize.observe(el.current)
    return () => {
      resize.disconnect()
      instance.dispose()
      chart.current = null
    }
  }, [])

  // atualiza no mesmo canvas: o gráfico de progresso muda a cada poucos segundos
  useEffect(() => {
    const base = theme()
    chart.current?.setOption(
      {
        ...base,
        ...option,
        xAxis: { ...(base.xAxis as object), ...(option.xAxis as object) },
        yAxis: { ...(base.yAxis as object), ...(option.yAxis as object) },
      },
      { notMerge: true, lazyUpdate: true },
    )
  }, [option])

  return <div ref={el} role="img" aria-label={label} style={{ height }} className="w-full" />
}
