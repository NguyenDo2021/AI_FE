import assert from 'node:assert/strict'
import process from 'node:process'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
const { chromium } = await import(
  pathToFileURL(
    process.env.PLAYWRIGHT_MODULE ||
      join(process.env.TEMP, 'codex-dashboard-browser/node_modules/playwright/index.mjs'),
  ).href
)
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
})
const base = process.env.BUNDLE_TEST_URL || 'http://127.0.0.1:4173'
const permissions = [
  ...(await readFile('src/constants/permissions.ts', 'utf8')).matchAll(/'([A-Z][A-Z_]+)'/g),
].map((match) => match[1])
const routes = [
  '/catalog/warehouses',
  '/catalog/product-groups',
  '/catalog/products',
  '/stock/receipts',
  '/stock/stocktakes',
  '/stock/inventory',
  '/stock/movements',
  '/sales/customers',
  '/sales/orders',
  '/sales/payments',
  '/sales/receivables',
  '/sales/returns',
  '/sales/refunds',
  '/sales/refundables',
  '/reports/inventory',
  '/reports/sales',
  '/reports/payments',
  '/reports/receivables-summary',
  '/reports/low-stock',
  '/system/user',
  '/system/role',
  '/system/permission',
]
const results = [],
  errors = []
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
  await context.addInitScript(() => {
    localStorage.setItem('frontend-base:access-token', 'ui-import-test')
    sessionStorage.setItem('working-warehouse:ui-user', '00000000-0000-4000-8000-000000000001')
  })
  await context.route('**/api/**', async (route) => {
    const url = new URL(route.request().url()),
      path = url.pathname.replace(/^\/api/, '')
    assert.ok(
      ['GET', 'OPTIONS'].includes(route.request().method()),
      'Smoke checks must not mutate data',
    )
    const reply = (data) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(data),
      })
    if (route.request().method() === 'OPTIONS') return reply({})
    if (path === '/auth/me') return reply({ id: 'ui-user', username: 'ui-test', permissions })
    if (path === '/users/ui-user') return reply({ id: 'ui-user', status: 1 })
    if (path === '/users/ui-user/roles') return reply([])
    if (path === '/users/me/warehouses')
      return reply([
        { id: '00000000-0000-4000-8000-000000000001', code: 'K1', name: 'Warehouse 1', status: 1 },
      ])
    return reply({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      summary: {},
      period: {
        from: url.searchParams.get('from'),
        to: url.searchParams.get('to'),
        timezone: 'Asia/Ho_Chi_Minh',
      },
    })
  })
  const page = await context.newPage()
  page.on('pageerror', (error) => errors.push({ url: page.url(), message: error.message }))
  page.on('console', (message) => {
    if (
      /Failed to resolve component|Unhandled application error|does not provide an export/.test(
        message.text(),
      )
    )
      errors.push({ url: page.url(), message: message.text() })
  })
  for (const route of routes) {
    await page.goto(base + route)
    await page.locator('.app-header').waitFor()
    await page.waitForLoadState('networkidle')
    assert.equal(new URL(page.url()).pathname, route)
    let dialogOpened = false
    const create = page
      .getByRole('button')
      .filter({ hasText: /Th\u00eam|T\u1ea1o/ })
      .first()
    if ((await create.count()) && (await create.isEnabled())) {
      await create.click()
      await page.locator('.ant-modal:visible, .ant-drawer-content:visible').first().waitFor()
      await page.waitForLoadState('networkidle')
      dialogOpened = true
    }
    assert.deepEqual(errors, [])
    results.push({ route, dialogOpened, componentErrors: 0 })
  }
  await mkdir('docs/bundle', { recursive: true })
  await writeFile(
    'docs/bundle/ui-checks.json',
    JSON.stringify(
      {
        api: 'Controlled read-only fixtures; list rendering and available create dialogs, no real mutations',
        results,
        errors,
      },
      null,
      2,
    ) + '\n',
  )
  console.log(
    `PASS: ${results.length} production routes, ${results.filter((item) => item.dialogOpened).length} create dialogs, no component/runtime errors`,
  )
} finally {
  await browser.close()
}
