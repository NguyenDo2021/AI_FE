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
import { computed, defineComponent, ref } from '${vueUrl}'
const ctx = globalThis.__reportTests
export const useMediaQuery = () => ref(false)
export const DownOutlined = defineComponent({ render: () => null })
export const UpOutlined = DownOutlined
export const FileExcelOutlined = DownOutlined
export const FilterOutlined = DownOutlined
export const InfoCircleFilled = DownOutlined
export const ReloadOutlined = DownOutlined
export const SearchOutlined = DownOutlined
export const BarChartOutlined = DownOutlined
export const FileTextOutlined = DownOutlined
export const ShoppingCartOutlined = DownOutlined
export const UndoOutlined = DownOutlined
export const ArrowRightOutlined = DownOutlined
export const InfoCircleOutlined = DownOutlined
export const SolutionOutlined = DownOutlined
export const TeamOutlined = DownOutlined
export const WalletOutlined = DownOutlined
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
const inventorySource = (await read('src/views/reports/InventoryReportPage.vue')).replace(
  '</script>',
  'defineExpose({ exportExcel, exportLoading, exportError, appliedFilters, load, filters, rows, total, error, ready, loading, options, changePage, submit, reset, preset, validationError, expanded, mobileOpen, columns })\n</script>',
)
let inventoryCode = compileScript(parse(inventorySource).descriptor, {
  id: 'inventory-report-test',
}).content
inventoryCode = inventoryCode.replace(/from ['"]vue['"]/g, 'from ' + JSON.stringify(vueUrl))
for (const name of [
  'vue-i18n',
  'ant-design-vue',
  '@ant-design/icons-vue',
  '@vueuse/core',
  '@/utils/paymentReceipt',
  '@/components/catalog/FittedListTable.vue',
  '@/components/stock/ProductSelect.vue',
  '@/composables/useSalesScope',
])
  inventoryCode = inventoryCode.replaceAll("from '" + name + "'", 'from ' + JSON.stringify(mockUrl))
for (const [name, value] of [
  ['@/utils/reports', utilsUrl],
  ['@/utils/reportExport', exportUtilsUrl],
  ['@/api/reports/reports.api', apiUrl],
  ['@/api/reports/reportExport.api', exportApiUrl],
])
  inventoryCode = inventoryCode.replaceAll("from '" + name + "'", 'from ' + JSON.stringify(value))
const InventoryPage = (await import(url(transpile(inventoryCode)))).default
const salesSource = (await read('src/views/reports/SalesReportPage.vue')).replace(
  '</script>',
  'defineExpose({ exportExcel, exportLoading, exportError, appliedFilters, load, filters, rows, sales, period, total, error, ready, loading, options, changePage, submit, reset, preset, validationError, expanded, mobileOpen, columns, primaryMetrics, secondaryMetrics, metricValue })\n</script>',
)
let salesCode = compileScript(parse(salesSource).descriptor, { id: 'sales-report-test' }).content
salesCode = salesCode.replace(/from ['"]vue['"]/g, 'from ' + JSON.stringify(vueUrl))
for (const name of [
  'vue-i18n',
  'ant-design-vue',
  '@ant-design/icons-vue',
  '@vueuse/core',
  '@/utils/paymentReceipt',
  '@/components/catalog/FittedListTable.vue',
  '@/composables/useSalesScope',
])
  salesCode = salesCode.replaceAll("from '" + name + "'", 'from ' + JSON.stringify(mockUrl))
for (const [name, value] of [
  ['@/utils/reports', utilsUrl],
  ['@/utils/reportExport', exportUtilsUrl],
  ['@/api/reports/reports.api', apiUrl],
  ['@/api/reports/reportExport.api', exportApiUrl],
])
  salesCode = salesCode.replaceAll("from '" + name + "'", 'from ' + JSON.stringify(value))
const SalesPage = (await import(url(transpile(salesCode)))).default
const receivablesSource = (await read('src/views/reports/ReceivablesReportPage.vue')).replace(
  '</script>',
  'defineExpose({ filters, appliedFilters, data, displayedWarehouseId, detailLocation, metricValue, timestamp, loading, ready, error, options, mobileOpen, load, submit, reset, reloadScope })\n</script>',
)
let receivablesCode = compileScript(parse(receivablesSource).descriptor, {
  id: 'receivables-report-test',
}).content
receivablesCode = receivablesCode.replace(/from ['"]vue['"]/g, 'from ' + JSON.stringify(vueUrl))
for (const name of [
  'vue-i18n',
  '@ant-design/icons-vue',
  '@vueuse/core',
  '@/composables/useSalesScope',
])
  receivablesCode = receivablesCode.replaceAll(
    "from '" + name + "'",
    'from ' + JSON.stringify(mockUrl),
  )
for (const [name, value] of [
  ['@/utils/reports', utilsUrl],
  ['@/api/reports/reports.api', apiUrl],
])
  receivablesCode = receivablesCode.replaceAll(
    "from '" + name + "'",
    'from ' + JSON.stringify(value),
  )
const ReceivablesPage = (await import(url(transpile(receivablesCode)))).default
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
function mount(kind, component = Page) {
  const app = renderer.createApp(
    defineComponent({
      setup() {
        return () => h(component, { kind, ref: 'page' })
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

test('inventory screen applies once, preserves hidden drafts, and reload/page/export use applied filters', async () => {
  reset()
  context.auth.user.permissions.push('PRODUCT_VIEW')
  const { vm, unmount } = mount('inventory', InventoryPage)
  await flush()
  assert.equal(context.calls.length, 1)
  const initial = { ...vm.appliedFilters }
  vm.filters.warehouseId = 'w1'
  vm.filters.productId = 'p2'
  vm.filters.from = '2026-10-02'
  vm.filters.to = '2026-10-20'
  vm.expanded = true
  vm.expanded = false
  vm.mobileOpen = true
  vm.mobileOpen = false
  await flush()
  assert.equal(context.calls.length, 1)
  assert.equal(vm.filters.productId, 'p2')
  await vm.load()
  assert.deepEqual(context.calls.at(-1).config.params, utils.reportQuery('inventory', initial))
  vm.changePage(2, 10)
  await flush()
  assert.deepEqual(
    context.calls.at(-1).config.params,
    utils.reportQuery('inventory', { ...initial, page: 2 }),
  )
  await vm.exportExcel()
  assert.deepEqual(
    context.exportCalls.at(-1).config.params,
    exportUtils.exportQuery('inventory', initial),
  )
  const before = context.calls.length
  vm.submit()
  await flush()
  assert.equal(context.calls.length, before + 1)
  assert.equal(vm.appliedFilters.page, 1)
  assert.equal(context.calls.at(-1).config.params.productId, 'p2')
  assert.equal(context.calls.at(-1).config.params.warehouseId, 'w1')
  vm.changePage(3, 50)
  await flush()
  assert.equal(context.calls.at(-1).config.params.page, 1)
  assert.equal(context.calls.at(-1).config.params.pageSize, 50)
  unmount()
})

test('inventory screen validates before replacing results and each preset/reset requests once', async () => {
  reset()
  const { vm, unmount } = mount('inventory', InventoryPage)
  await flush()
  const initial = { ...vm.appliedFilters }
  vm.filters.from = '2026-10-29'
  vm.filters.to = '2026-10-01'
  vm.submit()
  await flush()
  assert.equal(context.calls.length, 1)
  assert.equal(vm.ready, true)
  assert.ok(vm.validationError)
  assert.deepEqual(vm.appliedFilters, initial)
  for (const preset of ['today', 'month', 'previous']) {
    const before = context.calls.length
    vm.preset(preset)
    await flush()
    assert.equal(context.calls.length, before + 1)
    assert.equal(vm.validationError, '')
    assert.deepEqual(
      { from: vm.appliedFilters.from, to: vm.appliedFilters.to },
      utils.reportRange(preset),
    )
  }
  const before = context.calls.length
  vm.reset()
  await flush()
  assert.equal(context.calls.length, before + 1)
  assert.deepEqual(vm.appliedFilters, {
    ...utils.reportRange('month'),
    warehouseId: undefined,
    productId: undefined,
    page: 1,
    pageSize: 10,
  })
  unmount()
})

test('inventory screen rejects old responses, preserves exact historical rows and clears revoked scope', async () => {
  reset()
  const { vm, unmount } = mount('inventory', InventoryPage)
  await flush()
  const pending = []
  context.handler = () => new Promise((resolve) => pending.push(resolve))
  vm.filters.from = '2026-10-01'
  vm.filters.to = '2026-10-20'
  vm.submit()
  vm.filters.from = '2026-10-02'
  vm.submit()
  pending[1](
    '{"items":[{"warehouseId":"w1","productId":"p1","productStatus":0,"closingQuantity":-9223372036854775808,"saleReturnQuantity":7}],"total":1}',
  )
  await flush()
  pending[0](page())
  await flush()
  assert.equal(vm.total, 1)
  assert.equal(vm.rows[0].closingQuantity, -9223372036854775808n)
  assert.equal(vm.rows[0].productStatus, 0)
  assert.equal(vm.columns.length, 13)
  assert.equal(vm.columns.at(-1).key, 'closingQuantity')
  assert.ok(vm.columns.every((column) => !column.fixed))
  context.auth.user.permissions = []
  assert.deepEqual(vm.rows, [])
  assert.equal(vm.ready, false)
  assert.equal(vm.loading, false)
  assert.equal(vm.error, 'reports.forbidden')
  unmount()
})

const currentDebt = {
  totalRemainingAmount: 999,
  customerRemainingAmount: 800,
  walkInRemainingAmount: 100,
  customerCount: 2,
  customerOutstandingOrderCount: 3,
  walkInOutstandingOrderCount: 0,
  asOf: '2026-10-28T09:52:41Z',
}

test('current receivables submits warehouse once; reload and detail use the displayed scope, not draft', async () => {
  reset()
  context.handler = async () => currentDebt
  const { vm, unmount } = mount('receivables-summary', ReceivablesPage)
  await flush()
  assert.equal(context.calls.length, 1)
  assert.equal(context.calls[0].url, '/reports/receivables-summary')
  assert.deepEqual(context.calls[0].config.params, {})
  vm.filters.warehouseId = 'w1'
  vm.mobileOpen = true
  await flush()
  assert.equal(context.calls.length, 1)
  assert.deepEqual(vm.detailLocation, { path: '/sales/receivables', query: { warehouseId: '' } })
  await vm.load()
  assert.deepEqual(context.calls.at(-1).config.params, {})
  vm.submit()
  await flush()
  assert.equal(context.calls.length, 3)
  assert.deepEqual(context.calls.at(-1).config.params, { warehouseId: 'w1' })
  assert.equal(vm.displayedWarehouseId, 'w1')
  assert.equal(vm.detailLocation.query.warehouseId, 'w1')
  assert.equal(vm.mobileOpen, true)
  assert.equal(vm.options[0].disabled, undefined)
  vm.filters.warehouseId = undefined
  assert.equal(vm.detailLocation.query.warehouseId, 'w1')
  vm.reset()
  await flush()
  assert.equal(context.calls.length, 4)
  assert.deepEqual(context.calls.at(-1).config.params, {})
  assert.equal(vm.filters.warehouseId, undefined)
  unmount()
})

test('current receivables keeps six authoritative metrics, exact int64, zero and missing-field fallback', async () => {
  reset()
  context.handler = async () =>
    JSON.stringify({ ...currentDebt, totalRemainingAmount: '__EXACT__' }).replace(
      '"__EXACT__"',
      '9223372036854775807',
    )
  const { vm, unmount } = mount('receivables-summary', ReceivablesPage)
  await flush()
  assert.equal(vm.metricValue('totalRemainingAmount'), '9.223.372.036.854.775.807 ₫')
  assert.equal(vm.metricValue('customerRemainingAmount'), '800 ₫')
  assert.equal(vm.metricValue('walkInRemainingAmount'), '100 ₫')
  assert.equal(vm.metricValue('customerCount'), '2')
  assert.equal(vm.metricValue('customerOutstandingOrderCount'), '3')
  assert.equal(vm.metricValue('walkInOutstandingOrderCount'), '0')
  context.handler = async () => ({
    ...currentDebt,
    totalRemainingAmount: 0,
    customerRemainingAmount: undefined,
  })
  await vm.load()
  assert.equal(vm.metricValue('totalRemainingAmount'), '0 ₫')
  assert.equal(vm.metricValue('customerRemainingAmount'), '—')
  unmount()
})

test('current receivables timestamp comes from BE in Vietnam time and is absent during reload', async () => {
  reset()
  context.handler = async () => currentDebt
  const { vm, unmount } = mount('receivables-summary', ReceivablesPage)
  await flush()
  assert.equal(
    vm.timestamp,
    new Date(currentDebt.asOf).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
  )
  context.handler = async () => ({ ...currentDebt, asOf: undefined })
  await vm.load()
  assert.equal(vm.timestamp, '—')
  let finish
  context.handler = () =>
    new Promise((resolve) => {
      finish = resolve
    })
  const pending = vm.load()
  assert.equal(vm.data, undefined)
  assert.equal(vm.ready, false)
  assert.equal(vm.timestamp, '—')
  assert.equal(vm.loading, true)
  finish(currentDebt)
  await pending
  assert.equal(vm.ready, true)
  unmount()
})

test('current receivables rejects stale summary, scope and timestamp after rapid submissions or unmount', async () => {
  reset()
  context.handler = async () => currentDebt
  const { vm, unmount } = mount('receivables-summary', ReceivablesPage)
  await flush()
  const pending = []
  context.handler = () => new Promise((resolve) => pending.push(resolve))
  vm.filters.warehouseId = 'w1'
  vm.submit()
  assert.equal(vm.data, undefined)
  vm.filters.warehouseId = undefined
  vm.submit()
  pending[1]({ ...currentDebt, totalRemainingAmount: 123, asOf: '2026-10-28T10:00:00Z' })
  await flush()
  pending[0](currentDebt)
  await flush()
  assert.equal(vm.data.totalRemainingAmount, 123)
  assert.equal(vm.displayedWarehouseId, undefined)
  assert.equal(vm.data.asOf, '2026-10-28T10:00:00Z')
  const afterUnmount = vm.load()
  unmount()
  pending[2](currentDebt)
  await afterUnmount
  assert.equal(vm.data, undefined)
})

test('current receivables errors preserve applied and draft warehouses and show backend messages', async () => {
  reset()
  context.handler = async () => currentDebt
  const { vm, unmount } = mount('receivables-summary', ReceivablesPage)
  await flush()
  vm.filters.warehouseId = 'w1'
  vm.submit()
  await flush()
  vm.filters.warehouseId = undefined
  context.handler = async () => {
    throw new Error('Backend report message')
  }
  await vm.load()
  assert.equal(vm.error, 'Backend report message')
  assert.equal(vm.appliedFilters.warehouseId, 'w1')
  assert.equal(vm.filters.warehouseId, undefined)
  assert.equal(vm.data, undefined)
  assert.equal(vm.ready, false)
  assert.equal(vm.loading, false)
  context.handler = async () => currentDebt
  await vm.load()
  assert.equal(vm.error, '')
  assert.equal(vm.displayedWarehouseId, 'w1')
  unmount()
})

test('current receivables preserves report permission, ADMIN bypass and revocation of pending requests', async () => {
  reset()
  context.auth.user.permissions = ['RECEIVABLE_VIEW']
  context.handler = async () => currentDebt
  const { vm, unmount } = mount('receivables-summary', ReceivablesPage)
  await flush()
  assert.equal(context.calls.length, 0)
  assert.equal(vm.error, 'reports.forbidden')
  context.auth.isCatalogAdmin = true
  await flush()
  assert.equal(vm.ready, true)
  let finish
  context.handler = () =>
    new Promise((resolve) => {
      finish = resolve
    })
  const pending = vm.load()
  context.auth.isCatalogAdmin = false
  assert.equal(vm.ready, false)
  assert.equal(vm.data, undefined)
  finish(currentDebt)
  await pending
  assert.equal(vm.ready, false)
  unmount()
})

test('current receivables refreshes denied warehouse scope and rejects selections outside that scope', async () => {
  reset()
  context.handler = async () => currentDebt
  const { vm, unmount } = mount('receivables-summary', ReceivablesPage)
  await flush()
  const before = context.calls.length
  vm.filters.warehouseId = 'outside'
  vm.submit()
  await flush()
  assert.equal(context.calls.length, before)
  assert.equal(vm.error, 'reports.scopeUnavailable')
  assert.equal(vm.ready, false)
  vm.filters.warehouseId = 'w1'
  context.handler = async () => {
    throw Object.assign(new Error('Denied'), { status: 403, code: 'WAREHOUSE_ACCESS_DENIED' })
  }
  vm.submit()
  await flush()
  assert.equal(context.refreshes, 1)
  assert.equal(vm.filters.warehouseId, undefined)
  assert.equal(vm.appliedFilters.warehouseId, undefined)
  assert.equal(vm.data, undefined)
  assert.equal(vm.ready, false)
  unmount()
})

test('sales screen submits once and keeps draft separate from reload, pagination and export', async () => {
  reset()
  const { vm, unmount } = mount('sales', SalesPage)
  await flush()
  assert.equal(context.calls.length, 1)
  const initial = { ...vm.appliedFilters }
  vm.filters.warehouseId = 'w1'
  vm.filters.from = '2026-10-02'
  vm.filters.to = '2026-10-20'
  vm.expanded = true
  vm.mobileOpen = true
  await flush()
  assert.equal(context.calls.length, 1)
  await vm.load()
  assert.deepEqual(context.calls.at(-1).config.params, utils.reportQuery('sales', initial))
  vm.changePage(2, 10)
  await flush()
  assert.equal(context.calls.length, 3)
  assert.equal(context.calls.at(-1).config.params.warehouseId, undefined)
  await vm.exportExcel()
  assert.deepEqual(
    context.exportCalls.at(-1).config.params,
    exportUtils.exportQuery('sales', initial),
  )
  vm.submit()
  await flush()
  assert.equal(context.calls.length, 4)
  assert.deepEqual(context.calls.at(-1).config.params, {
    warehouseId: 'w1',
    from: '2026-10-02',
    to: '2026-10-20',
    page: 1,
    pageSize: 10,
  })
  assert.equal(vm.mobileOpen, true)
  assert.equal(vm.options[0].disabled, undefined)
  unmount()
})

test('sales screen preserves backend summary, all metric mappings, exact negatives and missing values', async () => {
  reset()
  context.handler = async () =>
    JSON.stringify(
      page({
        items: [{ warehouseId: 'w1', ...sales, netSalesAmount: 900 }],
        summary: { ...sales, netSalesAmount: '__EXACT__', returnedSalesAmount: 150 },
      }),
    ).replace('"__EXACT__"', '-9223372036854775808')
  const { vm, unmount } = mount('sales', SalesPage)
  await flush()
  assert.equal(vm.metricValue('netSalesAmount'), '-9.223.372.036.854.775.808 ₫')
  assert.equal(vm.metricValue('returnedSalesAmount'), '150 ₫')
  assert.equal(vm.sales.netSalesAmount, -9223372036854775808n)
  assert.equal(vm.rows[0].netSalesAmount, 900)
  assert.deepEqual(
    vm.columns.slice(1).map((column) => column.dataIndex),
    [...utils.salesMetrics],
  )
  assert.deepEqual(
    [...vm.primaryMetrics.map((metric) => metric.key), ...vm.secondaryMetrics].sort(),
    [...utils.salesMetrics].sort(),
  )
  assert.equal(vm.columns.length, 11)
  assert.ok(vm.columns.slice(1).every((column) => column.align === 'right'))
  vm.changePage(2, 10)
  await flush()
  assert.equal(vm.sales.netSalesAmount, -9223372036854775808n)
  context.handler = async () => page({ summary: { ...sales } })
  await vm.load()
  assert.equal(vm.metricValue('returnedSalesAmount'), '—')
  unmount()
})

test('sales screen validates dates, applies presets and restores existing defaults with single requests', async () => {
  reset()
  const { vm, unmount } = mount('sales', SalesPage)
  await flush()
  const initial = { ...vm.appliedFilters }
  vm.filters.from = ''
  vm.submit()
  await flush()
  assert.equal(context.calls.length, 1)
  assert.ok(vm.validationError)
  assert.deepEqual(vm.appliedFilters, initial)
  assert.equal(vm.ready, true)
  for (const preset of ['today', 'month', 'previous']) {
    const before = context.calls.length
    vm.preset(preset)
    await flush()
    assert.equal(context.calls.length, before + 1)
    assert.equal(vm.validationError, '')
    assert.deepEqual(
      { from: vm.appliedFilters.from, to: vm.appliedFilters.to },
      utils.reportRange(preset),
    )
  }
  for (const size of [20, 50, 100, 10]) {
    const before = context.calls.length
    vm.changePage(2, size)
    await flush()
    assert.equal(context.calls.length, before + 1)
    assert.equal(vm.appliedFilters.page, 1)
    assert.equal(vm.appliedFilters.pageSize, size)
  }
  const before = context.calls.length
  vm.reset()
  await flush()
  assert.equal(context.calls.length, before + 1)
  assert.deepEqual(vm.appliedFilters, {
    warehouseId: undefined,
    ...utils.reportRange('month'),
    page: 1,
    pageSize: 10,
  })
  unmount()
})

test('sales screen commits period, summary and rows together, discards stale responses and revokes access', async () => {
  reset()
  const { vm, unmount } = mount('sales', SalesPage)
  await flush()
  const pending = []
  context.handler = () => new Promise((resolve) => pending.push(resolve))
  vm.filters.to = '2026-10-20'
  vm.submit()
  assert.equal(vm.sales, undefined)
  assert.equal(vm.period, undefined)
  assert.deepEqual(vm.rows, [])
  vm.filters.to = '2026-10-21'
  vm.submit()
  pending[1](
    page({ period: { ...period, to: '2026-10-21' }, summary: { ...sales, netSalesAmount: -123 } }),
  )
  await flush()
  pending[0](page())
  await flush()
  assert.equal(vm.sales.netSalesAmount, -123)
  assert.equal(vm.period.to, '2026-10-21')
  context.auth.user.permissions = []
  assert.equal(vm.ready, false)
  assert.equal(vm.sales, undefined)
  assert.equal(vm.period, undefined)
  assert.equal(vm.error, 'reports.forbidden')
  context.auth.isCatalogAdmin = true
  pending[2](page())
  await flush()
  assert.equal(vm.ready, true)
  unmount()
})

test('sales screen handles empty/error states and refreshes revoked warehouse scope', async () => {
  reset()
  context.handler = async () => page({ items: [], total: 0 })
  const { vm, unmount } = mount('sales', SalesPage)
  await flush()
  assert.equal(vm.total, 0)
  assert.equal(vm.ready, true)
  await vm.exportExcel()
  assert.equal(context.downloads.length, 1)
  vm.filters.warehouseId = 'w1'
  vm.submit()
  await flush()
  context.handler = async () => {
    throw Object.assign(new Error('Denied'), { status: 403, code: 'WAREHOUSE_ACCESS_DENIED' })
  }
  await vm.load()
  await flush()
  assert.equal(context.refreshes, 1)
  assert.equal(vm.filters.warehouseId, undefined)
  assert.equal(vm.appliedFilters.warehouseId, undefined)
  assert.equal(vm.ready, false)
  assert.equal(vm.sales, undefined)
  assert.deepEqual(vm.rows, [])
  unmount()
})

test('sales screen deduplicates exports, reads JSON blob errors and cancels revoked exports', async () => {
  reset()
  const { vm, unmount } = mount('sales', SalesPage)
  await flush()
  context.exportHandler = async () => ({
    data: new Blob([JSON.stringify({ code: 'EXPORT_TOO_LARGE', status: 422 })]),
    headers: { 'content-type': 'application/json' },
  })
  await vm.exportExcel()
  assert.match(vm.exportError, /thu hẹp/)
  assert.equal(vm.exportLoading, false)
  let finish
  context.exportHandler = () =>
    new Promise((resolve) => {
      finish = resolve
    })
  const pending = vm.exportExcel()
  await vm.exportExcel()
  assert.equal(context.exportCalls.length, 2)
  assert.equal(context.exportCalls.at(-1).url, '/reports/sales/export')
  assert.equal(vm.loading, false)
  context.auth.user.permissions = []
  assert.equal(context.exportCalls.at(-1).config.signal.aborted, true)
  finish(xlsxResponse())
  await pending
  assert.equal(context.downloads.length, 0)
  unmount()
})

test('sales screen retains backend date errors and does not relabel old data with an invalid period', async () => {
  reset()
  const { vm, unmount } = mount('sales', SalesPage)
  await flush()
  for (const code of ['INVALID_DATE_RANGE', 'REPORT_PERIOD_TOO_LARGE']) {
    context.handler = async () => {
      throw Object.assign(new Error('Invalid report dates'), { status: 400, code })
    }
    await vm.load()
    assert.equal(vm.validationError, utils.reportError({ code }))
    assert.equal(vm.error, vm.validationError)
    assert.equal(vm.ready, false)
    assert.equal(vm.sales, undefined)
    assert.equal(vm.period, undefined)
    assert.equal(vm.loading, false)
  }
  unmount()
})

test('inventory screen cancels late export after scope revocation and handles JSON blob errors', async () => {
  reset()
  const { vm, unmount } = mount('inventory', InventoryPage)
  await flush()
  context.exportHandler = async () => ({
    data: new Blob([
      JSON.stringify({ code: 'EXPORT_TOO_LARGE', message: 'Too large', status: 422 }),
    ]),
    headers: { 'content-type': 'application/json' },
  })
  await vm.exportExcel()
  assert.match(vm.exportError, /thu hẹp/)
  assert.equal(vm.exportLoading, false)
  assert.equal(context.downloads.length, 0)
  let finish
  context.exportHandler = () =>
    new Promise((resolve) => {
      finish = resolve
    })
  const pending = vm.exportExcel()
  await vm.exportExcel()
  assert.equal(context.exportCalls.length, 2)
  context.auth.user.permissions = []
  assert.equal(context.exportCalls.at(-1).config.signal.aborted, true)
  finish(xlsxResponse())
  await pending
  assert.equal(context.downloads.length, 0)
  unmount()
})
