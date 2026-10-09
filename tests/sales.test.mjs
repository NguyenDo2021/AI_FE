/* eslint-disable vue/one-component-per-file -- Component test doubles share one harness. */
import { setImmediate } from 'node:timers'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Buffer } from 'node:buffer'
import ts from 'typescript'
import { parse, compileScript } from 'vue/compiler-sfc'
import { createRenderer, reactive, nextTick, defineComponent, h } from 'vue'
const vueUrl = import.meta.resolve('vue')
let index = 0
const moduleUrl = (source) =>
  `data:text/javascript;base64,${Buffer.from(source + `\n// module ${++index}`).toString('base64')}`
const transpile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8')
const domainUrl = moduleUrl(transpile(await read('src/utils/stock.ts')))
const domain = await import(domainUrl)
const context = {
  refreshes: 0,
  confirmation: undefined,
  calls: [],
  response: undefined,
  handler: undefined,
  warehouses: reactive({
    loaded: true,
    load: async () => {
      context.refreshes++
    },
    selectedId: 'w1',
    warehouses: [{ id: 'w1', name: 'Warehouse', code: 'W1', status: 1 }],
  }),
  auth: reactive({
    user: {
      id: 'user',
      permissions: [
        'STOCK_RECEIPT_VIEW',
        'STOCK_RECEIPT_CREATE',
        'STOCK_RECEIPT_UPDATE',
        'STOCK_RECEIPT_CONFIRM',
        'STOCK_RECEIPT_CANCEL',
        'INVENTORY_VIEW',
        'INVENTORY_MOVEMENT_VIEW',
      ],
    },
    isCatalogAdmin: false,
  }),
  payments: reactive({ revision: 0, summaries: {}, attempts: {}, syncOrders() {} }),
  stock: reactive({
    revision: 0,
    invalidate() {
      this.revision++
    },
  }),
}
globalThis.__salesTests = context
const mockUrl = moduleUrl(`
 import { defineComponent, h } from '${vueUrl}'
 const context = globalThis.__salesTests
 const call = async (method, url, data, config) => {
  const raw = data === undefined ? undefined : config.transformRequest[0](data)
  context.calls.push({ method, url, data, raw, config })
  const result = context.handler ? await context.handler({ method, url, data, raw, config }) : context.response
  const json = typeof result === 'string' ? result : JSON.stringify(result)
  return config.transformResponse[0](json)
 }
 export const getCatalogList = async () => ({ items: [], total: 0, page: 1, pageSize: 100 })
 export const request = { get: (url, config) => call('GET', url, undefined, config), post: (url, data, config) => call('POST', url, data, config), put: (url, data, config) => call('PUT', url, data, config) }
 export const useWarehouseStore = () => context.warehouses
 export const usePaymentsStore = () => context.payments
 export const useStockStore = () => context.stock
 export const useAuthStore = () => context.auth
 export const useCatalogPermission = () => ({ can: (permission) => context.auth.isCatalogAdmin || context.auth.user.permissions.includes(permission) })
 export const useI18n = () => ({ t: key => key })
 export const message = { success() {}, info() {} }
 export const Modal = { confirm: options => { context.confirmation = options } }
 export const formatDateTime = value => value
 export const BasicModal = defineComponent({ setup(_, { slots }) { return () => h('modal', [slots.default?.(), slots.footer?.()]) } })
 export const BasicTable = defineComponent({ props: ['columns','dataSource'], setup(props, { slots }) { return () => h('table', (props.dataSource ?? []).flatMap(record => props.columns.map(column => h('cell', { column: column.key }, slots.bodyCell?.({ column, record }))))) } })
 export default defineComponent({ setup() { return () => null } })
`)
const apiUrl = moduleUrl(
  transpile(
    (await read('src/api/stock/stock.api.ts'))
      .replace("'@/utils/request'", JSON.stringify(mockUrl))
      .replace("'@/utils/stock'", JSON.stringify(domainUrl)),
  ),
)
const salesDomainUrl = moduleUrl(
  transpile(
    (await read('src/utils/sales.ts')).replace("'@/utils/stock'", JSON.stringify(domainUrl)),
  ),
)
const paymentDomainUrl = moduleUrl(
  transpile(
    (await read('src/utils/payments.ts')).replace("'@/utils/stock'", JSON.stringify(domainUrl)),
  ),
)
const salesDomain = await import(salesDomainUrl)
const salesApiUrl = moduleUrl(
  transpile(
    (await read('src/api/sales/sales.api.ts'))
      .replace("'@/utils/request'", JSON.stringify(mockUrl))
      .replace("'@/utils/stock'", JSON.stringify(domainUrl)),
  ),
)
const api = await import(salesApiUrl)
const scopeUrl = moduleUrl(
  transpile(
    (await read('src/composables/useSalesScope.ts'))
      .replace(/from ['"]vue['"]/g, 'from ' + JSON.stringify(vueUrl))
      .replace(
        /from ['"]@\/(?:stores\/auth|stores\/warehouse|composables\/useCatalogPermission)['"]/g,
        'from ' + JSON.stringify(mockUrl),
      ),
  ),
)

async function component(path, expose) {
  let source = await read(path)
  source = source.replace('</script>', `defineExpose({ ${expose} })\n</script>`)
  const { descriptor } = parse(source)
  let code = compileScript(descriptor, { id: `test-${index}`, inlineTemplate: true }).content
  code = code.replace(/from ['"]vue['"]/g, `from '${vueUrl}'`)
  code = code.replace(
    /from ['"](?:vue-i18n|ant-design-vue|@\/components|@\/stores\/warehouse|@\/stores\/stock|@\/stores\/auth|@\/composables\/useCatalogPermission|@\/utils\/date|\.\/ProductSelect.vue|@\/components\/stock\/ProductSelect.vue|@\/components\/stock\/ReceiptDialog.vue|@\/components\/sales\/SalesOrderDialog.vue)['"]/g,
    `from '${mockUrl}'`,
  )
  code = code
    .replace(/from ['"]@\/utils\/payments['"]/g, 'from ' + JSON.stringify(paymentDomainUrl))
    .replace(/from ['"]@\/stores\/payments['"]/g, 'from ' + JSON.stringify(mockUrl))
    .replace(
      /from ['"](?:\.\/OrderPaymentPanel.vue|@\/components\/sales\/CollectPaymentDialog.vue)['"]/g,
      'from ' + JSON.stringify(mockUrl),
    )
  code = code
    .replace(/from ['"]@\/utils\/stock['"]/g, `from '${domainUrl}'`)
    .replace(/from ['"]@\/api\/stock\/stock.api['"]/g, `from '${apiUrl}'`)
  code = code
    .replace(/from ['"]@\/utils\/sales['"]/g, 'from ' + JSON.stringify(salesDomainUrl))
    .replace(/from ['"]@\/api\/sales\/sales.api['"]/g, 'from ' + JSON.stringify(salesApiUrl))
    .replace(/from ['"]@\/composables\/useSalesScope['"]/g, 'from ' + JSON.stringify(scopeUrl))
    .replace(
      /from ['"](?:\.\/CustomerSelect.vue|@\/components\/sales\/CustomerSelect.vue|@\/components\/sales\/CustomerDialog.vue)['"]/g,
      'from ' + JSON.stringify(mockUrl),
    )
    .replace(/from ['"]@\/api\/catalog\/catalog.api['"]/g, 'from ' + JSON.stringify(mockUrl))
  code = code.replace(
    /from ['"]@\/components\/sales\/PendingPaymentRetries.vue['"]/g,
    'from ' + JSON.stringify(mockUrl),
  )
  return (await import(moduleUrl(transpile(code)))).default
}
const SalesOrderDialog = await component(
  'src/components/sales/SalesOrderDialog.vue',
  'submit, load, reload, form, detail, fields, blocked, reason, goodsReturned, loading, customer',
)
const CustomerDialog = await component(
  'src/components/sales/CustomerDialog.vue',
  'submit, load, form, detail, fields, warehouseId',
)
const CustomersPage = await component(
  'src/views/sales/CustomersPage.vue',
  'load, rows, filters, page, changePage, total',
)
const SalesOrdersPage = await component(
  'src/views/sales/SalesOrdersPage.vue',
  'load, rows, filters, customers',
)
const CustomerSelect = await component(
  'src/components/sales/CustomerSelect.vue',
  'load, rows, options, change, search',
)
const ProductSelect = await component(
  'src/components/stock/ProductSelect.vue',
  'load, change, visibleOptions',
)
const InventoryPage = await component(
  'src/views/stock/InventoryPage.vue',
  'load, rows, salesOrderId, salesDetailOpen, receiptId, detailOpen',
)
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
  patchProp(node, key, _previous, value) {
    ;(node.props ??= {})[key] = value
  },
})
const flush = async () => {
  await new Promise((resolve) => setImmediate(resolve))
  await nextTick()
}
function mount(Component, props) {
  const state = reactive({ ...props })
  const Root = defineComponent({
    setup() {
      return () => h(Component, { ...state, ref: 'subject' })
    },
  })
  const app = renderer.createApp(Root)
  app.config.warnHandler = () => undefined
  app.config.globalProperties.$t = (key) => key
  for (const name of [
    'a-spin',
    'a-alert',
    'a-descriptions',
    'a-descriptions-item',
    'a-form',
    'a-form-item',
    'a-select',
    'a-input',
    'a-date-picker',
    'a-textarea',
    'a-button',
  ])
    app.component(
      name,
      defineComponent({
        inheritAttrs: false,
        setup(_, { attrs, slots }) {
          return () => h('div', attrs, slots.default?.())
        },
      }),
    )
  const tree = { children: [] }
  const root = app.mount(tree)
  return { vm: root.$refs.subject, state, tree, unmount: () => app.unmount() }
}

const allPermissions = [
  'CUSTOMER_VIEW',
  'CUSTOMER_CREATE',
  'CUSTOMER_UPDATE',
  'SALES_ORDER_VIEW',
  'SALES_ORDER_CREATE',
  'SALES_ORDER_UPDATE',
  'SALES_ORDER_CONFIRM',
  'SALES_ORDER_CANCEL',
  'PRODUCT_VIEW',
]
function reset() {
  context.calls = []
  context.handler = undefined
  context.response = undefined
  context.confirmation = undefined
  context.refreshes = 0
  context.stock.revision = 0
  context.warehouses.loaded = true
  context.warehouses.selectedId = 'w1'
  context.warehouses.warehouses = [
    { id: 'w1', name: 'Warehouse', code: 'W1', status: 1 },
    { id: 'w2', name: 'Other', code: 'W2', status: 1 },
  ]
  context.auth.user.id = 'user'
  context.auth.user.permissions = [...allPermissions]
  context.auth.isCatalogAdmin = false
}
const customer = (overrides = {}) => ({
  id: 'c1',
  warehouseId: 'w1',
  code: 'KH1',
  name: 'Customer',
  phone: '0900',
  address: 'Address',
  note: 'Note',
  status: 1,
  createdAt: '2026-10-09T00:00:00Z',
  updatedAt: '2026-10-09T00:00:00Z',
  ...overrides,
})
const order = (overrides = {}) => ({
  id: 's1',
  code: 'DH1',
  warehouseId: 'w1',
  saleDate: '2026-10-09',
  status: 'DRAFT',
  subtotal: 20000,
  discountAmount: 1000,
  totalAmount: 19000,
  version: 7,
  note: 'Note',
  createdBy: 'u1',
  createdAt: '2026-10-09T00:00:00Z',
  updatedAt: '2026-10-09T00:00:00Z',
  lines: [
    {
      productId: 'p1',
      quantity: 10,
      unitPrice: 2000,
      lineTotal: 20000,
      productCode: 'P1',
      productName: 'Product',
      unit: 'cay',
    },
  ],
  ...overrides,
})
const form = (overrides = {}) => ({
  warehouseId: 'w1',
  customerId: undefined,
  saleDate: '2026-10-09',
  note: '',
  discountAmount: '1000',
  lines: [{ key: 'k1', productId: 'p1', quantity: '10', unitPrice: '2000' }],
  ...overrides,
})
const writes = () => context.calls.filter((call) => call.method !== 'GET')
const pageData = (items) => ({ items, total: items.length, page: 1, pageSize: 10 })

test('exact totals: 10 x 2000 - 1000 = 19000; editing price to 3000 = 29000', () => {
  assert.equal(salesDomain.salesTotals(form()).totalAmount, 19000n)
  assert.equal(
    salesDomain.salesTotals(
      form({ lines: [{ productId: 'p1', quantity: '10', unitPrice: '3000' }] }),
    ).totalAmount,
    29000n,
  )
  assert.deepEqual(salesDomain.validateSales(form()), {})
})
test('zero price and discount remain valid; discount cannot exceed subtotal', () => {
  assert.deepEqual(
    salesDomain.validateSales(
      form({ discountAmount: '0', lines: [{ productId: 'p1', quantity: '1', unitPrice: '0' }] }),
    ),
    {},
  )
  assert.ok(salesDomain.validateSales(form({ discountAmount: '20001' })).discountAmount)
})
test('int64 line, subtotal overflow, decimal/exponent and duplicates are rejected', () => {
  const maximum = '9223372036854775807'
  assert.deepEqual(
    salesDomain.validateSales(
      form({
        discountAmount: '0',
        lines: [{ productId: 'p1', quantity: maximum, unitPrice: '1' }],
      }),
    ),
    {},
  )
  assert.ok(
    salesDomain.validateSales(
      form({ lines: [{ productId: 'p1', quantity: maximum, unitPrice: '2' }] }),
    )['lines[0].unitPrice'],
  )
  assert.ok(
    salesDomain.validateSales(
      form({
        lines: [
          { productId: 'p1', quantity: maximum, unitPrice: '1' },
          { productId: 'p2', quantity: '1', unitPrice: '1' },
        ],
      }),
    ).lines,
  )
  for (const quantity of ['0', '-1', '1.0', '1e3', '9223372036854775808'])
    assert.ok(
      salesDomain.validateSales(form({ lines: [{ productId: 'p1', quantity, unitPrice: '0' }] }))[
        'lines[0].quantity'
      ],
    )
  assert.ok(
    salesDomain.validateSales(form({ lines: [form().lines[0], form().lines[0]] }))[
      'lines[1].productId'
    ],
  )
})
test('real calendar date, note and 1-1000 line limits are validated', () => {
  assert.ok(salesDomain.validateSales(form({ saleDate: '2026-02-30' })).saleDate)
  assert.ok(salesDomain.validateSales(form({ note: 'a'.repeat(2001) })).note)
  assert.ok(salesDomain.validateSales(form({ lines: [] })).lines)
  assert.ok(salesDomain.validateSales(form({ lines: Array(1001).fill(form().lines[0]) })).lines)
})
test('customer trim and limits preserve phone leading zero and numeric status 0', () => {
  assert.deepEqual(salesDomain.customerInput(customer({ name: ' Customer ', status: 0 })), {
    name: 'Customer',
    phone: '0900',
    address: 'Address',
    note: 'Note',
    status: 0,
  })
  assert.ok(
    salesDomain.validateCustomer(
      customer({
        name: ' ',
        phone: '1'.repeat(21),
        address: 'a'.repeat(501),
        note: 'n'.repeat(2001),
        status: '0',
      }),
    ).status,
  )
})
test('snapshot names survive cancellation; missing customer name uses ID, retail uses label', () => {
  assert.equal(
    salesDomain.salesCustomerName(
      order({ customerId: 'c1', status: 'CANCELLED', customerSnapshot: { name: 'Historic' } }),
      [customer({ name: 'New' })],
    ),
    'Historic',
  )
  assert.equal(salesDomain.salesCustomerName(order({ customerId: 'missing' }), []), 'missing')
  assert.equal(salesDomain.salesCustomerName(order(), []), 'Khách lẻ')
})
test('API request uses relative paths and lossless integer tokens, preserves transform retry', async () => {
  reset()
  context.response = domain.stringifyStockJson(order({ totalAmount: 9223372036854775807n }))
  assert.equal((await api.getSalesOrder('s1')).totalAmount, 9223372036854775807n)
  await api.createSalesOrder({
    ...salesDomain.salesInput(
      form({
        discountAmount: '0',
        lines: [{ productId: 'p1', quantity: '9007199254740993', unitPrice: '0' }],
      }),
    ),
    warehouseId: 'w1',
  })
  const call = context.calls.at(-1)
  assert.equal(call.url, '/sales-orders')
  assert.equal(call.config.preventAutomaticRetry, true)
  assert.match(call.raw, /"quantity":9007199254740993/)
  assert.doesNotMatch(call.raw, /subtotal|snapshot|status|code/)
  assert.equal(call.config.transformRequest[0](call.raw), call.raw)
})
test('creating draft without INVENTORY_VIEW performs one POST and no inventory mutation', async () => {
  reset()
  context.response = order({ version: 0 })
  const subject = mount(SalesOrderDialog, { open: true, mode: 'create' })
  subject.vm.form = form()
  await subject.vm.submit()
  assert.equal(writes().length, 1)
  assert.equal(context.stock.revision, 0)
  assert.deepEqual(domain.parseStockJson(writes()[0].raw), {
    warehouseId: 'w1',
    customerId: null,
    saleDate: '2026-10-09',
    discountAmount: 1000,
    lines: [{ productId: 'p1', quantity: 10, unitPrice: 2000 }],
  })
  subject.unmount()
})
test('editing loads GET detail first, uses latest version, keeps zero fields and full lines', async () => {
  reset()
  context.response = order({
    customerId: 'c1',
    note: 'Keep',
    discountAmount: 0,
    lines: [
      {
        ...order().lines[0],
        productId: 'p2',
        quantity: 9007199254740993n,
        unitPrice: 0,
        lineTotal: 0,
      },
    ],
  })
  context.response = domain.stringifyStockJson(context.response)
  context.auth.user.permissions = allPermissions.filter((item) => item !== 'CUSTOMER_VIEW')
  const subject = mount(SalesOrderDialog, { open: true, mode: 'edit', id: 's1' })
  await flush()
  assert.equal(subject.vm.form.lines[0].quantity, '9007199254740993')
  assert.ok(subject.vm.form.lines[0].key)
  await subject.vm.submit()
  assert.deepEqual(domain.parseStockJson(writes()[0].raw), {
    customerId: 'c1',
    saleDate: '2026-10-09',
    note: 'Keep',
    discountAmount: 0,
    version: 7,
    lines: [{ productId: 'p2', quantity: 9007199254740993n, unitPrice: 0 }],
  })
  subject.unmount()
})
test('confirm loads version, blocks double submit and invalidates stock once', async () => {
  reset()
  let finish
  context.handler = ({ method }) =>
    method === 'GET'
      ? order()
      : new Promise((resolve) => {
          finish = resolve
        })
  const subject = mount(SalesOrderDialog, { open: true, mode: 'confirm', id: 's1' })
  await flush()
  const pending = subject.vm.submit()
  await subject.vm.submit()
  assert.equal(writes().length, 1)
  assert.equal(writes()[0].raw, '{"version":7}')
  finish(order({ status: 'CONFIRMED', version: 8 }))
  await pending
  assert.equal(subject.vm.detail.status, 'CONFIRMED')
  assert.equal(context.stock.revision, 1)
  subject.unmount()
})
test('already confirmed/cancelled detail cannot confirm again', async () => {
  for (const status of ['CONFIRMED', 'CANCELLED']) {
    reset()
    context.response = order({ status })
    const subject = mount(SalesOrderDialog, { open: true, mode: 'confirm', id: 's1' })
    await flush()
    await subject.vm.submit()
    assert.equal(writes().length, 0)
    subject.unmount()
  }
})
test('cancelling both draft and confirmed requires a nonblank reason', async () => {
  for (const status of ['DRAFT', 'CONFIRMED']) {
    reset()
    context.response = order({ status })
    const subject = mount(SalesOrderDialog, { open: true, mode: 'cancel', id: 's1' })
    await flush()
    subject.vm.reason = '   '
    subject.vm.goodsReturned = true
    await subject.vm.submit()
    assert.ok(subject.vm.fields.reason)
    assert.equal(writes().length, 0)
    subject.unmount()
  }
})
test('confirmed cancellation requires unchecked return acknowledgement then sends true', async () => {
  reset()
  context.handler = ({ method }) =>
    order({ status: method === 'GET' ? 'CONFIRMED' : 'CANCELLED', version: 8 })
  const subject = mount(SalesOrderDialog, { open: true, mode: 'cancel', id: 's1' })
  await flush()
  assert.equal(subject.vm.goodsReturned, false)
  subject.vm.reason = ' Recovered '
  await subject.vm.submit()
  assert.equal(writes().length, 0)
  assert.ok(subject.vm.fields.goodsReturned)
  subject.vm.goodsReturned = true
  await subject.vm.submit()
  assert.equal(writes()[0].raw, '{"version":8,"reason":"Recovered","goodsReturned":true}')
  assert.equal(context.stock.revision, 1)
  subject.unmount()
})
test('draft cancellation omits goodsReturned and never consults catalogue status', async () => {
  reset()
  context.auth.user.permissions = ['SALES_ORDER_VIEW', 'SALES_ORDER_CANCEL']
  context.response = order()
  const subject = mount(SalesOrderDialog, { open: true, mode: 'cancel', id: 's1' })
  await flush()
  subject.vm.reason = 'Cancelled draft'
  await subject.vm.submit()
  assert.equal(writes()[0].raw, '{"version":7,"reason":"Cancelled draft"}')
  subject.unmount()
})
test('409 preserves unsaved draft and prevents retry; reload requires explicit approval', async () => {
  reset()
  context.handler = ({ method }) => {
    if (method === 'GET') return order()
    throw Object.assign(new Error('Backend conflict'), { status: 409 })
  }
  const subject = mount(SalesOrderDialog, { open: true, mode: 'edit', id: 's1' })
  await flush()
  subject.vm.form.note = 'Unsaved'
  await subject.vm.submit()
  assert.equal(subject.vm.form.note, 'Unsaved')
  assert.equal(subject.vm.blocked, true)
  await subject.vm.submit()
  assert.equal(writes().length, 1)
  subject.vm.reload()
  assert.ok(context.confirmation)
  assert.equal(subject.vm.form.note, 'Unsaved')
  assert.equal(context.calls.filter((call) => call.method === 'GET').length, 1)
  subject.unmount()
})
test('backend stock error leaves status/stock unchanged and displays backend message', async () => {
  reset()
  context.handler = ({ method }) => {
    if (method === 'GET') return order()
    throw Object.assign(new Error('Not enough goods'), {
      status: 409,
      details: { productId: 'p1' },
    })
  }
  const subject = mount(SalesOrderDialog, { open: true, mode: 'confirm', id: 's1' })
  await flush()
  await subject.vm.submit()
  assert.equal(subject.vm.detail.status, 'DRAFT')
  assert.equal(context.stock.revision, 0)
  assert.equal(subject.vm.fields.productId, 'p1')
  subject.unmount()
})
test('ambiguous confirm/cancel failure reconciles via GET before any retry', async () => {
  for (const mode of ['confirm', 'cancel']) {
    reset()
    let reads = 0
    const final = mode === 'confirm' ? 'CONFIRMED' : 'CANCELLED'
    context.handler = ({ method }) => {
      if (method === 'GET')
        return order({
          status: ++reads === 1 ? (mode === 'confirm' ? 'DRAFT' : 'CONFIRMED') : final,
        })
      throw new Error('Timeout')
    }
    const subject = mount(SalesOrderDialog, { open: true, mode, id: 's1' })
    await flush()
    subject.vm.reason = 'Recovered'
    subject.vm.goodsReturned = true
    await subject.vm.submit()
    assert.equal(reads, 2)
    assert.equal(subject.vm.detail.status, final)
    assert.equal(subject.vm.blocked, true)
    await subject.vm.submit()
    assert.equal(writes().length, 1)
    subject.unmount()
  }
})
test('inactive customer stays selected and blocks saving until explicit retail/customer change', async () => {
  reset()
  context.handler = ({ url }) =>
    url.startsWith('/customers') ? customer({ status: 0 }) : order({ customerId: 'c1' })
  const subject = mount(SalesOrderDialog, { open: true, mode: 'edit', id: 's1' })
  await flush()
  assert.equal(subject.vm.form.customerId, 'c1')
  assert.equal(subject.vm.customer.status, 0)
  await subject.vm.submit()
  assert.ok(subject.vm.fields.customerId)
  assert.equal(writes().length, 0)
  subject.vm.form.customerId = undefined
  await subject.vm.submit()
  assert.equal(writes().length, 1)
  subject.unmount()
})
test('wrong warehouse customer is not accepted by draft form', async () => {
  reset()
  context.response = order()
  const subject = mount(SalesOrderDialog, { open: true, mode: 'create' })
  subject.vm.form = form({ customerId: 'c1' })
  subject.vm.customer = customer({ warehouseId: 'w2' })
  await subject.vm.submit()
  assert.ok(subject.vm.fields.customerId)
  assert.equal(writes().length, 0)
  subject.unmount()
})
test('warehouse change clears customer but keeps lines and note', async () => {
  reset()
  const subject = mount(SalesOrderDialog, { open: true, mode: 'create' })
  subject.vm.form = form({ customerId: 'c1', note: 'Keep' })
  await flush()
  subject.vm.form.warehouseId = 'w2'
  await flush()
  assert.equal(subject.vm.form.customerId, undefined)
  assert.equal(subject.vm.form.note, 'Keep')
  assert.equal(subject.vm.form.lines[0].productId, 'p1')
  subject.unmount()
})
test('customer status toggle uses full detail preserving all contact fields; inactive warehouse allows edit', async () => {
  reset()
  context.warehouses.warehouses[0].status = 0
  context.response = customer()
  const subject = mount(CustomerDialog, { open: true, mode: 'toggle', id: 'c1' })
  await flush()
  await subject.vm.submit()
  assert.deepEqual(domain.parseStockJson(writes()[0].raw), {
    name: 'Customer',
    phone: '0900',
    address: 'Address',
    note: 'Note',
    status: 0,
  })
  subject.unmount()
})
test('customers list sends status 0, changing filters/page size resets page, all statuses omit status', async () => {
  reset()
  context.response = pageData([customer({ status: 0 })])
  const subject = mount(CustomersPage, {})
  await flush()
  subject.vm.changePage(3, 10)
  await flush()
  subject.vm.filters.status = 0
  await flush()
  assert.equal(subject.vm.page, 1)
  assert.equal(context.calls.at(-1).config.params.status, 0)
  subject.vm.filters.status = undefined
  await flush()
  assert.equal('status' in context.calls.at(-1).config.params, false)
  subject.vm.changePage(3, 20)
  await flush()
  assert.equal(subject.vm.page, 1)
  subject.unmount()
})
test('sales list preserves inclusive date strings and rejects reversed range without API call', async () => {
  reset()
  context.response = pageData([order()])
  const subject = mount(SalesOrdersPage, {})
  await flush()
  subject.vm.filters.from = '2026-10-09'
  subject.vm.filters.to = '2026-10-09'
  await flush()
  const params = context.calls.at(-1).config.params
  assert.equal(params.from, '2026-10-09')
  assert.equal(params.to, '2026-10-09')
  assert.equal('keyword' in params, false)
  assert.equal('type' in params, false)
  const count = context.calls.length
  subject.vm.filters.from = '2026-10-10'
  await flush()
  assert.equal(context.calls.length, count)
  subject.unmount()
})
test('late list response from previous warehouse cannot restore old rows', async () => {
  reset()
  let finish
  context.handler = ({ config }) =>
    config.params.warehouseId === 'w1'
      ? new Promise((resolve) => {
          finish = resolve
        })
      : pageData([customer({ warehouseId: 'w2' })])
  const subject = mount(CustomersPage, {})
  await flush()
  context.warehouses.selectedId = 'w2'
  await flush()
  finish(pageData([customer()]))
  await flush()
  assert.equal(subject.vm.rows[0].warehouseId, 'w2')
  subject.unmount()
})
test('revoked warehouse/permission discards pending detail and disables mutation', async () => {
  for (const revoke of ['warehouse', 'permission']) {
    reset()
    let finish
    context.handler = () =>
      new Promise((resolve) => {
        finish = resolve
      })
    const subject = mount(SalesOrderDialog, { open: true, mode: 'edit', id: 's1' })
    await flush()
    if (revoke === 'warehouse') context.warehouses.warehouses = []
    else context.auth.user.permissions = []
    await flush()
    finish(order())
    await flush()
    assert.equal(subject.vm.detail, undefined)
    await subject.vm.submit()
    assert.equal(writes().length, 0)
    subject.unmount()
  }
})
test('403 clears visible results and reloads assigned warehouse scope', async () => {
  reset()
  context.handler = () => {
    throw Object.assign(new Error('Denied'), { status: 403 })
  }
  const subject = mount(CustomersPage, {})
  await flush()
  assert.deepEqual(subject.vm.rows, [])
  assert.equal(context.refreshes, 1)
  subject.unmount()
})
test('separate mutation permissions and Admin follow existing permission mechanism', async () => {
  reset()
  context.auth.user.permissions = ['SALES_ORDER_VIEW']
  context.response = order()
  const subject = mount(SalesOrderDialog, { open: true, mode: 'confirm', id: 's1' })
  await flush()
  await subject.vm.submit()
  assert.equal(context.calls.length, 0)
  subject.unmount()
  context.auth.isCatalogAdmin = true
  const admin = mount(SalesOrderDialog, { open: true, mode: 'confirm', id: 's1' })
  await flush()
  await admin.vm.submit()
  assert.equal(writes().length, 1)
  admin.unmount()
})
test('customer picker uses warehouse/status/search/server pagination and ignores foreign customers', async () => {
  reset()
  context.response = {
    ...pageData([
      customer(),
      customer({ id: 'c2', warehouseId: 'w2' }),
      customer({ id: 'c3', status: 0 }),
    ]),
    total: 120,
  }
  const subject = mount(CustomerSelect, { warehouseId: 'w1', activeOnly: true })
  await subject.vm.load()
  assert.equal(subject.vm.rows.length, 1)
  assert.equal(context.calls.at(-1).config.params.status, 1)
  await subject.vm.load(true)
  assert.equal(context.calls.at(-1).config.params.page, 2)
  subject.vm.search('0900')
  await new Promise((resolve) => setTimeout(resolve, 300))
  assert.equal(context.calls.at(-1).config.params.keyword, '0900')
  assert.equal(context.calls.at(-1).config.params.page, 1)
  subject.unmount()
})
test('product selector fetches exact default sale price including zero and filters inactive products', async () => {
  reset()
  context.response =
    '{"items":[{"id":"p1","code":"P1","name":"Product","status":1,"defaultSalePrice":9223372036854775807},{"id":"p2","code":"P2","name":"Free","status":1,"defaultSalePrice":0},{"id":"p3","code":"P3","name":"Inactive","status":0,"defaultSalePrice":1}],"total":3,"page":1,"pageSize":100}'
  const prices = []
  const subject = mount(ProductSelect, {
    activeOnly: true,
    salePricing: true,
    onSelectedPrice: (value) => prices.push(value),
  })
  await subject.vm.load()
  assert.equal(context.calls.at(-1).url, '/products')
  assert.equal(subject.vm.visibleOptions.length, 2)
  subject.vm.change('p1')
  subject.vm.change('p2')
  assert.deepEqual(prices, [9223372036854775807n, 0])
  subject.unmount()
})
test('stock/sales movements use correct document IDs and keep server totals unfiltered', async () => {
  reset()
  context.auth.user.permissions.push('INVENTORY_MOVEMENT_VIEW', 'STOCK_RECEIPT_VIEW')
  context.response = pageData([
    {
      id: 'm1',
      warehouseId: 'w1',
      productId: 'p1',
      type: 'SALE_CONFIRM',
      quantityChange: -10,
      salesOrderId: 's1',
      salesOrderCode: 'DH1',
      performedAt: '2026-10-09T00:00:00Z',
    },
    {
      id: 'm2',
      warehouseId: 'w1',
      productId: 'p1',
      type: 'RECEIPT_CONFIRM',
      quantityChange: 10,
      receiptId: 'r1',
      receiptCode: 'PN1',
      performedAt: '2026-10-09T00:00:00Z',
    },
  ])
  const subject = mount(InventoryPage, { movements: true })
  await flush()
  assert.equal(subject.vm.rows.length, 2)
  assert.equal('type' in context.calls.at(-1).config.params, false)
  const nodes = []
  const walk = (node) => {
    nodes.push(node)
    for (const child of node.children ?? []) walk(child)
  }
  walk(subject.tree)
  const buttons = nodes.filter(
    (node) =>
      typeof node.props?.onClick === 'function' &&
      node.children?.some((child) => ['DH1', 'PN1'].includes(child.text)),
  )
  assert.equal(buttons.length, 2)
  buttons[0].props.onClick()
  assert.equal(subject.vm.salesOrderId, 's1')
  assert.equal(subject.vm.receiptId, undefined)
  buttons[1].props.onClick()
  assert.equal(subject.vm.receiptId, 'r1')
  subject.unmount()
})
test('new labels are valid UTF-8 and Vietnamese/English keys agree', async () => {
  const vi = (await import(moduleUrl(transpile(await read('src/locales/vi-VN.ts'))))).default
  const en = (await import(moduleUrl(transpile(await read('src/locales/en-US.ts'))))).default
  assert.equal(vi.sales.customers, 'Khách hàng')
  assert.equal(vi.stock.SALE_CONFIRM, 'Xác nhận bán hàng')
  assert.deepEqual(Object.keys(vi.sales).sort(), Object.keys(en.sales).sort())
  assert.equal(vi.stock.sourceDocument, 'Chứng từ nguồn')
})

test('shared auth interceptor refreshes session but never replays a sales creation POST', async () => {
  reset()
  const audit = { replayed: 0, expired: 0, refreshed: 0, cleared: 0, rejected: undefined }
  globalThis.__salesRequestAudit = audit
  const requestMockUrl = moduleUrl(`
    const audit = globalThis.__salesRequestAudit
    const client = {
      interceptors: { request: { use() {} }, response: { use(_success, rejected) { audit.rejected = rejected } } },
      request: async () => { audit.replayed++; return {} }
    }
    export default { create: () => client }
    export const message = { error() {} }
    export const i18n = { global: { t: key => key } }
    export const clearTokens = () => { audit.cleared++ }
    export const getAccessToken = () => 'access'
    export const getRefreshToken = () => 'refresh'
  `)
  let source = await read('src/utils/request.ts')
  source = source.replace(
    /from ['"](?:axios|ant-design-vue|@\/locales|@\/utils\/storage)['"]/g,
    'from ' + JSON.stringify(requestMockUrl),
  )
  source = source.replace('import.meta.env.VITE_GLOB_API_URL', "'http://example.test/api'")
  const client = await import(moduleUrl(transpile(source)))
  client.configureRequestAuth({
    refresh: async () => {
      audit.refreshed++
      return 'new-access'
    },
    onSessionExpired: () => {
      audit.expired++
    },
  })
  await assert.rejects(
    audit.rejected({
      response: { status: 401, data: { message: 'Login required' } },
      config: { url: '/sales-orders', preventAutomaticRetry: true, headers: { set() {} } },
    }),
    /Login required/,
  )
  assert.equal(audit.refreshed, 1)
  assert.equal(audit.replayed, 0)
  assert.equal(audit.expired, 0)
  assert.equal(audit.cleared, 0)
  await audit.rejected({
    response: { status: 401, data: {} },
    config: { url: '/sales-orders/s1', headers: { set() {} } },
  })
  assert.equal(audit.replayed, 1)
})

test('orders with active payments cannot be cancelled and backend rejection explains unsupported refunds', async () => {
  reset()
  context.response = order({ status: 'CONFIRMED', paidAmount: 600000 })
  const subject = mount(SalesOrderDialog, { open: true, mode: 'cancel', id: 's1' })
  await flush()
  subject.vm.reason = 'Attempt'
  subject.vm.goodsReturned = true
  await subject.vm.submit()
  assert.equal(writes().length, 0)
  assert.match(
    salesDomain.salesError({ status: 409, code: 'SALES_ORDER_HAS_PAYMENTS' }),
    /hoàn tiền/,
  )
  subject.unmount()
})
