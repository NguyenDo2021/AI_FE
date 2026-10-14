import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Buffer } from 'node:buffer'
import ts from 'typescript'

const url = (source) => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8')
const transpile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
const context = {
  calls: [],
  notices: [],
  token: 'old',
  refreshToken: 'refresh',
  expired: 0,
  refreshes: 0,
  denied: 0,
}
globalThis.__receiptRequest = context
const mockUrl = url(`
  import axios, { AxiosError } from '${import.meta.resolve('axios')}'
  const context = globalThis.__receiptRequest
  export default { create: config => axios.create({ ...config, adapter: async config => {
    context.calls.push(config)
    const result = await context.handler(config)
    const response = { ...result, config, statusText: String(result.status) }
    if (result.status >= 400) throw new AxiosError('HTTP error', undefined, config, undefined, response)
    return response
  } }) }
  export const message = { error: value => context.notices.push(value) }
  export const i18n = { global: { t: key => key } }
  export const getAccessToken = () => context.token
  export const getRefreshToken = () => context.refreshToken
  export const clearTokens = () => { context.token = null; context.refreshToken = null }
`)
const domainUrl = url(transpile(await read('src/utils/paymentReceipt.ts')))
const source = (await read('src/utils/request.ts'))
  .replace("'axios'", JSON.stringify(mockUrl))
  .replace("'ant-design-vue'", JSON.stringify(mockUrl))
  .replace("'@/locales'", JSON.stringify(mockUrl))
  .replace("'@/utils/storage'", JSON.stringify(mockUrl))
  .replace("'@/utils/paymentReceipt'", JSON.stringify(domainUrl))
  .replace('import.meta.env.VITE_GLOB_API_URL', "'/api'")
const { request, configureRequestAuth } = await import(url(transpile(source)))
const pdf = () => ({
  status: 200,
  data: new Blob(['%PDF-1.7'], { type: 'application/pdf' }),
  headers: {
    'content-type': 'application/pdf',
    'content-disposition': 'inline; filename="bien-lai-PT1.pdf"',
  },
})
const failure = (status, code, malformed = false) => ({
  status,
  data: new Blob(
    [
      malformed
        ? '{invalid'
        : JSON.stringify({
            timestamp: 'now',
            status,
            code,
            message: 'Backend: ' + code,
            details: { id: 'p1' },
          }),
    ],
    { type: 'application/json' },
  ),
  headers: { 'content-type': 'application/json' },
})
function reset() {
  Object.assign(context, {
    calls: [],
    notices: [],
    token: 'old',
    refreshToken: 'refresh',
    expired: 0,
    refreshes: 0,
    denied: 0,
  })
  configureRequestAuth({
    refresh: async () => {
      context.refreshes++
      context.token = 'fresh'
      return 'fresh'
    },
    onSessionExpired: () => {
      context.expired++
    },
    onAccessDenied: () => {
      context.denied++
    },
  })
}
const config = {
  quietErrors: true,
  skipAccessRefresh: true,
  headers: { Accept: 'application/pdf' },
}

test('real Axios interceptors preserve Blob and headers while JSON calls still unwrap normally', async () => {
  reset()
  const response = pdf()
  context.handler = () => response
  const result = await request.getBlob('/payments/p1/print', config)
  assert.equal(result.data, response.data)
  assert.equal(result.headers['content-disposition'], response.headers['content-disposition'])
  const sent = context.calls[0]
  assert.equal(sent.baseURL, '/api')
  assert.equal(sent.url, '/payments/p1/print')
  assert.equal(sent.data, undefined)
  assert.equal(sent.responseType, 'blob')
  assert.equal(sent.headers.Authorization, 'Bearer old')
  context.handler = () => ({
    status: 200,
    data: '{"id":"p1"}',
    headers: { 'content-type': 'application/json' },
  })
  assert.deepEqual(await request.get('/payments/p1'), { id: 'p1' })
})

test('real Blob JSON errors preserve status, code, message and details without a generic duplicate toast', async () => {
  reset()
  for (const [status, code] of [
    [400, 'INVALID_REQUEST'],
    [403, 'FORBIDDEN'],
    [403, 'WAREHOUSE_ACCESS_DENIED'],
    [404, 'PAYMENT_NOT_FOUND'],
    [500, 'PAYMENT_PDF_FAILED'],
    [500, 'INTERNAL_ERROR'],
  ]) {
    context.handler = () => failure(status, code)
    await assert.rejects(request.getBlob('/payments/p1/print', config), (error) => {
      assert.equal(error.status, status)
      assert.equal(error.code, code)
      assert.equal(error.message, 'Backend: ' + code)
      assert.deepEqual(error.details, { id: 'p1' })
      return true
    })
  }
  assert.deepEqual(context.notices, [])
  assert.equal(context.denied, 0)
  context.handler = () => failure(500, 'INTERNAL_ERROR', true)
  await assert.rejects(
    request.getBlob('/payments/p1/print', config),
    (error) => error.status === 500 && error.code === undefined,
  )
})

