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
test('concurrent scope loads share one request; a new user supersedes the old response', async () => {
  const completions = []
  globalThis.__getMyWarehouses = () => new Promise((resolve) => completions.push(resolve))
  const store = warehouseModule.useWarehouseStore()
  const older = store.load('a')
  const shared = store.load('a')
  assert.equal(completions.length, 1)
  const newer = store.load('b')
  completions[1]([warehouse('new')])
  await newer
  completions[0]([warehouse('old')])
  await older
  await shared
  assert.equal(store.warehouses[0].id, 'new')
})
test('failed recovery retains last known scope without claiming an empty assignment', async () => {
  response = [warehouse('w1')]
  const store = warehouseModule.useWarehouseStore()
  await store.load('a')
  store.select('w1')
  globalThis.__getMyWarehouses = async () => {
    throw new Error('Denied')
  }
  await assert.rejects(store.revokeAccess('a'), /Denied/)
  assert.equal(store.selected, undefined)
  assert.equal(store.accessBlocked, true)
  assert.equal(store.loaded, true)
  assert.equal(store.warehouses[0].id, 'w1')
  assert.equal(store.error, 'Denied')
})

const authUtils = await loadSource('src/utils/auth.ts')
const jwt = (permissions = [], extra = {}) =>
  'header.' +
  Buffer.from(JSON.stringify({ permissions, ...extra })).toString('base64url') +
  '.signature'
const profile = (overrides = {}) => ({
  id: 'a',
  username: 'a',
  fullName: 'A',
  email: '',
  permissions: [],
  isAdmin: false,
  ...overrides,
})
let tokenResponse
let identity
let loginResponse
let savedToken
let identityCalls
let timers
globalThis.window = { setTimeout: (callback) => timers.push(callback) }
globalThis.__authMocks = {
  getUserInfoApi: async () => {
    identityCalls++
    return authUtils.validateCurrentUser(await identity())
  },
  loginApi: () => loginResponse(),
  refreshTokenApi: () => tokenResponse(),
  getTokenPermissions: authUtils.getTokenPermissions,
  useWarehouseStore: () => warehouseModule.useWarehouseStore(),
  clearPaymentRetries: () => {},
  clearTokens: () => {
    savedToken = null
  },
  getAccessToken: () => savedToken,
  getRefreshToken: () => 'refresh',
  saveTokens: (tokens) => {
    savedToken = tokens.accessToken
  },
}
beforeEach(() => {
  savedToken = jwt(['PRODUCT_VIEW'])
  identity = async () => profile()
  loginResponse = async () => ({ accessToken: savedToken, refreshToken: 'refresh' })
  tokenResponse = async () => ({ accessToken: jwt(['PRODUCT_CREATE']), refreshToken: 'refresh' })
  identityCalls = 0
  timers = []
})
const authModule = await loadSource('src/stores/auth.ts', (source) => {
  source = source.replace(/import \{[^}]+\} from '@\/(?:api|stores|utils)\/[^']+'\r?\n/g, '')
  return moduleImports(source).replace(
    'export const useAuthStore',
    'const { getUserInfoApi, loginApi, refreshTokenApi, getTokenPermissions, useWarehouseStore, clearPaymentRetries, clearTokens, getAccessToken, getRefreshToken, saveTokens } = globalThis.__authMocks\nexport const useAuthStore',
  )
})

test('Admin comes only from the boolean /auth/me field, independent of username, roles and permissions', async () => {
  const auth = authModule.useAuthStore()
  assert.equal(auth.adminVerificationStatus, 'idle')
  for (const isAdmin of [true, false]) {
    identity = async () =>
      profile({ isAdmin, username: 'ADMIN', permissions: ['USER_VIEW', 'PRODUCT_CREATE'] })
    await auth.getUserInfo()
    assert.equal(auth.isCatalogAdmin, isAdmin)
    assert.equal(auth.adminVerified, true)
    assert.equal(auth.adminVerificationStatus, 'verified')
    assert.deepEqual(auth.user.permissions, ['PRODUCT_VIEW'])
    assert.deepEqual(auth.currentUser.permissions, ['USER_VIEW', 'PRODUCT_CREATE'])
  }
})

