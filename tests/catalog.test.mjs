import { Buffer } from 'node:buffer'
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { createPinia, setActivePinia } from 'pinia'
let moduleIndex = 0
async function loadSource(path, replace = (source) => source) {
  const source = replace(await readFile(new URL('../' + path, import.meta.url), 'utf8'))
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  })
  return import(
    `data:text/javascript;base64,${Buffer.from(outputText + `\n// module ${++moduleIndex}`).toString('base64')}`
  )
}
const domain = await loadSource('src/utils/catalog.ts')
const t = (key) => key
const valid = () => ({
  code: ' pu-001 ',
  name: 'Product',
  groupId: 'group-1',
  status: 1,
  referencePurchasePrice: '0',
  defaultSalePrice: '0',
  lowStockThreshold: '0',
})
const product = {
  id: 'p1',
  createdAt: '2026-10-07T09:00:00Z',
  code: 'PU-001',
  name: 'Product',
  groupId: 'inactive-group',
  status: 1,
  unit: 'cay',
  referencePurchasePrice: 0,
  defaultSalePrice: 0,
  lowStockThreshold: 0,
  material: 'PU',
  description: 'Retain me',
  lengthMeters: 2.4,
}

test('valid minimum product and zero values pass validation', () => {
  assert.deepEqual(domain.validateCatalog('products', valid(), t), {})
  const payload = domain.catalogPayload('products', valid())
  assert.equal(payload.referencePurchasePrice, 0)
  assert.equal(payload.defaultSalePrice, 0)
  assert.equal(payload.lowStockThreshold, 0)
  assert.equal(payload.unit, 'cay')
  assert.equal(payload.code, 'PU-001')
})
test('invalid code is rejected rather than silently stripped', () => {
  for (const code of ['A B', 'ÁBC', 'ABC/', ''])
    assert.ok(domain.validateCatalog('warehouses', { ...valid(), code }, t).code)
  for (const code of ['a_Z-1.2', '  code  '])
    assert.equal(domain.validateCatalog('warehouses', { ...valid(), code }, t).code, undefined)
})
test('all payload length limits are enforced', () => {
  for (const [kind, key, max] of [
    ['warehouses', 'code', 80],
    ['warehouses', 'name', 160],
    ['warehouses', 'address', 500],
    ['warehouses', 'phone', 20],
    ['warehouses', 'note', 2000],
    ['product-groups', 'description', 2000],
    ['products', 'material', 100],
    ['products', 'color', 100],
    ['products', 'dimensions', 255],
    ['products', 'description', 2000],
  ]) {
    assert.equal(
      domain.validateCatalog(kind, { ...valid(), [key]: 'x'.repeat(max) }, t)[key],
      undefined,
    )
    assert.ok(domain.validateCatalog(kind, { ...valid(), [key]: 'x'.repeat(max + 1) }, t)[key])
  }
})
test('status must be numeric 0/1; status 0 survives JSON payload', () => {
  assert.equal(
    JSON.parse(JSON.stringify(domain.catalogPayload('warehouses', { ...valid(), status: 0 })))
      .status,
    0,
  )
  for (const status of ['0', '1', 2, undefined])
    assert.ok(domain.validateCatalog('warehouses', { ...valid(), status }, t).status)
})
test('safe price boundary is accepted; larger integers, fractions and negatives are blocked', () => {
  const form = valid()
  form.defaultSalePrice = String(Number.MAX_SAFE_INTEGER)
  assert.equal(domain.validateCatalog('products', form, t).defaultSalePrice, undefined)
  assert.equal(domain.catalogPayload('products', form).defaultSalePrice, Number.MAX_SAFE_INTEGER)
  for (const value of ['9007199254740992', '9999999999999999999', '1.5', '-1', '1e3', 'NaN', '']) {
    assert.ok(
      domain.validateCatalog('products', { ...form, defaultSalePrice: value }, t).defaultSalePrice,
    )
  }
  assert.equal(domain.unsafePrices({ ...product, defaultSalePrice: 9007199254740992 }), true)
  assert.equal(domain.unsafePrices(product), false)
})
test('length supports up to nine integer and three decimal digits', () => {
  for (const value of ['', '0.001', '999999999.999', '2.4'])
    assert.equal(
      domain.validateCatalog('products', { ...valid(), lengthMeters: value }, t).lengthMeters,
      undefined,
    )
  for (const value of ['0', '-1', '1.0001', '1000000000', 'Infinity'])
    assert.ok(
      domain.validateCatalog('products', { ...valid(), lengthMeters: value }, t).lengthMeters,
    )
})
test('stock threshold accepts only bounded integers', () => {
  for (const value of ['0', '2147483647'])
    assert.equal(
      domain.validateCatalog('products', { ...valid(), lowStockThreshold: value }, t)
        .lowStockThreshold,
      undefined,
    )
  for (const value of ['2147483648', '-1', '1.1', ''])
    assert.ok(
      domain.validateCatalog('products', { ...valid(), lowStockThreshold: value }, t)
        .lowStockThreshold,
    )
})
test('edit and status PUT retain fields and inactive group ID without response metadata', () => {
  const form = domain.toCatalogForm({ ...product, updatedAt: 'timestamp' })
  form.status = 0
  const payload = domain.catalogPayload('products', form)
  assert.deepEqual(payload, {
    code: 'PU-001',
    name: 'Product',
    groupId: 'inactive-group',
    material: 'PU',
    color: undefined,
    dimensions: undefined,
    lengthMeters: 2.4,
    unit: 'cay',
    referencePurchasePrice: 0,
    defaultSalePrice: 0,
    lowStockThreshold: 0,
    description: 'Retain me',
    status: 0,
  })
  for (const field of ['id', 'createdAt', 'updatedAt', 'warehouseId'])
    assert.equal(field in payload, false)
})
test('warehouse status PUT preserves optional fields', () => {
  const warehouse = {
    id: 'w',
    code: 'W',
    name: 'Warehouse',
    address: 'Address',
    phone: '01234',
    note: 'Retain me',
    status: 1,
    createdAt: 'date',
  }
  assert.deepEqual(
    domain.catalogPayload('warehouses', { ...domain.toCatalogForm(warehouse), status: 0 }),
    {
      code: 'W',
      name: 'Warehouse',
      address: 'Address',
      phone: '01234',
      note: 'Retain me',
      status: 0,
    },
  )
})
test('backend validation and duplicate code errors map to fields', () => {
  assert.deepEqual(
    domain.catalogFieldErrors({
      code: 'VALIDATION_ERROR',
      details: { name: 'Required', defaultSalePrice: 'Invalid', unknown: {} },
    }),
    { name: 'Required', defaultSalePrice: 'Invalid' },
  )
  assert.deepEqual(
    domain.catalogFieldErrors({ code: 'PRODUCT_CODE_EXISTS', message: 'Duplicate' }),
    { code: 'Duplicate' },
  )
  assert.equal(domain.catalogError({ code: 'WAREHOUSE_ACCESS_DENIED' }, t), 'catalog.accessDenied')
  assert.equal(domain.catalogError({ code: 'RESOURCE_CONFLICT' }, t), 'catalog.conflict')
  assert.equal(domain.catalogError({ status: 404 }, t), 'catalog.notFound')
})

