import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { beforeEach, test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { setImmediate } from 'node:timers/promises'
import ts from 'typescript'
import { createPinia, setActivePinia } from 'pinia'
import { AxiosError } from 'axios'

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8')
const url = (source) => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
const transpile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
const utilsUrl = url(transpile(await read('src/utils/auth.ts')))
const storageUrl = url(
  transpile(
    (await read('src/utils/storage.ts')).replace(
      "'@/constants/storage'",
      JSON.stringify(url(transpile(await read('src/constants/storage.ts')))),
    ),
  ),
)
const runtimeUrl = url(`
export const message = { error() {} }
export const i18n = { global: { t: key => key } }
export const clearPaymentRetries = () => {}
export const useWarehouseStore = () => ({ reset() {} })
`)
const requestUrl = url(
  transpile(
    (await read('src/utils/request.ts'))
      .replace("from 'axios'", `from '${import.meta.resolve('axios')}'`)
      .replace("'@/utils/storage'", JSON.stringify(storageUrl))
      .replace(
        "'@/utils/paymentReceipt'",
        JSON.stringify(url(transpile(await read('src/utils/paymentReceipt.ts')))),
      )
      .replace(/'(ant-design-vue|@\/locales)'/g, JSON.stringify(runtimeUrl))
      .replace('import.meta.env.VITE_GLOB_API_URL', "'https://example.test/api'")
      .replace('const http = axios.create', 'const http = globalThis.__authHttp = axios.create'),
  ),
)
const apiUrl = url(
  transpile(
    (await read('src/api/auth/auth.api.ts'))
      .replace("from 'axios'", `from '${import.meta.resolve('axios')}'`)
      .replace("'@/utils/request'", JSON.stringify(requestUrl))
      .replace("'@/utils/auth'", JSON.stringify(utilsUrl))
      .replace('import.meta.env.VITE_GLOB_API_URL', "'https://example.test/api'"),
  ),
)
const storeUrl = url(
  transpile(
    (await read('src/stores/auth.ts'))
      .replace("from 'vue'", `from '${import.meta.resolve('vue')}'`)
      .replace("from 'pinia'", `from '${import.meta.resolve('pinia')}'`)
      .replace("'@/utils/auth'", JSON.stringify(utilsUrl))
      .replace("'@/utils/storage'", JSON.stringify(storageUrl))
      .replace("'@/api/auth/auth.api'", JSON.stringify(apiUrl))
      .replace(/'(@\/utils\/payments|@\/stores\/warehouse)'/g, JSON.stringify(runtimeUrl)),
  ),
)
const { request, configureRequestAuth } = await import(requestUrl)
const { useAuthStore } = await import(storeUrl)
const api = await import(apiUrl)
const userApi = await import(
  url(
    transpile(
      (await read('src/api/user/user.api.ts')).replace(
        "'@/utils/request'",
        JSON.stringify(requestUrl),
      ),
    ),
  )
)
const permissionUrl = url(transpile(await read('src/utils/permission.ts')))
const { useCatalogPermission } = await import(
  url(
    transpile(
      (await read('src/composables/useCatalogPermission.ts'))
        .replace("'@/stores/auth'", JSON.stringify(storeUrl))
        .replace("'@/utils/permission'", JSON.stringify(permissionUrl)),
    ),
  )
)
const axios = (await import('axios')).default
const http = globalThis.__authHttp
const storage = new Map()
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: (key) => storage.delete(key),
}
let timers
globalThis.window = { setTimeout: (callback) => timers.push(callback) }
const jwt = (permissions = ['PRODUCT_VIEW']) =>
  'header.' +
  Buffer.from(JSON.stringify({ sub: 'employee', permissions })).toString('base64url') +
  '.signature'
