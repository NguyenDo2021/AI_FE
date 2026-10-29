// API fixtures only: no backend data is read or changed.
import assert from 'node:assert/strict'
import process from 'node:process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const { chromium } = await import(
  pathToFileURL(
    process.env.PLAYWRIGHT_MODULE ||
      join(process.env.TEMP, 'codex-dashboard-browser/node_modules/playwright/index.mjs'),
  ).href
)
const artifacts = join(process.env.TEMP, 'codex-receivables-report-browser')
await mkdir(artifacts, { recursive: true })
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  ignoreDefaultArgs: ['--hide-scrollbars'],
})
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  timezoneId: 'America/New_York',
  reducedMotion: 'reduce',
})
await context.addInitScript(() => {
  localStorage.setItem('frontend-base:access-token', 'receivables-report-test')
  sessionStorage.setItem('working-warehouse:receivables-report-user', 'w1')
})
const calls = [],
  checks = [],
  errors = [],
  measurements = []
let mode = 'normal',
  profile = 'full',
  delay = 0
const warehouses = [
  { id: 'w1', code: 'K01', name: 'Kho trung tâm', status: 1 },
  { id: 'w2', code: 'K02', name: 'Kho ngừng hoạt động', status: 0 },
  { id: 'w3', code: 'K03', name: 'Kho có tên rất dài '.repeat(12), status: 1 },
]
const debt = {
  totalRemainingAmount: 999000000,
  customerRemainingAmount: 800000000,
  walkInRemainingAmount: 100000000,
  customerCount: 2,
  customerOutstandingOrderCount: 7,
  walkInOutstandingOrderCount: 0,
  asOf: '2026-10-28T09:52:41Z',
}
await context.route('**/api/**', async (route) => {
  const request = route.request(),
    url = new URL(request.url())
  if (!url.pathname.startsWith('/api/')) return route.continue()
  const path = url.pathname.replace(/^\/api/, ''),
    params = Object.fromEntries(url.searchParams)
  calls.push({
    path,
    method: request.method(),
    params,
    authorization: request.headers().authorization,
  })
  const reply = (data, status = 200) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(data).replaceAll('"EXACT_INT64"', '9223372036854775807'),
    })
  if (path === '/auth/me')
    return reply({
      id: 'receivables-report-user',
      username: 'report',
      fullName: 'Kiểm tra báo cáo',
      permissions:
        profile === 'none' || profile === 'admin'
          ? []
          : ['REPORT_RECEIVABLE_VIEW', ...(profile === 'full' ? ['RECEIVABLE_VIEW'] : [])],
    })
  if (path === '/users/receivables-report-user')
    return reply({ id: 'receivables-report-user', status: 1 })
  if (path === '/users/receivables-report-user/roles')
    return reply(profile === 'admin' ? [{ id: 'admin', code: 'ADMIN', status: 1 }] : [])
  if (path === '/users/me/warehouses') return reply(warehouses)
  if (path === '/reports/receivables-summary') {
    const capturedMode = mode,
      capturedDelay = delay
    if (capturedDelay) await new Promise((resolve) => setTimeout(resolve, capturedDelay))
    if (capturedMode === 'error') return reply({ message: 'Lỗi báo cáo từ backend kiểm thử.' }, 500)
    const data = { ...debt }
    if (capturedMode === 'large')
      for (const key of Object.keys(data)) if (key !== 'asOf') data[key] = 'EXACT_INT64'
    if (capturedMode === 'zero')
      for (const key of Object.keys(data)) if (key !== 'asOf') data[key] = 0
    if (capturedMode === 'missing') {
      delete data.totalRemainingAmount
      delete data.asOf
    }
    if (params.warehouseId === 'w2') {
      data.totalRemainingAmount = 222000000
      data.asOf = '2026-10-28T10:00:00Z'
    }
    return reply(data)
  }
  if (path === '/receivables' || path === '/receivables/walk-in-orders')
    return reply({ items: [], total: 0, page: 1, pageSize: 10 })
  return reply({})
})
const page = await context.newPage()
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (/ResizeObserver loop|Unhandled|Failed to resolve component/.test(message.text()))
    errors.push(message.text())
})
const base = process.env.RECEIVABLES_REPORT_TEST_URL || 'http://127.0.0.1:5178'
const reportCalls = () => calls.filter((call) => call.path === '/reports/receivables-summary')
const detailCalls = () => calls.filter((call) => call.path === '/receivables')
const check = (name, condition = true) => {
  assert.ok(condition, name)
  checks.push(name)
}
const metric = (key) => page.locator('[data-metric="' + key + '"]')
const ready = async () => {
  await page.locator('.receivables-report').waitFor()
  await page.waitForFunction(
    () => document.querySelector('.receivables-report')?.getAttribute('aria-busy') === 'false',
  )
  await page.waitForTimeout(150)
}
const openReport = async () => {
  await page.goto(base + '/reports/receivables-summary')
  await metric('totalRemainingAmount').waitFor()
  await ready()
}
const search = async () => {
  await page.locator('.report-search').click()
  await ready()
}
const reload = async () => {
  await page.locator('.report-reload').click()
  await ready()
}
const select = async (text) => {
  await page.locator('.report-field .ant-select').click()
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: text })
    .click()
}
const geometry = async (name) => {
  await page.waitForTimeout(150)
  const measurement = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    pageWidth: document.documentElement.scrollWidth,
    cardsFit: [
      ...document.querySelectorAll('.report-hero, .metric-card, [data-metric], .report-detail'),
    ].every((el) => el.scrollWidth <= el.clientWidth + 1),
    metricCount: document.querySelectorAll('[data-metric]').length,
    detailCount: document.querySelectorAll('.report-detail').length,
    columns: getComputedStyle(document.querySelector('.count-metrics')).gridTemplateColumns,
  }))
  measurements.push({ name, ...measurement })
  check(name + ': no page horizontal overflow', measurement.pageWidth <= measurement.width + 1)
  check(name + ': all card values fit', measurement.cardsFit)
  check(name + ': all six metrics', measurement.metricCount === 6)
  check(name + ': single detail action', measurement.detailCount === 1)
  return measurement
}
try {
  await openReport()
  check('Initial request once', reportCalls().length === 1)
  check('Only existing GET summary endpoint', reportCalls()[0].method === 'GET')
  assert.deepEqual(reportCalls()[0].params, {})
  check('No date or pagination query')
  check(
    'Existing Authorization',
    reportCalls()[0].authorization === 'Bearer receivables-report-test',
  )
  check('Correct heading', (await page.locator('h1').innerText()) === 'Báo cáo công nợ hiện tại')
  check(
    'Backend total is not recomputed',
    (await metric('totalRemainingAmount').innerText()) === '999.000.000 ₫',
  )
  for (const [key, text] of Object.entries({
    customerRemainingAmount: '800.000.000 ₫',
    walkInRemainingAmount: '100.000.000 ₫',
    customerCount: '2',
    customerOutstandingOrderCount: '7',
    walkInOutstandingOrderCount: '0',
  }))
    check('Mapping ' + key, (await metric(key).innerText()) === text)
  check(
    'BE timestamp formatted in Vietnam time even in another browser timezone',
    (await page.locator('[data-timestamp]').innerText()).includes('16:52:41') &&
      (await page.locator('[data-timestamp]').innerText()).includes('28/10/2026'),
  )
  check(
    'No unsupported date/table/export UI',
    (await page.locator('.ant-picker, .ant-table, .report-export').count()) === 0,
  )
  const initialCount = reportCalls().length
  await select('Kho ngừng hoạt động')
  check('Draft does not request', reportCalls().length === initialCount)
  check(
    'Displayed scope stays applied',
    (await page.locator('[data-scope]').innerText()) === 'Tất cả kho được phép',
  )
  check(
    'Detail still uses all warehouses',
    (await page.locator('.report-detail').getAttribute('href')).endsWith('warehouseId='),
  )
  await reload()
  assert.deepEqual(reportCalls().at(-1).params, {})
  check('Reload ignores draft and requests once', reportCalls().length === initialCount + 1)
  await search()
  check('Submit exactly once', reportCalls().length === initialCount + 2)
  assert.deepEqual(reportCalls().at(-1).params, { warehouseId: 'w2' })
  check(
    'Inactive warehouse included',
    (await page.locator('[data-scope]').innerText()).includes('Kho ngừng hoạt động'),
  )
  check(
    'Summary and asOf match selected warehouse',
    (await metric('totalRemainingAmount').innerText()).startsWith('222.000.000') &&
      (await page.locator('[data-timestamp]').innerText()).includes('17:00:00'),
  )
  await select('Kho có tên rất dài')
  check(
    'Warehouse select exposes full name',
    (await page.locator('.report-field .ant-select').getAttribute('title')).length > 100,
  )
  check(
    'Detail uses applied inactive warehouse',
    (await page.locator('.report-detail').getAttribute('href')).endsWith('warehouseId=w2'),
  )
  await page.locator('.report-detail').click()
  await page.waitForURL('**/sales/receivables?warehouseId=w2')
  await page.waitForFunction(() => !!document.querySelector('.receivables-page'))
  await page.waitForTimeout(300)
  check('Detail receives applied warehouse', detailCalls().at(-1)?.params.warehouseId === 'w2')
  check(
    'Working warehouse stays unchanged',
    (await page.locator('.app-header').innerText()).includes('Kho trung tâm'),
  )
  await openReport()
  await page.locator('.report-detail').click()
  await page.waitForURL('**/sales/receivables?warehouseId=')
  await page.waitForTimeout(300)
  check(
    'All-warehouse detail overrides unrelated working warehouse',
    detailCalls().at(-1)?.params.warehouseId === undefined,
  )
  await openReport()
  await select('Kho có tên rất dài')
  const beforeEnter = reportCalls().length
  await page.locator('.report-search').focus()
  await page.keyboard.press('Enter')
  await ready()
  check('Enter submits once', reportCalls().length === beforeEnter + 1)
  check(
    'Long applied warehouse name is retained',
    (await page.locator('[data-scope]').innerText()).length > 100,
  )
  await geometry('long warehouse name')
  const beforeReset = reportCalls().length
  await page.locator('.report-reset').click()
  await ready()
  check('Reset requests once', reportCalls().length === beforeReset + 1)
  assert.deepEqual(reportCalls().at(-1).params, {})
  check('Reset restores all permitted warehouses')
  const desktop = await geometry('desktop')
  check('Desktop has three count columns', desktop.columns.split(' ').length === 3)
  await page.screenshot({ path: join(artifacts, 'desktop.png'), fullPage: true })
  const beforeLayout = reportCalls().length
  for (const width of [320, 375, 390, 414, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await geometry(width + ' collapsed')
    if (width < 768) {
      const toggle = page.locator('.report-mobile-toggle')
      check(width + ': form initially hidden', !(await page.locator('.report-search').isVisible()))
      await toggle.focus()
      await page.keyboard.press('Tab')
      check(
        width + ': hidden fields skipped by Tab',
        await page.evaluate(() => !document.activeElement.closest('.report-filter-form')),
      )
      check(width + ': aria-controls exists', !!(await toggle.getAttribute('aria-controls')))
      await toggle.click()
      check(width + ': aria-expanded true', (await toggle.getAttribute('aria-expanded')) === 'true')
      await geometry(width + ' expanded')
      check(
        width + ': no second expand level',
        (await page.locator('.receivables-report').getByRole('button', { name: /Mở rộng|Thu gọn/ }).count()) === 0,
      )
      check(
        width + ': mobile touch targets',
        await page
          .locator('.receivables-report button:visible')
          .evaluateAll((els) => els.every((el) => el.getBoundingClientRect().height >= 43)),
      )
      if (width === 390)
        await page.screenshot({ path: join(artifacts, 'mobile-expanded.png'), fullPage: true })
      await toggle.click()
    }
  }
  check('Toggles and resize never request', reportCalls().length === beforeLayout)
  await page.setViewportSize({ width: 390, height: 900 })
  await page.locator('.report-mobile-toggle').click()
  await select('Kho có tên rất dài')
  await page.locator('.report-mobile-toggle').click()
  await page.setViewportSize({ width: 1440, height: 1000 })
  check(
    'Draft retained across breakpoints',
    (await page.locator('.report-field .ant-select').getAttribute('title')).length > 100,
  )
  check('Draft did not request', reportCalls().length === beforeLayout)
  await page.setViewportSize({ width: 390, height: 900 })
  await page.locator('.report-mobile-toggle').click()
  const beforeMobileSubmit = reportCalls().length
  await search()
  check(
    'Mobile search once and form remains open',
    reportCalls().length === beforeMobileSubmit + 1 &&
      (await page.locator('.report-mobile-toggle').getAttribute('aria-expanded')) === 'true',
  )
  await page.locator('.report-reset').click()
  await ready()
  await page.locator('.report-mobile-toggle').click()
  mode = 'large'
  await reload()
  check(
    'Exact int64 total',
    (await metric('totalRemainingAmount').innerText()) === '9.223.372.036.854.775.807 ₫',
  )
  for (const width of [320, 375, 390, 414, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await geometry(width + ' all int64 metrics')
  }
  mode = 'zero'
  await reload()
  check(
    'All zero metrics visible',
    await page
      .locator('[data-metric]')
      .evaluateAll((els) => els.every((el) => /^0(?: ₫)?$/.test(el.textContent))),
  )
  mode = 'missing'
  await reload()
  check(
    'Missing total stays absent instead of zero',
    (await metric('totalRemainingAmount').innerText()) === '—',
  )
  check(
    'Missing asOf is not manufactured',
    (await page.locator('[data-timestamp]').innerText()) === '—',
  )
  mode = 'normal'
  await reload()
  const sidebarToggle = page.locator('.app-header button[aria-label*="thanh bên"]')
  await sidebarToggle.click()
  await page.waitForTimeout(350)
  await geometry('sidebar collapsed')
  await sidebarToggle.click()
  await page.waitForTimeout(350)
  await geometry('sidebar expanded')
  await page.setViewportSize({ width: 1024, height: 500 })
  await geometry('short viewport')
  await page.locator('.report-note').scrollIntoViewIfNeeded()
  check('Short viewport permits scrolling to note', await page.locator('.report-note').isVisible())
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.evaluate(() => {
    document.documentElement.style.zoom = '1.25'
  })
  await geometry('125 percent CSS zoom')
  await page.evaluate(() => {
    document.documentElement.style.zoom = ''
  })
  const beforeHover = await page.evaluate(() => document.documentElement.scrollWidth)
  await page.locator('.report-reload').hover()
  await page.locator('.report-reload').focus()
  check(
    'Hover and focus reload do not grow page',
    (await page.evaluate(() => document.documentElement.scrollWidth)) === beforeHover,
  )
  mode = 'error'
  await reload()
  check(
    'BE error message retained',
    await page.getByText('Lỗi báo cáo từ backend kiểm thử.').isVisible(),
  )
  check(
    'Error removes stale metrics and navigation',
    (await page.locator('[data-metric], .report-detail').count()) === 0,
  )
  mode = 'normal'
  delay = 300
  await page.locator('.report-reload').click()
  check(
    'Loading skeleton visible without old data',
    (await page.locator('.report-loading').isVisible()) &&
      (await page.locator('[data-metric]').count()) === 0,
  )
  await ready()
  delay = 0
  profile = 'report-only'
  await page.reload()
  await metric('totalRemainingAmount').waitFor()
  check(
    'Report permission alone cannot open detail',
    (await page.locator('.report-detail').count()) === 0,
  )
  await page.goto(base + '/sales/receivables?warehouseId=w2')
  await page.waitForURL('**/403')
  check('Detail route still enforces separate permission')
  profile = 'admin'
  await openReport()
  check('ADMIN exception still works', (await page.locator('.report-detail').count()) === 1)
  profile = 'none'
  await page.reload()
  await page.waitForURL('**/403')
  check('Missing report permission rejects route')
  check('No runtime errors', errors.length === 0)
  console.log(
    'Passed ' + checks.length + ' receivables report browser checks. Artifacts: ' + artifacts,
  )
} finally {
  await page.screenshot({ path: join(artifacts, 'last-state.png'), fullPage: true }).catch(() => {})
  await writeFile(
    join(artifacts, 'results.json'),
    JSON.stringify({ checks, errors, measurements, calls }, null, 2),
  )
  await browser.close()
}