const calls = []
globalThis.__catalogRequest = Object.fromEntries(
  ['get', 'put', 'post', 'delete'].map((method) => [
    method,
    async (...args) => {
      calls.push({ method, args })
      return undefined
    },
  ]),
)
const api = await loadSource('src/api/catalog/catalog.api.ts', (source) =>
  source.replace(
    "import { request } from '@/utils/request'",
    'const request = globalThis.__catalogRequest',
  ),
)
test('API paths do not repeat /api; list sends status 0 and server pagination', async () => {
  calls.length = 0
  await api.getCatalogList('products', {
    page: 1,
    pageSize: 100,
    status: 0,
    keyword: 'PU',
    groupId: 'group',
  })
  assert.equal(calls[0].args[0], '/products')
  assert.deepEqual(calls[0].args[1].params, {
    page: 1,
    pageSize: 100,
    status: 0,
    keyword: 'PU',
    groupId: 'group',
  })
  assert.equal(calls[0].args[1].quietErrors, true)
})
test('assignment uses bodyless PUT per warehouse; DELETE 204 needs no JSON parsing', async () => {
  calls.length = 0
  await api.assignWarehouse('user', 'w1')
  await api.unassignWarehouse('user', 'w2')
  assert.equal(calls[0].method, 'put')
  assert.equal(calls[0].args[0], '/users/user/warehouses/w1')
  assert.equal(calls[0].args[1], undefined)
  assert.equal(calls[1].method, 'delete')
  assert.equal(calls[1].args[0], '/users/user/warehouses/w2')
})

