<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { init, use, type EChartsType, type EChartsCoreOption } from 'echarts/core'
import { LineChart, PieChart, BarChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  AriaComponent,
} from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
use([
  LineChart,
  PieChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  AriaComponent,
  SVGRenderer,
])
const props = defineProps<{ option: EChartsCoreOption; label: string }>()
const element = ref<HTMLDivElement>()
let chart: EChartsType | undefined
let observer: ResizeObserver | undefined
let frame: number | undefined
const render = (): void => {
  chart?.setOption(
    { ...props.option, animation: false, aria: { enabled: true, description: props.label } },
    { notMerge: true },
  )
}
onMounted(() => {
  if (!element.value) return
  chart = init(element.value, undefined, { renderer: 'svg' })
  render()
  observer = new ResizeObserver(() => {
    if (frame !== undefined) cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      chart?.resize()
      frame = undefined
    })
  })
  observer.observe(element.value)
})
watch(() => props.option, render)
onBeforeUnmount(() => {
  observer?.disconnect()
  if (frame !== undefined) cancelAnimationFrame(frame)
  chart?.dispose()
  chart = undefined
})
</script>
<template><div ref="element" class="dashboard-chart" role="img" :aria-label="label" /></template>
<style scoped>
.dashboard-chart {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 240px;
}
</style>
