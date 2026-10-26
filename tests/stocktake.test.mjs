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
const stockUrl = moduleUrl(transpile(await read('src/utils/stock.ts')))
const stockDomain = await import(stockUrl)
const domainUrl = moduleUrl(
  transpile(
    (await read('src/utils/stocktake.ts')).replace("'@/utils/stock'", JSON.stringify(stockUrl)),
  ),
)
const domain = await import(domainUrl)
const context = {
  calls: [],
  modals: [],
  route: reactive({ query: {} }),
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
        'STOCKTAKE_VIEW',
        'STOCKTAKE_CREATE',
        'STOCKTAKE_UPDATE',
        'STOCKTAKE_CONFIRM',
        'STOCKTAKE_CANCEL',
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
globalThis.window = { addEventListener() {}, removeEventListener() {} }
const mockUrl = moduleUrl(`
 import { defineComponent, h, computed } from '${vueUrl}'
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
 export const PlusOutlined = defineComponent({ render: () => null })
 export const ReloadOutlined = PlusOutlined
 export const SaveOutlined = PlusOutlined
 export const EyeOutlined = PlusOutlined
 export const MoreOutlined = PlusOutlined
 export const message = { success() {} }
 export const Modal = { confirm(options) { context.modals.push(options) } }
 export const useRoute = () => context.route
 export const onBeforeRouteLeave = () => undefined
 export const useSalesScope = () => ({ auth: context.auth, warehouses: context.warehouses, can: useCatalogPermission().can, inScope: id => context.warehouses.warehouses.some(w => w.id === id), refreshScope: async () => { context.warehouses.warehouses = [] }, scopeKey: computed(() => JSON.stringify([context.auth.user.permissions, context.auth.isCatalogAdmin, context.warehouses.warehouses])) })
 export const formatDateTime = value => value
 export const BasicModal = defineComponent({ setup(_, { slots }) { return () => h('modal', [slots.default?.(), slots.footer?.()]) } })
 export const BasicTable = defineComponent({ setup() { return () => null } })
 export default defineComponent({ setup() { return () => null } })
`)
const apiUrl = moduleUrl(
  transpile(
    (await read('src/api/stock/stocktake.api.ts'))
      .replace("'@/utils/request'", JSON.stringify(mockUrl))
      .replace("'@/utils/stock'", JSON.stringify(stockUrl))
      .replace("'@/composables/useCatalogPermission'", JSON.stringify(mockUrl)),
  ),
)
const api = await import(apiUrl)

const stockApiUrl = moduleUrl(
  transpile(
    (await read('src/api/stock/stock.api.ts'))
      .replace("'@/utils/request'", JSON.stringify(mockUrl))
      .replace("'@/utils/stock'", JSON.stringify(stockUrl)),
  ),
)
async function component(path, expose) {
  const source = (await read(path)).replace('</script>', `defineExpose({ ${expose} })\n</script>`)
  const { descriptor } = parse(source)
  let code = compileScript(descriptor, { id: `test-${index}`, inlineTemplate: true }).content
  code = code.replace(/from ['"]vue['"]/g, `from '${vueUrl}'`)
  for (const name of [
    'vue-i18n',
    '@ant-design/icons-vue',
    './StocktakeTable.vue',
    '@/components/stock/StocktakeTable.vue',
    'ant-design-vue',
    'vue-router',
    '@/components',
    '@/stores/warehouse',
    '@/stores/stock',
    '@/stores/auth',
    '@/composables/useCatalogPermission',
    '@/composables/useSalesScope',
    '@/utils/date',
    './StocktakeProducts.vue',
    '@/components/stock/StocktakeDialog.vue',
  ])
    code = code
      .replaceAll(`from '${name}'`, `from '${mockUrl}'`)
      .replaceAll(`from "${name}"`, `from '${mockUrl}'`)
  code = code
    .replaceAll("from '@/utils/stocktake'", `from '${domainUrl}'`)
    .replaceAll("from '@/utils/stock'", `from '${stockUrl}'`)
    .replaceAll("from '@/api/stock/stocktake.api'", `from '${apiUrl}'`)
    .replaceAll("from '@/api/stock/stock.api'", `from '${stockApiUrl}'`)
  return (await import(moduleUrl(transpile(code)))).default
}
const StocktakeDialog = await component(
  'src/components/stock/StocktakeDialog.vue',
  'execute, requestAction, load, form, detail, fields, blocked, reason, loading, saving, dirty, stale, addProduct, localMode, error',
)
const StocktakeProducts = await component(
  'src/components/stock/StocktakeProducts.vue',
  'load, rows, changePage, select',
)
const StocktakesPage = await component(
  'src/views/stock/StocktakesPage.vue',
  'load, rows, total, page, pageSize, filters, show, changePage, columns',
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
  context.modals = []
  context.route.query = {}
  context.warehouses.warehouses = [{ id: 'w1', name: 'Warehouse', code: 'W1', status: 1 }]
  context.handler = undefined
  context.stock.revision = 0
  context.warehouses.selectedId = 'w1'
  context.auth.user.permissions = [
    'STOCKTAKE_VIEW',
    'STOCKTAKE_CREATE',
    'STOCKTAKE_UPDATE',
    'STOCKTAKE_CONFIRM',
    'STOCKTAKE_CANCEL',
    'INVENTORY_VIEW',
    'INVENTORY_MOVEMENT_VIEW',
  ]
  context.auth.isCatalogAdmin = false
}

const receipt = (overrides = {}) => ({
  id: 's1',
  code: 'KK-1',
  warehouseId: 'w1',
  status: 'DRAFT',
  version: 7,
  createdBy: 'u1',
  createdAt: '2026-10-12T03:00:00Z',
  updatedBy: 'u1',
  updatedAt: '2026-10-12T03:00:00Z',
  lines: [
    {
      productId: 'p1',
      productCode: 'P1',
      productName: 'Product',
      unit: 'cay',
      systemQuantity: 100,
      inventoryRevision: 1,
      countedQuantity: 97,
      difference: -3,
      reason: 'Missing three',
    },
  ],
  ...overrides,
})
const openDialog = async (mode = 'edit', overrides = {}) => {
  const mounted = mount(StocktakeDialog, { open: true, id: 's1', mode, ...overrides })
  await flush()
  return mounted
}

test('exact differences, zero and blank counts, reason validation at save', () => {
  const form = domain.stocktakeForm(receipt())
  assert.equal(domain.countDifference('97', 100), -3n)
  assert.equal(domain.countDifference('105', 100), 5n)
  assert.equal(domain.countDifference('100', 100), 0n)
  assert.equal(domain.countDifference('0', 100), -100n)
  assert.equal(domain.countDifference('', 100), undefined)
  assert.equal(
    domain.countDifference('9223372036854775807', 9007199254740993n),
    9214364837600034814n,
  )
  assert.equal(domain.countDifference('10', undefined), undefined)
  form.lines[0].reason = ' '
  assert.equal(domain.validateStocktake(form)['lines.p1'], 'reasonRequired')
  form.lines[0].countedQuantity = ''
  assert.deepEqual(domain.validateStocktake(form), {})
  assert.equal(domain.validateStocktake(form, false, true)['lines.p1'], 'countRequired')
  form.lines[0].countedQuantity = '0'
  form.lines[0].reason = 'Empty'
  assert.deepEqual(domain.validateStocktake(form, false, true), {})
  for (const value of ['1.0', '1e0', '-1', '9223372036854775808']) {
    form.lines[0].countedQuantity = value
    assert.equal(domain.validateStocktake(form)['lines.p1'], 'invalidQuantity')
  }
})
test('full replacement uses exact integer tokens and omits blank counts, metadata', () => {
  const form = domain.stocktakeForm(receipt())
  form.lines[0].countedQuantity = '9223372036854775807'
  const raw = stockDomain.stringifyStockJson(domain.stocktakeInput(form, 9223372036854775807n))
  assert.match(raw, /"version":9223372036854775807/)
  assert.match(raw, /"countedQuantity":9223372036854775807/)
  assert.doesNotMatch(raw, /warehouseId|systemQuantity|inventoryRevision|difference|createdBy/)
  form.lines[0].countedQuantity = ''
  assert.doesNotMatch(
    stockDomain.stringifyStockJson(domain.stocktakeInput(form, 1)),
    /countedQuantity/,
  )
})
test('stale parses all products even equal quantities with different revision, without Number', () => {
  const stale = domain.parseStaleLines({
    'lines.p1.snapshotRevision': '1',
    'lines.p1.currentRevision': '3',
    'lines.p1.systemQuantity': '9223372036854775807',
    'lines.p1.currentQuantity': '9223372036854775807',
    'lines.p2.currentQuantity': '1',
  })
  assert.equal(stale.p1.currentQuantity, '9223372036854775807')
  assert.equal(stale.p1.snapshotRevision, '1')
  assert.equal(stale.p1.currentRevision, '3')
  assert.equal(stale.p2.currentQuantity, '1')
})
test('line errors map productId and indexed backend validation to stable identity', () => {
  const lines = domain.stocktakeForm(receipt()).lines
  assert.deepEqual(
    domain.stocktakeFieldErrors('STOCKTAKE_COUNT_REQUIRED', { productId: 'p1' }, lines),
    { 'lines.p1': 'STOCKTAKE_COUNT_REQUIRED' },
  )
  assert.deepEqual(
    domain.stocktakeFieldErrors('VALIDATION_ERROR', { 'lines[0].reason': 'required' }, lines),
    { 'lines.p1': 'required' },
  )
})
test('API refuses every operation without its permission, preserves int64 and disables write retry', async () => {
  reset()
  context.auth.user.permissions = []
  for (const call of [
    () => api.getStocktakes({ page: 1, pageSize: 10 }),
    () => api.getStocktake('s1'),
    () => api.createStocktake({ warehouseId: 'w1', lines: [{ productId: 'p1' }] }),
    () => api.updateStocktake('s1', { version: 1, lines: [] }),
    () => api.refreshStocktake('s1', 1),
    () => api.confirmStocktake('s1', 1),
    () => api.cancelStocktake('s1', 1, 'Reason'),
  ])
    await assert.rejects(call, { code: 'FORBIDDEN' })
  assert.equal(context.calls.length, 0)
  context.auth.isCatalogAdmin = true
  context.response = stockDomain.stringifyStockJson(receipt({ version: 9223372036854775807n }))
  assert.equal(
    (await api.confirmStocktake('s1', 9223372036854775807n)).version,
    9223372036854775807n,
  )
  assert.equal(context.calls[0].raw, '{"version":9223372036854775807}')
  assert.equal(context.calls[0].config.preventAutomaticRetry, true)
})
test('save preserves draft inventory, validates reason, and uses backend response version', async () => {
  reset()
  context.response = receipt()
  const { vm, unmount } = await openDialog()
  vm.form.lines[0].reason = ''
  await vm.execute('save')
  assert.equal(context.calls.length, 1)
  assert.ok(vm.fields['lines.p1'])
  vm.form.lines[0].reason = 'Missing'
  context.response = receipt({ version: 8 })
  await vm.execute('save')
  assert.equal(context.calls.at(-1).method, 'PUT')
  assert.equal(context.calls.at(-1).data.version, 7)
  assert.equal(vm.detail.version, 8)
  assert.equal(context.stock.revision, 0)
  unmount()
})
test('confirm rejects unsaved edits and blank count, accepts zero with reason', async () => {
  reset()
  context.response = receipt()
  const { vm, unmount } = await openDialog()
  vm.form.note = 'Unsaved'
  await vm.execute('confirm')
  assert.equal(context.calls.length, 1)
  assert.equal(vm.error, 'stocktake.saveFirst')
  vm.form.note = ''
  context.response = receipt({
    lines: [
      {
        ...receipt().lines[0],
        countedQuantity: undefined,
        difference: undefined,
        reason: undefined,
      },
    ],
  })
  await vm.load(false)
  await vm.execute('confirm')
  assert.ok(vm.fields['lines.p1'])
  context.response = receipt({
    lines: [{ ...receipt().lines[0], countedQuantity: 0, difference: -100, reason: 'Empty' }],
  })
  await vm.load(false)
  context.response = receipt({ status: 'CONFIRMED', version: 8 })
  await vm.execute('confirm')
  assert.equal(vm.detail.status, 'CONFIRMED')
  assert.equal(context.stock.revision, 1)
  unmount()
})
test('confirm prevents duplicate requests and sends current saved version', async () => {
  reset()
  let finish
  context.handler = ({ method }) =>
    method === 'GET'
      ? receipt()
      : new Promise((resolve) => {
          finish = resolve
        })
  const { vm, unmount } = await openDialog('confirm')
  const pending = vm.execute('confirm')
  await vm.execute('confirm')
  assert.equal(context.calls.filter((c) => c.method === 'POST').length, 1)
  assert.equal(context.calls.at(-1).raw, '{"version":7}')
  finish(receipt({ status: 'CONFIRMED', version: 8 }))
  await pending
  unmount()
})
test('version conflict preserves user input and blocks resend without adopting currentVersion', async () => {
  reset()
  context.handler = ({ method }) => {
    if (method === 'GET') return receipt()
    throw Object.assign(new Error('Conflict'), {
      status: 409,
      code: 'VERSION_CONFLICT',
      details: { currentVersion: '99' },
    })
  }
  const { vm, unmount } = await openDialog()
  vm.form.note = 'My notes'
  await vm.execute('save')
  assert.equal(vm.form.note, 'My notes')
  assert.equal(vm.detail.version, 7)
  assert.equal(vm.blocked, true)
  await vm.execute('save')
  assert.equal(context.calls.length, 2)
  unmount()
})
test('stale keeps baseline and every affected line; refresh replaces all saved counts/reasons', async () => {
  reset()
  context.handler = ({ method, url }) => {
    if (method === 'GET') return receipt()
    if (url.endsWith('refresh-snapshot'))
      return receipt({
        version: 8,
        lines: [
          {
            ...receipt().lines[0],
            systemQuantity: 101,
            inventoryRevision: 3,
            countedQuantity: undefined,
            difference: undefined,
            reason: undefined,
          },
        ],
      })
    throw Object.assign(new Error('Stale'), {
      status: 409,
      code: 'STOCKTAKE_STALE',
      details: {
        'lines.p1.snapshotRevision': '1',
        'lines.p1.currentRevision': '3',
        'lines.p1.currentQuantity': '100',
        'lines.p2.currentQuantity': '10',
      },
    })
  }
  const { vm, unmount } = await openDialog('edit')
  await vm.execute('confirm')
  assert.equal(vm.form.lines[0].systemQuantity, 100)
  assert.equal(vm.stale.p1.currentRevision, '3')
  assert.equal(vm.stale.p2.currentQuantity, '10')
  assert.equal(context.calls.length, 2)
  vm.requestAction('refresh')
  assert.equal(context.calls.length, 2)
  assert.equal(context.modals.length, 1)
  await context.modals[0].onOk()
  assert.equal(vm.form.lines[0].countedQuantity, '')
  assert.equal(vm.form.lines[0].reason, '')
  assert.equal(vm.form.lines[0].systemQuantity, 101)
  assert.equal(vm.detail.version, 8)
  assert.deepEqual(vm.stale, {})
  unmount()
})
test('final states reject all mutations; draft cancel requires reason and works for inactive warehouse', async () => {
  for (const status of ['CONFIRMED', 'CANCELLED']) {
    reset()
    context.response = receipt({ status })
    const { vm, unmount } = await openDialog('cancel')
    vm.reason = 'Wrong'
    for (const action of ['save', 'refresh', 'confirm', 'cancel']) await vm.execute(action)
    assert.equal(context.calls.length, 1)
    unmount()
  }
  reset()
  context.response = receipt()
  context.warehouses.warehouses[0].status = 0
  const { vm, unmount } = await openDialog('cancel')
  await vm.execute('cancel')
  assert.equal(context.calls.length, 1)
  vm.reason = ' Wrong '
  context.response = receipt({ status: 'CANCELLED', version: 8 })
  await vm.execute('cancel')
  assert.equal(context.calls.at(-1).raw, '{"version":7,"reason":"Wrong"}')
  assert.equal(context.stock.revision, 0)
  unmount()
})
test('create-only permission does not GET or PUT; create+update edits using response without VIEW', async () => {
  for (const update of [false, true]) {
    reset()
    context.auth.user.permissions = ['STOCKTAKE_CREATE', ...(update ? ['STOCKTAKE_UPDATE'] : [])]
    context.response = receipt({
      version: 0,
      lines: [
        {
          ...receipt().lines[0],
          countedQuantity: undefined,
          difference: undefined,
          reason: undefined,
        },
      ],
    })
    const { vm, unmount } = await openDialog('create', { id: undefined })
    vm.addProduct({
      productId: 'p1',
      productCode: 'P1',
      productName: 'Product',
      unit: 'cay',
      quantity: 100,
    })
    await vm.execute('save')
    assert.equal(context.calls.length, 1)
    assert.deepEqual(stockDomain.parseStockJson(context.calls[0].raw), {
      warehouseId: 'w1',
      lines: [{ productId: 'p1' }],
    })
    assert.equal(vm.localMode, update ? 'edit' : 'create')
    await vm.execute('save')
    assert.equal(context.calls.filter((c) => c.method === 'GET').length, 0)
    assert.equal(context.calls.filter((c) => c.method === 'PUT').length, update ? 1 : 0)
    unmount()
  }
})
test('timeout confirm reads final state once without retrying POST; create timeout blocks retry', async () => {
  reset()
  let reads = 0
  context.handler = ({ method }) => {
    if (method === 'GET') return receipt({ status: ++reads === 1 ? 'DRAFT' : 'CONFIRMED' })
    throw new Error('Timeout')
  }
  const { vm, unmount } = await openDialog('confirm')
  await vm.execute('confirm')
  assert.equal(context.calls.filter((c) => c.method === 'POST').length, 1)
  assert.equal(vm.detail.status, 'CONFIRMED')
  assert.equal(context.stock.revision, 1)
  unmount()
  reset()
  context.handler = () => {
    throw new Error('Timeout')
  }
  const created = await openDialog('create', { id: undefined })
  created.vm.addProduct({ productId: 'p1', productCode: 'P1', productName: 'Product', unit: 'cay' })
  await created.vm.execute('save')
  await created.vm.execute('save')
  assert.equal(context.calls.length, 1)
  assert.equal(created.vm.blocked, true)
  created.unmount()
})
test('late detail cannot overwrite a newly opened create or revoked scope', async () => {
  reset()
  let finish
  context.handler = () =>
    new Promise((resolve) => {
      finish = resolve
    })
  const { vm, state, unmount } = await openDialog('view')
  state.open = false
  await flush()
  state.id = undefined
  state.mode = 'create'
  state.open = true
  await flush()
  finish(receipt())
  await flush()
  assert.equal(vm.detail, undefined)
  assert.equal(vm.loading, false)
  unmount()
  reset()
  context.response = receipt()
  const second = await openDialog('edit')
  context.warehouses.warehouses = []
  await flush()
  assert.equal(second.vm.detail, undefined)
  assert.deepEqual(second.vm.form.lines, [])
  await second.vm.execute('save')
  assert.equal(context.calls.length, 1)
  second.unmount()
})
test('product picker paginates inventory and never calls without INVENTORY_VIEW', async () => {
  reset()
  context.auth.user.permissions = ['STOCKTAKE_CREATE']
  const denied = mount(StocktakeProducts, { warehouseId: 'w1', selected: [] })
  await flush()
  assert.equal(context.calls.length, 0)
  denied.unmount()
  reset()
  context.response = {
    items: [{ productId: 'p1', quantity: 0, productStatus: 0 }],
    total: 25,
    page: 1,
    pageSize: 10,
  }
  const allowed = mount(StocktakeProducts, { warehouseId: 'w1', selected: [] })
  await flush()
  allowed.vm.changePage(2, 10)
  await flush()
  assert.equal(context.calls.at(-1).config.params.page, 2)
  assert.equal(context.calls.at(-1).url, '/warehouses/w1/inventory')
  allowed.unmount()
})
test('list uses backend total, sends local calendar dates, resets page on filter changes', async () => {
  reset()
  context.response = { items: [receipt()], total: 25, page: 1, pageSize: 10 }
  const { vm, unmount } = mount(StocktakesPage, {})
  await flush()
  assert.equal(vm.total, 25)
  vm.page = 3
  vm.filters.from = '2026-10-12'
  vm.filters.to = '2026-10-12'
  await flush()
  assert.equal(vm.page, 1)
  assert.deepEqual(context.calls.at(-1).config.params, {
    page: 1,
    pageSize: 10,
    warehouseId: 'w1',
    from: '2026-10-12',
    to: '2026-10-12',
  })
  unmount()
})
test('new lines require backend snapshot before entering counts; duplicates and limits are rejected', () => {
  const form = domain.stocktakeForm(receipt())
  form.lines.push({ ...form.lines[0], productId: 'p2', systemQuantity: undefined })
  assert.equal(domain.validateStocktake(form)['lines.p2'], 'saveNewLine')
  form.lines[1].countedQuantity = ''
  assert.deepEqual(domain.validateStocktake(form), {})
  form.lines[1].productId = 'p1'
  assert.equal(domain.validateStocktake(form)['lines.p1'], 'duplicate')
  form.lines = []
  assert.equal(domain.validateStocktake(form).lines, 'lineLimit')
  form.lines = Array.from({ length: 1001 }, (_, i) => ({ productId: String(i) }))
  assert.equal(domain.validateStocktake(form, true).lines, 'lineLimit')
})

test('refresh warns about unsaved data and cancellation preserves it; reload requires discard approval', async () => {
  reset()
  context.response = receipt()
  const { vm, unmount } = await openDialog()
  vm.form.note = 'Unsaved'
  vm.requestAction('refresh')
  vm.requestAction('refresh')
  assert.equal(context.modals.length, 1)
  assert.match(context.modals[0].content, /stocktake.discard/)
  context.modals[0].onCancel()
  assert.equal(vm.form.note, 'Unsaved')
  const reload = vm.load()
  await flush()
  assert.equal(context.calls.length, 1)
  context.modals.at(-1).onCancel()
  await reload
  assert.equal(vm.form.note, 'Unsaved')
  unmount()
})
test('stale without UPDATE explains required updater and never calls refresh', async () => {
  reset()
  context.auth.user.permissions = ['STOCKTAKE_VIEW', 'STOCKTAKE_CONFIRM']
  context.handler = ({ method }) => {
    if (method === 'GET') return receipt()
    throw Object.assign(new Error('Stale'), {
      status: 409,
      code: 'STOCKTAKE_STALE',
      details: { 'lines.p1.currentRevision': '3' },
    })
  }
  const { vm, unmount } = await openDialog('confirm')
  await vm.execute('confirm')
  assert.match(vm.error, /stocktake.needUpdater/)
  await vm.execute('refresh')
  assert.equal(context.calls.length, 2)
  unmount()
})
test('warehouse access denied clears detail and form and refreshes scope', async () => {
  reset()
  context.handler = ({ method }) => {
    if (method === 'GET') return receipt()
    throw Object.assign(new Error('Denied'), { status: 403, code: 'WAREHOUSE_ACCESS_DENIED' })
  }
  const { vm, unmount } = await openDialog()
  await vm.execute('save')
  assert.equal(vm.detail, undefined)
  assert.deepEqual(vm.form.lines, [])
  assert.deepEqual(context.warehouses.warehouses, [])
  await vm.execute('save')
  assert.equal(context.calls.length, 2)
  unmount()
})
test('cancel timeout reloads final state without repeating; no VIEW leaves result blocked', async () => {
  reset()
  let reads = 0
  context.handler = ({ method }) => {
    if (method === 'GET') return receipt({ status: ++reads === 1 ? 'DRAFT' : 'CANCELLED' })
    throw new Error('Timeout')
  }
  const { vm, unmount } = await openDialog('cancel')
  vm.reason = 'Wrong'
  await vm.execute('cancel')
  assert.equal(vm.detail.status, 'CANCELLED')
  assert.equal(context.calls.filter((c) => c.method === 'POST').length, 1)
  assert.equal(context.stock.revision, 0)
  unmount()
  reset()
  context.auth.user.permissions = ['STOCKTAKE_CANCEL']
  context.handler = () => {
    throw new Error('Timeout')
  }
  const noView = await openDialog('cancel', { initial: receipt() })
  noView.vm.reason = 'Wrong'
  await noView.vm.execute('cancel')
  await noView.vm.execute('cancel')
  assert.equal(context.calls.length, 1)
  assert.equal(context.calls[0].method, 'POST')
  assert.equal(noView.vm.blocked, true)
  noView.unmount()
})
test('both locales provide matching stocktake labels and preserve Vietnamese UTF-8', async () => {
  const vi = (await import(moduleUrl(transpile(await read('src/locales/vi-VN.ts'))))).default
  const en = (await import(moduleUrl(transpile(await read('src/locales/en-US.ts'))))).default
  assert.equal(vi.stocktake.title, 'Ki\u1ec3m k\u00ea kho')
  assert.deepEqual(Object.keys(vi.stocktake).sort(), Object.keys(en.stocktake).sort())
  assert.deepEqual(Object.keys(vi.stocktake.errors).sort(), Object.keys(en.stocktake.errors).sort())
})
test('page sizes preserve filters, use server totals and return to page one', async () => {
  reset()
  context.response = { items: [receipt()], total: 237, page: 1, pageSize: 10 }
  const { vm, unmount } = mount(StocktakesPage, {})
  await flush()
  vm.filters.status = 'DRAFT'
  vm.filters.from = '2026-10-12'
  vm.filters.to = '2026-10-15'
  await flush()
  for (const size of [20, 50, 100, 10]) {
    vm.changePage(4, size)
    await flush()
    assert.equal(vm.page, 1)
    assert.equal(vm.total, 237)
    assert.deepEqual(context.calls.at(-1).config.params, {
      page: 1,
      pageSize: size,
      warehouseId: 'w1',
      status: 'DRAFT',
      from: '2026-10-12',
      to: '2026-10-15',
    })
    vm.changePage(2, size)
    await flush()
    assert.equal(context.calls.at(-1).config.params.page, 2)
  }
  assert.deepEqual(
    vm.columns.map((column) => column.key),
    ['code', 'warehouse', 'createdBy', 'updatedBy', 'updatedAt', 'status', 'createdAt', 'actions'],
  )
  assert.equal(vm.columns.at(-1).fixed, 'right')
  unmount()
})

test('list ignores late responses after filters change', async () => {
  reset()
  const requests = []
  context.handler = () => new Promise((resolve) => requests.push(resolve))
  const { vm, unmount } = mount(StocktakesPage, {})
  await flush()
  vm.filters.status = 'CONFIRMED'
  await flush()
  requests.at(-1)({ items: [receipt({ code: 'NEW' })], total: 1 })
  await flush()
  requests[0]({ items: [receipt({ code: 'OLD' })], total: 99 })
  await flush()
  assert.equal(vm.rows[0].code, 'NEW')
  assert.equal(vm.total, 1)
  unmount()
})