const storage = new Map()
globalThis.sessionStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: (key) => storage.delete(key),
}
let response = []
globalThis.__getMyWarehouses = async () => response
const moduleImports = (source) =>
  source
    .replace("from 'vue'", `from '${import.meta.resolve('vue')}'`)
    .replace("from 'pinia'", `from '${import.meta.resolve('pinia')}'`)
const warehouseModule = await loadSource('src/stores/warehouse.ts', (source) =>
  moduleImports(source).replace(
    "import { getMyWarehouses } from '@/api/catalog/catalog.api'",
    'const getMyWarehouses = () => globalThis.__getMyWarehouses()',
  ),
)
const warehouse = (id, status = 1) => ({ id, status, code: id, name: id })
beforeEach(() => {
  setActivePinia(createPinia())
  storage.clear()
  response = []
  globalThis.__getMyWarehouses = async () => response
})
test('working warehouse is restored only for its user and within active scope', async () => {
  storage.set('working-warehouse:a', 'w1')
  response = [warehouse('w1'), warehouse('w2', 0)]
  const store = warehouseModule.useWarehouseStore()
  await store.load('a')
  assert.equal(store.selectedId, 'w1')
  store.select('w2')
  assert.equal(store.selectedId, undefined)
  store.select('w1')
  await store.load('b')
  assert.equal(store.selectedId, undefined)
  assert.equal(storage.has('working-warehouse:a'), false)
})
test('revoking access or deactivating selected warehouse clears selection; inactive warehouses remain visible', async () => {
  const store = warehouseModule.useWarehouseStore()
  response = [warehouse('w1')]
  await store.load('a')
  store.select('w1')
  response = [warehouse('w1', 0)]
  await store.load('a')
  assert.equal(store.selectedId, undefined)
  assert.equal(store.warehouses.length, 1)
  response = [warehouse('w1')]
  await store.load('a')
  store.select('w1')
  response = []
  await store.load('a')
  assert.equal(store.selectedId, undefined)
  assert.equal(storage.has('working-warehouse:a'), false)
})
test('logout clears scope and prevents a pending response from restoring it', async () => {
  let finish
  globalThis.__getMyWarehouses = () =>
    new Promise((resolve) => {
      finish = resolve
    })
  const store = warehouseModule.useWarehouseStore()
  const pending = store.load('a')
  store.reset()
  finish([warehouse('old')])
  await pending
  assert.equal(store.ownerId, undefined)
  assert.deepEqual(store.warehouses, [])
  assert.equal(store.loading, false)
})
test('only latest scope request can commit its response', async () => {
  const completions = []
  globalThis.__getMyWarehouses = () => new Promise((resolve) => completions.push(resolve))
  const store = warehouseModule.useWarehouseStore()
  const older = store.load('a')
  const newer = store.load('a')
  completions[1]([warehouse('new')])
  await newer
  completions[0]([warehouse('old')])
  await older
  assert.equal(store.warehouses[0].id, 'new')
})
test('scope fetch failure clears stale selected warehouse', async () => {
  response = [warehouse('w1')]
  const store = warehouseModule.useWarehouseStore()
  await store.load('a')
  store.select('w1')
  globalThis.__getMyWarehouses = async () => {
    throw new Error('Denied')
  }
  await assert.rejects(store.load('a'), /Denied/)
  assert.equal(store.selectedId, undefined)
  assert.deepEqual(store.warehouses, [])
})

