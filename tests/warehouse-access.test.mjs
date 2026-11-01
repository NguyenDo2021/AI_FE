/* eslint-disable vue/one-component-per-file -- UI test doubles share one renderer. */
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { beforeEach, test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { setImmediate } from 'node:timers/promises'
import ts from 'typescript'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick, createRenderer, defineComponent, h, reactive } from 'vue'
import { parse, compileScript } from 'vue/compiler-sfc'
import { AxiosError } from 'axios'

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8')
const url = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
const transpile = (code) =>
  ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
const runtime = url(`
 export const message = { error() {} }
 export const i18n = { global: { t: key => key } }
 export const getAccessToken = () => 'access'
 export const getRefreshToken = () => globalThis.__warehouseRefreshToken
 export const clearTokens = () => { globalThis.__warehouseExpired++ }
`)
const blobUrl = url(transpile(await read('src/utils/paymentReceipt.ts')))
const requestUrl = url(
  transpile(
    (await read('src/utils/request.ts'))
      .replace("from 'axios'", `from '${import.meta.resolve('axios')}'`)
      .replace("'@/utils/paymentReceipt'", JSON.stringify(blobUrl))
      .replace(/'(@\/locales|ant-design-vue|@\/utils\/storage)'/g, JSON.stringify(runtime))
      .replace('import.meta.env.VITE_GLOB_API_URL', "'https://example.test/api'")
      .replace(
        'const http = axios.create',
        'const http = globalThis.__warehouseHttp = axios.create',
      ),
  ),
)
const client = await import(requestUrl)
const catalogUrl = url(
  transpile(
    (await read('src/api/catalog/catalog.api.ts')).replace(
      "'@/utils/request'",
      JSON.stringify(requestUrl),
    ),
  ),
)
const storeUrl = url(
  transpile(
    (await read('src/stores/warehouse.ts'))
      .replace("from 'vue'", `from '${import.meta.resolve('vue')}'`)
      .replace("from 'pinia'", `from '${import.meta.resolve('pinia')}'`)
      .replace("'@/api/catalog/catalog.api'", JSON.stringify(catalogUrl)),
  ),
)
const { useWarehouseStore } = await import(storeUrl)
const { installWarehouseAccess } = await import(
  url(
    transpile(
      (await read('src/utils/warehouseAccess.ts')).replace(
        "'@/utils/request'",
        JSON.stringify(requestUrl),
      ),
    ),
  )
)
const http = globalThis.__warehouseHttp
const storage = new Map()
globalThis.sessionStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: (key) => storage.delete(key),
}
const warehouse = (id) => ({ id, code: id, name: 'Warehouse ' + id, status: 1 })
const deferred = () => {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}
const flush = async () => {
  await setImmediate()
  await nextTick()
}
let store, calls, handler, scope, forbidden
const respond = (config, data, status = 200) => ({
  config,
  data,
  status,
  statusText: '',
  headers: {},
})
const deny = (config, code = 'WAREHOUSE_ACCESS_DENIED', blob = false) => {
  const data = blob ? new Blob([JSON.stringify({ code })], { type: 'application/json' }) : { code }
  throw new AxiosError('Denied', 'ERR_BAD_REQUEST', config, undefined, respond(config, data, 403))
}
beforeEach(async () => {
  storage.clear()
  calls = []
  scope = [warehouse('w1'), warehouse('w2')]
  forbidden = 0
  globalThis.__warehouseExpired = 0
  globalThis.__warehouseRefreshToken = undefined
  handler = (config) => respond(config, { items: [], total: 0 })
  http.defaults.adapter = async (config) => {
    calls.push(config)
    if (config.url === '/users/me/warehouses') return respond(config, scope)
    return handler(config)
  }
  setActivePinia(createPinia())
  store = useWarehouseStore()
  await store.load('employee')
  store.select('w1')
  installWarehouseAccess(store, () => 'employee')
  client.configureRequestAuth({
    refresh: async () => 'new-access',
    onSessionExpired: () => {
      globalThis.__warehouseExpired++
    },
    onAccessDenied: () => {
      forbidden++
    },
  })
  calls.length = 0
})

