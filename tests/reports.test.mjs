/* eslint-disable vue/one-component-per-file -- Shared component test doubles. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Buffer } from 'node:buffer'
import { setImmediate } from 'node:timers'
import ts from 'typescript'
import { parse, compileScript } from 'vue/compiler-sfc'
import { createRenderer, reactive, nextTick, defineComponent, h } from 'vue'
const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8')
let index = 0
const url = (source) =>
  'data:text/javascript;base64,' + Buffer.from(source + '\n// ' + ++index).toString('base64')
const transpile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
const vueUrl = import.meta.resolve('vue')
const stockUrl = url(transpile(await read('src/utils/stock.ts')))
const utilsUrl = url(
  transpile(
    (await read('src/utils/reports.ts')).replace("'@/utils/stock'", JSON.stringify(stockUrl)),
  ),
)
const utils = await import(utilsUrl)
const receiptUrl = url(transpile(await read('src/utils/paymentReceipt.ts')))
const receiptUtils = await import(receiptUrl)
const exportUtilsUrl = url(
  transpile(
    (await read('src/utils/reportExport.ts'))
      .replace("'@/utils/reports'", JSON.stringify(utilsUrl))
      .replace("'@/utils/paymentReceipt'", JSON.stringify(receiptUrl)),
  ),
)
const exportUtils = await import(exportUtilsUrl)
const context = {
  calls: [],
  exportCalls: [],
  downloads: [],
  notices: [],
  exportHandler: undefined,
  handler: undefined,
  refreshes: 0,
  auth: reactive({
    user: { id: 'u1', permissions: Object.values(utils.reportPermission) },
    isCatalogAdmin: false,
  }),
  warehouses: reactive({
    loaded: true,
    ownerId: 'u1',
    error: '',
    warehouses: [{ id: 'w1', code: 'W', name: 'Warehouse', status: 0 }],
  }),
}
globalThis.__reportTests = context
const mockUrl = url(`
import { computed, defineComponent } from '${vueUrl}'
const ctx = globalThis.__reportTests
export const useCatalogPermission = () => ({ can: permission => ctx.auth.isCatalogAdmin || !!ctx.auth.user?.permissions.includes(permission) })
export const downloadBlob = (blob, filename) => ctx.downloads.push({ blob, filename })
export const message = { success: text => ctx.notices.push(text) }
export const request = { getBlob: async (url, config) => {
  ctx.exportCalls.push({ url, config })
  return ctx.exportHandler(url, config)
}, get: async (url, config) => {
  ctx.calls.push({ url, config })
  const result = await ctx.handler(url, config)
  return config.transformResponse[0](typeof result === 'string' ? result : JSON.stringify(result))
} }
export const useI18n = () => ({ t: key => key })
export const useSalesScope = () => ({
  auth: ctx.auth, warehouses: ctx.warehouses, can: useCatalogPermission().can,
  scopeKey: computed(() => JSON.stringify([ctx.auth.user, ctx.auth.isCatalogAdmin, ctx.warehouses.loaded, ctx.warehouses.warehouses])),
  refreshScope: async () => { ctx.refreshes++; ctx.warehouses.warehouses = [] },
})
export default defineComponent({ setup() { return () => null } })
`)
const apiUrl = url(
  transpile(
    (await read('src/api/reports/reports.api.ts'))
      .replace("'@/utils/request'", JSON.stringify(mockUrl))
      .replace("'@/utils/stock'", JSON.stringify(stockUrl))
      .replace("'@/composables/useCatalogPermission'", JSON.stringify(mockUrl))
      .replace("'@/utils/reports'", JSON.stringify(utilsUrl)),
  ),
)
const api = await import(apiUrl)
const exportApiUrl = url(
  transpile(
    (await read('src/api/reports/reportExport.api.ts'))
      .replace("'@/utils/request'", JSON.stringify(mockUrl))
      .replace("'@/composables/useCatalogPermission'", JSON.stringify(mockUrl))
      .replace("'@/utils/reports'", JSON.stringify(utilsUrl))
      .replace("'@/utils/reportExport'", JSON.stringify(exportUtilsUrl)),
  ),
)
const exportApi = await import(exportApiUrl)
let source = (await read('src/views/reports/ReportsPage.vue')).replace(
  '</script>',
  'defineExpose({ exportExcel, exportLoading, exportError, appliedFilters, load, filters, rows, sales, payments, dashboard, receivables, total, error, ready, loading, options, changePage })\n</script>',
)
const { descriptor } = parse(source)
let code = compileScript(descriptor, { id: 'reports-test', inlineTemplate: true }).content
code = code.replace(/from ['"]vue['"]/g, 'from ' + JSON.stringify(vueUrl))
for (const name of [
  'vue-i18n',
  'ant-design-vue',
  '@/utils/paymentReceipt',
  '@/components/BasicTable/BasicTable.vue',
  '@/components/stock/ProductSelect.vue',
  '@/composables/useSalesScope',
])
  code = code.replaceAll("from '" + name + "'", 'from ' + JSON.stringify(mockUrl))
code = code
  .replace("from '@/utils/reports'", 'from ' + JSON.stringify(utilsUrl))
  .replace("from '@/api/reports/reports.api'", 'from ' + JSON.stringify(apiUrl))
code = code
  .replace("from '@/utils/reportExport'", 'from ' + JSON.stringify(exportUtilsUrl))
  .replace("from '@/api/reports/reportExport.api'", 'from ' + JSON.stringify(exportApiUrl))
const Page = (await import(url(transpile(code)))).default
const renderer = createRenderer({
  createElement: (type) => ({ type, children: [] }),
  createText: (text) => ({ text }),
  createComment: (text) => ({ text }),
  insert(child, parent, anchor) {
    if (child.parent) child.parent.children = child.parent.children.filter((item) => item !== child)
    child.parent = parent
    const position = anchor ? parent.children.indexOf(anchor) : -1
    if (position >= 0) parent.children.splice(position, 0, child)
    else parent.children.push(child)
  },
  remove(child) {
    if (child.parent) child.parent.children = child.parent.children.filter((item) => item !== child)
  },
  setText(node, text) {
    node.text = text
  },
  setElementText(node, text) {
    node.text = text
  },
  parentNode: (node) => node?.parent,
  nextSibling: (node) => node?.parent?.children[node.parent.children.indexOf(node) + 1] ?? null,
  patchProp(node, key, _prev, value) {
    ;(node.props ??= {})[key] = value
  },
})
const flush = async () => {
  await new Promise((resolve) => setImmediate(resolve))
  await nextTick()
}
function mount(kind) {
  const app = renderer.createApp(
    defineComponent({
      setup() {
        return () => h(Page, { kind, ref: 'page' })
      },
    }),
  )
  app.config.warnHandler = () => undefined
  for (const name of [
    'a-form',
    'a-form-item',
    'a-select',
    'a-date-picker',
    'a-space',
    'a-button',
    'a-alert',
    'a-spin',
    'a-card',
    'a-empty',
    'router-link',
  ])
    app.component(
      name,
      defineComponent({
        setup(_, { slots }) {
          return () => h('div', slots.default?.())
        },
      }),
    )
  const root = app.mount({ children: [] })
  return { vm: root.$refs.page, unmount: () => app.unmount() }
}
const period = { from: '2026-10-01', to: '2026-10-13', timezone: 'Asia/Ho_Chi_Minh' }
const sales = {
  confirmedOrderCount: 1,
  cancelledConfirmedOrderCount: 2,
  confirmedQuantity: 10,
  cancelledQuantity: 20,
  grossSalesAmount: 1000,
  discountAmount: 100,
  confirmedSalesAmount: 900,
  cancelledSalesAmount: 1800,
  netSalesAmount: -900,
}
const page = (overrides = {}) => ({
  items: [],
  total: 25,
  page: 1,
  pageSize: 10,
  summary: sales,
  period,
  ...overrides,
})
function reset() {
  context.calls = []
  context.exportCalls = []
  context.downloads = []
  context.notices = []
  context.exportHandler = async () => xlsxResponse()
  context.refreshes = 0
  context.auth.user = { id: 'u1', permissions: Object.values(utils.reportPermission) }
  context.auth.isCatalogAdmin = false
  context.warehouses.loaded = true
  context.warehouses.ownerId = 'u1'
  context.warehouses.warehouses = [{ id: 'w1', code: 'W', name: 'Inactive', status: 0 }]
  context.handler = async () => page()
}
const filters = {
  from: '2026-10-01',
  to: '2026-10-13',
  page: 1,
  pageSize: 10,
  warehouseId: 'w1',
  productId: 'p1',
  keyword: 'unsupported',
}
test('queries whitelist fields, keep calendar days, omit date/pagination where unsupported', () => {
  assert.deepEqual(utils.reportQuery('inventory', filters), {
    warehouseId: 'w1',
    productId: 'p1',
    from: filters.from,
    to: filters.to,
    page: 1,
    pageSize: 10,
  })
  assert.deepEqual(utils.reportQuery('low-stock', filters), {
    warehouseId: 'w1',
    productId: 'p1',
    page: 1,
    pageSize: 10,
  })
  assert.deepEqual(utils.reportQuery('receivables-summary', filters), { warehouseId: 'w1' })
  assert.deepEqual(utils.reportQuery('dashboard', filters), {
    warehouseId: 'w1',
    from: filters.from,
    to: filters.to,
  })
  assert.throws(() => utils.reportQuery('sales', { ...filters, from: '2026-10-14' }))
  assert.throws(() => utils.reportQuery('inventory', { ...filters, from: '2026-02-30' }))
  assert.throws(() => utils.reportQuery('sales', { ...filters, pageSize: 101 }))
  assert.doesNotThrow(() => utils.reportQuery('low-stock', { ...filters, from: '', to: '' }))
})
test('date presets use Vietnam time at month/year boundaries and leap years', () => {
  assert.deepEqual(utils.reportRange('month', new Date('2026-09-30T18:00:00Z')), {
    from: '2026-10-01',
    to: '2026-10-01',
  })
  assert.deepEqual(utils.reportRange('previous', new Date('2026-01-01T00:00:00Z')), {
    from: '2025-12-01',
    to: '2025-12-31',
  })
  assert.deepEqual(utils.reportRange('previous', new Date('2024-03-01T00:00:00Z')), {
    from: '2024-02-01',
    to: '2024-02-29',
  })
})
test('all six API requests enforce report permissions; admin bypasses and exact negative int64 survives', async () => {
  reset()
  context.auth.user.permissions = ['PAYMENT_VIEW', 'RECEIVABLE_VIEW', 'INVENTORY_VIEW']
  for (const kind of Object.keys(utils.reportPermission))
    await assert.rejects(api.getReport(kind, filters), { code: 'FORBIDDEN' })
  assert.equal(context.calls.length, 0)
  context.auth.isCatalogAdmin = true
  context.handler = async () => '{"netSalesAmount":-9223372036854775807}'
  assert.equal((await api.getReport('sales', filters)).netSalesAmount, -9223372036854775807n)
  assert.equal(context.calls[0].url, '/reports/sales')
  assert.equal(utils.reportValue(-9223372036854775807n, true), '-9.223.372.036.854.775.807 ₫')
  assert.equal(utils.reportValue(0), '0')
  assert.equal(utils.reportValue(undefined), '—')
})
test('summary comes from backend, survives page changes; pageSize and filters reset page', async () => {
  reset()
  const { vm, unmount } = mount('sales')
  await flush()
  assert.equal(vm.sales.netSalesAmount, -900)
  assert.equal(vm.total, 25)
  assert.deepEqual(vm.rows, [])
  vm.changePage(2, 10)
  await flush()
  assert.equal(context.calls.at(-1).config.params.page, 2)
  assert.equal(vm.sales.netSalesAmount, -900)
  vm.changePage(2, 50)
  await flush()
  assert.equal(context.calls.at(-1).config.params.page, 1)
  vm.changePage(3, 50)
  vm.filters.warehouseId = 'w1'
  await flush()
  assert.equal(vm.filters.page, 1)
  assert.equal(vm.options[0].disabled, undefined)
  assert.equal(
    context.calls.some((call) => call.url.includes('products')),
    false,
  )
  unmount()
})
test('old results cannot overwrite new filters; loading clears old rows and summary', async () => {
  reset()
  const { vm, unmount } = mount('sales')
  await flush()
  const pending = []
  context.handler = () => new Promise((resolve) => pending.push(resolve))
  vm.filters.from = '2026-10-02'
  assert.equal(vm.ready, false)
  assert.equal(vm.sales, undefined)
  vm.filters.from = '2026-10-03'
  pending[1](page({ summary: { ...sales, netSalesAmount: -500 } }))
  await flush()
  pending[0](page({ summary: { ...sales, netSalesAmount: 900 } }))
  await flush()
  assert.equal(vm.sales.netSalesAmount, -500)
  unmount()
})
test('dashboard missing sections stay absent and never trigger detail requests', async () => {
  reset()
  context.auth.user.permissions = ['REPORT_DASHBOARD_VIEW']
  context.handler = async () => ({ generatedAt: '2026-10-13T02:00:00Z', period })
  const { vm, unmount } = mount('dashboard')
  await flush()
  assert.equal(vm.ready, true)
  assert.equal(vm.dashboard.periodSections, undefined)
  assert.equal(vm.dashboard.currentSections, undefined)
  assert.equal(context.calls.length, 1)
  assert.equal(vm.sales, undefined)
  unmount()
})
test('inventory preserves backend 87, zero historical rows and clears success on 409', async () => {
  reset()
  context.handler = async () =>
    page({
      items: [
        {
          warehouseId: 'w1',
          productId: 'p1',
          openingQuantity: 0,
          receiptQuantity: 100,
          saleQuantity: 10,
          adjustmentDecreaseQuantity: 3,
          closingQuantity: 87,
        },
        {
          warehouseId: 'w1',
          productId: 'p2',
          openingQuantity: 0,
          closingQuantity: 0,
          productStatus: 0,
        },
      ],
    })
  const { vm, unmount } = mount('inventory')
  await flush()
  assert.equal(vm.rows[0].closingQuantity, 87)
  assert.equal(vm.rows.length, 2)
  context.handler = async () => {
    throw Object.assign(new Error('Mismatch'), {
      status: 409,
      code: 'INVENTORY_HISTORY_INCONSISTENT',
    })
  }
  await vm.load()
  assert.equal(vm.ready, false)
  assert.deepEqual(vm.rows, [])
  assert.match(vm.error, /đối soát/)
  unmount()
})
test('revoked warehouse/permission clears visible data and rejects late responses', async () => {
  reset()
  const { vm, unmount } = mount('sales')
  await flush()
  let finish
  context.handler = () =>
    new Promise((resolve) => {
      finish = resolve
    })
  vm.filters.warehouseId = 'w1'
  context.auth.user.permissions = []
  assert.equal(vm.ready, false)
  assert.equal(vm.sales, undefined)
  finish(page())
  await flush()
  assert.equal(vm.ready, false)
  assert.equal(vm.sales, undefined)
  unmount()
})
test('warehouse denial refreshes scope and removes selection', async () => {
  reset()
  const { vm, unmount } = mount('inventory')
  await flush()
  vm.filters.warehouseId = 'w1'
  await flush()
  context.handler = async () => {
    throw Object.assign(new Error('Denied'), { status: 403, code: 'WAREHOUSE_ACCESS_DENIED' })
  }
  await vm.load()
  await flush()
  assert.equal(vm.filters.warehouseId, undefined)
  assert.equal(context.refreshes, 1)
  assert.match(vm.error, /Quyền truy cập kho/)
  assert.equal(vm.ready, false)
  unmount()
})
test('current reports omit dates and preserve zero low stock with server total', async () => {
  reset()
  context.handler = async () =>
    page({
      items: [
        {
          warehouseId: 'w1',
          productId: 'p1',
          quantity: 0,
          lowStockThreshold: 5,
          shortageQuantity: 5,
        },
      ],
    })
  const { vm, unmount } = mount('low-stock')
  await flush()
  assert.equal(vm.rows[0].quantity, 0)
  assert.equal(vm.total, 25)
  assert.equal('from' in context.calls[0].config.params, false)
  unmount()
})

const xlsxResponse = () => ({
  data: new Blob([new Uint8Array([0x50, 0x4b, 3, 4, 0])], { type: exportUtils.xlsxContentType }),
  headers: {
    'content-type': exportUtils.xlsxContentType,
    'content-disposition': "attachment; filename=old.xlsx; filename*=UTF-8''b%C3%A1o-c%C3%A1o.xlsx",
  },
})

test('export query excludes pagination and unsupported fields; low stock ignores dates', () => {
  for (const kind of ['inventory', 'sales', 'payments', 'low-stock']) {
    const query = exportUtils.exportQuery(kind, {
      ...filters,
      sort: 'name',
      page: 999,
      pageSize: 999,
    })
    assert.equal(
      'page' in query || 'pageSize' in query || 'keyword' in query || 'sort' in query,
      false,
    )
    assert.equal('productId' in query, kind === 'inventory' || kind === 'low-stock')
    assert.equal('from' in query || 'to' in query, kind !== 'low-stock')
    assert.equal(
      'warehouseId' in exportUtils.exportQuery(kind, { ...filters, warehouseId: undefined }),
      false,
    )
  }
  for (const from of ['', undefined, null, '2026-02-30', '2026-10-14'])
    assert.throws(() => exportUtils.exportQuery('inventory', { ...filters, from }))
  assert.doesNotThrow(() => exportUtils.exportQuery('low-stock', { ...filters, from: '', to: '' }))
})

test('four export endpoints enforce their permissions and reuse Admin exception', async () => {
  reset()
  for (const kind of ['inventory', 'sales', 'payments', 'low-stock']) {
    context.auth.user.permissions = Object.values(utils.reportPermission).filter(
      (value) => value !== utils.reportPermission[kind],
    )
    await assert.rejects(exportApi.getReportExport(kind, filters), { code: 'FORBIDDEN' })
    context.auth.user.permissions = [utils.reportPermission[kind]]
    const result = await exportApi.getReportExport(kind, filters)
    assert.equal(context.exportCalls.at(-1).url, '/reports/' + kind + '/export')
    assert.equal(context.exportCalls.at(-1).config.headers.Accept, exportUtils.xlsxContentType)
    assert.equal(context.exportCalls.at(-1).config.data, undefined)
    assert.equal(result.filename, 'báo-cáo.xlsx')
    assert.equal(result.blob.size, 5)
  }
  context.auth.user.permissions = []
  context.auth.isCatalogAdmin = true
  await exportApi.getReportExport('inventory', filters)
  assert.equal(context.exportCalls.length, 5)
})

test('export filenames decode UTF-8, sanitize paths and use dated fallbacks', () => {
  assert.equal(
    exportUtils.exportFilename('inventory', filters, ''),
    'nhap-xuat-ton_2026-10-01_2026-10-13.xlsx',
  )
  assert.equal(
    exportUtils.exportFilename('sales', filters, ''),
    'ban-hang_2026-10-01_2026-10-13.xlsx',
  )
  assert.equal(
    exportUtils.exportFilename('payments', filters, ''),
    'thu-tien_2026-10-01_2026-10-13.xlsx',
  )
  assert.equal(
    exportUtils.exportFilename('low-stock', filters, '', new Date('2026-10-13T18:02:03Z')),
    'ton-thap_2026-10-14-01-02-03.xlsx',
  )
  assert.equal(
    exportUtils.exportFilename(
      'sales',
      filters,
      "attachment; filename=ordinary.xlsx; filename*=UTF-8''%ZZ",
    ),
    'ordinary.xlsx',
  )
  assert.doesNotMatch(
    exportUtils.exportFilename('sales', filters, 'attachment; filename="../../secret/file.xlsx"'),
    /[\\/]/,
  )
})

test('invalid or empty XLSX and JSON errors, including wrongly labelled JSON, cannot download', async () => {
  const { data } = xlsxResponse()
  assert.equal(await exportUtils.validateReportXlsx(data, exportUtils.xlsxContentType), data)
  for (const value of [new Blob([]), new Blob(['not xlsx']), new Blob(['PK-not-xlsx']), {}])
    await assert.rejects(exportUtils.validateReportXlsx(value, exportUtils.xlsxContentType))
  for (const header of ['', 'application/octet-stream', 'text/html'])
    await assert.rejects(exportUtils.validateReportXlsx(data, header), /Content-Type/)
  const payload = {
    timestamp: 'now',
    status: 409,
    code: 'INVENTORY_HISTORY_INCONSISTENT',
    message: 'Mismatch',
    details: { id: 'p1' },
  }
  for (const type of [
    'application/json',
    'application/problem+json',
    exportUtils.xlsxContentType,
    '',
  ]) {
    const blob = new Blob([JSON.stringify(payload)], { type })
    await assert.rejects(
      exportUtils.validateReportXlsx(blob, type),
      (error) => error.status === 409 && error.code === payload.code && error.details.id === 'p1',
    )
  }
  await assert.rejects(exportUtils.validateReportXlsx(new Blob(['{broken']), 'application/json'))
})

test('export remains available for empty tables and releases its loading state', async () => {
  for (const kind of ['inventory', 'sales', 'payments', 'low-stock']) {
    reset()
    context.handler = async () => page({ items: [], total: 0 })
    const { vm, unmount } = mount(kind)
    await flush()
    assert.equal(vm.total, 0)
    await vm.exportExcel()
    assert.equal(context.exportCalls[0].url, '/reports/' + kind + '/export')
    assert.deepEqual(
      context.exportCalls[0].config.params,
      exportUtils.exportQuery(kind, vm.appliedFilters),
    )
    assert.equal(vm.exportLoading, false)
    assert.equal(context.downloads.length, 1)
    assert.deepEqual(context.notices, ['reports.downloadStarted'])
    unmount()
  }
})

test('export requires applied filters and valid dates; dashboard has no export', async () => {
  reset()
  const { vm, unmount } = mount('sales')
  await flush()
  context.handler = () => new Promise(() => {})
  vm.filters.warehouseId = 'w1'
  await vm.exportExcel()
  assert.equal(vm.exportError, 'reports.applyBeforeExport')
  assert.equal(context.exportCalls.length, 0)
  vm.filters.from = ''
  await vm.exportExcel()
  assert.match(vm.exportError, /ngày/)
  unmount()
  reset()
  const subject = mount('dashboard')
  await flush()
  await subject.vm.exportExcel()
  assert.equal(context.exportCalls.length, 0)
  subject.unmount()
})

test('one export at a time, filter snapshot stays consistent while user edits the table', async () => {
  reset()
  const { vm, unmount } = mount('inventory')
  await flush()
  let finish
  context.exportHandler = () =>
    new Promise((resolve) => {
      finish = resolve
    })
  const before = { ...vm.appliedFilters }
  const pending = vm.exportExcel()
  assert.equal(vm.exportLoading, true)
  assert.equal(vm.loading, false)
  await vm.exportExcel()
  assert.equal(context.exportCalls.length, 1)
  vm.filters.from = '2026-10-02'
  await flush()
  finish({ ...xlsxResponse(), headers: { 'content-type': exportUtils.xlsxContentType } })
  await pending
  assert.deepEqual(
    context.exportCalls[0].config.params,
    exportUtils.exportQuery('inventory', before),
  )
  assert.equal(
    context.downloads[0].filename,
    'nhap-xuat-ton_' + before.from + '_' + before.to + '.xlsx',
  )
  assert.equal(vm.exportLoading, false)
  unmount()
})

test('logout, user change, revoked permissions and unmount reject late exports', async () => {
  for (const action of [
    () => {
      context.auth.user = null
    },
    () => {
      context.auth.user.id = 'u2'
    },
    () => {
      context.auth.user.permissions = []
    },
    (subject) => subject.unmount(),
  ]) {
    reset()
    const subject = mount('sales')
    await flush()
    let finish
    context.exportHandler = () =>
      new Promise((resolve) => {
        finish = resolve
      })
    const pending = subject.vm.exportExcel()
    const signal = context.exportCalls[0].config.signal
    action(subject)
    assert.equal(signal.aborted, true)
    assert.equal(subject.vm.exportLoading, false)
    finish(xlsxResponse())
    await pending
    assert.equal(context.downloads.length, 0)
    assert.equal(context.notices.length, 0)
    subject.unmount()
  }
})

test('export errors clear loading, allow manual retry, and warehouse denial refreshes scope', async () => {
  reset()
  const { vm, unmount } = mount('inventory')
  await flush()
  for (const cause of [
    Object.assign(new Error('Too large'), { code: 'EXPORT_TOO_LARGE' }),
    Object.assign(new Error('Mismatch'), { code: 'INVENTORY_HISTORY_INCONSISTENT', status: 409 }),
    Object.assign(new Error('Overflow'), { code: 'NUMERIC_OVERFLOW', status: 500 }),
    new Error('Network failure'),
  ]) {
    context.exportHandler = async () => {
      throw cause
    }
    await vm.exportExcel()
    assert.equal(vm.exportLoading, false)
    assert.ok(vm.exportError)
    assert.equal(context.downloads.length, 0)
  }
  context.exportHandler = async () => ({
    data: new Blob([JSON.stringify({ code: 'FORBIDDEN', message: 'Denied', status: 403 })]),
    headers: { 'content-type': 'application/json' },
  })
  await vm.exportExcel()
  assert.match(vm.exportError, /quyền/)
  assert.equal(context.downloads.length, 0)
  context.exportHandler = async () => xlsxResponse()
  await vm.exportExcel()
  assert.equal(context.downloads.length, 1)
  context.exportHandler = async () => {
    throw Object.assign(new Error('Denied'), { code: 'WAREHOUSE_ACCESS_DENIED', status: 403 })
  }
  await vm.exportExcel()
  assert.equal(context.refreshes, 1)
  assert.equal(vm.filters.warehouseId, undefined)
  assert.match(vm.exportError, /Phạm vi kho/)
  assert.equal(vm.exportLoading, false)
  unmount()
})

test('download uses object URL, removes anchor and delays cleanup, even when click fails', async () => {
  const previousDocument = globalThis.document
  const previousTimeout = globalThis.setTimeout
  try {
    for (const fail of [false, true]) {
      const anchor = {
        remove() {
          this.removed = true
        },
        click() {
          this.clicked = true
          if (fail) throw new Error('Blocked')
        },
      }
      let release
      globalThis.document = { createElement: () => anchor, body: { appendChild() {} } }
      globalThis.setTimeout = (callback, delay) => {
        assert.equal(delay, 60_000)
        release = callback
      }
      const download = () => receiptUtils.downloadBlob(xlsxResponse().data, 'report.xlsx')
      if (fail) assert.throws(download, /Blocked/)
      else download()
      assert.equal(anchor.download, 'report.xlsx')
      assert.equal(anchor.removed, true)
      assert.match(anchor.href, /^blob:/)
      assert.equal((await (await fetch(anchor.href)).blob()).size, 5)
      release()
      await assert.rejects(fetch(anchor.href))
    }
  } finally {
    globalThis.document = previousDocument
    globalThis.setTimeout = previousTimeout
  }
})

test('return/refund reporting keeps exact negative cash flow and separate authoritative metrics', async () => {
  reset()
  context.handler = async () =>
    page({
      summary: {
        netRecordedAmount: 100,
        netRefundedAmount: 250,
        netCashFlowAmount: -150,
        createdRefundCount: 2,
        cancelledRefundCount: 1,
      },
    })
  const payments = mount('payments')
  await flush()
  assert.equal(payments.vm.payments.netRecordedAmount, 100)
  assert.equal(payments.vm.payments.netRefundedAmount, 250)
  assert.equal(payments.vm.payments.netCashFlowAmount, -150)
  assert.ok(utils.paymentMetrics.includes('netRefundedBankTransferAmount'))
  assert.ok(utils.paymentMetrics.includes('reversedRefundCashAmount'))
  assert.equal(utils.reportValue(-9223372036854775807n, true), '-9.223.372.036.854.775.807 ₫')
  payments.unmount()
  context.handler = async () =>
    page({
      items: [
        {
          warehouseId: 'w1',
          productId: 'p1',
          openingQuantity: 0,
          saleReturnQuantity: 7,
          closingQuantity: 87,
        },
      ],
    })
  const inventory = mount('inventory')
  await flush()
  assert.equal(inventory.vm.rows[0].saleReturnQuantity, 7)
  assert.equal(inventory.vm.rows[0].closingQuantity, 87)
  inventory.unmount()
})

test('refund dashboard section is optional and available without SALES_ORDER_VIEW', async () => {
  reset()
  context.auth.user.permissions = ['REPORT_DASHBOARD_VIEW', 'REFUND_VIEW']
  context.handler = async () => ({
    generatedAt: '2026-10-16T03:00:00Z',
    period,
    currentSections: {
      refunds: { refundableOrderCount: 1, refundableAmount: 300000, asOf: '2026-10-16T03:00:00Z' },
    },
  })
  const dashboard = mount('dashboard')
  await flush()
  assert.equal(dashboard.vm.dashboard.currentSections.refunds.refundableAmount, 300000)
  assert.equal(context.calls.length, 1)
  assert.equal(dashboard.vm.dashboard.currentSections.receivables, undefined)
  context.handler = async () => ({ generatedAt: '2026-10-16T03:00:00Z', period })
  await dashboard.vm.load()
  assert.equal(dashboard.vm.dashboard.currentSections, undefined)
  dashboard.unmount()
})
