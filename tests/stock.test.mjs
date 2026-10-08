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
  calls: [],
  response: undefined,
  handler: undefined,
  warehouses: reactive({
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
  stock: reactive({
    revision: 0,
    invalidate() {
      this.revision++
    },
  }),
}
globalThis.__stockTests = context
const mockUrl = moduleUrl(`
 import { defineComponent, h } from '${vueUrl}'
 const context = globalThis.__stockTests
 const call = async (method, url, data, config) => {
  const raw = data === undefined ? undefined : config.transformRequest[0](data)
  context.calls.push({ method, url, data, raw, config })
  const result = context.handler ? await context.handler({ method, url, data, raw, config }) : context.response
  const json = typeof result === 'string' ? result : JSON.stringify(result)
  return config.transformResponse[0](json)
 }
 export const request = { get: (url, config) => call('GET', url, undefined, config), post: (url, data, config) => call('POST', url, data, config), put: (url, data, config) => call('PUT', url, data, config) }
 export const useWarehouseStore = () => context.warehouses
 export const useStockStore = () => context.stock
 export const useAuthStore = () => context.auth
 export const useCatalogPermission = () => ({ can: (permission) => context.auth.isCatalogAdmin || context.auth.user.permissions.includes(permission) })
 export const useI18n = () => ({ t: key => key })
 export const message = { success() {} }
 export const formatDateTime = value => value
 export const BasicModal = defineComponent({ setup(_, { slots }) { return () => h('modal', [slots.default?.(), slots.footer?.()]) } })
 export const BasicTable = defineComponent({ setup() { return () => null } })
 export default defineComponent({ setup() { return () => null } })
`)
const apiUrl = moduleUrl(
  transpile(
    (await read('src/api/stock/stock.api.ts'))
      .replace("'@/utils/request'", JSON.stringify(mockUrl))
      .replace("'@/utils/stock'", JSON.stringify(domainUrl)),
  ),
)
const api = await import(apiUrl)
async function component(path, expose) {
  let source = await read(path)
  source = source.replace('</script>', `defineExpose({ ${expose} })\n</script>`)
  const { descriptor } = parse(source)
  let code = compileScript(descriptor, { id: `test-${index}`, inlineTemplate: true }).content
  code = code.replace(/from ['"]vue['"]/g, `from '${vueUrl}'`)
  code = code.replace(
    /from ['"](?:vue-i18n|ant-design-vue|@\/components|@\/stores\/warehouse|@\/stores\/stock|@\/stores\/auth|@\/composables\/useCatalogPermission|@\/utils\/date|\.\/ProductSelect.vue|@\/components\/stock\/ProductSelect.vue|@\/components\/stock\/ReceiptDialog.vue)['"]/g,
    `from '${mockUrl}'`,
  )
  code = code
    .replace(/from ['"]@\/utils\/stock['"]/g, `from '${domainUrl}'`)
    .replace(/from ['"]@\/api\/stock\/stock.api['"]/g, `from '${apiUrl}'`)
  return (await import(moduleUrl(transpile(code)))).default
}
const ReceiptDialog = await component(
  'src/components/stock/ReceiptDialog.vue',
  'submit, load, form, detail, fields, blocked, reason, loading',
)
const InventoryPage = await component(
  'src/views/stock/InventoryPage.vue',
  'load, rows, loading, error',
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
  const root = app.mount({ children: [] })
  return { vm: root.$refs.subject, state, unmount: () => app.unmount() }
}
function reset() {
  context.calls = []
  context.handler = undefined
  context.stock.revision = 0
  context.warehouses.selectedId = 'w1'
  context.auth.user.permissions = [
    'STOCK_RECEIPT_VIEW',
    'STOCK_RECEIPT_CREATE',
    'STOCK_RECEIPT_UPDATE',
    'STOCK_RECEIPT_CONFIRM',
    'STOCK_RECEIPT_CANCEL',
    'INVENTORY_VIEW',
    'INVENTORY_MOVEMENT_VIEW',
  ]
  context.auth.isCatalogAdmin = false
}
const receipt = (overrides = {}) => ({
  id: 'r1',
  code: 'PN-1',
  warehouseId: 'w1',
  receiptDate: '2026-10-08',
  status: 'DRAFT',
  totalAmount: 10,
  version: 7,
  createdBy: 'u1',
  createdAt: '2026-10-08T03:00:00Z',
  lines: [
    {
      productId: 'p1',
      quantity: 1,
      unitPrice: 10,
      lineTotal: 10,
      productCode: 'P1',
      productName: 'Product',
      unit: 'cay',
    },
  ],
  ...overrides,
})

test('int64 JSON preserves max/min, nested arrays and numeric-looking escaped strings', () => {
  const raw =
    '{"max":9223372036854775807,"min":-9223372036854775808,"safe":9007199254740991,"zero":0,"n":null,"decimal":2.5,"list":[9007199254740993],"note":"id 9223372036854775807 \\"quoted\\""}'
  const parsed = domain.parseStockJson(raw)
  assert.equal(parsed.max, 9223372036854775807n)
  assert.equal(parsed.min, -9223372036854775808n)
  assert.equal(parsed.safe, Number.MAX_SAFE_INTEGER)
  assert.equal(parsed.list[0], 9007199254740993n)
  assert.equal(parsed.note, 'id 9223372036854775807 "quoted"')
  assert.equal(parsed.decimal, 2.5)
  assert.throws(() => domain.parseStockJson('{"bad":01}'))
})
test('write JSON uses integer tokens and rejects imprecise Number values', () => {
  const raw = domain.stringifyStockJson({
    quantity: 9223372036854775807n,
    unitPrice: 0n,
    note: '"quoted"',
    optional: undefined,
  })
  assert.match(raw, /"quantity":9223372036854775807/)
  assert.match(raw, /"unitPrice":0/)
  assert.doesNotMatch(raw, /optional/)
  assert.deepEqual(domain.parseStockJson(raw), {
    quantity: 9223372036854775807n,
    unitPrice: 0,
    note: '"quoted"',
  })
  assert.throws(() => domain.stringifyStockJson({ quantity: 9007199254740992 }))
})
test('quantity and price validate both int64 boundaries and invalid forms', () => {
  for (const value of ['', '100.0', '1.5', '-1', '1e3', 'null', '9223372036854775808'])
    assert.equal(domain.validStockInteger(value), false, value)
  assert.equal(domain.validStockInteger('9223372036854775807', true), true)
  assert.equal(domain.validStockInteger('0', true), false)
  assert.equal(domain.validStockInteger('0'), true)
})
test('full replacement omits optional empty values and never emits receipt metadata', () => {
  const input = domain.receiptInput({
    warehouseId: 'w1',
    receiptDate: '2026-10-08',
    supplierName: ' ',
    note: '',
    lines: [{ productId: 'p1', quantity: '9223372036854775807', unitPrice: '0' }],
  })
  const raw = domain.stringifyStockJson(input)
  assert.deepEqual(domain.parseStockJson(raw), {
    receiptDate: '2026-10-08',
    lines: [{ productId: 'p1', quantity: 9223372036854775807n, unitPrice: 0 }],
  })
})
test('calendar date and empty lines are validated', () => {
  const errors = domain.validateReceipt(
    { warehouseId: '', receiptDate: '2026-02-30', supplierName: '', note: '', lines: [] },
    (key) => key,
  )
  assert.ok(errors.warehouseId)
  assert.ok(errors.receiptDate)
  assert.ok(errors.lines)
})
test('movement range retains instants and exclusive endpoint without adding a day', () => {
  assert.deepEqual(domain.movementRange('2026-10-08T00:00:00+07:00', '2026-10-09T00:00:00+07:00'), {
    from: '2026-10-07T17:00:00.000Z',
    to: '2026-10-08T17:00:00.000Z',
  })
  assert.deepEqual(domain.movementRange(), {})
})
test('API shares relative paths, direct response and lossless transforms on token-refresh retry', async () => {
  reset()
  context.response = domain.stringifyStockJson(receipt({ totalAmount: 9223372036854775807n }))
  assert.equal((await api.getReceipt('r1')).totalAmount, 9223372036854775807n)
  await api.confirmReceipt('r1', 7)
  const call = context.calls.at(-1)
  assert.equal(call.url, '/stock-receipts/r1/confirm')
  assert.equal(call.raw, '{"version":7}')
  assert.equal(call.config.transformRequest[0](call.raw), call.raw)
})
test('confirm uses latest GET version, prevents double submit, and invalidates stock once', async () => {
  reset()
  let resolveWrite
  context.handler = ({ method }) =>
    method === 'GET'
      ? receipt()
      : new Promise((resolve) => {
          resolveWrite = resolve
        })
  const { vm, unmount } = mount(ReceiptDialog, { open: true, id: 'r1', mode: 'confirm' })
  await flush()
  const pending = vm.submit()
  await vm.submit()
  assert.equal(context.calls.filter((call) => call.method === 'POST').length, 1)
  assert.equal(context.calls.at(-1).raw, '{"version":7}')
  resolveWrite(receipt({ status: 'CONFIRMED', version: 8 }))
  await pending
  assert.equal(vm.detail.status, 'CONFIRMED')
  assert.equal(context.stock.revision, 1)
  unmount()
})
test('confirm reload detects changed status and sends no mutation', async () => {
  reset()
  context.response = receipt({ status: 'CANCELLED' })
  const { vm, unmount } = mount(ReceiptDialog, { open: true, id: 'r1', mode: 'confirm' })
  await flush()
  await vm.submit()
  assert.deepEqual(
    context.calls.map((call) => call.method),
    ['GET'],
  )
  unmount()
})
test('confirmed cancellation requires trimmed reason, posts latest version and refreshes stock', async () => {
  reset()
  context.handler = ({ method }) =>
    receipt({ status: method === 'GET' ? 'CONFIRMED' : 'CANCELLED', version: 8 })
  const { vm, unmount } = mount(ReceiptDialog, { open: true, id: 'r1', mode: 'cancel' })
  await flush()
  vm.reason = '   '
  await vm.submit()
  assert.ok(vm.fields.reason)
  assert.equal(context.calls.length, 1)
  vm.reason = ' Wrong receipt '
  await vm.submit()
  assert.equal(context.calls.at(-1).raw, '{"version":8,"reason":"Wrong receipt"}')
  assert.equal(context.stock.revision, 1)
  unmount()
})
test('draft cancellation omits reason rather than sending empty/null', async () => {
  reset()
  context.response = receipt()
  const { vm, unmount } = mount(ReceiptDialog, { open: true, id: 'r1', mode: 'cancel' })
  await flush()
  await vm.submit()
  assert.equal(context.calls.at(-1).raw, '{"version":7}')
  unmount()
})
test('edit replaces all lines exactly with int64 values, excludes warehouse and metadata', async () => {
  reset()
  context.response = domain.stringifyStockJson(
    receipt({
      lines: [{ ...receipt().lines[0], quantity: 9007199254740993n, unitPrice: 0, lineTotal: 0 }],
    }),
  )
  const { vm, unmount } = mount(ReceiptDialog, { open: true, id: 'r1', mode: 'edit' })
  await flush()
  assert.equal(vm.form.lines[0].quantity, '9007199254740993')
  await vm.submit()
  const call = context.calls.at(-1)
  assert.equal(call.method, 'PUT')
  assert.deepEqual(domain.parseStockJson(call.raw), {
    receiptDate: '2026-10-08',
    version: 7,
    lines: [{ productId: 'p1', quantity: 9007199254740993n, unitPrice: 0 }],
  })
  assert.equal(context.stock.revision, 0)
  unmount()
})
test('409 preserves form and blocks automatic retry until explicit detail reload', async () => {
  reset()
  let version = 7
  context.handler = ({ method }) => {
    if (method === 'GET') return receipt({ version })
    throw Object.assign(new Error('Conflict'), { status: 409 })
  }
  const { vm, unmount } = mount(ReceiptDialog, { open: true, id: 'r1', mode: 'edit' })
  await flush()
  vm.form.note = 'unsaved note'
  await vm.submit()
  assert.equal(vm.blocked, true)
  assert.equal(vm.form.note, 'unsaved note')
  await vm.submit()
  assert.equal(context.calls.filter((call) => call.method === 'PUT').length, 1)
  version = 8
  await vm.load()
  context.handler = () => receipt({ version: 9 })
  await vm.submit()
  assert.equal(context.calls.at(-1).data.version, 8)
  unmount()
})
test('insufficient stock keeps receipt and does not invalidate inventory', async () => {
  reset()
  context.handler = ({ method }) => {
    if (method === 'GET') return receipt({ status: 'CONFIRMED' })
    throw Object.assign(new Error('No stock'), { status: 409, code: 'INSUFFICIENT_STOCK' })
  }
  const { vm, unmount } = mount(ReceiptDialog, { open: true, id: 'r1', mode: 'cancel' })
  await flush()
  vm.reason = 'Wrong receipt'
  await vm.submit()
  assert.equal(vm.detail.status, 'CONFIRMED')
  assert.equal(context.stock.revision, 0)
  unmount()
})
test('lack of mutation permission prevents both loading and writing', async () => {
  reset()
  context.auth.user.permissions = ['STOCK_RECEIPT_VIEW']
  const { vm, unmount } = mount(ReceiptDialog, { open: true, id: 'r1', mode: 'confirm' })
  await flush()
  await vm.submit()
  assert.equal(context.calls.length, 0)
  unmount()
})
test('inventory sends no request before selecting a warehouse', async () => {
  reset()
  context.warehouses.selectedId = undefined
  const { vm, unmount } = mount(InventoryPage, {})
  await flush()
  assert.equal(context.calls.length, 0)
  assert.deepEqual(vm.rows, [])
  unmount()
})
test('warehouse switch ignores late response from previous warehouse and refresh revision reloads', async () => {
  reset()
  let finishOld
  context.handler = ({ url }) =>
    url.includes('/w1/')
      ? new Promise((resolve) => {
          finishOld = resolve
        })
      : {
          items: [{ warehouseId: 'w2', productId: 'p2', quantity: 8 }],
          total: 1,
          page: 1,
          pageSize: 10,
        }
  const { vm, unmount } = mount(InventoryPage, {})
  await flush()
  context.warehouses.selectedId = 'w2'
  await flush()
  assert.equal(vm.rows[0].warehouseId, 'w2')
  finishOld({
    items: [{ warehouseId: 'w1', productId: 'p1', quantity: 999 }],
    total: 1,
    page: 1,
    pageSize: 10,
  })
  await flush()
  assert.equal(vm.rows[0].warehouseId, 'w2')
  assert.deepEqual(context.calls[1].config.params, { page: 1, pageSize: 10 })
  context.stock.invalidate()
  await flush()
  assert.equal(context.calls.length, 3)
  unmount()
})

test('close a loading detail then open create: loading is reset and stale detail is ignored', async () => {
  reset()
  let finishDetail
  context.handler = () =>
    new Promise((resolve) => {
      finishDetail = resolve
    })
  const { vm, state, unmount } = mount(ReceiptDialog, { open: true, id: 'r1', mode: 'view' })
  await flush()
  assert.equal(vm.loading, true)
  state.open = false
  await flush()
  state.id = undefined
  state.mode = 'create'
  state.open = true
  await flush()
  assert.equal(vm.loading, false)
  finishDetail(receipt())
  await flush()
  assert.equal(vm.detail, undefined)
  assert.equal(vm.form.lines.length, 1)
  unmount()
})
test('permission revocation discards pending detail and blocks mutation', async () => {
  reset()
  let finishDetail
  context.handler = () =>
    new Promise((resolve) => {
      finishDetail = resolve
    })
  const { vm, unmount } = mount(ReceiptDialog, { open: true, id: 'r1', mode: 'edit' })
  await flush()
  context.auth.user.permissions = []
  await flush()
  finishDetail(receipt())
  await flush()
  assert.equal(vm.detail, undefined)
  await vm.submit()
  assert.equal(context.calls.length, 1)
  unmount()
})
test('create sends only allowed payload and does not invalidate inventory', async () => {
  reset()
  context.response = receipt({ version: 0 })
  const { vm, unmount } = mount(ReceiptDialog, { open: true, mode: 'create' })
  vm.form.receiptDate = '2026-10-08'
  vm.form.lines[0].productId = 'p1'
  vm.form.lines[0].quantity = '9223372036854775807'
  vm.form.lines[0].unitPrice = '0'
  await vm.submit()
  const call = context.calls[0]
  assert.equal(call.method, 'POST')
  assert.equal(call.url, '/stock-receipts')
  assert.deepEqual(domain.parseStockJson(call.raw), {
    warehouseId: 'w1',
    receiptDate: '2026-10-08',
    lines: [{ productId: 'p1', quantity: 9223372036854775807n, unitPrice: 0 }],
  })
  assert.equal(context.stock.revision, 0)
  unmount()
})

test('stock translations preserve existing catalog messages and both locales have matching stock keys', async () => {
  const vi = (await import(moduleUrl(transpile(await read('src/locales/vi-VN.ts'))))).default
  const en = (await import(moduleUrl(transpile(await read('src/locales/en-US.ts'))))).default
  assert.ok(vi.catalog.warehouses)
  assert.ok(vi.catalog.required)
  assert.ok(en.catalog.warehouses)
  assert.equal(vi.stock.receipts, 'Phiếu nhập kho')
  assert.deepEqual(Object.keys(vi.stock).sort(), Object.keys(en.stock).sort())
  for (const text of Object.values(vi.stock)) assert.equal(text.includes('?'), false)
})