test('receipt denial refreshes assignments once, clears selection and persistence without logging out', async () => {
  scope = []
  const refresh = deferred()
  const adapter = http.defaults.adapter
  http.defaults.adapter = (config) =>
    config.url === '/users/me/warehouses'
      ? (calls.push(config), refresh.promise.then(() => respond(config, scope)))
      : adapter(config)
  handler = (config) => deny(config)
  const failures = await Promise.allSettled([
    client.request.get('/stock-receipts/r1'),
    client.request.get('/stock-receipts', { params: { warehouseId: 'w1' } }),
    client.request.get('/reports/inventory'),
  ])
  assert.equal(failures[0].reason.code, 'WAREHOUSE_ACCESS_DENIED')
  assert.equal(store.accessBlocked, true)
  assert.equal(store.selected, undefined)
  assert.equal(calls.filter((c) => c.url === '/users/me/warehouses').length, 1)
  refresh.resolve()
  await flush()
  assert.equal(store.accessBlocked, false)
  assert.equal(store.loaded, true)
  assert.deepEqual(store.warehouses, [])
  assert.equal(store.selectedId, undefined)
  assert.equal(storage.has('working-warehouse:employee'), false)
  assert.equal(globalThis.__warehouseExpired, 0)
  assert.equal(forbidden, 0)
  const before = calls.length
  await assert.rejects(client.request.get('/warehouses/w1/inventory'), {
    code: 'WAREHOUSE_SCOPE_CHANGED',
  })
  await assert.rejects(client.request.get('/stock-receipts'), { code: 'WAREHOUSE_SCOPE_CHANGED' })
  assert.equal(calls.length, before)
})

test('late lists, details and report aggregates cannot restore revoked warehouse data', async () => {
  const old = deferred()
  handler = (config) =>
    config.url === '/stock-receipts/denied'
      ? deny(config)
      : old.promise.then(() =>
          respond(config, { items: [{ warehouseId: 'w1' }], total: 42, summary: 99 }),
        )
  const pending = [
    client.request.get('/stock-receipts'),
    client.request.get('/stock-receipts/r1'),
    client.request.get('/warehouses/w1/inventory'),
    client.request.get('/reports/dashboard'),
  ].map((promise) =>
    promise.then(
      () => assert.fail('stale data was accepted'),
      (error) => error.code,
    ),
  )
  await flush()
  scope = [warehouse('w2')]
  await assert.rejects(client.request.get('/stock-receipts/denied'), {
    code: 'WAREHOUSE_ACCESS_DENIED',
  })
  await flush()
  old.resolve()
  assert.deepEqual(await Promise.all(pending), Array(4).fill('WAREHOUSE_SCOPE_CHANGED'))
  assert.deepEqual(
    store.warehouses.map((w) => w.id),
    ['w2'],
  )
  assert.equal(store.selectedId, undefined) // Existing project rule: no automatic selection.
  assert.equal(storage.has('working-warehouse:employee'), false)
  handler = (config) => respond(config, { items: [], total: 0 })
  await client.request.get('/warehouses/w2/inventory')
  const count = calls.length
  await assert.rejects(client.request.get('/stock-receipts', { params: { warehouseId: 'w1' } }))
  assert.equal(calls.length, count)
})