test('401 refresh retries the authenticated Blob request once, retaining its response options', async () => {
  reset()
  context.handler = (config) =>
    config.headers.Authorization === 'Bearer old' ? failure(401, 'UNAUTHORIZED') : pdf()
  const response = await request.getBlob('/payments/p1/print', config)
  assert.equal(response.data instanceof Blob, true)
  assert.equal(context.refreshes, 1)
  assert.equal(context.calls.length, 2)
  assert.equal(context.calls[1].responseType, 'blob')
  assert.equal(context.calls[1].preserveResponse, true)
  assert.equal(context.calls[1].headers.Authorization, 'Bearer fresh')
  assert.equal(context.expired, 0)
})

test('a PDF error after refresh stays a PDF error and does not expire the refreshed session', async () => {
  reset()
  context.handler = (config) =>
    config.headers.Authorization === 'Bearer old'
      ? failure(401, 'UNAUTHORIZED')
      : failure(500, 'PAYMENT_PDF_FAILED')
  await assert.rejects(
    request.getBlob('/payments/p1/print', config),
    (error) => error.code === 'PAYMENT_PDF_FAILED',
  )
  assert.equal(context.refreshes, 1)
  assert.equal(context.expired, 0)
  assert.equal(context.token, 'fresh')
})

test('repeated 401 stops after one refresh and expires session; failed refresh also expires session', async () => {
  reset()
  context.handler = () => failure(401, 'UNAUTHORIZED')
  await assert.rejects(
    request.getBlob('/payments/p1/print', config),
    (error) => error.status === 401,
  )
  assert.equal(context.calls.length, 2)
  assert.equal(context.refreshes, 1)
  assert.equal(context.expired, 1)
  assert.equal(context.token, null)
  reset()
  configureRequestAuth({
    refresh: async () => {
      throw new Error('Refresh failed')
    },
    onSessionExpired: () => {
      context.expired++
    },
  })
  await assert.rejects(
    request.getBlob('/payments/p1/print', config),
    (error) => error.status === 401,
  )
  assert.equal(context.calls.length, 1)
  assert.equal(context.expired, 1)
})

test('ordinary JSON errors and network failures remain normalized', async () => {
  reset()
  context.handler = () => ({
    status: 400,
    data: { code: 'INVALID_REQUEST', message: 'Invalid JSON request' },
    headers: {},
  })
  await assert.rejects(
    request.get('/payments/p1', { quietErrors: true }),
    (error) => error.code === 'INVALID_REQUEST' && error.message === 'Invalid JSON request',
  )
  context.handler = () => {
    throw new Error('Network unavailable')
  }
  await assert.rejects(
    request.getBlob('/payments/p1/print', config),
    (error) => error.status === undefined && error.message === 'errors.network',
  )
})

test('XLSX exports preserve headers and Blob, authenticate, omit body and refresh 401 once', async () => {
  reset()
  const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  const blob = new Blob([new Uint8Array([0x50, 0x4b, 3, 4])], { type: mime })
  const disposition = "attachment; filename*=UTF-8''b%C3%A1o-c%C3%A1o.xlsx"
  context.handler = (config) =>
    config.headers.Authorization === 'Bearer old'
      ? failure(401, 'UNAUTHORIZED')
      : {
          status: 200,
          data: blob,
          headers: { 'content-type': mime, 'content-disposition': disposition },
        }
  const params = { from: '2026-10-01', to: '2026-10-14', warehouseId: 'w1' }
  const result = await request.getBlob('/reports/inventory/export', {
    ...config,
    params,
    headers: { Accept: mime },
  })
  assert.equal(result.data, blob)
  assert.equal(result.headers['content-type'], mime)
  assert.equal(result.headers['content-disposition'], disposition)
  assert.equal(context.refreshes, 1)
  assert.equal(context.calls.length, 2)
  for (const sent of context.calls) {
    assert.equal(sent.baseURL, '/api')
    assert.equal(sent.url, '/reports/inventory/export')
    assert.equal(sent.method, 'get')
    assert.equal(sent.data, undefined)
    assert.equal(sent.responseType, 'blob')
    assert.equal(sent.preserveResponse, true)
    assert.deepEqual(sent.params, params)
    assert.equal(sent.headers.Accept, mime)
  }
})

test('export Blob errors keep optional codes and details even when MIME is incorrectly labelled', async () => {
  reset()
  for (const [status, code] of [
    [403, 'FORBIDDEN'],
    [403, 'WAREHOUSE_ACCESS_DENIED'],
    [400, 'INVALID_REQUEST'],
    [409, 'INVENTORY_HISTORY_INCONSISTENT'],
    [413, 'EXPORT_TOO_LARGE'],
    [500, 'NUMERIC_OVERFLOW'],
    [500, 'INTERNAL_ERROR'],
  ]) {
    context.handler = () => {
      const result = failure(status, code)
      result.headers['content-type'] = 'application/octet-stream'
      result.data = new Blob([
        JSON.stringify({ status, code, message: 'Backend: ' + code, details: { id: 'w1' } }),
      ])
      return result
    }
    await assert.rejects(
      request.getBlob('/reports/sales/export', config),
      (error) => error.status === status && error.code === code && error.details.id === 'w1',
    )
  }
  assert.equal(context.denied, 0)
  assert.deepEqual(context.notices, [])
})
