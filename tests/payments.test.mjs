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
 export const request = {
 getBlob: async (url, config) => {
   context.calls.push({ method: 'GET', url, config })
   return context.handler ? await context.handler({ method: 'GET', url, config }) : context.response
 },
 get: (url, config) => call('GET', url, undefined, config), post: (url, data, config) => call('POST', url, data, config), put: (url, data, config) => call('PUT', url, data, config) }
 export const useWarehouseStore = () => context.warehouses
 export const usePaymentsStore = () => context.payments
 export const useStockStore = () => context.stock
 export const useAuthStore = () => context.auth
 export const useCatalogPermission = () => ({ can: (permission) => context.auth.isCatalogAdmin || context.auth.user.permissions.includes(permission) })
 export const useI18n = () => ({ t: key => key })
 export const WalletOutlined = defineComponent({ setup() { return () => null } })
 export const InfoCircleOutlined = WalletOutlined
 export const EyeOutlined = WalletOutlined
 export const PrinterOutlined = WalletOutlined
 export const CloseCircleOutlined = WalletOutlined
 export const ReloadOutlined = WalletOutlined
 export const SearchOutlined = WalletOutlined
 export const FilterOutlined = WalletOutlined
 export const DownOutlined = WalletOutlined
 export const UpOutlined = WalletOutlined
 export const MoreOutlined = WalletOutlined
 export const FileTextOutlined = WalletOutlined
 export const DownloadOutlined = WalletOutlined
 export const ExportOutlined = WalletOutlined
 export const message = { success() {}, info() {}, error() {} }
 export const Modal = { confirm: options => { context.confirmation = options } }
 export const formatDateTime = value => value
 export const formatDate = value => value
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

const receiptDomainUrl = moduleUrl(transpile(await read('src/utils/paymentReceipt.ts')))
const receiptDomain = await import(receiptDomainUrl)
const receiptApiUrl = moduleUrl(
  transpile(
    (await read('src/api/payments/paymentReceipt.api.ts'))
      .replace("'@/utils/request'", JSON.stringify(mockUrl))
      .replace("'@/utils/paymentReceipt'", JSON.stringify(receiptDomainUrl)),
  ),
)
const receiptControllerUrl = moduleUrl(
  transpile(
    (await read('src/composables/usePaymentReceipt.ts'))
      .replace("'vue'", JSON.stringify(vueUrl))
      .replace("'ant-design-vue'", JSON.stringify(mockUrl))
      .replace("'@/composables/usePaymentScope'", JSON.stringify(paymentScopeUrl))
      .replace("'@/api/payments/paymentReceipt.api'", JSON.stringify(receiptApiUrl))
      .replace("'@/utils/paymentReceipt'", JSON.stringify(receiptDomainUrl)),
  ),
)
const { usePaymentReceipt } = await import(receiptControllerUrl)
const ReceiptHarness = defineComponent({
  setup(_, { expose }) {
    const receipt = usePaymentReceipt()
    expose(receipt)
    return () => null
  },
})