test('failed verification removes prior Admin immediately, retains token permissions and permits retry', async () => {
  identity = async () => profile({ isAdmin: true })
  const auth = authModule.useAuthStore()
  await auth.getUserInfo()
  assert.equal(auth.isCatalogAdmin, true)
  let fail
  identity = () =>
    new Promise((_, reject) => {
      fail = reject
    })
  const pending = auth.refreshAdmin()
  assert.equal(auth.isCatalogAdmin, false)
  assert.equal(auth.adminVerificationStatus, 'loading')
  fail(new Error('Network unavailable'))
  await pending
  assert.equal(auth.currentUser, null)
  assert.equal(auth.isCatalogAdmin, false)
  assert.equal(auth.adminVerificationStatus, 'failed')
  assert.deepEqual(auth.user.permissions, ['PRODUCT_VIEW'])
  identity = async () => profile()
  await auth.refreshAdmin()
  assert.equal(auth.adminVerificationStatus, 'verified')
  assert.equal(auth.isCatalogAdmin, false)
})

test('missing, null, string and numeric isAdmin reject the contract rather than verifying false', async () => {
  const auth = authModule.useAuthStore()
  for (const isAdmin of [undefined, null, 'false', 'true', 0, 1]) {
    identity = async () => profile({ isAdmin })
    await assert.rejects(auth.getUserInfo(), /Invalid \/auth\/me response/)
    assert.equal(auth.adminVerificationStatus, 'failed')
    assert.equal(auth.isCatalogAdmin, false)
  }
  for (const value of [{ data: profile() }, null, { ...profile(), permissions: ['VIEW', 1] }]) {
    assert.throws(() => authUtils.validateCurrentUser(value), /Invalid \/auth\/me response/)
  }
})

test('concurrent identity, manual verification and denial recovery share one /me request', async () => {
  let finish
  identity = () =>
    new Promise((resolve) => {
      finish = resolve
    })
  const auth = authModule.useAuthStore()
  const pending = auth.getUserInfo()
  const shared = auth.getUserInfo()
  const retry = auth.refreshAdmin()
  const denial = auth.refreshAdminAfterDenial()
  assert.equal(identityCalls, 1)
  finish(profile())
  await Promise.all([pending, shared, retry, denial])
  await auth.refreshAdminAfterDenial()
  assert.equal(identityCalls, 1)
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
  finish(profile({ isAdmin: true }))
  await assert.rejects(pending, /Session changed/)
  assert.equal(auth.user, null)
  assert.equal(auth.currentUser, null)
  assert.equal(auth.isCatalogAdmin, false)
  assert.equal(auth.adminVerificationStatus, 'idle')
})

test('account switch clears Admin, warehouse selection and persistence and rejects late old identity', async () => {
  const auth = authModule.useAuthStore()
  identity = async () => profile({ isAdmin: true })
  await auth.getUserInfo()
  response = [warehouse('w1')]
  const scope = warehouseModule.useWarehouseStore()
  await scope.load('a')
  scope.select('w1')
  let finish
  identity = () =>
    new Promise((resolve) => {
      finish = resolve
    })
  const old = auth.getUserInfo()
  const employeeToken = jwt(['PRODUCT_VIEW'])
  loginResponse = async () => ({ accessToken: employeeToken, refreshToken: 'employee-refresh' })
  identity = async () => profile({ id: 'b', username: 'employee', isAdmin: false })
  await auth.login({ username: 'employee', password: 'password' })
  finish(profile({ isAdmin: true }))
  await assert.rejects(old, /Session changed/)
  assert.equal(auth.user.id, 'b')
  assert.equal(auth.isCatalogAdmin, false)
  assert.equal(auth.adminVerified, true)
  assert.deepEqual(scope.warehouses, [])
  assert.equal(scope.selectedId, undefined)
  assert.equal(storage.has('working-warehouse:a'), false)
})