test('failed recovery stays blocked, retains unverified scope and supports an explicit retry', async () => {
  const adapter = http.defaults.adapter
  http.defaults.adapter = (config) => {
    if (config.url === '/users/me/warehouses') {
      calls.push(config)
      throw new AxiosError('Offline', 'ERR_NETWORK', config)
    }
    return adapter(config)
  }
  handler = (config) => deny(config)
  await assert.rejects(client.request.get('/stock-receipts/r1'))
  await flush()
  assert.equal(store.accessBlocked, true)
  assert.equal(store.loaded, true)
  assert.equal(store.warehouses.length, 2)
  assert.ok(store.error)
  const count = calls.length
  await assert.rejects(client.request.get('/sales-orders'))
  await assert.rejects(client.request.post('/stock-receipts', { warehouseId: 'w1' }))
  await flush()
  assert.equal(calls.length, count) // No background retry loop.
  scope = []
  http.defaults.adapter = adapter
  await store.load('employee')
  assert.equal(store.accessBlocked, false)
  assert.equal(store.error, '')
  assert.deepEqual(store.warehouses, [])
})

test('FORBIDDEN preserves valid warehouse scope, selection and functional permission flow', async () => {
  const revision = store.scopeRevision
  handler = (config) => deny(config, 'FORBIDDEN')
  await assert.rejects(client.request.get('/stock-receipts/r1'), { code: 'FORBIDDEN' })
  assert.equal(forbidden, 1)
  assert.equal(store.scopeRevision, revision)
  assert.equal(store.accessBlocked, false)
  assert.equal(store.selectedId, 'w1')
  assert.equal(
    calls.some((c) => c.url === '/users/me/warehouses'),
    false,
  )
})

test('products and groups remain accessible without assignments or during failed scope recovery', async () => {
  scope = []
  await store.load('employee')
  handler = (config) => respond(config, { items: [{ id: 'p1' }], total: 1 })
  assert.equal((await client.request.get('/products')).total, 1)
  assert.equal((await client.request.get('/product-groups')).total, 1)
  store.accessBlocked = true
  assert.equal((await client.request.get('/products')).total, 1)
  assert.equal(client.isWarehouseRequest('/users/me/warehouses'), false)
})

test('denied writes are never replayed into another warehouse; PDF errors use their code too', async () => {
  scope = [warehouse('w2')]
  handler = (config) => deny(config)
  await assert.rejects(client.request.post('/sales-orders/s1/confirm', { version: 1 }))
  await flush()
  assert.equal(calls.filter((c) => c.method === 'post').length, 1)
  assert.equal(store.selectedId, undefined)
  store.select('w2')
  scope = []
  handler = (config) => deny(config, 'WAREHOUSE_ACCESS_DENIED', true)
  await assert.rejects(client.request.getBlob('/payments/p1/print'), {
    code: 'WAREHOUSE_ACCESS_DENIED',
  })
  await flush()
  assert.deepEqual(store.warehouses, [])
})