const profile = (extra = {}) => ({
  id: 'employee',
  username: 'employee',
  fullName: 'Employee',
  email: '',
  permissions: ['USER_VIEW'],
  isAdmin: false,
  ...extra,
})
const respond = (config, data) => ({ config, data, status: 200, statusText: 'OK', headers: {} })
const reject = (config, status, code) => {
  throw new AxiosError(code, '', config, undefined, { ...respond(config, { code }), status })
}
const flush = async () => {
  await setImmediate()
  await setImmediate()
}
const drainTimers = async () => {
  for (const callback of timers.splice(0)) callback()
  await flush()
}
let auth, calls, handler, rawHandler, expired
beforeEach(() => {
  storage.clear()
  storage.set('frontend-base:access-token', jwt())
  storage.set('frontend-base:refresh-token', 'refresh')
  timers = []
  calls = []
  expired = 0
  handler = (config) => respond(config, profile())
  rawHandler = (config) =>
    respond(config, { accessToken: jwt(['PRODUCT_CREATE']), refreshToken: 'new-refresh' })
  http.defaults.adapter = async (config) => {
    calls.push(config)
    return handler(config)
  }
  axios.defaults.adapter = async (config) => {
    calls.push(config)
    return rawHandler(config)
  }
  setActivePinia(createPinia())
  auth = useAuthStore()
  configureRequestAuth({
    refresh: auth.refreshToken,
    sessionRevision: () => auth.sessionRevision,
    onSessionExpired: () => {
      expired++
      auth.logout()
    },
    onAccessDenied: () => {
      void auth.refreshAdminAfterDenial()
    },
  })
})

test('session restoration uses one direct /auth/me body and bearer header without admin endpoints', async () => {
  await Promise.all([auth.getUserInfo(), auth.getUserInfo(), auth.refreshAdmin()])
  assert.deepEqual(
    calls.map((c) => c.url),
    ['/auth/me'],
  )
  assert.equal(calls[0].baseURL, 'https://example.test/api')
  assert.equal(calls[0].headers.get('Authorization'), 'Bearer ' + jwt())
  assert.equal(auth.adminVerified, true)
  assert.equal(auth.isCatalogAdmin, false)
  assert.equal(useCatalogPermission().can('PRODUCT_VIEW'), true)
  assert.equal(useCatalogPermission().can('USER_VIEW'), false)
})

test('login verifies Admin=true with empty JWT permissions and clears previous effective access', async () => {
  rawHandler = (config) => respond(config, { accessToken: jwt([]), refreshToken: 'refresh' })
  handler = (config) => respond(config, profile({ isAdmin: true, permissions: [] }))
  await auth.login({ username: 'admin', password: 'secret' })
  assert.deepEqual(
    calls.map((c) => c.url),
    ['https://example.test/api/auth/login', '/auth/me'],
  )
  assert.deepEqual(auth.user.permissions, [])
  assert.equal(useCatalogPermission().can('PRODUCT_DELETE'), true)
  handler = (config) => respond(config, profile())
  rawHandler = (config) => respond(config, { accessToken: jwt(), refreshToken: 'refresh' })
  await auth.login({ username: 'employee', password: 'secret' })
  assert.equal(useCatalogPermission().can('PRODUCT_DELETE'), false)
})

test('/me 401 refreshes and retries once with new JWT permissions without another scheduled /me', async () => {
  handler = (config) => {
    if (!config._retry) return reject(config, 401, 'UNAUTHORIZED')
    return respond(config, profile())
  }
  await auth.getUserInfo()
  await drainTimers()
  assert.deepEqual(
    calls.map((c) => c.url),
    ['/auth/me', 'https://example.test/api/auth/refresh', '/auth/me'],
  )
  assert.deepEqual(auth.user.permissions, ['PRODUCT_CREATE'])
  assert.equal(auth.adminVerified, true)
  assert.equal(expired, 0)
})

test('a second /me 401 expires the session without any refresh loop', async () => {
  handler = (config) => reject(config, 401, 'UNAUTHORIZED')
  await assert.rejects(auth.getUserInfo())
  await drainTimers()
  assert.equal(calls.filter((c) => c.url.includes('/auth/refresh')).length, 1)
  assert.equal(calls.filter((c) => c.url === '/auth/me').length, 2)
  assert.equal(auth.isAuthenticated, false)
  assert.equal(auth.isCatalogAdmin, false)
  assert.equal(auth.currentUser, null)
})

test('refresh from concurrent business 401s updates effective permissions then verifies identity once', async () => {
  await auth.getUserInfo()
  calls.length = 0
  handler = (config) => {
    if (config.url !== '/auth/me' && !config._retry) return reject(config, 401, 'UNAUTHORIZED')
    return respond(config, config.url === '/auth/me' ? profile() : { items: [] })
  }
  await Promise.all([request.get('/products'), request.get('/product-groups')])
  await drainTimers()
  assert.equal(calls.filter((c) => c.url.includes('/auth/refresh')).length, 1)
  assert.equal(calls.filter((c) => c.url === '/auth/me').length, 1)
  assert.deepEqual(auth.user.permissions, ['PRODUCT_CREATE'])
  assert.equal(auth.adminVerified, true)
})