test('DB permission changes do not affect can() until the access token rotates', async () => {
  const auth = authModule.useAuthStore()
  identity = async () => profile({ permissions: ['PRODUCT_CREATE'] })
  await auth.getUserInfo()
  assert.deepEqual(auth.user.permissions, ['PRODUCT_VIEW'])
  await auth.refreshToken()
  assert.deepEqual(auth.user.permissions, ['PRODUCT_CREATE'])
  assert.equal(auth.isCatalogAdmin, false)
  assert.equal(auth.adminVerificationStatus, 'idle')
  await auth.getUserInfo()
  for (const callback of timers) callback()
  assert.equal(identityCalls, 2)
  assert.deepEqual(auth.user.permissions, ['PRODUCT_CREATE'])
  assert.equal(auth.adminVerified, true)
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
  finish({ accessToken: jwt([]), refreshToken: 'refresh' })
  await assert.rejects(pending, /Session changed/)
  assert.equal(auth.accessToken, null)
  assert.equal(auth.user, null)
})

test('token rotation during identity fetch uses new token permissions without duplicate verification', async () => {
  const auth = authModule.useAuthStore()
  identity = async () => {
    await auth.refreshToken()
    return profile()
  }
  await auth.getUserInfo()
  assert.equal(identityCalls, 1)
  assert.equal(timers.length, 0)
  assert.deepEqual(auth.user.permissions, ['PRODUCT_CREATE'])
  assert.equal(auth.adminVerified, true)
})

test('concurrent refreshes share tokens and schedule one verification', async () => {
  let finish
  tokenResponse = () =>
    new Promise((resolve) => {
      finish = resolve
    })
  const auth = authModule.useAuthStore()
  const pending = auth.refreshToken()
  const shared = auth.refreshToken()
  finish({ accessToken: jwt([]), refreshToken: 'refresh' })
  await Promise.all([pending, shared])
  assert.equal(timers.length, 1)
  timers[0]()
  await auth.getUserInfo()
  assert.equal(identityCalls, 1)
})

test('malformed JWT permission claims fail closed without using roles or DB fallback', () => {
  for (const token of ['bad', jwt(null), jwt('PRODUCT_VIEW'), 'header.bad.signature']) {
    assert.deepEqual(authUtils.getTokenPermissions(token), [])
  }
  assert.deepEqual(
    authUtils.getTokenPermissions(jwt(['PRODUCT_VIEW', 1], { roles: ['ADMIN'], isAdmin: true })),
    ['PRODUCT_VIEW'],
  )
})

const permissionsModule = await loadSource('src/constants/permissions.ts')
globalThis.__permissions = permissionsModule.PERMISSIONS
const landing = await loadSource('src/utils/landing.ts', (source) =>
  source.replace(
    "import { PERMISSIONS } from '@/constants/permissions'",
    'const PERMISSIONS = globalThis.__permissions',
  ),
)
test('login landing prioritizes business dashboard for verified Admin and preserves create-only access', () => {
  assert.equal(landing.getLandingPath([], true), '/dashboard')
  assert.equal(landing.getLandingPath(['REPORT_DASHBOARD_VIEW'], false), '/dashboard')
  assert.equal(landing.getLandingPath(['WAREHOUSE_CREATE'], false), '/catalog/warehouses')
  assert.equal(landing.getLandingPath(['PRODUCT_GROUP_CREATE'], false), '/catalog/product-groups')
  assert.equal(landing.getLandingPath(['PRODUCT_VIEW'], false), '/catalog/products')
  assert.equal(landing.getLandingPath(['DASHBOARD_VIEW'], false), '/dashboard')
  assert.equal(landing.getLandingPath(['USER_VIEW'], false), '/system/user')
  assert.equal(landing.getLandingPath([], false), '/403')
})
