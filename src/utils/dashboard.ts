import type {
  ReportFilters,
  DashboardTrends,
  SalesSummary,
  WarehouseFields,
  PaymentSummary,
} from '@/types/reports'
import type { StockInteger } from '@/types/stock'
import { reportQuery, reportValue } from '@/utils/reports'

export const dashboardColors = { sales: '#7861df', payments: '#27aaa1', refunds: '#e78a38' }
export const trendsQuery = (filters: ReportFilters): Record<string, string | number> => {
  const query = reportQuery('dashboard', filters)
  const days =
    (Date.parse(filters.to + 'T00:00:00Z') - Date.parse(filters.from + 'T00:00:00Z')) / 86400000 + 1
  if (days > 366)
    throw Object.assign(new Error('Chọn tối đa 366 ngày, tính cả hai đầu.'), {
      code: 'REPORT_PERIOD_TOO_LARGE',
    })
  return query
}
export const exact = (value: StockInteger): bigint => {
  if (typeof value === 'number' && !Number.isSafeInteger(value))
    throw new Error('Số nguyên không an toàn từ API.')
  return BigInt(value)
}
// Divide in integer space first; only the scaled decimal coordinate becomes a Number.
export const chartNumber = (value: StockInteger, divisor: bigint): number => {
  const raw = exact(value),
    negative = raw < 0n,
    absolute = negative ? -raw : raw
  const whole = absolute / divisor,
    remainder = absolute % divisor
  return Number(
    `${negative ? '-' : ''}${whole}.${remainder.toString().padStart(divisor.toString().length - 1, '0')}`,
  )
}
export const chartUnit = (values: StockInteger[]): { divisor: bigint; label: string } =>
  values.some((value) => exact(value) >= 1000000000n || exact(value) <= -1000000000n)
    ? { divisor: 1000000000n, label: 'tỷ VND' }
    : { divisor: 1000000n, label: 'triệu VND' }
export const warehouseTop = (
  rows: (SalesSummary & WarehouseFields)[],
): (SalesSummary & WarehouseFields)[] =>
  [...rows]
    .sort((a, b) => {
      const av = exact(a.netSalesAmount),
        bv = exact(b.netSalesAmount)
      const difference = (bv < 0n ? -bv : bv) - (av < 0n ? -av : av)
      return difference > 0n ? 1 : difference < 0n ? -1 : a.warehouseId.localeCompare(b.warehouseId)
    })
    .slice(0, 10)
export const recordedComposition = (payments: PaymentSummary) => {
  const cash = exact(payments.recordedCashAmount),
    bank = exact(payments.recordedBankTransferAmount)
  if (cash < 0n || bank < 0n)
    throw new Error('Khoản thu ghi nhận phải không âm. Cần kiểm tra dữ liệu API.')
  const total = cash + bank
  const percent = (value: bigint): string => {
    if (total === 0n) return '0%'
    const hundredths = (value * 10000n + total / 2n) / total
    return `${hundredths / 100n},${(hundredths % 100n).toString().padStart(2, '0')}%`
  }
  return {
    total,
    items: [
      { name: 'Tiền mặt', raw: cash, percent: percent(cash) },
      { name: 'Chuyển khoản', raw: bank, percent: percent(bank) },
    ],
  }
}
export const timestampVN = (value?: string): string =>
  value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—'
// Coordinates may be approximate; exact business values remain in tooltips/tables.
const axisValue = (value: number): string =>
  Math.abs(value) >= 1000000
    ? value.toExponential(1).replace('.', ',')
    : value.toLocaleString('vi-VN', { maximumFractionDigits: 2 })