let account = { status: 1 }
let roles = [{ code: 'ADMIN', status: 1 }]
let rejectAdmin = false
let tokenResponse = async () => ({ accessToken: 'new-token', refreshToken: 'refresh' })
let identity = async () => ({ id: 'a', username: 'a', fullName: 'A', email: '', permissions: [] })
globalThis.__authMocks = {
  getUser: async () => {
    if (rejectAdmin) throw new Error('Denied')
    return account
  },
  getUserRoles: async () => roles,
  getUserInfoApi: () => identity(),
  loginApi: async () => ({ accessToken: 'token', refreshToken: 'refresh' }),
  refreshTokenApi: () => tokenResponse(),
  useWarehouseStore: () => warehouseModule.useWarehouseStore(),
  clearPaymentRetries: () => {},
  clearTokens: () => {},
  getAccessToken: () => 'token',
  getRefreshToken: () => 'refresh',
  saveTokens: () => {},
}
const authModule = await loadSource('src/stores/auth.ts', (source) => {
  source = source.replace(/import \{[^}]+\} from '@\/(?:api|stores|utils)\/[^']+'\r?\n/g, '')
  return moduleImports(source).replace(
    'export const useAuthStore',
    'const { getUser, getUserRoles, getUserInfoApi, loginApi, refreshTokenApi, useWarehouseStore, clearPaymentRetries, clearTokens, getAccessToken, getRefreshToken, saveTokens } = globalThis.__authMocks\nexport const useAuthStore',
  )
})
test('Admin requires active account and active database ADMIN role, independent of permissions', async () => {
  rejectAdmin = false
  const auth = authModule.useAuthStore()
  for (const [status, roleStatus, expected] of [
    [1, 1, true],
    [0, 1, false],
    [1, 0, false],
  ]) {
    account = { status }
    roles = [{ code: 'ADMIN', status: roleStatus }]
    await auth.getUserInfo()
    assert.equal(auth.isCatalogAdmin, expected)
    assert.equal(auth.adminVerified, true)
  }
  roles = [{ code: 'USER', status: 1 }]
  await auth.refreshAdmin()
  assert.equal(auth.isCatalogAdmin, false)
})
test('failed database verification falls back to permissions without claiming Admin', async () => {
  account = { status: 1 }
  roles = [{ code: 'ADMIN', status: 1 }]
  rejectAdmin = false
  const auth = authModule.useAuthStore()
  await auth.getUserInfo()
  assert.equal(auth.isCatalogAdmin, true)
  rejectAdmin = true
  await auth.refreshAdmin()
  assert.equal(auth.isCatalogAdmin, false)
  assert.equal(auth.adminVerified, false)
  rejectAdmin = false
})
test('late identity response after logout cannot restore logged-out state', async () => {
  let finish
  identity = () =>
    new Promise((resolve) => {
      finish = resolve
    })
  const auth = authModule.useAuthStore()
  const pending = auth.getUserInfo()
  auth.logout()
  finish({ id: 'a', permissions: [] })
  await assert.rejects(pending, /Session changed/)
  assert.equal(auth.user, null)
  assert.equal(auth.isCatalogAdmin, false)
  identity = async () => ({ id: 'a', permissions: [] })
})

const permissionsModule = await loadSource('src/constants/permissions.ts')
globalThis.__permissions = permissionsModule.PERMISSIONS
const landing = await loadSource('src/utils/landing.ts', (source) =>
  source.replace(
    "import { PERMISSIONS } from '@/constants/permissions'",
    'const PERMISSIONS = globalThis.__permissions',
  ),
)
test('login landing allows Admin and create-only users without granting dashboard access', () => {
  assert.equal(landing.getLandingPath([], true), '/catalog/warehouses')
  assert.equal(landing.getLandingPath(['WAREHOUSE_CREATE'], false), '/catalog/warehouses')
  assert.equal(landing.getLandingPath(['PRODUCT_GROUP_CREATE'], false), '/catalog/product-groups')
  assert.equal(landing.getLandingPath(['PRODUCT_VIEW'], false), '/catalog/products')
  assert.equal(landing.getLandingPath(['DASHBOARD_VIEW'], false), '/dashboard')
  assert.equal(landing.getLandingPath(['USER_VIEW'], false), '/system/user')
  assert.equal(landing.getLandingPath([], false), '/403')
})
test('refresh response after logout cannot restore tokens', async () => {
  let finish
  tokenResponse = () =>
    new Promise((resolve) => {
      finish = resolve
    })
  const auth = authModule.useAuthStore()
  const pending = auth.refreshToken()
  auth.logout()
  finish({ accessToken: 'late-token', refreshToken: 'refresh' })
  await assert.rejects(pending, /Session changed/)
  assert.equal(auth.accessToken, null)
  assert.equal(auth.user, null)
  tokenResponse = async () => ({ accessToken: 'new-token', refreshToken: 'refresh' })
})
test('token rotation during identity fetch does not incorrectly invalidate the session', async () => {
  const auth = authModule.useAuthStore()
  identity = async () => {
    auth.accessToken = 'rotated-token'
    return { id: 'a', permissions: [] }
  }
  rejectAdmin = false
  account = { status: 1 }
  roles = []
  await auth.getUserInfo()
  assert.equal(auth.user.id, 'a')
  assert.equal(auth.accessToken, 'rotated-token')
  identity = async () => ({ id: 'a', permissions: [] })
})
