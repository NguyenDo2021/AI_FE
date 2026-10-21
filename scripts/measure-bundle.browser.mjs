import assert from 'node:assert/strict'
import { writeFile, mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import process from 'node:process'

const { chromium } = await import(
  pathToFileURL(
    process.env.PLAYWRIGHT_MODULE ||
      join(process.env.TEMP, 'codex-dashboard-browser/node_modules/playwright/index.mjs'),
  ).href
)
const base = process.env.BUNDLE_TEST_URL || 'http://127.0.0.1:5173'
const label = process.argv[2] || 'after'
if (!/^[a-z-]+$/.test(label)) throw new Error('Use a simple report label')
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
})
const permissions = [
  'REPORT_DASHBOARD_VIEW',
  'REPORT_SALES_VIEW',
  'REPORT_PAYMENT_VIEW',
  'REPORT_RECEIVABLE_VIEW',
  'REPORT_LOW_STOCK_VIEW',
  'REFUND_VIEW',
]
const results = []
try {
  for (const scenario of ['login', 'dashboard-direct', 'login-to-dashboard', 'dashboard-empty']) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
      serviceWorkers: 'block',
    })
    if (scenario.startsWith('dashboard-'))
      await context.addInitScript(() =>
        localStorage.setItem('frontend-base:access-token', 'bundle-test-token'),
      )
    const errors = []
    await context.route('**/api/**', async (route) => {
      const url = new URL(route.request().url())
      const path = url.pathname.replace(/^\/api/, '')
      const reply = (data) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify(data),
        })
      if (route.request().method() === 'OPTIONS') return reply({})
      if (path === '/auth/login')
        return reply({ accessToken: 'bundle-test-token', refreshToken: 'bundle-test-refresh' })
      if (path === '/auth/me')
        return reply({
          id: 'bundle-user',
          username: 'bundle',
          fullName: 'Bundle Test',
          permissions: scenario === 'dashboard-empty' ? ['REPORT_DASHBOARD_VIEW'] : permissions,
        })
      if (path === '/users/bundle-user') return reply({ id: 'bundle-user', status: 1 })
      if (path === '/users/bundle-user/roles') return reply([])
      const warehouse = {
        id: '00000000-0000-4000-8000-000000000001',
        code: 'K1',
        name: 'Kho 1',
        status: 1,
      }
      if (path === '/users/me/warehouses') return reply([warehouse])
      const period = {
        from: url.searchParams.get('from'),
        to: url.searchParams.get('to'),
        timezone: 'Asia/Ho_Chi_Minh',
      }
      const generatedAt = '2026-10-21T03:00:00Z'
      if (path === '/reports/dashboard' && scenario === 'dashboard-empty')
        return reply({ generatedAt, period, periodSections: {}, currentSections: {} })
      if (path === '/reports/dashboard')
        return reply({
          generatedAt,
          period,
          periodSections: {
            sales: { netSalesAmount: 42000000 },
            payments: {
              netRecordedAmount: 42000000,
              netRefundedAmount: 1000000,
              recordedCashAmount: 18000000,
              recordedBankTransferAmount: 24000000,
            },
          },
          currentSections: {
            receivables: { totalRemainingAmount: 2000000, asOf: generatedAt },
            refunds: { refundableAmount: 1000000, refundableOrderCount: 1, asOf: generatedAt },
            lowStock: { lowStockPairCount: 1, asOf: generatedAt },
          },
        })
      if (path === '/reports/dashboard/trends')
        return reply({
          generatedAt,
          period,
          items: [
            {
              date: period.from,
              sales: { netSalesAmount: 42000000 },
              payments: {
                netRecordedAmount: 42000000,
                netRefundedAmount: 1000000,
                netCashFlowAmount: 41000000,
              },
            },
          ],
        })
      if (path === '/reports/sales')
        return reply({
          period,
          page: 1,
          pageSize: 100,
          total: 1,
          items: [
            {
              warehouseId: warehouse.id,
              warehouseCode: 'K1',
              warehouseName: 'Kho 1',
              netSalesAmount: 42000000,
            },
          ],
          summary: { netSalesAmount: 42000000 },
        })
      throw new Error('Unexpected API: ' + path)
    })
    const page = await context.newPage()
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (
        ['warning', 'error'].includes(message.type()) &&
        /resolve component|not registered|not imported|not exists/i.test(message.text())
      )
        errors.push(message.text())
    })
    const cdp = await context.newCDPSession(page)
    await cdp.send('Network.enable')
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
    const requests = new Map()
    cdp.on('Network.responseReceived', ({ requestId, type, response }) => {
      if (type === 'Script' && response.url.startsWith(base + '/'))
        requests.set(requestId, {
          file: new URL(response.url).pathname,
          contentEncoding:
            response.headers['Content-Encoding'] ||
            response.headers['content-encoding'] ||
            'identity',
          fromCache: !!(response.fromDiskCache || response.fromServiceWorker),
          encodedBodyBytes: 0,
        })
    })
    cdp.on('Network.loadingFinished', ({ requestId, encodedDataLength }) => {
      const request = requests.get(requestId)
      if (request) request.networkBytes = encodedDataLength
    })
    await page.goto(base + (scenario.startsWith('dashboard-') ? '/dashboard' : '/login'))
    if (!scenario.startsWith('dashboard-')) await page.locator('.login-page').waitFor()
    if (scenario === 'login-to-dashboard') {
      await page.locator('input[autocomplete="username"]').fill('bundle')
      await page.locator('input[autocomplete="current-password"]').fill('test-password')
      await page.locator('button[type="submit"]').click()
    }
    if (scenario !== 'login') {
      await page.waitForURL('**/dashboard')
      if (scenario === 'dashboard-empty')
        await page.locator('.business-dashboard .ant-empty').waitFor()
      else
        for (const selector of ['.trend-chart svg', '.warehouse-panel svg', '.donut-chart svg'])
          await page.locator(selector).waitFor()
    }
    await page.waitForLoadState('networkidle')
    const timing = await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .filter((item) => new URL(item.name).pathname.endsWith('.js'))
        .map((item) => ({
          file: new URL(item.name).pathname,
          encodedBodyBytes: item.encodedBodySize,
          decodedBodyBytes: item.decodedBodySize,
          transferBytes: item.transferSize,
        })),
    )
    for (const request of requests.values())
      Object.assign(
        request,
        timing.find((item) => item.file === request.file),
      )
    const files = [...requests.values()]
    if (scenario === 'dashboard-empty')
      assert.ok(
        files.every((file) => !file.file.includes('DashboardChart')),
        'Empty dashboard must not load ECharts',
      )
    assert.deepEqual(errors, [])
    assert.ok(files.every((file) => !file.fromCache))
    const expectedBytes = (
      await Promise.all(files.map((file) => readFile('dist' + file.file)))
    ).reduce((sum, file) => sum + file.length, 0)
    const decodedBodyBytes = files.reduce((sum, file) => sum + file.decodedBodyBytes, 0)
    assert.equal(
      decodedBodyBytes,
      expectedBytes,
      'Browser must receive every requested chunk in full',
    )
    results.push({
      scenario,
      requestCount: files.length,
      decodedBodyBytes,
      encodedBodyBytes: files.reduce((sum, file) => sum + file.encodedBodyBytes, 0),
      transferBytes: files.reduce((sum, file) => sum + file.transferBytes, 0),
      files,
      errors,
    })
    await context.close()
  }
  await mkdir('docs/bundle', { recursive: true })
  await writeFile(
    `docs/bundle/browser-${label}.json`,
    JSON.stringify(
      {
        base,
        viewport: '1440x1100',
        cacheDisabled: true,
        api: 'Controlled responses, no real backend or credentials',
        results,
      },
      null,
      2,
    ) + '\n',
  )
  console.log(
    JSON.stringify(
      results.map((result) => ({
        scenario: result.scenario,
        requestCount: result.requestCount,
        decodedBodyBytes: result.decodedBodyBytes,
        encodedBodyBytes: result.encodedBodyBytes,
        errors: result.errors,
      })),
      null,
      2,
    ),
  )
} finally {
  await browser.close()
}