async function component(path, expose) {
  let source = (await read(path)).replace(/import ['"]\.\/paymentDialogs\.css['"]/g, '')
  source = source.replace('</script>', `defineExpose({ ${expose} })\n</script>`)
  const { descriptor } = parse(source)
  let code = compileScript(descriptor, { id: `test-${index}`, inlineTemplate: true }).content
  code = code
    .replace(
      /from ['"]@\/composables\/usePaymentReceipt['"]/g,
      'from ' + JSON.stringify(receiptControllerUrl),
    )
    .replace(/from ['"]\.\/PaymentReceiptDialog.vue['"]/g, 'from ' + JSON.stringify(mockUrl))
  code = code.replace(
    /from ['"](?:@\/components\/catalog\/FittedListTable.vue|\.\/PaymentAmountSummary.vue|\.\/PaymentCancelDialog.vue)['"]/g,
    'from ' + JSON.stringify(mockUrl),
  )
  code = code.replace(/from ['"]vue['"]/g, `from '${vueUrl}'`)
  code = code.replace(/from ['"]@ant-design\/icons-vue['"]/g, 'from ' + JSON.stringify(mockUrl))
  code = code
    .replace(
      /from ['"]@\/composables\/usePaymentReceipt['"]/g,
      'from ' + JSON.stringify(receiptControllerUrl),
    )
    .replace(/from ['"]\.\/PaymentReceiptDialog.vue['"]/g, 'from ' + JSON.stringify(mockUrl))
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
  code = code
    .replace(
      /from ['"]@\/composables\/usePaymentReceipt['"]/g,
      'from ' + JSON.stringify(receiptControllerUrl),
    )
    .replace(/from ['"]\.\/PaymentReceiptDialog.vue['"]/g, 'from ' + JSON.stringify(mockUrl))
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
  'load, rows, filters, page, pageSize, changePage, total, error, show, detailOpen, detailId',
)
const CustomerDebt = await component(
  'src/components/sales/CustomerReceivablesDialog.vue',
  'load, detail, page, pageSize, changePage, error, reload',
)
const DebtPage = await component(
  'src/views/sales/ReceivablesPage.vue',
  'load, rows, orders, tab, filters, page, pageSize, changePage, total, submitFilters, resetFilters, expanded, mobileFiltersOpen, showCustomer, customerId, open',
)
const DetailDialog = await component(
  'src/components/sales/PaymentDetailDialog.vue',
  'load, submit, detail, reason, fields, error, cancelling, saving, openCancel, closeCancel, closeDetail',
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

test('receivable filters submit once, isolate UUID, and retain context on reset', async () => {
  reset(['RECEIVABLE_VIEW'])
  context.response = pageData([])
  const subject = mount(DebtPage, {})
  await flush()
  const initial = context.calls.length
  subject.vm.filters.keyword = '  KH / Anh Bắc / 0901234567  '
  subject.vm.filters.customerId = 'direct-customer-id'
  subject.vm.filters.warehouseId = 'w2'
  subject.vm.expanded = true
  subject.vm.mobileFiltersOpen = true
  await flush()
  assert.equal(context.calls.length, initial)
  subject.vm.submitFilters()
  await flush()
  assert.equal(context.calls.length, initial + 1)
  assert.deepEqual(context.calls.at(-1).config.params, {
    page: 1,
    pageSize: 10,
    warehouseId: 'w2',
    keyword: '  KH / Anh Bắc / 0901234567  ',
  })
  subject.vm.changePage(3, 10)
  await flush()
  subject.vm.filters.keyword = 'not submitted'
  subject.vm.changePage(4, 10)
  await flush()
  assert.equal(context.calls.at(-1).config.params.keyword, '  KH / Anh Bắc / 0901234567  ')
  const count = context.calls.length
  subject.vm.expanded = false
  subject.vm.mobileFiltersOpen = false
  await flush()
  assert.equal(context.calls.length, count)
  assert.equal(subject.vm.filters.customerId, 'direct-customer-id')
  subject.vm.showCustomer(subject.vm.filters.customerId)
  await flush()
  assert.equal(subject.vm.open, true)
  assert.equal(subject.vm.customerId, 'direct-customer-id')
  assert.equal(context.calls.length, count)
  subject.vm.resetFilters()
  await flush()
  assert.equal(context.calls.length, count + 1)
  assert.deepEqual(context.calls.at(-1).config.params, { page: 1, pageSize: 10, warehouseId: 'w1' })
  assert.equal(subject.vm.filters.customerId, '')
  subject.unmount()
})

test('receivable tabs retain independent applied filters and pagination; layout does not fetch', async () => {
  reset(['RECEIVABLE_VIEW'])
  context.response = pageData([])
  const subject = mount(DebtPage, {})
  await flush()
  subject.vm.filters.keyword = 'customer'
  subject.vm.submitFilters()
  subject.vm.changePage(3, 20)
  subject.vm.changePage(3, 20)
  await flush()
  subject.vm.tab = 'walk-in'
  await flush()
  assert.equal(subject.vm.page, 1)
  assert.equal(subject.vm.pageSize, 10)
  subject.vm.filters.warehouseId = 'w2'
  subject.vm.submitFilters()
  await flush()
  assert.deepEqual(context.calls.at(-1).config.params, { page: 1, pageSize: 10, warehouseId: 'w2' })
  subject.vm.tab = 'customers'
  await flush()
  assert.equal(subject.vm.page, 3)
  assert.equal(subject.vm.pageSize, 20)
  assert.deepEqual(context.calls.at(-1).config.params, {
    page: 3,
    pageSize: 20,
    warehouseId: 'w1',
    keyword: 'customer',
  })
  const count = context.calls.length
  context.warehouses.selectedId = 'w2'
  await flush()
  assert.equal(context.calls.length, count + 1)
  assert.equal(subject.vm.page, 1)
  assert.equal(subject.vm.open, false)
  subject.unmount()
})

test('late receivable list responses cannot overwrite the active tab or revoked scope', async () => {
  reset(['RECEIVABLE_VIEW'])
  let finish
  context.handler = ({ url }) =>
    url === '/receivables'
      ? new Promise((resolve) => {
          finish = resolve
        })
      : pageData([order()])
  const subject = mount(DebtPage, {})
  await flush()
  subject.vm.tab = 'walk-in'
  await flush()
  finish(pageData([{ customerId: 'old', warehouseId: 'w1' }]))
  await flush()
  assert.deepEqual(subject.vm.rows, [])
  assert.equal(subject.vm.orders[0].id, 's1')
  const count = context.calls.length
  context.auth.user.permissions = []
  await flush()
  assert.equal(context.calls.length, count)
  assert.deepEqual(subject.vm.orders, [])
  context.auth.isCatalogAdmin = true
  await flush()
  assert.equal(context.calls.length, count + 1)
  assert.equal(subject.vm.orders[0].id, 's1')
  subject.unmount()
})

test('late customer detail cannot replace a new customer and manual reload emits one list refresh', async () => {
  reset(['RECEIVABLE_VIEW'])
  let finish
  let reloads = 0
  context.handler = ({ url }) =>
    url === '/customers/c1/receivables'
      ? new Promise((resolve) => {
          finish = resolve
        })
      : {
          customerId: 'c2',
          warehouseId: 'w2',
          remainingAmount: '9223372036854775807',
          orders: pageData([]),
        }
  const subject = mount(CustomerDebt, { open: true, customerId: 'c1', onReload: () => reloads++ })
  await flush()
  subject.state.customerId = 'c2'
  await flush()
  assert.equal(subject.vm.detail.customerId, 'c2')
  finish({ customerId: 'c1', warehouseId: 'w1', remainingAmount: 1, orders: pageData([order()]) })
  await flush()
  assert.equal(subject.vm.detail.customerId, 'c2')
  assert.equal(String(subject.vm.detail.remainingAmount), '9223372036854775807')
  const count = context.calls.length
  subject.vm.reload()
  await flush()
  assert.equal(context.calls.length, count + 1)
  assert.equal(reloads, 1)
  subject.state.open = false
  await flush()
  assert.equal(subject.vm.detail, undefined)
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

const pdfResponse = (
  text = '%PDF-1.7\nreceipt',
  disposition = 'inline; filename="bien-lai-PT1.pdf"',
) => ({
  data: new Blob([text], { type: 'application/pdf' }),
  headers: { 'content-type': 'application/pdf', 'content-disposition': disposition },
})

test('receipt PDF validates MIME, nonempty Blob and signature; JSON errors are decoded safely', async () => {
  const pdf = pdfResponse().data
  assert.equal(await receiptDomain.validateReceiptPdf(pdf, 'application/pdf'), pdf)
  for (const data of [
    new Blob([], { type: 'application/pdf' }),
    new Blob(['{}'], { type: 'application/pdf' }),
    '{}',
  ]) {
    await assert.rejects(receiptDomain.validateReceiptPdf(data, 'application/pdf'), /PDF/)
  }
  await assert.rejects(receiptDomain.validateReceiptPdf(pdf, 'application/json'), /PDF/)
  const payload = {
    status: 403,
    code: 'WAREHOUSE_ACCESS_DENIED',
    message: 'Denied',
    details: { warehouseId: 'w1' },
  }
  const decoded = await receiptDomain.readBlobError(
    new Blob([JSON.stringify(payload)], { type: 'application/json' }),
    'application/json',
  )
  assert.equal(decoded.code, payload.code)
  assert.deepEqual(decoded.details, payload.details)
  assert.equal(
    await receiptDomain.readBlobError(new Blob(['{invalid']), 'application/json'),
    undefined,
  )
  assert.equal(await receiptDomain.readBlobError(pdf, 'application/pdf'), undefined)
  for (const code of [
    'INVALID_REQUEST',
    'UNAUTHORIZED',
    'FORBIDDEN',
    'WAREHOUSE_ACCESS_DENIED',
    'PAYMENT_NOT_FOUND',
    'PAYMENT_PDF_FAILED',
    'INTERNAL_ERROR',
  ]) {
    assert.notEqual(
      receiptDomain.receiptError({ code }),
      'Không tải được biên lai. Kiểm tra kết nối và thử lại.',
    )
  }
})

test('receipt filenames prefer UTF-8 filename*, fall back safely, and remove unsafe paths', () => {
  assert.equal(
    receiptDomain.receiptFilename(
      "inline; filename=old.pdf; filename*=UTF-8''bi%C3%AAn-lai.pdf",
      'PT1',
    ),
    'biên-lai.pdf',
  )
  assert.equal(
    receiptDomain.receiptFilename("inline; filename=old.pdf; filename*=UTF-8''%ZZ", 'PT1'),
    'old.pdf',
  )
  assert.equal(receiptDomain.receiptFilename('', 'PT001'), 'bien-lai-PT001.pdf')
  assert.equal(
    /[\\/<>:"|?*]/.test(
      receiptDomain.receiptFilename('inline; filename="../../secret\\file.pdf"', '../PT1'),
    ),
    false,
  )
})

test('receipt-only permission supports ACTIVE and CANCELLED, returns BE bytes unchanged and uses only GET', async () => {
  reset(['PAYMENT_VIEW'])
  const subject = mount(ReceiptHarness, {})
  for (const status of ['ACTIVE', 'CANCELLED']) {
    const response = pdfResponse(
      '%PDF-1.7\nĐÃ HỦY — BẢN LƯU\nTiếng Việt 9223372036854775807\n/Page /Page',
    )
    context.response = response
    await subject.vm.show(receipt({ status }))
    assert.equal(subject.vm.state.open, true)
    assert.equal(await (await fetch(subject.vm.state.url)).text(), await response.data.text())
    assert.equal(subject.vm.state.filename, 'bien-lai-PT1.pdf')
  }
  assert.ok(
    context.calls.every((call) => call.method === 'GET' && call.url === '/payments/p1/print'),
  )
  assert.equal(context.calls[0].config.headers.Accept, 'application/pdf')
  assert.equal(context.calls[0].config.signal instanceof AbortSignal, true)
  assert.equal(context.stock.revision, 0)
  subject.unmount()
})

test('closing during receipt fetch aborts and never reopens on a late response', async () => {
  reset(['PAYMENT_VIEW'])
  let finish
  context.handler = () =>
    new Promise((resolve) => {
      finish = resolve
    })
  const subject = mount(ReceiptHarness, {})
  const pending = subject.vm.show(receipt())
  subject.vm.close()
  assert.equal(context.calls[0].config.signal.aborted, true)
  finish(pdfResponse())
  await pending
  assert.equal(subject.vm.state.open, false)
  assert.equal(subject.vm.state.url, '')
  subject.unmount()
})

test('newer receipt wins; replacement, close and unmount release viewer URLs', async () => {
  reset(['PAYMENT_VIEW'])
  let finish
  context.handler = ({ url }) =>
    url.includes('/p1/')
      ? new Promise((resolve) => {
          finish = resolve
        })
      : pdfResponse('%PDF-1.7\nsecond')
  const subject = mount(ReceiptHarness, {})
  const pending = subject.vm.show(receipt())
  await subject.vm.show(receipt({ id: 'p2', code: 'PT2' }))
  const secondUrl = subject.vm.state.url
  finish(pdfResponse())
  await pending
  assert.equal(subject.vm.state.url, secondUrl)
  context.handler = undefined
  context.response = pdfResponse()
  await subject.vm.show(receipt())
  await nextTick()
  await assert.rejects(fetch(secondUrl))
  const currentUrl = subject.vm.state.url
  subject.unmount()
  await nextTick()
  await assert.rejects(fetch(currentUrl))
})

test('logout, revoked PAYMENT_VIEW, warehouse loss and selected scope changes clear receipts', async () => {
  for (const revoke of [
    () => {
      context.auth.user = null
    },
    () => {
      context.auth.user.permissions = []
    },
    () => {
      context.warehouses.warehouses = []
    },
    () => {
      context.warehouses.selectedId = 'w2'
    },
  ]) {
    reset(['PAYMENT_VIEW'])
    context.response = pdfResponse()
    const subject = mount(ReceiptHarness, {})
    await subject.vm.show(receipt())
    const url = subject.vm.state.url
    revoke()
    assert.equal(subject.vm.state.open, false)
    assert.equal(subject.vm.state.url, '')
    await nextTick()
    await assert.rejects(fetch(url))
    subject.unmount()
  }
})

test('receipt denial closes preview and refreshes access; invalid success and network failure allow retry', async () => {
  reset(['PAYMENT_VIEW'])
  const subject = mount(ReceiptHarness, {})
  context.handler = () => {
    throw Object.assign(new Error('Denied'), { status: 403, code: 'WAREHOUSE_ACCESS_DENIED' })
  }
  await subject.vm.show(receipt())
  assert.equal(subject.vm.state.open, false)
  assert.equal(context.refreshes, 2)
  context.handler = undefined
  context.response = {
    data: new Blob(['{}'], { type: 'application/json' }),
    headers: { 'content-type': 'application/json' },
  }
  await subject.vm.show(receipt())
  assert.equal(subject.vm.state.url, '')
  assert.match(subject.vm.state.error, /PDF/)
  context.handler = () => {
    throw new Error('Network unavailable')
  }
  await subject.vm.show(receipt())
  assert.match(subject.vm.state.error, /Network/)
  context.handler = undefined
  context.response = pdfResponse()
  subject.vm.retry()
  await flush()
  assert.ok(subject.vm.state.url)
  assert.equal(subject.vm.state.error, '')
  subject.unmount()
})

test('receipt checks scope locally before fetching and ignores late response after scope loss', async () => {
  reset([])
  const subject = mount(ReceiptHarness, {})
  await subject.vm.show(receipt())
  assert.equal(context.calls.length, 0)
  context.auth.user.permissions = ['PAYMENT_VIEW']
  await subject.vm.show(receipt({ warehouseId: 'unassigned' }))
  assert.equal(context.calls.length, 0)
  let finish
  context.handler = () =>
    new Promise((resolve) => {
      finish = resolve
    })
  const pending = subject.vm.show(receipt())
  context.auth.user.permissions = []
  finish(pdfResponse())
  await pending
  assert.equal(subject.vm.state.open, false)
  assert.equal(subject.vm.state.url, '')
  subject.unmount()
})

test('download uses the server filename and keeps a separate URL until its delayed release', async () => {
  reset(['PAYMENT_VIEW'])
  context.response = pdfResponse()
  const subject = mount(ReceiptHarness, {})
  await subject.vm.show(receipt())
  const originalDocument = globalThis.document
  const originalTimeout = globalThis.setTimeout
  const anchor = {
    click() {
      this.clicked = true
    },
    remove() {
      this.removed = true
    },
  }
  let release
  try {
    globalThis.document = { createElement: () => anchor, body: { appendChild() {} } }
    globalThis.setTimeout = (callback, delay) => {
      assert.equal(delay, 60_000)
      release = callback
    }
    subject.vm.download()
    assert.equal(anchor.download, 'bien-lai-PT1.pdf')
    assert.equal(anchor.clicked, true)
    assert.equal(anchor.removed, true)
    const viewerUrl = subject.vm.state.url
    assert.notEqual(anchor.href, viewerUrl)
    subject.vm.close()
    await nextTick()
    await assert.rejects(fetch(viewerUrl))
    assert.equal(await (await fetch(anchor.href)).text(), '%PDF-1.7\nreceipt')
    release()
    await assert.rejects(fetch(anchor.href))
  } finally {
    globalThis.document = originalDocument
    globalThis.setTimeout = originalTimeout
    subject.unmount()
  }
})

test('blocked popup is retryable; separate PDF has no opener and is released on scope loss', async () => {
  reset(['PAYMENT_VIEW'])
  context.response = pdfResponse()
  const subject = mount(ReceiptHarness, {})
  await subject.vm.show(receipt())
  const originalWindow = globalThis.window
  let url
  const popup = {
    opener: 'app',
    location: {
      replace(value) {
        url = value
      },
    },
    close() {
      this.closed = true
    },
  }
  try {
    globalThis.window = { open: () => null }
    subject.vm.openPdf()
    assert.match(subject.vm.state.printHint, /chặn/)
    globalThis.window.open = () => popup
    subject.vm.openPdf()
    assert.equal(popup.opener, null)
    assert.equal(await (await fetch(url)).text(), '%PDF-1.7\nreceipt')
    context.auth.user.permissions = []
    assert.equal(popup.closed, true)
    await assert.rejects(fetch(url))
  } finally {
    globalThis.window = originalWindow
    subject.unmount()
  }
})

test('print waits for viewer load, prints only its frame and offers a separate PDF on unsupported printing', async () => {
  reset(['PAYMENT_VIEW'])
  context.response = pdfResponse()
  const controller = mount(ReceiptHarness, {})
  await controller.vm.show(receipt())
  const ReceiptDialog = await component(
    'src/components/sales/PaymentReceiptDialog.vue',
    'print, frame',
  )
  const subject = mount(ReceiptDialog, { receipt: controller.vm })
  let prints = 0
  let appPrints = 0
  let opened = 0
  const originalWindow = globalThis.window
  try {
    globalThis.window = {
      print() {
        appPrints++
      },
      open() {
        opened++
        return null
      },
    }
    subject.vm.frame.contentWindow = {
      focus() {},
      print() {
        prints++
      },
    }
    subject.vm.print()
    assert.equal(prints, 0)
    controller.vm.loaded('blob:wrong')
    assert.equal(controller.vm.state.ready, false)
    controller.vm.loaded(controller.vm.state.url)
    subject.vm.print()
    assert.equal(prints, 1)
    assert.equal(appPrints, 0)
    assert.doesNotMatch(controller.vm.state.printHint, /thành công/)
    subject.vm.frame.contentWindow.print = () => {
      throw new Error('Unsupported')
    }
    subject.vm.print()
    assert.equal(opened, 1)
    assert.match(controller.vm.state.printHint, /chặn/)
  } finally {
    globalThis.window = originalWindow
    subject.unmount()
    controller.unmount()
  }
})

test('payment page sizes reset once and opening details preserves filters and pagination', async () => {
  reset(['PAYMENT_VIEW'])
  context.response = pageData([receipt()], 137)
  const subject = mount(History, {})
  await flush()
  subject.vm.filters.customerId = 'customer-uuid'
  await flush()
  for (const size of [20, 50, 100, 10]) {
    const before = context.calls.length
    subject.vm.changePage(4, size)
    await flush()
    assert.equal(context.calls.length, before + 1)
    assert.equal(subject.vm.page, 1)
    assert.deepEqual(context.calls.at(-1).config.params, {
      warehouseId: 'w1',
      customerId: 'customer-uuid',
      page: 1,
      pageSize: size,
    })
  }
  subject.vm.changePage(3, 10)
  await flush()
  const before = context.calls.length
  subject.vm.show(receipt())
  subject.vm.detailOpen = false
  await flush()
  assert.equal(subject.vm.page, 3)
  assert.equal(subject.vm.filters.customerId, 'customer-uuid')
  assert.equal(context.calls.length, before)
  subject.unmount()
})

test('cancel dialog returns to the same detail, resets for another receipt and never preloads PDF', async () => {
  reset()
  context.response = receipt()
  const subject = mount(DetailDialog, { open: true, id: 'p1' })
  await flush()
  assert.ok(context.calls.every((call) => call.url === '/payments/p1'))
  subject.vm.openCancel()
  assert.equal(subject.vm.cancelling, true)
  subject.vm.reason = 'old reason'
  subject.vm.closeCancel()
  assert.equal(subject.vm.cancelling, false)
  assert.equal(subject.vm.detail.id, 'p1')
  subject.vm.openCancel()
  assert.equal(subject.vm.reason, '')
  subject.vm.reason = 'another reason'
  context.response = receipt({ id: 'p2' })
  subject.state.id = 'p2'
  await flush()
  assert.equal(subject.vm.reason, '')
  assert.deepEqual(subject.vm.fields, {})
  assert.equal(subject.vm.detail.id, 'p2')
  subject.unmount()
})

test('cancel failure retains reason, fields and authoritative state; pending submit blocks duplicates and closing', async () => {
  const store = reset()
  context.response = receipt()
  const subject = mount(DetailDialog, { open: true, id: 'p1' })
  await flush()
  subject.vm.openCancel()
  subject.vm.reason = 'Giữ nguyên lý do'
  let fail
  context.handler = () =>
    new Promise((_resolve, reject) => {
      fail = reject
    })
  const pending = subject.vm.submit()
  assert.equal(subject.vm.saving, true)
  subject.vm.closeCancel()
  assert.equal(subject.vm.cancelling, true)
  await subject.vm.submit()
  assert.equal(writes().length, 1)
  fail(
    Object.assign(new Error('Dữ liệu đã thay đổi'), {
      status: 409,
      code: 'VALIDATION_ERROR',
      details: { reason: 'Kiểm tra lại lý do' },
    }),
  )
  await pending
  assert.equal(subject.vm.reason, 'Giữ nguyên lý do')
  assert.equal(subject.vm.fields.reason, 'Kiểm tra lại lý do')
  assert.equal(subject.vm.detail.status, 'ACTIVE')
  assert.equal(subject.vm.cancelling, true)
  assert.equal(subject.vm.saving, false)
  assert.deepEqual(store.summaries, {})
  subject.unmount()
})

test('viewer close preserves an ongoing print URL until afterprint releases it', async () => {
  reset(['PAYMENT_VIEW'])
  context.response = pdfResponse()
  const subject = mount(ReceiptHarness, {})
  await subject.vm.show(receipt())
  assert.equal(subject.vm.state.paymentCode, 'PT1')
  const url = subject.vm.state.url
  const release = subject.vm.holdPrint()
  subject.vm.close()
  await nextTick()
  assert.equal(await (await fetch(url)).text(), '%PDF-1.7\nreceipt')
  release()
  release()
  await assert.rejects(fetch(url))
  subject.unmount()
})

test('closing or replacing the viewer keeps an independently opened PDF alive until scope invalidation', async () => {
  reset(['PAYMENT_VIEW'])
  context.response = pdfResponse()
  const subject = mount(ReceiptHarness, {})
  await subject.vm.show(receipt())
  const originalWindow = globalThis.window
  let url
  const popup = {
    closed: false,
    opener: null,
    location: {
      replace(value) {
        url = value
      },
    },
    close() {
      this.closed = true
    },
  }
  try {
    globalThis.window = { open: () => popup }
    subject.vm.openPdf()
    subject.vm.close()
    await nextTick()
    assert.equal(popup.closed, false)
    assert.equal(await (await fetch(url)).text(), '%PDF-1.7\nreceipt')
    await subject.vm.show(receipt({ id: 'p2' }))
    assert.equal(popup.closed, false)
    context.auth.user.permissions = []
    assert.equal(popup.closed, true)
    await assert.rejects(fetch(url))
  } finally {
    globalThis.window = originalWindow
    subject.unmount()
  }
})
