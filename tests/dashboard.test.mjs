import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Buffer } from 'node:buffer'
import { setImmediate } from 'node:timers'
import ts from 'typescript'
import { createRenderer, reactive, defineComponent, nextTick } from 'vue'
const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8')
let id = 0
const url = (source) =>
  'data:text/javascript;base64,' + Buffer.from(source + '\n// ' + ++id).toString('base64')
const transpile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
const vueUrl = import.meta.resolve('vue')
const stockUrl = url(transpile(await read('src/utils/stock.ts')))
const reportsUrl = url(
  transpile(
    (await read('src/utils/reports.ts')).replace("'@/utils/stock'", JSON.stringify(stockUrl)),
  ),
)
const utilsUrl = url(
  transpile(
    (await read('src/utils/dashboard.ts')).replace("'@/utils/reports'", JSON.stringify(reportsUrl)),
  ),
)
const utils = await import(utilsUrl),
  reports = await import(reportsUrl)
const period = { from: '2026-10-01', to: '2026-10-03', timezone: 'Asia/Ho_Chi_Minh' }
const filters = { ...period, page: 1, pageSize: 100 }
const allPermissions = ['REPORT_DASHBOARD_VIEW', 'REPORT_SALES_VIEW', 'REPORT_PAYMENT_VIEW']
const ctx = {
  auth: reactive({
    user: { id: 'u1', permissions: allPermissions },
    isCatalogAdmin: false,
    getUserInfo: async () => {
      ctx.identities++
      ctx.auth.user.permissions = ctx.serverPermissions
    },
  }),
  warehouses: reactive({
    loaded: true,
    ownerId: 'u1',
    warehouses: [{ id: 'w1', code: 'W1', name: 'Kho 1', status: 1 }],
  }),
  calls: [],
  refreshes: 0,
  identities: 0,
}
globalThis.__businessDashboardTests = ctx
const mockUrl = url(`
import { computed } from '${vueUrl}'
const ctx = globalThis.__businessDashboardTests
export const useCatalogPermission = () => ({ can: permission => ctx.auth.isCatalogAdmin || !!ctx.auth.user?.permissions.includes(permission) })
export const useSalesScope = () => ({ auth: ctx.auth, warehouses: ctx.warehouses, can: useCatalogPermission().can, scopeKey: computed(() => JSON.stringify([ctx.auth.user, ctx.auth.isCatalogAdmin, ctx.warehouses])), refreshScope: async () => { ctx.refreshes++; ctx.warehouses.warehouses = [] } })
export const request = { get: async (url, config) => { ctx.calls.push({url, config}); const result = await ctx.handler(url, config); return config.transformResponse[0](typeof result === 'string' ? result : JSON.stringify(result)) } }
`)
const apiUrl = url(
  transpile(
    (await read('src/api/reports/dashboard.api.ts'))
      .replace("'@/utils/request'", JSON.stringify(mockUrl))
      .replace("'@/utils/stock'", JSON.stringify(stockUrl))
      .replace("'@/composables/useCatalogPermission'", JSON.stringify(mockUrl))
      .replace("'@/utils/reports'", JSON.stringify(reportsUrl))
      .replace("'@/utils/dashboard'", JSON.stringify(utilsUrl)),
  ),
)
const api = await import(apiUrl)
const hookUrl = url(
  transpile(
    (await read('src/composables/useBusinessDashboard.ts'))
      .replace("'vue'", JSON.stringify(vueUrl))
      .replace("'@/composables/useSalesScope'", JSON.stringify(mockUrl))
      .replace("'@/api/reports/dashboard.api'", JSON.stringify(apiUrl))
      .replace("'@/utils/reports'", JSON.stringify(reportsUrl)),
  ),
)
const { useBusinessDashboard } = await import(hookUrl)
const renderer = createRenderer({
  createElement: () => ({}),
  createComment: () => ({}),
  createText: () => ({}),
  insert() {},
  remove() {},
  setText() {},
  setElementText() {},
  parentNode() {},
  nextSibling() {},
  patchProp() {},
})
const flush = async () => {
  await new Promise((resolve) => setImmediate(resolve))
  await nextTick()
}
const salesPage = (items = [], total = items.length, page = 1) => ({
  items,
  total,
  page,
  pageSize: 100,
  period,
  summary: {},
})
const reset = (permissions = allPermissions) => {
  ctx.calls = []
  ctx.refreshes = 0
  ctx.identities = 0
  ctx.serverPermissions = []
  ctx.auth.user = { id: 'u1', permissions: [...permissions] }
  ctx.auth.isCatalogAdmin = false
  Object.assign(ctx.warehouses, {
    loaded: true,
    ownerId: 'u1',
    warehouses: [{ id: 'w1', code: 'W1', name: 'Kho 1', status: 1 }],
  })
  ctx.handler = async (endpoint) =>
    endpoint.endsWith('/trends')
      ? { generatedAt: '2026-10-21T03:00:00Z', period, items: [] }
      : endpoint.endsWith('/sales')
        ? salesPage()
        : {
            generatedAt: '2026-10-21T03:00:00Z',
            period,
            periodSections: {
              sales: { netSalesAmount: 10 },
              payments: {
                netRecordedAmount: 5,
                netRefundedAmount: -2,
                recordedCashAmount: 3,
                recordedBankTransferAmount: 7,
              },
            },
          }
}
const mount = () => {
  let state
  const app = renderer.createApp(
    defineComponent({
      setup() {
        state = useBusinessDashboard()
        return () => null
      },
    }),
  )
  app.mount({})
  return {
    get state() {
      return state
    },
    unmount: () => app.unmount(),
  }
}