const zeroLine = {
  silent: true,
  symbol: 'none',
  label: { show: false },
  lineStyle: { color: '#98a0b6', type: 'solid' },
  data: [{ yAxis: 0 }],
}
export const trendOption = (result: DashboardTrends) => {
  // Missing API days are explicit gaps, never synthetic zero business values.
  const byDate = new Map(result.items.map((item) => [item.date, item]))
  const dates: string[] = []
  for (
    let day = Date.parse(result.period.from + 'T00:00:00Z');
    day <= Date.parse(result.period.to + 'T00:00:00Z') && dates.length < 366;
    day += 86400000
  )
    dates.push(new Date(day).toISOString().slice(0, 10))
  const points = dates.map((date) => byDate.get(date))
  const definitions = [
    {
      key: 'sales' as const,
      metric: 'netSalesAmount' as const,
      name: 'Giá trị bán ròng',
      color: dashboardColors.sales,
      symbol: 'circle',
    },
    {
      key: 'payments' as const,
      metric: 'netRecordedAmount' as const,
      name: 'Thu ròng',
      color: dashboardColors.payments,
      symbol: 'diamond',
    },
  ]
  const values = result.items.flatMap((item) =>
    [item.sales?.netSalesAmount, item.payments?.netRecordedAmount].filter(
      (value): value is StockInteger => value !== undefined,
    ),
  )
  const unit = chartUnit(values)
  const series = definitions
    .filter((definition) => result.items.some((item) => item[definition.key] !== undefined))
    .map((definition) => ({
      name: definition.name,
      type: 'line',
      smooth: false,
      connectNulls: false,
      symbol: definition.symbol,
      symbolSize: 6,
      lineStyle: { color: definition.color, width: 2 },
      itemStyle: { color: definition.color },
      areaStyle: { color: definition.color, opacity: 0.07 },
      data: points.map((item) => {
        const raw =
          definition.key === 'sales'
            ? item?.sales?.netSalesAmount
            : item?.payments?.netRecordedAmount
        return raw === undefined ? null : chartNumber(raw, unit.divisor)
      }),
      markLine: zeroLine,
    }))
  return {
    color: [dashboardColors.sales, dashboardColors.payments],
    animation: false,
    legend: { bottom: 0, left: 0, itemGap: 20, textStyle: { color: '#47516b' } },
    grid: { left: 12, right: 18, top: 40, bottom: 58, containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: dates,
      axisLabel: {
        hideOverlap: true,
        formatter: (value: string) => value.slice(8) + '/' + value.slice(5, 7),
      },
      axisTick: { show: false },
      axisLine: { show: false },
    },
    yAxis: {
      type: 'value',
      name: unit.label,
      axisLabel: { formatter: axisValue, hideOverlap: true },
      splitNumber: 4,
      min: (extent: { min: number }) => Math.min(extent.min, 0),
      max: (extent: { max: number }) => Math.max(extent.max, 0),
      splitLine: { lineStyle: { color: '#edf0f7' } },
    },
    tooltip: {
      trigger: 'axis',
      renderMode: 'richText',
      confine: true,
      formatter: (params: { dataIndex: number; seriesName: string }[]) => {
        const item = points[params[0]?.dataIndex ?? -1]
        if (!item) return ''
        const lines = [item.date.split('-').reverse().join('/')]
        for (const param of params) {
          const raw =
            param.seriesName === 'Giá trị bán ròng'
              ? item.sales?.netSalesAmount
              : item.payments?.netRecordedAmount
          if (raw !== undefined) lines.push(`${param.seriesName}\n${reportValue(raw)} VND`)
        }
        return lines.join('\n')
      },
    },
    series,
  }
}
export const warehouseOption = (rows: (SalesSummary & WarehouseFields)[]) => {
  const top = warehouseTop(rows),
    unit = chartUnit(top.map((row) => row.netSalesAmount))
  return {
    animation: false,
    grid: { left: 8, right: 16, top: 12, bottom: 48, containLabel: true },
    xAxis: {
      type: 'value',
      name: unit.label,
      nameLocation: 'middle',
      nameGap: 30,
      splitNumber: 3,
      axisLabel: { formatter: axisValue, hideOverlap: true },
      min: (extent: { min: number }) => Math.min(extent.min, 0),
      max: (extent: { max: number }) => Math.max(extent.max, 0),
      splitLine: { lineStyle: { color: '#edf0f7' } },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: top.map((row) => row.warehouseName),
      axisLabel: { width: 105, overflow: 'truncate' },
      axisTick: { show: false },
      axisLine: { show: false },
    },
    tooltip: {
      trigger: 'item',
      renderMode: 'richText',
      confine: true,
      formatter: (param: { dataIndex: number }) => {
        const row = top[param.dataIndex]
        return row
          ? `${row.warehouseName} (${row.warehouseCode})\nGiá trị bán ròng\n${reportValue(row.netSalesAmount)} VND`
          : ''
      },
    },
    series: [
      {
        type: 'bar',
        barMaxWidth: 26,
        itemStyle: { color: dashboardColors.sales, borderRadius: 3 },
        data: top.map((row) => chartNumber(row.netSalesAmount, unit.divisor)),
        markLine: { ...zeroLine, data: [{ xAxis: 0 }] },
      },
    ],
  }
}
export const donutOption = (payments: PaymentSummary) => {
  const composition = recordedComposition(payments),
    unit = chartUnit(composition.items.map((item) => item.raw))
  return {
    animation: false,
    color: [dashboardColors.sales, dashboardColors.payments],
    tooltip: {
      trigger: 'item',
      renderMode: 'richText',
      confine: true,
      formatter: (param: { dataIndex: number }) => {
        const item = composition.items[param.dataIndex]
        return item ? `${item.name} (${item.percent})\n${reportValue(item.raw)} VND` : ''
      },
    },
    series: [
      {
        type: 'pie',
        radius: ['62%', '83%'],
        center: ['50%', '50%'],
        label: { show: false },
        emphasis: { scale: false },
        stillShowZeroSum: false,
        data: composition.items.map((item) => ({
          name: item.name,
          value: chartNumber(item.raw, unit.divisor),
        })),
      },
    ],
  }
}
