/* eslint-disable vue/one-component-per-file -- Shared renderer and component test doubles. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Buffer } from 'node:buffer'
import { setImmediate } from 'node:timers'
import ts from 'typescript'
import { parse, compileScript } from 'vue/compiler-sfc'
import { createRenderer, reactive, nextTick, defineComponent, h } from 'vue'
import { createPinia, setActivePinia, disposePinia } from 'pinia'
const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8')
let serial = 0
const url = (source) =>
  'data:text/javascript;base64,' + Buffer.from(source + '\n// ' + ++serial).toString('base64')
const transpile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
const vueUrl = import.meta.resolve('vue')
const context = {
  auth: reactive({ user: { id: 'u1', permissions: [] }, isCatalogAdmin: false }),
  warehouses: reactive({
    loaded: true,
    selectedId: 'w1',
    warehouses: [{ id: 'w1', name: 'Kho', code: 'W1', status: 1 }],
  }),
  payments: reactive({ summaries: {}, revision: 0 }),
  stock: reactive({
    revision: 0,
    invalidate() {
      this.revision++
    },
  }),
  route: reactive({ query: {} }),
  calls: [],
  notices: [],
  refreshes: 0,
  handler: undefined,
  confirmation: undefined,
}
globalThis.__returnsTests = context
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
const stockUrl = url(transpile(await read('src/utils/stock.ts')))
const stock = await import(stockUrl)
context.stockJson = stock
const mockUrl = url(`
 import { computed, defineComponent, h } from '${vueUrl}'
 const c = globalThis.__returnsTests
 const call = async (method,path,data,config) => {
  const raw = data === undefined ? undefined : config.transformRequest[0](data)
  const entry = {method,path,data,raw,config}; c.calls.push(entry)
  const result = await c.handler(entry)
  return config.transformResponse[0](typeof result === 'string' ? result : c.stockJson.stringifyStockJson(result))
 }
 export const request = {get:(path,config)=>call('GET',path,undefined,config),post:(path,data,config)=>call('POST',path,data,config),put:(path,data,config)=>call('PUT',path,data,config)}
 export const useAuthStore = () => c.auth
 export const useWarehouseStore = () => c.warehouses
 export const usePaymentsStore = () => c.payments
 export const useStockStore = () => c.stock
 export const useRoute = () => c.route
 export const usePaymentScope = () => ({auth:c.auth,warehouses:c.warehouses,
  can:p=>c.auth.isCatalogAdmin || !!c.auth.user?.permissions.includes(p),
  inScope:id=>c.warehouses.warehouses.some(w=>w.id===id),
  contextKey:computed(()=>JSON.stringify([c.auth.user,c.auth.isCatalogAdmin,c.warehouses])),
  refreshAccess:async()=>{c.refreshes++},
 })
 export const formatDateTime = value => value
 export const formatDate = value => value
 export const InboxOutlined = defineComponent({render:()=>null})
 export const PlusOutlined = InboxOutlined
 export const FileTextOutlined = InboxOutlined
 export const AccountBookOutlined = InboxOutlined
 export const EyeOutlined = InboxOutlined
 export const WalletOutlined = InboxOutlined
 export const ReloadOutlined = InboxOutlined
 export const SearchOutlined = InboxOutlined
 export const message = {success:text=>c.notices.push(text),info:text=>c.notices.push(text)}
 export const Modal = {confirm:options=>{c.confirmation=options}}
 export const BasicModal = defineComponent({setup(_, {slots}) {return ()=>h('modal',[slots.default?.(),slots.footer?.()])}})
 export const BasicTable = defineComponent({props:['columns','dataSource'],setup(props,{slots}) {return ()=>h('table',(props.dataSource??[]).flatMap(record=>(props.columns??[]).map(column=>h('cell',slots.bodyCell?.({column,record})))))}})
 export default defineComponent({setup(){return ()=>null}})
`)
const cache = new Map([['src/utils/stock.ts', stockUrl]])
const mocked = new Set([
  '@/utils/request',
  '@/stores/auth',
  '@/stores/warehouse',
  '@/stores/payments',
  '@/stores/stock',
  '@/composables/usePaymentScope',
  '@/utils/date',
  'ant-design-vue',
  '@ant-design/icons-vue',
  'vue-router',
  '@/components',
])
async function rewrite(source) {
  let code = transpile(source)
  const specifiers = [...code.matchAll(/from ['"]([^'"]+)['"]/g)].map((match) => match[1])
  for (const spec of new Set(specifiers)) {
    let target
    if (spec === 'vue' || spec === 'pinia') target = import.meta.resolve(spec)
    else if (mocked.has(spec) || spec.endsWith('.vue')) target = mockUrl
    else if (spec.startsWith('@/')) target = await loadUrl('src/' + spec.slice(2) + '.ts')
    else throw new Error('Unhandled import ' + spec)
    code = code
      .replaceAll('from ' + JSON.stringify(spec), 'from ' + JSON.stringify(target))
      .replaceAll("from '" + spec + "'", 'from ' + JSON.stringify(target))
  }
  return code
}
async function loadUrl(path) {
  if (cache.has(path)) return cache.get(path)
  const target = url(await rewrite(await read(path)))
  cache.set(path, target)
  return target
}
const domain = await import(await loadUrl('src/utils/returns.ts'))
const api = await import(await loadUrl('src/api/sales/returns.api.ts'))
const paymentDomain = await import(await loadUrl('src/utils/payments.ts'))
const { useRefundsStore } = await import(await loadUrl('src/stores/refunds.ts'))
async function component(path, expose) {
  const source = (await read(path)).replace('</script>', `defineExpose({${expose}})\n</script>`)
  const { descriptor } = parse(source)
  return (
    await import(
      url(
        await rewrite(
          compileScript(descriptor, { id: 'return-test-' + serial, inlineTemplate: true }).content,
        ),
      )
    )
  ).default
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
    'a-checkbox',
    'a-space',
    'a-tag',
    'router-link',
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

const ReturnDialog = await component(
  'src/components/sales/ReturnDialog.vue',
  'detail,limits,form,fields,editing,quote,received,blocked,error,save,act,startEdit,refreshLimits,load,reason,selectSource,sourceId,sourceOrder,limitsSourceId,sourceLabel',
)
const RefundDialog = await component(
  'src/components/sales/RefundDialog.vue',
  'form,confirmed,submit,attempt,error,current,fields',
)
const RefundsPage = await component(
  'src/views/sales/RefundsPage.vue',
  'rows,filters,load,total,error,changePage,showOrder,orderOpen,showDetail,detailOpen,search,resetFilters',
)
const ReturnsPage = await component(
  'src/views/sales/ReturnsPage.vue',
  'rows,filters,load,total,error,changePage,show,open,search,resetFilters',
)
const RefundDetail = await component(
  'src/components/sales/RefundDetailDialog.vue',
  'detail,reason,cancel,error,cancelMode,openCancel,closeCancel',
)
const pending = await component('src/components/sales/PendingRefundRetries.vue', 'rows,retry,error')
const all = [
  'SALES_RETURN_VIEW',
  'SALES_RETURN_CREATE',
  'SALES_RETURN_UPDATE',
  'SALES_RETURN_CONFIRM',
  'SALES_RETURN_CANCEL',
  'REFUND_VIEW',
  'REFUND_CREATE',
  'REFUND_CANCEL',
]
let pinia
const line = (extra = {}) => ({
  productId: 'p1',
  productCode: 'P1',
  productName: 'Sản phẩm',
  unit: 'cây',
  soldQuantity: 3,
  returnedQuantity: 0,
  returnableQuantity: 3,
  lineTotal: 3,
  allocatedDiscountAmount: 1,
  netLineAmount: 2,
  ...extra,
})
const returnLine = (extra = {}) => ({
  productId: 'p1',
  productCode: 'P1',
  productName: 'Sản phẩm',
  unit: 'cây',
  soldQuantity: 3,
  allocatedDiscountAmount: 1,
  netLineAmount: 2,
  quantity: 1,
  returnAmount: 0,
  ...extra,
})
const draft = (extra = {}) => ({
  id: 'r1',
  code: 'TH-1',
  salesOrderId: 's1',
  warehouseId: 'w1',
  returnDate: '2026-10-16',
  reason: 'Khách trả hàng',
  note: ' ghi chú ',
  status: 'DRAFT',
  totalAmount: 0,
  version: 0,
  createdBy: 'u1',
  createdAt: '2026-10-16T03:00:00Z',
  updatedBy: 'u1',
  updatedAt: '2026-10-16T03:00:00Z',
  lines: [returnLine()],
  ...extra,
})
const summary = (extra = {}) => ({
  salesOrderId: 's1',
  code: 'DH1',
  warehouseId: 'w1',
  saleDate: '2026-10-16',
  status: 'CONFIRMED',
  totalAmount: 1000000,
  returnedAmount: 700000,
  adjustedTotalAmount: 300000,
  paidAmount: 600000,
  refundedAmount: 0,
  netPaidAmount: 600000,
  remainingAmount: 0,
  refundableAmount: 300000,
  paymentStatus: 'PAID',
  ...extra,
})
const refund = (extra = {}) => ({
  id: 'h1',
  code: 'HT-1',
  salesOrderId: 's1',
  warehouseId: 'w1',
  amount: 300000,
  refundDate: '2026-10-16',
  method: 'CASH',
  reason: 'Hoàn hàng trả',
  status: 'ACTIVE',
  createdBy: 'u1',
  createdAt: '2026-10-16T03:00:00Z',
  ...extra,
})
const mutation = (extra = {}) => ({
  refund: refund(),
  order: summary({ refundedAmount: 300000, netPaidAmount: 300000, refundableAmount: 0 }),
  ...extra,
})
const form = (extra = {}) => ({
  amount: '300000',
  refundDate: '2026-10-16',
  method: 'CASH',
  reference: '  REF  ',
  reason: ' Hoàn hàng trả ',
  note: '  ghi chú  ',
  ...extra,
})
const attempt = () => ({
  key: '11111111-1111-4111-8111-111111111111',
  salesOrderId: 's1',
  warehouseId: 'w1',
  input: domain.refundInput(form()),
  state: 'uncertain',
})
function reset(permissions = all) {
  if (pinia) disposePinia(pinia)
  for (const key of Object.keys(storage)) delete storage[key]
  context.auth.user = { id: 'u1', permissions: [...permissions] }
  context.auth.isCatalogAdmin = false
  context.warehouses.loaded = true
  context.warehouses.selectedId = 'w1'
  context.warehouses.warehouses = [{ id: 'w1', name: 'Kho', code: 'W1', status: 1 }]
  context.payments.summaries = {}
  context.payments.revision = 0
  context.stock.revision = 0
  context.calls = []
  context.notices = []
  context.refreshes = 0
  context.route.query = {}
  context.handler = ({ path }) => (path.endsWith('/returnable-lines') ? [line()] : draft())
  pinia = createPinia()
  setActivePinia(pinia)
  return useRefundsStore()
}
const writes = () => context.calls.filter((call) => call.method !== 'GET')
const failure = (code, status = 409, details) =>
  Object.assign(new Error(code), { code, status, details })

test('return valuation preserves 0,1,1 installments and large exact products', () => {
  assert.deepEqual(
    [0, 1, 2].map((before) => domain.estimateReturn(line({ returnedQuantity: before }), 1n)),
    [0n, 1n, 1n],
  )
  assert.equal(
    domain.estimateReturn(line({ netLineAmount: 9223372036854775807n, soldQuantity: 3 }), 3n),
    9223372036854775807n,
  )
  assert.equal(domain.estimateReturn(line({ netLineAmount: 0 }), 2n), 0n)
})
test('return/refund validation accepts zero valuation but rejects excessive/duplicate quantities and noninteger money', () => {
  const input = {
    returnDate: '2026-10-16',
    reason: ' trả ',
    note: '',
    lines: [{ productId: 'p1', quantity: '1' }],
  }
  assert.deepEqual(domain.validateReturn(input, [line()]), {})
  assert.ok(
    domain.validateReturn({ ...input, lines: [{ productId: 'p1', quantity: '4' }] }, [line()]).p1,
  )
  assert.ok(
    domain.validateReturn({ ...input, lines: [...input.lines, ...input.lines] }, [line()]).p1,
  )
  for (const amount of ['0', '1e3', '1.2', '9223372036854775808', '300001'])
    assert.ok(domain.validateRefund(form({ amount }), summary()).amount)
  assert.equal(domain.refundInput(form()).reference, '  REF  ')
  assert.equal(domain.refundInput(form()).reason, ' Hoàn hàng trả ')
  assert.equal(domain.hasNextPage(9223372036854775807n, 1, 100), true)
  assert.equal(domain.hasNextPage(undefined, 1, 10), false)
})
test('API sends exact numeric tokens and strict return/refund DTOs without quote metadata', async () => {
  reset()
  context.handler = () => draft()
  await api.updateReturn(
    'r/1',
    {
      returnDate: '2026-10-16',
      reason: 'Trả',
      note: null,
      lines: [{ productId: 'p1', quantity: 9223372036854775807n }],
    },
    9223372036854775807n,
  )
  assert.equal(writes()[0].path, '/sales-returns/r%2F1')
  assert.match(writes()[0].raw, /"quantity":9223372036854775807/)
  assert.match(writes()[0].raw, /"version":9223372036854775807/)
  assert.equal(writes()[0].config.preventAutomaticRetry, true)
  assert.deepEqual(Object.keys(stock.parseStockJson(writes()[0].raw)), [
    'returnDate',
    'reason',
    'note',
    'lines',
    'version',
  ])
  const details = stock.parseStockJson(
    '{"version":9223372036854775807,"quote":{"totalAmount":9223372036854775807,"lines":[]}}',
  )
  assert.equal(domain.isReturnQuoteChanged(details), true)
  assert.equal(
    domain.isReturnQuoteChanged({ version: 0, quote: { totalAmount: 1, lines: [{}] } }),
    false,
  )
})
test('creation needs return permissions only, saves a zero-value draft without moving stock or refunding', async () => {
  reset(['SALES_RETURN_VIEW', 'SALES_RETURN_CREATE'])
  const subject = mount(ReturnDialog, { open: true, salesOrderId: 's1', warehouseId: 'w1' })
  await flush()
  subject.vm.form.reason = ' trả '
  subject.vm.form.lines = [{ productId: 'p1', quantity: '1' }]
  await subject.vm.save()
  assert.equal(subject.vm.detail.status, 'DRAFT')
  assert.equal(context.stock.revision, 0)
  assert.equal(writes().length, 1)
  assert.equal(writes()[0].path, '/sales-returns')
  assert.deepEqual(Object.keys(writes()[0].data), [
    'salesOrderId',
    'returnDate',
    'reason',
    'note',
    'lines',
  ])
  assert.ok(
    context.calls.every(
      (call) => !call.path.includes('/inventory') && !call.path.includes('/refunds'),
    ),
  )
  subject.unmount()
})
test('quote change requires review, full PUT save and an unchecked confirmation again', async () => {
  reset()
  const subject = mount(ReturnDialog, { open: true, id: 'r1' })
  await flush()
  await subject.vm.act('confirm')
  assert.equal(writes().length, 0)
  subject.vm.received = true
  context.handler = ({ path }) => {
    if (path.endsWith('/confirm'))
      throw failure('RETURN_QUOTE_CHANGED', 409, {
        version: 0,
        quote: { totalAmount: 1, lines: [returnLine({ returnAmount: 1 })] },
      })
    return [line({ returnedQuantity: 1, returnableQuantity: 2 })]
  }
  await subject.vm.act('confirm')
  assert.equal(writes().length, 1)
  assert.equal(subject.vm.quote.quote.totalAmount, 1)
  assert.equal(subject.vm.detail.totalAmount, 0)
  assert.equal(context.stock.revision, 0)
  subject.vm.received = true
  await subject.vm.act('confirm')
  assert.equal(writes().length, 1)
  await subject.vm.startEdit()
  assert.equal(subject.vm.form.lines[0].quantity, '1')
  context.handler = () =>
    draft({ version: 1, totalAmount: 1, lines: [returnLine({ returnAmount: 1 })] })
  await subject.vm.save()
  assert.equal(writes().at(-1).method, 'PUT')
  assert.equal(writes().at(-1).data.version, 0)
  assert.equal(subject.vm.received, false)
  assert.equal(subject.vm.quote, undefined)
  await subject.vm.act('confirm')
  assert.equal(writes().length, 2)
  subject.vm.received = true
  context.handler = () => draft({ version: 2, totalAmount: 1, status: 'CONFIRMED' })
  await subject.vm.act('confirm')
  assert.equal(writes().at(-1).data.version, 1)
  assert.equal(subject.vm.detail.status, 'CONFIRMED')
  assert.equal(context.stock.revision, 1)
  await subject.vm.startEdit()
  await subject.vm.act('cancel')
  assert.equal(writes().length, 3)
  subject.unmount()
})
test('version conflict retains user data and original version; quantity refresh never clamps input', async () => {
  reset()
  const subject = mount(ReturnDialog, { open: true, id: 'r1' })
  await flush()
  await subject.vm.startEdit()
  subject.vm.form.reason = 'Giữ bản nhập'
  subject.vm.form.lines[0].quantity = '2'
  context.handler = () => {
    throw failure('VERSION_CONFLICT', 409, { version: 99 })
  }
  await subject.vm.save()
  assert.equal(subject.vm.form.reason, 'Giữ bản nhập')
  assert.equal(subject.vm.detail.version, 0)
  assert.equal(subject.vm.blocked, true)
  await subject.vm.save()
  assert.equal(writes().length, 1)
  context.handler = () => [line({ returnableQuantity: 1, returnedQuantity: 2 })]
  await subject.vm.refreshLimits()
  assert.equal(subject.vm.form.lines[0].quantity, '2')
  assert.equal(subject.vm.limits[0].returnableQuantity, 1)
  subject.unmount()
})
test('confirm timeout reloads final status without another POST; draft cancellation leaves inventory alone', async () => {
  reset()
  const subject = mount(ReturnDialog, { open: true, id: 'r1' })
  await flush()
  subject.vm.received = true
  context.handler = ({ method }) => {
    if (method === 'POST') throw new Error('Timeout')
    return draft({ status: 'CONFIRMED' })
  }
  await subject.vm.act('confirm')
  assert.equal(subject.vm.detail.status, 'CONFIRMED')
  assert.equal(writes().length, 1)
  assert.equal(subject.vm.blocked, true)
  subject.unmount()
  reset()
  const cancel = mount(ReturnDialog, { open: true, id: 'r1' })
  await flush()
  cancel.vm.reason = 'Lập sai'
  context.handler = () => draft({ status: 'CANCELLED' })
  await cancel.vm.act('cancel')
  assert.equal(context.stock.revision, 0)
  cancel.unmount()
})
test('refundables are usable with REFUND_VIEW alone and send no date filter or order GET', async () => {
  reset(['REFUND_VIEW'])
  context.handler = () => ({
    items: [summary()],
    total: 9223372036854775807n,
    page: 1,
    pageSize: 10,
  })
  const subject = mount(RefundsPage, { refundable: true })
  await flush()
  assert.equal(subject.vm.rows.length, 1)
  assert.equal(subject.vm.rows[0].paymentStatus, 'PAID')
  assert.equal(subject.vm.total, 9223372036854775807n)
  assert.ok(context.calls.every((call) => call.path === '/refundables'))
  assert.deepEqual(Object.keys(context.calls[0].config.params), ['warehouseId', 'page', 'pageSize'])
  subject.unmount()
})
test('refund confirmation and backend summary preserve the original order version and stock', async () => {
  reset()
  context.handler = () => mutation()
  const subject = mount(RefundDialog, { open: true, order: summary() })
  subject.vm.form = form()
  await subject.vm.submit()
  assert.equal(writes().length, 0)
  subject.vm.confirmed = true
  await subject.vm.submit()
  assert.equal(writes().length, 1)
  assert.equal(subject.vm.current.refundableAmount, 0)
  assert.equal(subject.vm.current.netPaidAmount, 300000)
  assert.equal(context.stock.revision, 0)
  const updated = paymentDomain.applyPaymentSummary(
    { id: 's1', version: 7 },
    context.payments.summaries.s1,
  )
  assert.equal(updated.version, 7)
  assert.equal(updated.paidAmount, 600000)
  assert.equal(updated.refundedAmount, 300000)
  subject.unmount()
})
test('uncertain refunds freeze payload and key across retry, including CANCELLED replay', async () => {
  const store = reset()
  context.handler = () => {
    throw new Error('Lost response')
  }
  await assert.rejects(store.collect(attempt()))
  const first = writes()[0]
  assert.ok(sessionStorage.getItem('refund-retry:u1'))
  context.handler = () => mutation({ refund: refund({ status: 'CANCELLED' }) })
  const changed = { ...attempt(), key: 'other', input: { ...attempt().input, amount: 1n } }
  const result = await store.collect(changed)
  assert.equal(result.refund.status, 'CANCELLED')
  assert.equal(writes()[1].raw, first.raw)
  assert.equal(
    writes()[1].config.headers['Idempotency-Key'],
    first.config.headers['Idempotency-Key'],
  )
  assert.equal(store.attempts.s1, undefined)
})
test('conflicting refund key stays blocked and a revoked scope cannot publish a late result', async () => {
  let store = reset()
  context.handler = () => {
    throw failure('IDEMPOTENCY_CONFLICT')
  }
  await assert.rejects(store.collect(attempt()))
  assert.equal(store.attempts.s1.state, 'conflict')
  await store.collect(attempt())
  assert.equal(writes().length, 1)
  store = reset()
  let finish
  context.handler = () =>
    new Promise((resolve) => {
      finish = resolve
    })
  const job = store.collect(attempt())
  context.warehouses.warehouses = []
  finish(mutation())
  await job
  assert.deepEqual(context.payments.summaries, {})
  assert.deepEqual(store.summaries, {})
})
test('refund cancellation requires a reason and applies server summary without changing inventory', async () => {
  reset()
  context.handler = () => refund()
  const subject = mount(RefundDetail, { open: true, id: 'h1' })
  await flush()
  await subject.vm.cancel()
  assert.equal(writes().length, 0)
  subject.vm.reason = 'Ghi nhận sai'
  context.handler = () => mutation({ refund: refund({ status: 'CANCELLED' }), order: summary() })
  await subject.vm.cancel()
  assert.equal(subject.vm.detail.status, 'CANCELLED')
  assert.equal(context.payments.summaries.s1.refundableAmount, 300000)
  assert.equal(context.stock.revision, 0)
  subject.unmount()
})
test('pending refund retry remains available after full refund and logout clears its namespace', async () => {
  const store = reset()
  context.handler = () => {
    throw new Error('Lost response')
  }
  await assert.rejects(store.collect(attempt()))
  const subject = mount(pending, {})
  assert.equal(subject.vm.rows.length, 1)
  context.handler = () => mutation({ refund: refund({ status: 'CANCELLED' }) })
  await subject.vm.retry(subject.vm.rows[0])
  assert.match(context.notices.at(-1), /đã bị hủy/)
  sessionStorage.setItem('refund-retry:u1', 'pending')
  sessionStorage.setItem('payment-retry:u1', 'pending')
  paymentDomain.clearPaymentRetries()
  assert.equal(sessionStorage.getItem('refund-retry:u1'), null)
  assert.equal(sessionStorage.getItem('payment-retry:u1'), null)
  subject.unmount()
})
test('late return detail and refund list responses cannot restore data after warehouse/user change', async () => {
  reset()
  let finish
  context.handler = () =>
    new Promise((resolve) => {
      finish = resolve
    })
  const subject = mount(ReturnDialog, { open: true, id: 'r1' })
  context.auth.user = { id: 'u2', permissions: [] }
  finish(draft())
  await flush()
  assert.equal(subject.vm.detail, undefined)
  subject.unmount()
  reset(['REFUND_VIEW'])
  context.handler = () =>
    new Promise((resolve) => {
      finish = resolve
    })
  const page = mount(RefundsPage, { refundable: true })
  context.auth.user.permissions = []
  finish({ items: [summary()], total: 1, page: 1, pageSize: 10 })
  await flush()
  assert.deepEqual(page.vm.rows, [])
  page.unmount()
})
test('business errors explain blocked cancellation and partial returns retain backend debt values', () => {
  assert.match(paymentDomain.paymentError({ code: 'PAYMENT_BELOW_REFUNDED' }), /thấp hơn/)
  assert.match(paymentDomain.paymentError({ code: 'SALES_ORDER_HAS_RETURNS' }), /bằng 0/)
  const after = paymentDomain.applyPaymentSummary(
    { id: 's1', version: 9 },
    summary({
      returnedAmount: 200000,
      adjustedTotalAmount: 800000,
      remainingAmount: 200000,
      refundableAmount: 0,
    }),
  )
  assert.equal(after.remainingAmount, 200000)
  assert.equal(after.version, 9)
})

test('reloading a newly created return reads its saved ID and latest version', async () => {
  reset(['SALES_RETURN_VIEW', 'SALES_RETURN_CREATE'])
  const subject = mount(ReturnDialog, { open: true, salesOrderId: 's1', warehouseId: 'w1' })
  await flush()
  subject.vm.form.reason = 'Trả hàng'
  subject.vm.form.lines = [{ productId: 'p1', quantity: '1' }]
  await subject.vm.save()
  context.handler = () => draft({ version: 3 })
  await subject.vm.load()
  assert.equal(context.calls.at(-1).path, '/sales-returns/r1')
  assert.equal(subject.vm.detail.version, 3)
  assert.equal(subject.vm.editing, false)
  subject.unmount()
})

const OrderSelect = await component(
  'src/components/sales/ReturnableOrderSelect.vue',
  'search,load,select,rows,keyword,page,total,loading,error,searched,options,selection,more',
)
const sourceOrder = (extra = {}) => ({
  id: '11111111-1111-4111-8111-111111111111',
  code: 'BH-001',
  warehouseId: 'w1',
  warehouseName: 'Kho A',
  customerName: 'Khách lẻ',
  saleDate: '2026-10-16',
  totalAmount: 1000000,
  ...extra,
})
const secondOrder = () =>
  sourceOrder({ id: '22222222-2222-4222-8222-222222222222', code: 'BH-002' })
const searchPage = (items, total = items.length, page = 1) => ({ items, total, page, pageSize: 10 })

test('order-code API trims only boundaries, keeps case and literal %, _ and ! in HTTP params', async () => {
  reset(['SALES_RETURN_VIEW'])
  context.handler = () => searchPage([sourceOrder({ totalAmount: 9223372036854775807n })])
  for (const code of ['  BH-001  ', ' bh- ', '  BH-%_!  ']) {
    const result = await api.getReturnableOrders({ code })
    const call = context.calls.at(-1)
    assert.equal(call.path, '/sales-orders/returnable-orders')
    assert.deepEqual(call.config.params, { code: code.trim(), page: 1, pageSize: 10 })
    assert.equal(result.items[0].totalAmount, 9223372036854775807n)
  }
  const count = context.calls.length
  await assert.rejects(api.getReturnableOrders({ code: '   ' }))
  assert.equal(context.calls.length, count)
})

test('selector debounces 300 ms, ignores whitespace and keeps search independent of the selected UUID', async (t) => {
  reset(['SALES_RETURN_VIEW'])
  t.mock.timers.enable({ apis: ['setTimeout'] })
  context.handler = () => searchPage([sourceOrder()])
  const selected = []
  const subject = mount(OrderSelect, {
    value: secondOrder().id,
    selected: secondOrder(),
    onSelected: (order) => selected.push(order),
  })
  subject.vm.search('   ')
  t.mock.timers.tick(400)
  await flush()
  assert.equal(context.calls.length, 0)
  subject.vm.search('BH-0')
  t.mock.timers.tick(200)
  subject.vm.search('  bh-001  ')
  t.mock.timers.tick(299)
  await flush()
  assert.equal(context.calls.length, 0)
  t.mock.timers.tick(1)
  await flush()
  assert.equal(context.calls.length, 1)
  assert.equal(context.calls[0].config.params.code, 'bh-001')
  assert.equal(subject.vm.selection.value, secondOrder().id)
  assert.equal(subject.vm.selection.label, secondOrder().code)
  assert.deepEqual(selected, [])
  subject.vm.select({ value: sourceOrder().id })
  assert.equal(selected[0].id, sourceOrder().id)
  subject.unmount()
})

test('order selector loads every page from total, keeps zero-value/old warehouse results and resets page on a new keyword', async (t) => {
  reset(['SALES_RETURN_VIEW'])
  t.mock.timers.enable({ apis: ['setTimeout'] })
  context.handler = ({ config }) => {
    const offset = (config.params.page - 1) * 10
    return searchPage(
      Array.from({ length: Math.min(10, 21 - offset) }, (_, index) =>
        sourceOrder({
          id: 'id-' + (offset + index),
          code: 'BH-' + (offset + index),
          totalAmount: 0,
          warehouseId: 'old-inactive-warehouse',
        }),
      ),
      21,
      config.params.page,
    )
  }
  const subject = mount(OrderSelect, {})
  subject.vm.search('BH-')
  t.mock.timers.tick(300)
  await flush()
  await subject.vm.load(true)
  await subject.vm.load(true)
  assert.equal(subject.vm.rows.length, 21)
  assert.equal(subject.vm.rows[0].totalAmount, 0)
  assert.equal(subject.vm.more, false)
  assert.equal(subject.vm.page, 3)
  assert.deepEqual(
    context.calls.map((call) => call.config.params.page),
    [1, 2, 3],
  )
  assert.equal(subject.vm.options[0].label, 'BH-0')
  assert.equal(subject.vm.options[0].order.customerName, 'Khách lẻ')
  subject.vm.search('BH-2')
  assert.equal(subject.vm.page, 1)
  t.mock.timers.tick(300)
  await flush()
  assert.equal(context.calls.at(-1).config.params.page, 1)
  assert.ok(context.calls.every((call) => !('warehouseId' in call.config.params)))
  subject.unmount()
})

test('late order searches are aborted and ignored even when transport still resolves them', async (t) => {
  reset(['SALES_RETURN_VIEW'])
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let finish
  context.handler = ({ config }) =>
    config.params.code === 'BH-old'
      ? new Promise((resolve) => {
          finish = resolve
        })
      : searchPage([secondOrder()])
  const subject = mount(OrderSelect, {})
  subject.vm.search('BH-old')
  t.mock.timers.tick(300)
  await flush()
  const old = context.calls[0]
  subject.vm.search('BH-new')
  assert.equal(old.config.signal.aborted, true)
  t.mock.timers.tick(300)
  await flush()
  finish(searchPage([sourceOrder()]))
  await flush()
  assert.equal(subject.vm.rows[0].id, secondOrder().id)
  assert.equal(subject.vm.error, '')
  subject.unmount()
})

test('empty results differ from API errors; retry and permission handling never use sales-order search', async (t) => {
  reset(['SALES_RETURN_VIEW'])
  t.mock.timers.enable({ apis: ['setTimeout'] })
  context.handler = () => {
    throw new Error('Search unavailable')
  }
  const subject = mount(OrderSelect, {})
  subject.vm.search('BH')
  t.mock.timers.tick(300)
  await flush()
  assert.match(subject.vm.error, /Search unavailable/)
  assert.equal(subject.vm.searched, false)
  context.handler = () => searchPage([])
  await subject.vm.load()
  assert.equal(subject.vm.error, '')
  assert.equal(subject.vm.searched, true)
  assert.deepEqual(subject.vm.rows, [])
  const count = context.calls.length
  context.auth.user.permissions = []
  subject.vm.search('BH-new')
  t.mock.timers.tick(300)
  await flush()
  assert.equal(context.calls.length, count)
  assert.deepEqual(subject.vm.rows, [])
  assert.ok(context.calls.every((call) => call.path === '/sales-orders/returnable-orders'))
  subject.unmount()
})

test('closing selector clears debounce, aborts inflight search and ignores its response', async (t) => {
  reset(['SALES_RETURN_VIEW'])
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let subject = mount(OrderSelect, {})
  subject.vm.search('BH')
  subject.unmount()
  t.mock.timers.tick(300)
  await flush()
  assert.equal(context.calls.length, 0)
  let finish
  context.handler = () =>
    new Promise((resolve) => {
      finish = resolve
    })
  subject = mount(OrderSelect, {})
  subject.vm.search('BH')
  t.mock.timers.tick(300)
  await flush()
  const call = context.calls[0]
  subject.unmount()
  assert.equal(call.config.signal.aborted, true)
  finish(searchPage([sourceOrder()]))
  await flush()
})

test('selected order loads lines and creates a return with its UUID, never its code', async () => {
  reset(['SALES_RETURN_VIEW', 'SALES_RETURN_CREATE'])
  const order = sourceOrder({ totalAmount: 0 })
  const subject = mount(ReturnDialog, { open: true })
  await flush()
  subject.vm.selectSource(order)
  await flush()
  assert.equal(subject.vm.sourceId, order.id)
  assert.equal(context.calls.at(-1).path, '/sales-orders/' + order.id + '/returnable-lines')
  subject.vm.form.lines = [{ productId: 'p1', quantity: '1' }]
  subject.vm.form.reason = 'Trả hàng'
  context.handler = () => draft({ salesOrderId: order.id })
  await subject.vm.save()
  assert.equal(writes().at(-1).data.salesOrderId, order.id)
  assert.notEqual(writes().at(-1).data.salesOrderId, order.code)
  assert.equal(subject.vm.sourceLabel, order.code)
  assert.ok(context.calls.every((call) => call.path !== '/sales-orders'))
  subject.unmount()
})

test('source change preserves old UUID and quantities until confirmation, cancellation keeps them and acceptance replaces lines', async () => {
  reset(['SALES_RETURN_VIEW', 'SALES_RETURN_CREATE'])
  const subject = mount(ReturnDialog, { open: true })
  await flush()
  subject.vm.selectSource(sourceOrder())
  await flush()
  subject.vm.form.lines = [{ productId: 'p1', quantity: '2' }]
  subject.vm.form.reason = 'Giữ lý do'
  subject.vm.form.note = 'Giữ ghi chú'
  const count = context.calls.length
  subject.vm.selectSource(secondOrder())
  assert.equal(subject.vm.sourceId, sourceOrder().id)
  assert.equal(subject.vm.form.lines[0].quantity, '2')
  assert.equal(context.calls.length, count)
  context.confirmation.onCancel()
  assert.equal(subject.vm.sourceId, sourceOrder().id)
  subject.vm.selectSource(secondOrder())
  context.handler = () => [line({ productId: 'p2' })]
  await context.confirmation.onOk()
  assert.equal(subject.vm.sourceId, secondOrder().id)
  assert.deepEqual(subject.vm.form.lines, [])
  assert.equal(subject.vm.limits[0].productId, 'p2')
  assert.equal(subject.vm.form.reason, 'Giữ lý do')
  assert.equal(subject.vm.form.note, 'Giữ ghi chú')
  subject.unmount()
})

test('fast source changes abort stale lines and prevent sending previous products with a new UUID', async () => {
  reset(['SALES_RETURN_VIEW', 'SALES_RETURN_CREATE'])
  let finishOld, finishNew
  context.handler = ({ path }) =>
    new Promise((resolve) => {
      if (path.includes(sourceOrder().id)) finishOld = resolve
      else finishNew = resolve
    })
  const subject = mount(ReturnDialog, { open: true })
  await flush()
  subject.vm.selectSource(sourceOrder())
  const old = context.calls.at(-1)
  subject.vm.selectSource(secondOrder())
  assert.equal(old.config.signal.aborted, true)
  assert.deepEqual(subject.vm.form.lines, [])
  subject.vm.form.reason = 'Trả'
  subject.vm.form.lines = [{ productId: 'p1', quantity: '1' }]
  await subject.vm.save()
  assert.equal(writes().length, 0)
  finishOld([line()])
  await flush()
  assert.deepEqual(subject.vm.limits, [])
  finishNew([line({ productId: 'p2' })])
  await flush()
  assert.equal(subject.vm.limits[0].productId, 'p2')
  await subject.vm.save()
  assert.equal(writes().length, 0)
  subject.vm.form.lines = [{ productId: 'p2', quantity: '1' }]
  context.handler = () => draft({ salesOrderId: secondOrder().id })
  await subject.vm.save()
  assert.equal(writes()[0].data.salesOrderId, secondOrder().id)
  assert.equal(writes()[0].data.lines[0].productId, 'p2')
  subject.unmount()
})

test('closing a return clears source requests and invalidates pending source-change confirmation', async () => {
  reset(['SALES_RETURN_VIEW', 'SALES_RETURN_CREATE'])
  const subject = mount(ReturnDialog, { open: true })
  await flush()
  subject.vm.selectSource(sourceOrder())
  await flush()
  subject.vm.form.lines = [{ productId: 'p1', quantity: '1' }]
  subject.vm.selectSource(secondOrder())
  const pending = context.confirmation
  const count = context.calls.length
  subject.state.open = false
  await flush()
  await pending.onOk()
  assert.equal(context.calls.length, count)
  assert.equal(subject.vm.sourceId, '')
  subject.unmount()
  reset(['SALES_RETURN_VIEW', 'SALES_RETURN_CREATE'])
  let finish
  context.handler = () =>
    new Promise((resolve) => {
      finish = resolve
    })
  const closed = mount(ReturnDialog, { open: true })
  await flush()
  closed.vm.selectSource(sourceOrder())
  const request = context.calls.at(-1)
  closed.state.open = false
  await flush()
  assert.equal(request.config.signal.aborted, true)
  finish([line()])
  await flush()
  assert.deepEqual(closed.vm.limits, [])
  closed.unmount()
})

test('existing drafts keep a fixed source ID and never search for an exhausted source label', async () => {
  reset(['SALES_RETURN_VIEW', 'SALES_RETURN_UPDATE'])
  const subject = mount(ReturnDialog, { open: true, id: 'r1' })
  await flush()
  assert.equal(subject.vm.sourceId, 's1')
  assert.equal(subject.vm.sourceLabel, 's1')
  subject.vm.selectSource(secondOrder())
  assert.equal(subject.vm.sourceId, 's1')
  await subject.vm.startEdit()
  assert.ok(context.calls.every((call) => !call.path.includes('/returnable-orders')))
  assert.equal(subject.vm.sourceId, 's1')
  subject.unmount()
})

test('selector 403 clears results and delegates access refresh without presenting an empty search', async (t) => {
  reset(['SALES_RETURN_VIEW'])
  t.mock.timers.enable({ apis: ['setTimeout'] })
  context.handler = () => {
    throw failure('WAREHOUSE_ACCESS_DENIED', 403)
  }
  let denied = 0
  const subject = mount(OrderSelect, {
    onDenied: () => {
      denied++
    },
  })
  subject.vm.search('BH')
  t.mock.timers.tick(300)
  await flush()
  assert.equal(denied, 1)
  assert.deepEqual(subject.vm.rows, [])
  assert.equal(subject.vm.searched, false)
  assert.equal(subject.vm.keyword, '')
  subject.unmount()
})

test('all three lists change server pages once and preserve filters when detail opens and closes', async () => {
  for (const [Component, props, path, item] of [
    [ReturnsPage, {}, '/sales-returns', draft()],
    [RefundsPage, { refundable: true }, '/refundables', summary()],
    [RefundsPage, { refundable: false }, '/refunds', refund()],
  ]) {
    reset()
    context.handler = ({ config }) => ({
      items: [item],
      total: 9223372036854775807n,
      page: config.params.page,
      pageSize: config.params.pageSize,
    })
    const subject = mount(Component, props)
    await flush()
    const calls = () => context.calls.filter((call) => call.path === path)
    let count = calls().length
    subject.vm.changePage(2, 10)
    await flush()
    assert.equal(calls().length, ++count)
    assert.equal(calls().at(-1).config.params.page, 2)
    for (const size of [20, 50, 100, 10]) {
      subject.vm.changePage(2, size)
      await flush()
      assert.equal(calls().length, ++count)
      assert.equal(calls().at(-1).config.params.page, 1)
      assert.equal(calls().at(-1).config.params.pageSize, size)
      assert.equal(subject.vm.total, 9223372036854775807n)
    }
    subject.vm.changePage(2, 10)
    await flush()
    count = calls().length
    if (Component === ReturnsPage) {
      subject.vm.show('r1')
      subject.vm.open = false
    } else {
      subject.vm.showDetail('h1')
      subject.vm.detailOpen = false
    }
    await flush()
    assert.equal(subject.vm.filters.page, 2)
    assert.equal(subject.vm.filters.warehouseId, 'w1')
    assert.equal(calls().length, count)
    subject.unmount()
  }
})

test('list search and reset send one request, keep page size and block repeated clicks while loading', async () => {
  for (const [Component, props, path, item] of [
    [ReturnsPage, {}, '/sales-returns', draft()],
    [RefundsPage, { refundable: true }, '/refundables', summary()],
    [RefundsPage, { refundable: false }, '/refunds', refund()],
  ]) {
    reset()
    const result = (config) => ({
      items: [item],
      total: 137,
      page: config.params.page,
      pageSize: config.params.pageSize,
    })
    context.handler = ({ config }) => result(config)
    const subject = mount(Component, props)
    await flush()
    const calls = () => context.calls.filter((call) => call.path === path)
    subject.vm.changePage(2, 20)
    await flush()
    subject.vm.filters.warehouseId = undefined
    await flush()
    let count = calls().length
    subject.vm.search()
    await flush()
    assert.equal(calls().length, ++count)
    assert.equal(calls().at(-1).config.params.page, 1)
    assert.equal(calls().at(-1).config.params.pageSize, 20)
    assert.equal(calls().at(-1).config.params.warehouseId, undefined)
    subject.vm.resetFilters()
    await flush()
    assert.equal(calls().length, ++count)
    assert.equal(calls().at(-1).config.params.warehouseId, 'w1')
    assert.equal(calls().at(-1).config.params.pageSize, 20)
    subject.vm.resetFilters()
    await flush()
    assert.equal(calls().length, ++count)
    let finish
    context.handler = ({ config }) =>
      new Promise((resolve) => {
        finish = () => resolve(result(config))
      })
    subject.vm.search()
    subject.vm.search()
    subject.vm.resetFilters()
    assert.equal(calls().length, ++count)
    finish()
    await flush()
    subject.unmount()
  }
})

test('refund cancellation is a separate view; returning preserves detail and API errors preserve reason', async () => {
  reset()
  context.handler = () => refund()
  const subject = mount(RefundDetail, { open: true, id: 'h1' })
  await flush()
  const original = subject.vm.detail
  const count = context.calls.length
  subject.vm.openCancel()
  assert.equal(subject.vm.cancelMode, true)
  subject.vm.closeCancel()
  assert.equal(subject.vm.cancelMode, false)
  assert.equal(subject.vm.detail, original)
  assert.equal(context.calls.length, count)
  subject.vm.openCancel()
  subject.vm.reason = 'Giữ lý do khi backend từ chối'
  context.handler = () => {
    throw failure('INVALID_REQUEST', 400)
  }
  await subject.vm.cancel()
  assert.equal(subject.vm.reason, 'Giữ lý do khi backend từ chối')
  assert.equal(subject.vm.cancelMode, true)
  assert.equal(subject.vm.detail, original)
  subject.state.id = 'h2'
  await flush()
  assert.equal(subject.vm.cancelMode, false)
  assert.equal(subject.vm.reason, '')
  subject.unmount()
})