test('Vietnam presets and trends inclusive 366 limit do not restrict other reports', () => {
  assert.deepEqual(reports.reportRange('week', new Date('2026-10-20T18:00:00Z')), {
    from: '2026-10-15',
    to: '2026-10-21',
  })
  assert.deepEqual(reports.reportRange('month', new Date('2026-10-20T18:00:00Z')), {
    from: '2026-10-01',
    to: '2026-10-21',
  })
  assert.doesNotThrow(() => utils.trendsQuery({ ...filters, from: '2025-10-21', to: '2026-10-21' }))
  assert.throws(() => utils.trendsQuery({ ...filters, from: '2025-10-20', to: '2026-10-21' }), {
    code: 'REPORT_PERIOD_TOO_LARGE',
  })
  assert.doesNotThrow(() =>
    reports.reportQuery('sales', { ...filters, from: '2025-10-20', to: '2026-10-21' }),
  )
  for (const from of ['', '2026-02-30', '2026-10-22'])
    assert.throws(() => utils.trendsQuery({ ...filters, from }))
  assert.deepEqual(utils.trendsQuery(filters), { from: period.from, to: period.to })
})
test('exact scaling, signed long and exact original tooltip survive chart conversion', () => {
  const raw = -9223372036854775807n
  assert.equal(utils.chartNumber(1234567n, 1000000n), 1.234567)
  assert.equal(utils.chartNumber(-1n, 1000000n), -0.000001)
  assert.equal(utils.chartNumber(raw, 1000000000n), Number('-9223372036.854775807'))
  assert.throws(() => utils.chartNumber(Number.MAX_SAFE_INTEGER + 1, 1000000n))
  const chart = utils.trendOption({
    period,
    items: [{ date: period.from, sales: { netSalesAmount: raw } }],
  })
  assert.equal(chart.yAxis.name, 'tỷ VND')
  assert.equal(chart.yAxis.max({ max: -1 }), 0)
  assert.match(
    chart.tooltip.formatter([{ dataIndex: 0, seriesName: 'Giá trị bán ròng' }]),
    /-9\.223\.372\.036\.854\.775\.807 VND/,
  )
  assert.equal(chart.series[0].markLine.data[0].yAxis, 0)
})
test('missing dates and unauthorized series remain gaps without manufactured zeros', () => {
  const chart = utils.trendOption({
    period,
    items: [
      { date: period.from, sales: { netSalesAmount: 0 } },
      { date: period.to, sales: { netSalesAmount: -100 } },
    ],
  })
  assert.deepEqual(chart.series[0].data, [0, null, -0.0001])
  assert.equal(chart.series.length, 1)
  assert.equal(chart.series[0].connectNulls, false)
  assert.equal(chart.tooltip.formatter([{ dataIndex: 1, seriesName: 'Giá trị bán ròng' }]), '')
})
test('recorded donut uses gross created receipts, exact ratios and supports a zero total', () => {
  const data = {
    recordedCashAmount: 1,
    recordedBankTransferAmount: 3,
    netRecordedAmount: -999,
    netCashAmount: -100,
  }
  const donut = utils.recordedComposition(data)
  assert.equal(donut.total, 4n)
  assert.equal(donut.items[0].percent, '25,00%')
  assert.equal(donut.items[1].percent, '75,00%')
  assert.equal(
    utils.recordedComposition({ recordedCashAmount: 0, recordedBankTransferAmount: 0 }).total,
    0n,
  )
  assert.equal(utils.donutOption(data).series[0].stillShowZeroSum, false)
  const huge = utils.recordedComposition({
    recordedCashAmount: 9223372036854775807n,
    recordedBankTransferAmount: 9223372036854775807n,
  })
  assert.equal(huge.total, 18446744073709551614n)
  assert.equal(huge.items[0].percent, '50,00%')
  assert.throws(() =>
    utils.recordedComposition({ recordedCashAmount: -1, recordedBankTransferAmount: 1 }),
  )
})
test('all warehouse pages are loaded before top 10; negative magnitude and exact sorting', async () => {
  reset()
  const rows = Array.from({ length: 205 }, (_, i) => ({
    warehouseId: 'w' + i,
    warehouseName: 'Kho ' + i,
    warehouseCode: 'K' + i,
    netSalesAmount: i === 204 ? -9223372036854775807n : BigInt(i),
  }))
  ctx.handler = async (_url, config) => {
    const page = config.params.page
    return JSON.stringify(
      salesPage(rows.slice((page - 1) * 100, page * 100), 205, page),
      (_key, value) => (typeof value === 'bigint' ? '__integer__' + value : value),
    ).replace(/"__integer__(-?\d+)"/g, '$1')
  }
  const result = await api.getAllWarehouseSales(filters)
  assert.equal(result.length, 205)
  assert.deepEqual(
    ctx.calls.map((call) => call.config.params.page),
    [1, 2, 3],
  )
  const top = utils.warehouseTop(result)
  assert.equal(top.length, 10)
  assert.equal(top[0].warehouseId, 'w204')
  assert.equal(top[1].warehouseId, 'w203')
  assert.ok(utils.warehouseOption(result).series[0].data[0] < 0)
})
test('pagination failures and aborted scope never present a partial all-warehouse result', async () => {
  reset()
  ctx.handler = async (_url, config) =>
    salesPage(config.params.page === 1 ? [{ warehouseId: 'w1' }] : [], 2, config.params.page)
  await assert.rejects(api.getAllWarehouseSales(filters), /phân trang/)
  reset()
  const controller = new AbortController()
  ctx.handler = async () => {
    controller.abort()
    return salesPage([{ warehouseId: 'w1' }], 2)
  }
  await assert.rejects(api.getAllWarehouseSales(filters, controller.signal))
  assert.equal(ctx.calls.length, 1)
})
test('API permission checks prevent unauthorized calls, verified Admin keeps exception', async () => {
  reset([])
  assert.throws(() => api.getDashboard(filters), { code: 'FORBIDDEN' })
  assert.throws(() => api.getDashboardTrends(filters), { code: 'FORBIDDEN' })
  await assert.rejects(api.getAllWarehouseSales(filters), { code: 'FORBIDDEN' })
  assert.equal(ctx.calls.length, 0)
  ctx.auth.isCatalogAdmin = true
  await api.getDashboard(filters)
  assert.equal(ctx.calls.length, 1)
})
test('dashboard-only user loads one request and keeps absent sections absent', async () => {
  reset(['REPORT_DASHBOARD_VIEW'])
  ctx.handler = async () => ({ generatedAt: '', period })
  const subject = mount()
  await flush()
  assert.equal(ctx.calls.length, 1)
  assert.equal(subject.state.summary.value.data.periodSections, undefined)
  assert.equal(subject.state.trends.value.data, undefined)
  subject.unmount()
})
test('panel failure and retry are independent of KPI and warehouse results', async () => {
  reset()
  const base = ctx.handler
  ctx.handler = async (endpoint, config) => {
    if (endpoint.endsWith('/trends')) throw new Error('Trends unavailable')
    return base(endpoint, config)
  }
  const subject = mount()
  await flush()
  assert.equal(subject.state.summary.value.data.periodSections.sales.netSalesAmount, 10)
  assert.match(subject.state.trends.value.error, /unavailable/)
  assert.deepEqual(subject.state.sales.value.data, [])
  ctx.handler = base
  await subject.state.retryTrends()
  assert.ok(subject.state.trends.value.data)
  assert.equal(ctx.calls.filter((call) => call.url === '/reports/dashboard').length, 1)
  subject.unmount()
})
test('filter snapshots abort old responses, clear immediately and batch date changes', async () => {
  reset()
  const base = ctx.handler
  let resolveOld
  ctx.handler = (endpoint, config) =>
    endpoint === '/reports/dashboard'
      ? new Promise((resolve) => {
          resolveOld = resolve
        })
      : base(endpoint, config)
  const subject = mount()
  await flush()
  const firstSignal = ctx.calls[0].config.signal
  ctx.handler = base
  Object.assign(subject.state.filters, { from: '2026-10-02', to: '2026-10-04', warehouseId: 'w1' })
  assert.equal(firstSignal.aborted, true)
  assert.equal(subject.state.summary.value.data, undefined)
  await flush()
  resolveOld({ period, periodSections: { sales: { netSalesAmount: 999 } } })
  await flush()
  assert.equal(subject.state.summary.value.data.periodSections.sales.netSalesAmount, 10)
  assert.deepEqual(
    ctx.calls.filter((call) => call.url === '/reports/dashboard').at(-1).config.params,
    { from: '2026-10-02', to: '2026-10-04', warehouseId: 'w1' },
  )
  assert.equal(ctx.calls.filter((call) => call.url === '/reports/dashboard').length, 2)
  subject.unmount()
})
test('warehouse revocation on 403 clears all results, refreshes scope, and avoids retry loops', async () => {
  reset()
  const subject = mount()
  await flush()
  subject.state.filters.warehouseId = 'w1'
  await flush()
  ctx.handler = async () => {
    throw Object.assign(new Error('Denied'), { status: 403, code: 'WAREHOUSE_ACCESS_DENIED' })
  }
  await subject.state.refresh()
  await flush()
  assert.equal(ctx.refreshes, 1)
  assert.equal(subject.state.filters.warehouseId, undefined)
  assert.equal(subject.state.summary.value.data, undefined)
  assert.match(subject.state.accessError.value, /Quyền/)
  const count = ctx.calls.length
  await flush()
  await flush()
  assert.equal(ctx.calls.length, count)
  assert.equal(subject.state.busy.value, false)
  subject.unmount()
})
test('permission revocation refreshes identity once without a dashboard API loop', async () => {
  reset()
  const subject = mount()
  await flush()
  ctx.handler = async () => {
    throw Object.assign(new Error('Denied'), { status: 403, code: 'FORBIDDEN' })
  }
  await subject.state.refresh()
  await flush()
  assert.equal(ctx.identities, 1)
  assert.equal(subject.state.authorized.value, false)
  assert.equal(subject.state.summary.value.data, undefined)
  const count = ctx.calls.length
  await flush()
  assert.equal(ctx.calls.length, count)
  subject.unmount()
})
test('user changes, local permission removal, unmount and invalid filters reject stale results', async () => {
  for (const action of [
    () => {
      ctx.auth.user = null
    },
    () => {
      ctx.auth.user.permissions = []
    },
    (subject) => subject.unmount(),
    (subject) => {
      subject.state.filters.from = ''
    },
  ]) {
    reset()
    let finish
    const base = ctx.handler
    ctx.handler = (endpoint, config) =>
      endpoint === '/reports/dashboard'
        ? new Promise((resolve) => {
            finish = resolve
          })
        : base(endpoint, config)
    const subject = mount()
    await flush()
    const signal = ctx.calls[0].config.signal
    action(subject)
    assert.equal(signal.aborted, true)
    finish({ period, periodSections: { sales: { netSalesAmount: 999 } } })
    await flush()
    assert.equal(subject.state.summary.value.data, undefined)
    subject.unmount()
  }
})
test('trends oversized period fails alone and never hits its API', async () => {
  reset()
  const subject = mount()
  await flush()
  Object.assign(subject.state.filters, { from: '2025-01-01', to: '2026-10-21' })
  await flush()
  assert.match(subject.state.trends.value.error, /366/)
  assert.ok(subject.state.summary.value.data)
  assert.equal(ctx.calls.filter((call) => call.url.endsWith('/trends')).length, 1)
  subject.unmount()
})
