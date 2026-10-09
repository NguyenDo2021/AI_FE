/* eslint-disable vue/one-component-per-file -- Component test doubles share one harness. */
import { setImmediate } from 'node:timers'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Buffer } from 'node:buffer'
import ts from 'typescript'
import { parse, compileScript } from 'vue/compiler-sfc'
import { createRenderer, reactive, nextTick, defineComponent, h } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
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
  payments: reactive({ revision: 0, summaries: {}, attempts: {} }),
  stock: reactive({
    revision: 0,
    invalidate() {
      this.revision++
    },
  }),
}
globalThis.__salesTests = context
const storage = {}
Object.defineProperties(storage, {
  getItem: { value: (key) => storage[key] ?? null },
  setItem: {
    value: (key, value) => {
      storage[key] = value
    },
  },
  removeItem: {
    value: (key) => {
      delete storage[key]
    },
  },
})
globalThis.sessionStorage = storage
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
const salesApiUrl = moduleUrl(
  transpile(
    (await read('src/api/sales/sales.api.ts'))
      .replace("'@/utils/request'", JSON.stringify(mockUrl))
      .replace("'@/utils/stock'", JSON.stringify(domainUrl)),
  ),
)
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

const paymentsDomain = await import(paymentDomainUrl)
const paymentApiUrl = moduleUrl(
  transpile(
    (await read('src/api/payments/payments.api.ts'))
      .replace("'@/utils/request'", JSON.stringify(mockUrl))
      .replace("'@/api/sales/sales.api'", JSON.stringify(salesApiUrl))
      .replace("'@/utils/stock'", JSON.stringify(domainUrl)),
  ),
)
const paymentApi = await import(paymentApiUrl)
const paymentStoreUrl = moduleUrl(
  transpile(
    (await read('src/stores/payments.ts'))
      .replace("'vue'", JSON.stringify(vueUrl))
      .replace("'pinia'", JSON.stringify(import.meta.resolve('pinia')))
      .replace("'@/stores/auth'", JSON.stringify(mockUrl))
      .replace("'@/stores/warehouse'", JSON.stringify(mockUrl))
      .replace("'@/api/payments/payments.api'", JSON.stringify(paymentApiUrl))
      .replace("'@/utils/stock'", JSON.stringify(domainUrl))
      .replace("'@/utils/payments'", JSON.stringify(paymentDomainUrl)),
  ),
)
const { usePaymentsStore } = await import(paymentStoreUrl)
const paymentScopeUrl = moduleUrl(
  transpile(
    (await read('src/composables/usePaymentScope.ts'))
      .replace("'vue'", JSON.stringify(vueUrl))
      .replace("'@/composables/useSalesScope'", JSON.stringify(scopeUrl)),
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
    .replace(/from ['"]@\/stores\/payments['"]/g, 'from ' + JSON.stringify(paymentStoreUrl))
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
  code = code
    .replace(
      /from ['"]@\/composables\/usePaymentScope['"]/g,
      'from ' + JSON.stringify(paymentScopeUrl),
    )
    .replace(
      /from ['"]@\/api\/payments\/payments.api['"]/g,
      'from ' + JSON.stringify(paymentApiUrl),
    )
    .replace(
      /from ['"](?:\.\/(?:PaymentDetailDialog|SalesOrderDialog|ReceivableOrders|CollectPaymentDialog|PaymentHistory).vue|@\/components\/sales\/(?:ReceivableOrders|CustomerReceivablesDialog).vue)['"]/g,
      'from ' + JSON.stringify(mockUrl),
    )
  code = code.replace(
    /from ['"]@\/components\/sales\/PendingPaymentRetries.vue['"]/g,
    'from ' + JSON.stringify(mockUrl),
  )
  return (await import(moduleUrl(transpile(code)))).default
}
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

const PendingRetries = await component(
  'src/components/sales/PendingPaymentRetries.vue',
  'retry, rows, error',
)
const CollectDialog = await component(
  'src/components/sales/CollectPaymentDialog.vue',
  'submit, form, detail, fields, attempt, error',
)
const History = await component(
  'src/components/sales/PaymentHistory.vue',
  'load, rows, filters, page, pageSize, changePage, total, error',
)
const CustomerDebt = await component(
  'src/components/sales/CustomerReceivablesDialog.vue',
  'load, detail, page, pageSize, changePage, error',
)
const DebtPage = await component(
  'src/views/sales/ReceivablesPage.vue',
  'load, rows, orders, tab, filters, page, pageSize, changePage, total',
)
const DetailDialog = await component(
  'src/components/sales/PaymentDetailDialog.vue',
  'load, submit, detail, reason, fields, error',
)
const order = (extra = {}) => ({
  id: 's1',
  code: 'DH1',
  warehouseId: 'w1',
  status: 'CONFIRMED',
  saleDate: '2026-10-09',
  totalAmount: 1000000,
  paidAmount: 0,
  remainingAmount: 1000000,
  paymentStatus: 'UNPAID',
  version: 7,
  subtotal: 1000000,
  discountAmount: 0,
  lines: [],
  createdAt: '2026-10-09T00:00:00Z',
  createdBy: 'u1',
  ...extra,
})
const receipt = (extra = {}) => ({
  id: 'p1',
  code: 'PT1',
  salesOrderId: 's1',
  warehouseId: 'w1',
  amount: 600000,
  method: 'CASH',
  paymentDate: '2026-10-09',
  status: 'ACTIVE',
  createdBy: 'u1',
  createdAt: '2026-10-09T00:00:00Z',
  ...extra,
})
const mutation = (extra = {}) => ({
  payment: receipt(extra),
  order: {
    salesOrderId: 's1',
    totalAmount: 1000000,
    paidAmount: 600000,
    remainingAmount: 400000,
    paymentStatus: 'PARTIALLY_PAID',
  },
})
const pageData = (items, total = items.length) => ({ items, total, page: 1, pageSize: 10 })
const form = (extra = {}) => ({
  amount: '600000',
  paymentDate: '2026-10-09',
  method: 'CASH',
  reference: ' ref ',
  note: ' note ',
  ...extra,
})
const attempt = (extra = {}) => ({
  key: 'b4327560-bcca-4c1b-9209-2a1b3f7a0417',
  salesOrderId: 's1',
  warehouseId: 'w1',
  input: paymentsDomain.paymentInput(form()),
  state: 'uncertain',
  ...extra,
})
const writes = () => context.calls.filter((call) => call.method !== 'GET')
function reset(
  permissions = ['PAYMENT_VIEW', 'PAYMENT_CREATE', 'PAYMENT_CANCEL', 'RECEIVABLE_VIEW'],
) {
  context.calls = []
  context.handler = undefined
  context.response = undefined
  context.refreshes = 0
  context.auth.user = { id: 'u1', permissions }
  context.auth.isCatalogAdmin = false
  context.auth.getUserInfo = async () => {
    context.refreshes++
    return context.auth.user
  }
  context.warehouses.selectedId = 'w1'
  context.warehouses.warehouses = [
    { id: 'w1', name: 'Warehouse', code: 'W1', status: 1 },
    { id: 'w2', name: 'Second', code: 'W2', status: 1 },
  ]
  for (const key of Object.keys(storage)) delete storage[key]
  setActivePinia(createPinia())
  return usePaymentsStore()
}
test('payment states, draft/cancelled and zero value confirmed are handled explicitly', () => {
  assert.equal(paymentsDomain.paymentLabel(order()), 'Chưa thanh toán')
  assert.equal(paymentsDomain.canCollect(order()), true)
  for (const status of ['DRAFT', 'CANCELLED']) {
    assert.equal(
      paymentsDomain.paymentLabel(order({ status, remainingAmount: 0, paymentStatus: undefined })),
      'Không áp dụng',
    )
    assert.equal(paymentsDomain.canCollect(order({ status })), false)
  }
  assert.equal(
    paymentsDomain.paymentLabel(
      order({ totalAmount: 0, remainingAmount: 0, paymentStatus: 'PAID' }),
    ),
    'Đã thanh toán',
  )
  assert.equal(paymentsDomain.canCollect(order({ remainingAmount: 0 })), false)
})
test('exact int64 JSON, strict DTO, untrimmed strings and future local dates', async () => {
  reset()
  context.response = mutation()
  const input = paymentsDomain.paymentInput(
    form({ amount: '9223372036854775807', paymentDate: '2099-01-01' }),
  )
  await paymentApi.createPayment('s1', input, attempt().key)
  assert.equal(writes()[0].url, '/sales-orders/s1/payments')
  assert.equal(writes()[0].config.headers['Idempotency-Key'], attempt().key)
  assert.equal(writes()[0].config.preventAutomaticRetry, true)
  assert.equal(
    writes()[0].raw,
    '{"amount":9223372036854775807,"paymentDate":"2099-01-01","method":"CASH","reference":" ref ","note":" note "}',
  )
  assert.deepEqual(
    paymentsDomain.validatePayment(
      form({ amount: '9223372036854775807', paymentDate: '2099-01-01' }),
      order({ remainingAmount: 9223372036854775807n }),
    ),
    {},
  )
  const result = domain.parseStockJson('{"amount":9223372036854775807}')
  assert.equal(result.amount, 9223372036854775807n)
  for (const amount of ['0', '-1', '600000.0', '6e5', '9223372036854775808', '1000001'])
    assert.ok(paymentsDomain.validatePayment(form({ amount }), order()).amount)
})
test('partial collection updates authoritative summary and preserves sales version', async () => {
  const store = reset()
  context.response = mutation()
  const result = await store.collect(attempt())
  const updated = paymentsDomain.applyPaymentSummary(order(), result.order)
  assert.equal(updated.version, 7)
  assert.equal(updated.remainingAmount, 400000)
  assert.equal(updated.paymentStatus, 'PARTIALLY_PAID')
  assert.equal(store.revision, 1)
  assert.equal(store.attempts.s1, undefined)
})
test('ambiguous failure saves exact request, retry ignores edited payload and returns cancelled receipt', async () => {
  const store = reset()
  context.handler = () => {
    throw new Error('Timeout')
  }
  await assert.rejects(store.collect(attempt()), /Timeout/)
  assert.equal(store.attempts.s1.key, attempt().key)
  assert.ok(storage['payment-retry:u1'])
  assert.equal(storage['payment-retry:u1'].includes('token'), false)
  context.response = mutation({ status: 'CANCELLED' })
  context.handler = undefined
  const result = await store.collect(
    attempt({
      key: 'different',
      input: paymentsDomain.paymentInput(form({ amount: '1', note: 'changed' })),
    }),
  )
  assert.equal(result.payment.status, 'CANCELLED')
  assert.equal(writes()[0].raw, writes()[1].raw)
  assert.equal(
    writes()[0].config.headers['Idempotency-Key'],
    writes()[1].config.headers['Idempotency-Key'],
  )
})
test('retry survives reload and remains isolated between users', async () => {
  let store = reset()
  context.handler = () => {
    throw new Error('Network')
  }
  await assert.rejects(store.collect(attempt()))
  setActivePinia(createPinia())
  store = usePaymentsStore()
  assert.equal(store.attempts.s1.input.amount, 600000n)
  context.auth.user = { id: 'u2', permissions: ['PAYMENT_CREATE'] }
  assert.deepEqual(store.attempts, {})
  context.auth.user = null
  paymentsDomain.clearPaymentRetries()
  assert.equal(Object.keys(storage).length, 0)
})
test('idempotency conflict is retained and cannot bypass with a fresh key', async () => {
  const store = reset()
  context.handler = () => {
    throw Object.assign(new Error('Conflict'), { status: 409, code: 'IDEMPOTENCY_CONFLICT' })
  }
  await assert.rejects(store.collect(attempt()))
  assert.equal(store.attempts.s1.state, 'conflict')
  await store.collect(attempt({ key: 'new' }))
  assert.equal(writes().length, 1)
})
test('double submit creates one request and late response cannot update another user', async () => {
  const store = reset()
  let finish
  context.handler = () =>
    new Promise((resolve) => {
      finish = resolve
    })
  const pending = store.collect(attempt())
  await store.collect(attempt())
  assert.equal(writes().length, 1)
  context.auth.user = { id: 'u2', permissions: [] }
  finish(mutation())
  await pending
  assert.deepEqual(store.summaries, {})
  assert.equal(store.revision, 0)
})
test('form locks payload after network failure, restores it when reopened and retries the old key', async () => {
  reset()
  context.handler = () => {
    throw new Error('Timeout')
  }
  const subject = mount(CollectDialog, { open: true, order: order() })
  subject.vm.form = form()
  await subject.vm.submit()
  assert.ok(subject.vm.attempt)
  const key = writes()[0].config.headers['Idempotency-Key']
  subject.state.open = false
  await flush()
  subject.state.open = true
  await flush()
  assert.equal(subject.vm.form.amount, '600000')
  subject.vm.form.note = 'Should not change retry'
  context.handler = undefined
  context.response = mutation()
  await subject.vm.submit()
  assert.equal(writes()[1].config.headers['Idempotency-Key'], key)
  assert.equal(writes()[1].raw, writes()[0].raw)
  subject.unmount()
})
test('overpayment backend error preserves form and permission-aware reload is separate', async () => {
  reset(['PAYMENT_CREATE'])
  context.handler = () => {
    throw Object.assign(new Error('Exceeded'), { status: 409, code: 'PAYMENT_EXCEEDS_REMAINING' })
  }
  const subject = mount(CollectDialog, { open: true, order: order() })
  subject.vm.form = form()
  await subject.vm.submit()
  assert.equal(subject.vm.form.note, ' note ')
  assert.equal(context.calls.length, 1)
  assert.equal(subject.vm.attempt, undefined)
  subject.unmount()
})
test('inactive warehouse and customer permit collection; no stock mutations occur', async () => {
  reset(['PAYMENT_CREATE'])
  context.warehouses.warehouses[0].status = 0
  context.response = mutation()
  const before = context.stock.revision
  const subject = mount(CollectDialog, {
    open: true,
    order: order({ customerId: 'inactive-customer' }),
  })
  subject.vm.form = form()
  await subject.vm.submit()
  assert.equal(writes().length, 1)
  assert.equal(context.stock.revision, before)
  subject.unmount()
})
test('payment-only access loads global receipts and order history without sales/customer requests', async () => {
  reset(['PAYMENT_VIEW'])
  context.response = pageData([receipt()])
  const subject = mount(History, { orderId: 's1' })
  await flush()
  assert.equal(subject.vm.rows.length, 1)
  assert.equal(context.calls[0].url, '/sales-orders/s1/payments')
  assert.equal(
    context.calls.some((call) => call.url === '/sales-orders' || call.url.startsWith('/customers')),
    false,
  )
  subject.unmount()
})
test('payment list filters send supported fields and inclusive date strings only', async () => {
  reset(['PAYMENT_VIEW'])
  context.response = pageData([receipt()])
  const subject = mount(History, {})
  await flush()
  subject.vm.filters.from = '2026-10-09'
  subject.vm.filters.to = '2026-10-09'
  subject.vm.filters.method = 'BANK_TRANSFER'
  await flush()
  const params = context.calls.at(-1).config.params
  assert.equal(params.from, '2026-10-09')
  assert.equal(params.to, '2026-10-09')
  assert.equal('keyword' in params, false)
  const count = context.calls.length
  subject.vm.filters.from = '2026-10-10'
  await flush()
  assert.equal(context.calls.length, count)
  subject.unmount()
})
test('customer debt total comes from backend independent of pageSize=1 and needs no customer/sales view', async () => {
  reset(['RECEIVABLE_VIEW'])
  context.response = {
    customerId: 'c1',
    warehouseId: 'w1',
    remainingAmount: 2400000,
    orders: pageData([order()], 2),
  }
  const subject = mount(CustomerDebt, { open: true, customerId: 'c1' })
  await flush()
  subject.vm.changePage(1, 1)
  await flush()
  assert.equal(subject.vm.detail.remainingAmount, 2400000)
  assert.equal(subject.vm.detail.orders.total, 2)
  assert.deepEqual(context.calls.at(-1).config.params, { page: 1, pageSize: 1 })
  assert.ok(context.calls.every((call) => call.url === '/customers/c1/receivables'))
  context.response = {
    customerId: 'c1',
    warehouseId: 'w1',
    remainingAmount: 0,
    orders: pageData([]),
  }
  await subject.vm.load()
  assert.equal(subject.vm.detail.remainingAmount, 0)
  assert.equal(subject.vm.detail.orders.total, 0)
  subject.unmount()
})
test('walk-in orders are loaded in a separate tab and never synthesize a customer', async () => {
  reset(['RECEIVABLE_VIEW'])
  context.response = pageData([])
  const subject = mount(DebtPage, {})
  await flush()
  context.response = pageData([order()])
  subject.vm.tab = 'walk-in'
  await flush()
  assert.equal(context.calls.at(-1).url, '/receivables/walk-in-orders')
  assert.equal(subject.vm.orders.length, 1)
  assert.deepEqual(subject.vm.rows, [])
  assert.equal('customerId' in context.calls.at(-1).config.params, false)
  subject.unmount()
})
test('scope/user change discards late payment list responses', async () => {
  reset(['PAYMENT_VIEW'])
  let finish
  context.handler = ({ config }) =>
    config.params.warehouseId === 'w1'
      ? new Promise((resolve) => {
          finish = resolve
        })
      : pageData([receipt({ warehouseId: 'w2' })])
  const subject = mount(History, {})
  await flush()
  context.warehouses.selectedId = 'w2'
  await flush()
  finish(pageData([receipt()]))
  await flush()
  assert.equal(subject.vm.rows[0].warehouseId, 'w2')
  context.auth.user.permissions = []
  await flush()
  assert.deepEqual(subject.vm.rows, [])
  subject.unmount()
})
test('403 refreshes current permissions and assigned warehouses', async () => {
  reset(['PAYMENT_VIEW'])
  context.handler = () => {
    throw Object.assign(new Error('Denied'), { status: 403, code: 'FORBIDDEN' })
  }
  const subject = mount(History, {})
  await flush()
  assert.deepEqual(subject.vm.rows, [])
  assert.equal(context.refreshes, 2)
  subject.unmount()
})
test('cancel requires reason, updates authoritative summary and never changes stock', async () => {
  const store = reset()
  context.response = receipt()
  const subject = mount(DetailDialog, { open: true, id: 'p1', cancel: true })
  await flush()
  subject.vm.reason = '   '
  await subject.vm.submit()
  assert.equal(writes().length, 0)
  context.response = {
    payment: receipt({ status: 'CANCELLED' }),
    order: {
      salesOrderId: 's1',
      totalAmount: 1000000,
      paidAmount: 0,
      remainingAmount: 1000000,
      paymentStatus: 'UNPAID',
    },
  }
  const before = context.stock.revision
  subject.vm.reason = ' Mistaken entry '
  await subject.vm.submit()
  assert.equal(writes()[0].raw, '{"reason":"Mistaken entry"}')
  assert.equal(subject.vm.detail.status, 'CANCELLED')
  assert.equal(store.summaries.s1.remainingAmount, 1000000)
  assert.equal(context.stock.revision, before)
  await subject.vm.submit()
  assert.equal(writes().length, 1)
  subject.unmount()
})
test('numeric, order-cancel and validation errors retain useful messages', () => {
  assert.match(paymentsDomain.paymentError({ code: 'NUMERIC_OVERFLOW' }), /64 bit/)
  assert.match(paymentsDomain.paymentError({ code: 'SALES_ORDER_HAS_PAYMENTS' }), /hoàn tiền/)
  assert.deepEqual(
    domain.stockFieldErrors({
      code: 'VALIDATION_ERROR',
      details: { amount: 'Invalid', paymentDate: 'Invalid date' },
    }),
    { amount: 'Invalid', paymentDate: 'Invalid date' },
  )
})

test('pending retries remain available after a fully paid order disappears from receivables', async () => {
  const store = reset(['PAYMENT_CREATE', 'RECEIVABLE_VIEW'])
  context.handler = () => {
    throw new Error('Lost response')
  }
  await assert.rejects(store.collect(attempt()))
  const subject = mount(PendingRetries, {})
  assert.equal(subject.vm.rows.length, 1)
  context.handler = undefined
  context.response = {
    payment: receipt(),
    order: {
      salesOrderId: 's1',
      totalAmount: 1000000,
      paidAmount: 1000000,
      remainingAmount: 0,
      paymentStatus: 'PAID',
    },
  }
  await subject.vm.retry(subject.vm.rows[0])
  assert.equal(writes()[0].raw, writes()[1].raw)
  assert.equal(store.summaries.s1.remainingAmount, 0)
  subject.unmount()
})
test('new collection uses a fresh UUID and authoritative full-payment response', async () => {
  reset(['PAYMENT_CREATE'])
  context.response = mutation()
  const subject = mount(CollectDialog, { open: true, order: order() })
  subject.vm.form = form()
  await subject.vm.submit()
  const first = writes()[0].config.headers['Idempotency-Key']
  subject.state.open = false
  await flush()
  subject.state.order = order({
    paidAmount: 600000,
    remainingAmount: 400000,
    paymentStatus: 'PARTIALLY_PAID',
  })
  subject.state.open = true
  await flush()
  subject.vm.form = form({ amount: '400000' })
  context.response = {
    payment: receipt({ id: 'p2', amount: 400000 }),
    order: {
      salesOrderId: 's1',
      totalAmount: 1000000,
      paidAmount: 1000000,
      remainingAmount: 0,
      paymentStatus: 'PAID',
    },
  }
  await subject.vm.submit()
  assert.notEqual(writes()[1].config.headers['Idempotency-Key'], first)
  assert.equal(subject.vm.detail.paymentStatus, 'PAID')
  assert.equal(subject.vm.detail.version, 7)
  subject.unmount()
})
test('revoked scope clears summaries and suppresses an old mutation response', async () => {
  const store = reset()
  store.record(mutation())
  let finish
  context.handler = () =>
    new Promise((resolve) => {
      finish = resolve
    })
  const pending = store.collect(attempt())
  context.warehouses.warehouses = []
  assert.deepEqual(store.summaries, {})
  finish(mutation())
  await pending
  assert.deepEqual(store.summaries, {})
})
test('a newer backend read replaces stale mutation amounts without changing version', () => {
  const store = reset()
  store.record(mutation())
  store.syncOrders([order({ paidAmount: 1000000, remainingAmount: 0, paymentStatus: 'PAID' })])
  const updated = paymentsDomain.applyPaymentSummary(order(), store.summaries.s1)
  assert.equal(updated.remainingAmount, 0)
  assert.equal(updated.version, 7)
})
test('receipt reload failure after successful creation never resurrects a pending collection', async () => {
  const store = reset()
  context.response = mutation()
  await store.collect(attempt())
  context.handler = () => {
    throw new Error('List unavailable')
  }
  const subject = mount(History, {})
  await flush()
  assert.equal(store.attempts.s1, undefined)
  assert.equal(store.revision, 1)
  assert.match(subject.vm.error, /List unavailable/)
  assert.equal(writes().length, 1)
  subject.unmount()
})

test('a definitive business rejection resolves an uncertain retry and permits reviewing a new amount', async () => {
  const store = reset()
  context.handler = () => {
    throw new Error('Timeout')
  }
  await assert.rejects(store.collect(attempt()))
  context.handler = () => {
    throw Object.assign(new Error('Exceeded'), { status: 409, code: 'PAYMENT_EXCEEDS_REMAINING' })
  }
  await assert.rejects(store.collect(attempt()))
  assert.equal(writes()[0].raw, writes()[1].raw)
  assert.equal(store.attempts.s1, undefined)
})