test('403 recovery is bounded per token; a failing /me cannot recursively reverify', async () => {
  await auth.getUserInfo()
  calls.length = 0
  handler = (config) => reject(config, 403, 'FORBIDDEN')
  await Promise.allSettled([request.get('/products'), request.get('/product-groups')])
  await flush()
  await assert.rejects(request.get('/products'))
  await flush()
  assert.equal(calls.filter((c) => c.url === '/auth/me').length, 1)
  assert.equal(auth.adminVerificationStatus, 'failed')
  assert.equal(auth.isCatalogAdmin, false)
  assert.equal(auth.isAuthenticated, true)
})

test('malformed direct body is rejected, while user administration endpoints remain available', async () => {
  handler = (config) => respond(config, { data: profile() })
  await assert.rejects(api.getUserInfoApi(), /Invalid \/auth\/me response/)
  handler = (config) => respond(config, config.url.endsWith('/roles') ? [] : { id: 'managed' })
  await userApi.getUser('managed')
  await userApi.getUserRoles('managed')
  assert.deepEqual(
    calls.slice(1).map((c) => c.url),
    ['/users/managed', '/users/managed/roles'],
  )
})

test('late 200/401/403 from a prior session cannot change identity or expire the new account', async () => {
  for (const status of [200, 401, 403]) {
    let finish
    // Reject errors from a deferred adapter without throwing outside its promise.
    handler = (config) =>
      new Promise((resolve, rejectPromise) => {
        finish = () => {
          try {
            if (status !== 200) reject(config, status, 'OLD_SESSION')
            resolve(respond(config, profile({ isAdmin: true })))
          } catch (error) {
            rejectPromise(error)
          }
        }
      })
    const old = auth.getUserInfo()
    const oldAssertion = assert.rejects(old, /Session changed/)
    await flush()
    auth.logout()
    rawHandler = (config) => respond(config, { accessToken: jwt(), refreshToken: 'new' })
    handler = (config) => respond(config, profile({ id: 'new-employee' }))
    await auth.login({ username: 'new-employee', password: 'secret' })
    finish()
    await oldAssertion
    assert.equal(auth.user.id, 'new-employee')
    assert.equal(auth.isCatalogAdmin, false)
    assert.equal(auth.adminVerified, true)
    assert.equal(expired, 0)
  }
})

test('logout before Axios dispatch prevents an old queued request from using the next account token', async () => {
  const old = auth.getUserInfo()
  const assertion = assert.rejects(old, { code: 'AUTH_SESSION_CHANGED' })
  auth.logout()
  await auth.login({ username: 'employee', password: 'secret' })
  await assertion
  assert.equal(calls.filter((c) => c.url === '/auth/me').length, 1)
  assert.equal(auth.adminVerified, true)
  assert.equal(expired, 0)
})

test('a new session does not share an older pending interceptor refresh', async () => {
  let finishOldRefresh
  rawHandler = (config) =>
    new Promise((resolve) => {
      finishOldRefresh = () =>
        resolve(respond(config, { accessToken: jwt([]), refreshToken: 'old' }))
    })
  handler = (config) => (config._retry ? respond(config, {}) : reject(config, 401, 'UNAUTHORIZED'))
  const old = request.get('/products')
  const oldAssertion = assert.rejects(old, /Session changed/)
  await flush()
  auth.logout()
  handler = (config) => respond(config, profile())
  rawHandler = (config) => respond(config, { accessToken: jwt(), refreshToken: 'new' })
  await auth.login({ username: 'employee', password: 'secret' })
  handler = (config) =>
    config._retry || config.url === '/auth/me'
      ? respond(config, config.url === '/auth/me' ? profile() : {})
      : reject(config, 401, 'UNAUTHORIZED')
  await request.get('/products')
  finishOldRefresh()
  await oldAssertion
  await drainTimers()
  assert.equal(calls.filter((c) => c.url.endsWith('/auth/refresh')).length, 2)
  assert.equal(auth.adminVerified, true)
  assert.equal(expired, 0)
})
