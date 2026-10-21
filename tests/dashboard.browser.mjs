// Browser integration checks use controlled API responses; production never loads these fixtures.
import assert from 'node:assert/strict'
import process from 'node:process'
import { mkdir, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
const { chromium } = await import(
  pathToFileURL(join(process.env.TEMP, 'codex-dashboard-browser/node_modules/playwright/index.mjs'))
    .href
)
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
})
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
  reducedMotion: 'reduce',
})
await context.addInitScript(() => {
  localStorage.setItem('frontend-base:access-token', 'browser-test-token')
})
const base = process.env.DASHBOARD_TEST_URL || 'http://127.0.0.1:5173'
const artifacts = process.env.DASHBOARD_TEST_ARTIFACTS || 'docs/dashboard-artifacts'
await mkdir(artifacts, { recursive: true })
const calls = [],
  errors = [],
  checks = []
let scenario = 'normal'
let permissions = [
  'REPORT_DASHBOARD_VIEW',
  'REPORT_SALES_VIEW',
  'REPORT_PAYMENT_VIEW',
  'REPORT_RECEIVABLE_VIEW',
  'REPORT_LOW_STOCK_VIEW',
  'REFUND_VIEW',
]
const warehouseId = (index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`
const warehouses = Array.from({ length: 205 }, (_, index) => ({
  id: warehouseId(index),
  code: 'K' + (index + 1),
  name: index === 204 ? 'Kho điều chỉnh' : 'Kho ' + (index + 1),
  status: 1,
}))
const stringify = (value) =>
  JSON.stringify(value, (_key, item) =>
    typeof item === 'bigint' ? '__integer__' + item : item,
  ).replace(/"__integer__(-?\d+)"/g, '$1')
await context.route('**/api/**', async (route) => {
  const url = new URL(route.request().url()),
    path = url.pathname.slice(4),
    params = url.searchParams
  calls.push({ path, params: Object.fromEntries(params) })
  const reply = (data, status = 200) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: stringify(data),
    })
  if (route.request().method() === 'OPTIONS') return reply({})
  if (path === '/auth/me')
    return reply({
      id: 'u1',
      username: 'dashboard-test',
      fullName: 'Kiểm tra tổng quan',
      permissions,
    })
  if (path === '/users/u1') return reply({ id: 'u1', status: 1 })
  if (path === '/users/u1/roles') return reply([])
  if (path === '/users/me/warehouses')
    return reply(scenario === 'denied' ? warehouses.slice(1) : warehouses)
  if (scenario === 'denied' && path.startsWith('/reports/'))
    return reply({ status: 403, code: 'WAREHOUSE_ACCESS_DENIED', message: 'Kho bị thu hồi' }, 403)
  if (scenario === 'forbidden' && path.startsWith('/reports/'))
    return reply({ status: 403, code: 'FORBIDDEN', message: 'Quyền bị thu hồi' }, 403)
  const from = params.get('from'),
    to = params.get('to'),
    selected = params.get('warehouseId')
  const period = { from, to, timezone: 'Asia/Ho_Chi_Minh' },
    generatedAt = '2026-10-21T03:00:00Z'
  const rows = warehouses
    .filter((item) => !selected || item.id === selected)
    .map((item, index) => ({
      warehouseId: item.id,
      warehouseCode: item.code,
      warehouseName: item.name,
      netSalesAmount:
        item.id === warehouseId(204)
          ? scenario === 'representative'
            ? -42000000n
            : -9007199254740993n
          : BigInt(index + 1) * (scenario === 'representative' ? 10000n : 100000n),
    }))
  const netSalesAmount = rows.reduce((sum, row) => sum + row.netSalesAmount, 0n)
  const dateList = []
  for (let day = Date.parse(from); day <= Date.parse(to) && dateList.length < 366; day += 86400000)
    dateList.push(new Date(day).toISOString().slice(0, 10))
  const items = dateList.map((date, index) => ({
    date,
    ...(permissions.includes('REPORT_SALES_VIEW')
      ? {
          sales: {
            netSalesAmount:
              index === 0 ? netSalesAmount - BigInt(dateList.length - 1) * 1000000n : 1000000n,
          },
        }
      : {}),
    ...(permissions.includes('REPORT_PAYMENT_VIEW')
      ? {
          payments: {
            netRecordedAmount: index === 0 ? -2000000 : 2000000,
            netRefundedAmount: -100000,
            netCashFlowAmount: index === 0 ? -1900000 : 2100000,
          },
        }
      : {}),
  }))
  if (path === '/reports/dashboard/trends') {
    if (scenario === 'trend-error')
      return reply({ status: 500, message: 'Xu hướng tạm thời lỗi' }, 500)
    return reply({ generatedAt, period, items })
  }
  if (path === '/reports/sales') {
    const page = Number(params.get('page') || 1)
    return reply({
      page,
      pageSize: 100,
      total: rows.length,
      items: rows.slice((page - 1) * 100, page * 100),
      period,
      summary: { netSalesAmount },
    })
  }
  if (path === '/reports/dashboard')
    return reply({
      generatedAt,
      period,
      periodSections: {
        ...(permissions.includes('REPORT_SALES_VIEW') ? { sales: { netSalesAmount } } : {}),
        ...(permissions.includes('REPORT_PAYMENT_VIEW')
          ? {
              payments: {
                netRecordedAmount: (dateList.length - 2) * 2000000,
                netRefundedAmount: -100000 * dateList.length,
                recordedCashAmount: scenario === 'zero' ? 0 : 18000000,
                recordedBankTransferAmount: scenario === 'zero' ? 0 : 24000000,
              },
            }
          : {}),
      },
      currentSections: {
        ...(permissions.includes('REPORT_RECEIVABLE_VIEW')
          ? { receivables: { totalRemainingAmount: 64200000, asOf: generatedAt } }
          : {}),
        ...(permissions.includes('REFUND_VIEW')
          ? { refunds: { refundableAmount: 3600000, refundableOrderCount: 4, asOf: generatedAt } }
          : {}),
        ...(permissions.includes('REPORT_LOW_STOCK_VIEW')
          ? { lowStock: { lowStockPairCount: 12, asOf: generatedAt } }
          : {}),
      },
    })
  return reply({ status: 404, message: path }, 404)
})
const page = await context.newPage()
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})
const check = (name, value) => {
  assert.ok(value, name)
  checks.push(name)
}
const ready = async () => {
  await page.locator('.kpi').first().waitFor()
  await page.locator('.trend-chart svg').waitFor()
  await page.locator('.warehouse-panel svg').waitFor()
  await page.waitForFunction(() => !document.querySelector('.ant-skeleton'))
}
try {
  await page.goto(base + '/')
  await page.waitForURL('**/dashboard')
  await ready()
  check('Default landing chooses permitted business dashboard', page.url().endsWith('/dashboard'))
  check(
    'All 205 warehouse rows are fetched across 3 pages',
    calls
      .filter((call) => call.path === '/reports/sales')
      .map((call) => call.params.page)
      .join(',') === '1,2,3',
  )
  check(
    'Top 10 label is explicit',
    (await page.locator('.warehouse-panel').innerText()).includes(
      '10 kho có giá trị bán ròng lớn nhất theo độ lớn',
    ),
  )
  check(
    'Exact large negative KPI matches API',
    (await page.locator('.kpi-value').first().innerText()).includes('-9.007.197.163.740.993'),
  )
  check(
    'Receipt ratios use recorded amounts',
    (await page.locator('.composition-legend').innerText()).includes('42,86%'),
  )
  check(
    'Receivable card does not grant target screen access',
    (await page.locator('a[href="/sales/receivables"]').count()) === 0,
  )
  check('Three SVG charts are mounted', (await page.locator('.dashboard-chart svg').count()) === 3)
  check(
    'Overview is the first standalone selected menu item',
    (await page.locator('.ant-menu-root > .ant-menu-item').first().innerText()).includes(
      'Tổng quan',
    ) && (await page.locator('.ant-menu-root > .ant-menu-item-selected').count()) === 1,
  )

  // Test rendered SVG instead of Vue development-only component internals.
  const paymentPaths = page.locator('.trend-chart svg path[stroke="#27aaa1"]')
  const paymentPathCount = await paymentPaths.count()
  const paymentLegend = page.locator('.trend-chart svg text').filter({ hasText: /^Thu r\u00f2ng$/ })
  await paymentLegend.click()
  await page.waitForFunction(
    (count) => document.querySelectorAll('.trend-chart svg path[stroke="#27aaa1"]').length < count,
    paymentPathCount,
  )
  check('Legend hides payment series', (await paymentPaths.count()) < paymentPathCount)
  const point = await page
    .locator('.trend-chart svg path[fill="#7861df"][transform]')
    .first()
    .boundingBox()
  assert.ok(point, 'First sales point is rendered')
  await page.mouse.move(point.x + point.width / 2 + 2, point.y + point.height / 2 - 2)
  await page.waitForTimeout(150)
  check(
    'Tooltip uses exact raw VND',
    (await page.locator('.trend-chart').textContent()).includes('-9.007.197.183.740.993 VND'),
  )
  await page.screenshot({ path: artifacts + '/desktop-large.png', fullPage: true })
  scenario = 'representative'
  await page.getByRole('button', { name: 'Làm mới', exact: true }).click()
  await ready()
  await page.screenshot({ path: artifacts + '/desktop.png', fullPage: true })
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await page.waitForTimeout(250)
    check(
      `No horizontal overflow at ${width}px`,
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    )
    check(
      `Chart resizes at ${width}px`,
      await page
        .locator('.trend-chart svg')
        .evaluate((element) => element.getBoundingClientRect().width <= innerWidth),
    )
    if (width === 390) await page.screenshot({ path: artifacts + '/mobile.png', fullPage: true })
  }
  await page.setViewportSize({ width: 1440, height: 1100 })
  await page.getByRole('button', { name: '7 ngày', exact: true }).click()
  await ready()
  check(
    'Seven-day preset sends seven inclusive dates',
    calls
      .filter((call) => call.path === '/reports/dashboard/trends')
      .slice(-1)
      .every(
        (call) => (Date.parse(call.params.to) - Date.parse(call.params.from)) / 86400000 === 6,
      ),
  )
  await page.locator('.warehouse-filter .ant-select').click()
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: 'K1 — Kho 1' })
    .first()
    .click()
  await ready()
  check(
    'Warehouse changes update every report API',
    ['/reports/dashboard', '/reports/dashboard/trends', '/reports/sales'].every(
      (path) =>
        calls.filter((call) => call.path === path).at(-1).params.warehouseId === warehouseId(0),
    ),
  )
  scenario = 'trend-error'
  await page.getByRole('button', { name: 'Làm mới', exact: true }).click()
  await page.getByRole('button', { name: 'Thử lại xu hướng', exact: true }).waitFor()
  check(
    'Trend errors preserve summary and warehouse chart',
    (await page.locator('.kpi-value').count()) === 3 &&
      (await page.locator('.warehouse-panel svg').count()) === 1,
  )
  scenario = 'normal'
  await page.getByRole('button', { name: 'Thử lại xu hướng', exact: true }).click()
  await ready()
  scenario = 'zero'
  await page.getByRole('button', { name: 'Làm mới', exact: true }).click()
  await ready()
  check(
    'Zero recorded total does not render a donut',
    (await page.locator('.donut-chart').count()) === 0 &&
      (await page.locator('.donut-panel').innerText()).includes('Chưa có khoản thu'),
  )
  scenario = 'denied'
  await page.getByRole('button', { name: 'Làm mới', exact: true }).click()
  await page.getByText('Quyền truy cập kho đã thay đổi.', { exact: false }).waitFor()
  const afterDenied = calls.length
  await page.waitForTimeout(350)
  check(
    'Revoked warehouse clears data and makes no request loop',
    (await page.locator('.kpi-value').count()) === 0 && calls.length === afterDenied,
  )
  scenario = 'normal'
  await page.goto(base + '/reports/dashboard?source=legacy')
  await page.waitForURL('**/dashboard?source=legacy')
  await ready()
  check(
    'Old dashboard link redirects to the canonical path and preserves query',
    new URL(page.url()).pathname === '/dashboard' &&
      new URL(page.url()).searchParams.get('source') === 'legacy',
  )
  permissions = ['REPORT_DASHBOARD_VIEW']
  calls.length = 0
  await page.reload()
  await page.getByText('Không có mục dữ liệu được cấp quyền trong tổng quan.').waitFor()
  check(
    'Dashboard-only user does not request trends or sales',
    calls
      .filter((call) => call.path.startsWith('/reports/'))
      .map((call) => call.path)
      .join(',') === '/reports/dashboard',
  )
  check(
    'Missing permission sections never become zero KPI cards',
    (await page.locator('.kpi-value').count()) === 0,
  )
  permissions = ['DASHBOARD_VIEW']
  calls.length = 0
  await page.goto(base + '/')
  await page.waitForURL('**/dashboard')
  await page.waitForTimeout(250)
  check(
    'User without report permission keeps valid existing landing',
    calls.filter((call) => call.path.startsWith('/reports/')).length === 0,
  )
  check(
    'No application exceptions',
    errors.filter(
      (error) =>
        !error.includes('500 (Internal Server Error)') && !error.includes('403 (Forbidden)'),
    ).length === 0,
  )
  await writeFile(
    artifacts + '/browser-results.json',
    JSON.stringify({ checks, errors, calls }, null, 2),
  )
  console.log(JSON.stringify({ passed: checks.length, checks, errors }, null, 2))
} catch (error) {
  await page.screenshot({ path: artifacts + '/failure.png', fullPage: true })
  throw error
} finally {
  await browser.close()
}