test('a warehouse denial after token refresh never expires the employee session', async () => {
  globalThis.__warehouseRefreshToken = 'refresh'
  let reads = 0
  handler = (config) => {
    if (++reads === 1)
      throw new AxiosError('Expired', '', config, undefined, respond(config, {}, 401))
    return deny(config)
  }
  scope = []
  await assert.rejects(client.request.get('/stock-receipts/r1'), {
    code: 'WAREHOUSE_ACCESS_DENIED',
  })
  await flush()
  assert.equal(globalThis.__warehouseExpired, 0)
})
// Render the real layout and warehouse selector with lightweight UI controls.
const uiState = (globalThis.__warehouseUiState = {
  route: reactive({ path: '/stock/receipts', name: 'stock-receipts' }),
  auth: reactive({ user: { id: 'employee' }, isCatalogAdmin: false }),
})
const uiMock = url(`
 import { defineComponent, ref } from '${import.meta.resolve('vue')}'
 export { useWarehouseStore } from '${storeUrl}'
 export const useAuthStore = () => globalThis.__warehouseUiState.auth
 export const useRoute = () => globalThis.__warehouseUiState.route
 export const usePermission = () => ({ can: () => true })
 export const useI18n = () => ({ t: key => key })
 export const theme = { useToken: () => ({ token: ref({}) }) }
 export const ShopOutlined = defineComponent({ render: () => null })
 export const ReloadOutlined = ShopOutlined
 export default ShopOutlined
`)
const compileComponent = async (path, replacements = []) => {
  const { descriptor } = parse(await read(path))
  let code = compileScript(descriptor, { id: path, inlineTemplate: true }).content
  for (const [from, to] of replacements)
    code = code
      .replaceAll(JSON.stringify(from), JSON.stringify(to))
      .replaceAll("'" + from + "'", JSON.stringify(to))
  code = code.replace(/from ['"]vue['"]/g, `from '${import.meta.resolve('vue')}'`)
  return url(transpile(code))
}
const selectorUrl = await compileComponent('src/components/catalog/WarehouseSelector.vue', [
  ['vue-i18n', uiMock],
  ['ant-design-vue', uiMock],
  ['@ant-design/icons-vue', uiMock],
  ['@/stores/auth', uiMock],
  ['@/stores/warehouse', storeUrl],
])
const headerUrl = url(`
 import { defineComponent, h } from '${import.meta.resolve('vue')}'
 import WarehouseSelector from '${selectorUrl}'
 export default defineComponent({ render: () => h(WarehouseSelector) })
`)
const layoutUrl = await compileComponent('src/layouts/BasicLayout.vue', [
  ['@/components/layout/AppHeader.vue', headerUrl],
  ['@/components/layout/AppSidebar.vue', uiMock],
  ['vue-router', uiMock],
  ['@/stores/auth', uiMock],
  ['@/composables/usePermission', uiMock],
  ['@/stores/warehouse', storeUrl],
])
const Layout = (await import(layoutUrl)).default
const renderer = createRenderer({
  createElement: (type) => ({ type, children: [] }),
  createText: (text) => ({ text }),
  createComment: (text) => ({ text }),
  insert(child, parent, anchor) {
    if (child.parent) child.parent.children = child.parent.children.filter((item) => item !== child)
    child.parent = parent
    const at = anchor ? parent.children.indexOf(anchor) : -1
    if (at < 0) parent.children.push(child)
    else parent.children.splice(at, 0, child)
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
  patchProp(node, key, _, value) {
    ;(node.props ??= {})[key] = value
  },
})
const find = (tree, predicate) => [
  ...(predicate(tree) ? [tree] : []),
  ...(tree.children ?? []).flatMap((child) => find(child, predicate)),
]
function mountLayout() {
  uiState.route.path = '/stock/receipts'
  uiState.route.name = 'stock-receipts'
  const app = renderer.createApp(Layout)
  app.config.warnHandler = () => undefined
  app.config.globalProperties.$t = (key) => key
  for (const name of [
    'a-layout',
    'a-layout-content',
    'a-alert',
    'a-button',
    'a-tooltip',
    'a-select',
  ]) {
    app.component(
      name,
      defineComponent({
        inheritAttrs: false,
        setup(_, { attrs, slots }) {
          return () => h(name, attrs, [slots.default?.(), slots.action?.()])
        },
      }),
    )
  }
  app.component(
    'RouterView',
    defineComponent({
      setup() {
        const cachedWarehouse = store.selectedId
        return () =>
          h('business-data', { warehouseId: cachedWarehouse }, [
            h('detail', 'old receipt'),
            h('rows', 'old rows'),
            h('total', '42'),
            h('summary', '99'),
          ])
      },
    }),
  )
  const tree = { children: [] }
  app.mount(tree)
  return { tree, unmount: () => app.unmount() }
}

test('receipt denial clears the mounted business subtree and updates header without a page reload', async () => {
  const subject = mountLayout()
  await flush()
  assert.equal(find(subject.tree, (node) => node.type === 'business-data').length, 1)
  scope = []
  handler = (config) => deny(config)
  await assert.rejects(client.request.get('/stock-receipts/r1'))
  await flush()
  assert.equal(find(subject.tree, (node) => node.type === 'business-data').length, 0)
  const selector = find(subject.tree, (node) => node.type === 'a-select')[0]
  assert.equal(selector.props.value, undefined)
  assert.equal(selector.props.disabled, true)
  assert.equal(selector.props.placeholder, 'header.noAssignedWarehouses')
  assert.equal(
    find(subject.tree, (node) => node.props?.message === 'header.warehouseAccessRevoked').length,
    1,
  )
  assert.equal(
    find(subject.tree, (node) => node.props?.description === 'catalog.noWarehouses').length,
    1,
  )
  uiState.route.path = '/stock/inventory'
  uiState.route.name = 'stock-inventory'
  await flush()
  assert.equal(find(subject.tree, (node) => node.type === 'business-data').length, 0)
  uiState.route.path = '/catalog/products'
  uiState.route.name = 'products'
  await flush()
  assert.equal(find(subject.tree, (node) => node.type === 'business-data').length, 1)
  subject.unmount()
})

test('failed scope refresh shows an unverified state with retry, then mounts a clean remaining scope', async () => {
  const subject = mountLayout()
  await flush()
  const adapter = http.defaults.adapter
  http.defaults.adapter = (config) =>
    config.url === '/users/me/warehouses'
      ? Promise.reject(new AxiosError('Offline', '', config))
      : adapter(config)
  handler = (config) => deny(config)
  await assert.rejects(client.request.get('/stock-receipts/r1'))
  await flush()
  assert.equal(find(subject.tree, (node) => node.type === 'business-data').length, 0)
  const alert = find(
    subject.tree,
    (node) => node.props?.message === 'header.warehouseScopeUnverified',
  )[0]
  assert.ok(alert)
  assert.equal(
    find(subject.tree, (node) => node.props?.placeholder === 'header.noAssignedWarehouses').length,
    0,
  )
  const retry = find(alert, (node) => node.type === 'a-button')[0]
  assert.equal(retry.props.disabled, false)
  http.defaults.adapter = adapter
  scope = [warehouse('w2')]
  await retry.props.onClick()
  await flush()
  assert.equal(store.selectedId, undefined)
  assert.equal(
    find(subject.tree, (node) => node.type === 'business-data')[0].props.warehouseId,
    undefined,
  )
  const selector = find(subject.tree, (node) => node.type === 'a-select')[0]
  assert.deepEqual(
    selector.props.options.map((item) => item.value),
    ['w2'],
  )
  subject.unmount()
})
test('unchanged scope after a denial stays blocked until an explicit retry, preventing recovery loops', async () => {
  handler = (config) => deny(config)
  await assert.rejects(client.request.get('/stock-receipts/r1'))
  await flush()
  assert.equal(store.accessBlocked, true)
  const count = calls.length
  await assert.rejects(client.request.get('/stock-receipts'))
  await flush()
  assert.equal(calls.length, count)
  handler = (config) => respond(config, { items: [], total: 0 })
  await store.load('employee')
  assert.equal(store.accessBlocked, false)
  assert.equal(store.selectedId, 'w1')
  await client.request.get('/stock-receipts')
})
test('scope recovery supersedes a warehouse fetch started before the denial', async () => {
  const old = deferred()
  const adapter = http.defaults.adapter
  let first = true
  http.defaults.adapter = (config) => {
    if (config.url === '/users/me/warehouses' && first) {
      first = false
      return old.promise.then(() => respond(config, [warehouse('w1'), warehouse('w2')]))
    }
    return adapter(config)
  }
  const pending = store.load('employee')
  await flush()
  scope = []
  handler = (config) => deny(config)
  await assert.rejects(client.request.get('/stock-receipts/r1'))
  await flush()
  old.resolve()
  await pending
  assert.deepEqual(store.warehouses, [])
  assert.equal(store.selectedId, undefined)
  assert.equal(store.accessBlocked, false)
})
