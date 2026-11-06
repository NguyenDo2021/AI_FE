// Run with a local Vite server; all backend traffic is intercepted.
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { join } from 'node:path'
import process from 'node:process'
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
const base = process.env.AUTH_TEST_URL || 'http://127.0.0.1:5197'
const permissions = ['PRODUCT_VIEW', 'PRODUCT_GROUP_VIEW', 'SALES_ORDER_VIEW']
const token =
  'header.' +
  Buffer.from(JSON.stringify({ sub: 'employee', permissions })).toString('base64url') +
  '.signature'
const warning = 'Chưa xác nhận được trạng thái Admin'
let checks = 0
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    await context.addInitScript(
      ({ token }) => {
        localStorage.setItem('frontend-base:access-token', token)
        localStorage.setItem('frontend-base:refresh-token', 'refresh')
      },
      { token },
    )
    let mode = 'employee'
    let releaseMe
    let assignments = [{ id: 'w1', code: 'W1', name: 'Warehouse 1', status: 1 }]
    const calls = []
    const errors = []
    await context.route('**/api/**', async (route) => {
      const req = route.request()
      const pathname = new URL(req.url()).pathname
      if (!pathname.startsWith('/api/')) return route.continue()
      const path = pathname.slice(4)
      calls.push(path)
      const reply = (data, status = 200) =>
        route.fulfill({
          status,
          contentType: 'application/json',
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify(data),
        })
      if (req.method() === 'OPTIONS') return reply({})
      if (path === '/auth/me') {
        if (mode === 'pending')
          await new Promise((resolve) => {
            releaseMe = resolve
          })
        if (mode === 'failure') return reply({ message: 'Unavailable' }, 503)
        return reply({
          id: 'employee',
          username: 'employee',
          fullName: 'Employee',
          email: '',
          permissions: ['USER_VIEW'],
          isAdmin: mode === 'admin',
        })
      }
      if (path === '/users/me/warehouses') return reply(assignments)
      if (path === '/sales-orders')
        return reply({
          items: [
            {
              id: 's1',
              code: 'SO-001',
              warehouseId: 'w1',
              saleDate: '2026-11-05',
              status: 'DRAFT',
              subtotal: 100,
              discountAmount: 0,
              totalAmount: 100,
              paidAmount: 0,
              remainingAmount: 100,
              returnedAmount: 0,
              adjustedTotalAmount: 100,
              refundedAmount: 0,
              netPaidAmount: 0,
              refundableAmount: 0,
              version: 1,
              createdBy: 'employee',
              createdAt: '2026-11-05T00:00:00Z',
              updatedAt: '2026-11-05T00:00:00Z',
              lines: [],
            },
          ],
          total: 1,
          page: 1,
          pageSize: 10,
        })
      if (path.startsWith('/users/')) return reply({ code: 'FORBIDDEN' }, 403)
      return reply({ items: [], total: 0, page: 1, pageSize: 10 })
    })
    const page = await context.newPage()
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('requestfailed', (request) =>
      console.log('Request failed:', request.url(), request.failure()),
    )
    const reverify = () =>
      page.evaluate(async () => {
        const { useAuthStore } = await import('/src/stores/auth.ts')
        await useAuthStore().refreshAdmin()
      })
    await page.goto(base + '/catalog/products')
    await page
      .locator('.products-page')
      .waitFor()
      .catch(async (error) => {
        console.log({
          url: page.url(),
          calls,
          errors,
          body: (await page.locator('body').innerText()).slice(0, 2000),
        })
        throw error
      })
    assert.equal(await page.getByText(warning, { exact: false }).count(), 0)
    assert.equal(calls.filter((path) => path === '/auth/me').length, 1)
    assert.equal(
      calls.some((path) => /^\/users\/employee(?:\/roles)?$/.test(path)),
      false,
    )
    checks += 3
    const state = await page.evaluate(async () => {
      const { useAuthStore } = await import('/src/stores/auth.ts')
      const auth = useAuthStore()
      return {
        status: auth.adminVerificationStatus,
        admin: auth.isCatalogAdmin,
        permissions: auth.user.permissions,
      }
    })
    assert.deepEqual(state, { status: 'verified', admin: false, permissions })
    checks++
    await page.reload()
    await page.locator('.products-page').waitFor()
    assert.equal(calls.filter((path) => path === '/auth/me').length, 2)
    checks++

    // Shared catalog stays readable without warehouse assignments.
    assignments = []
    await page.evaluate(async () => {
      const { useWarehouseStore } = await import('/src/stores/warehouse.ts')
      await useWarehouseStore().load('employee')
    })
    assert.equal(await page.locator('.products-page').isVisible(), true)
    checks++
    mode = 'admin'
    await reverify()
    assert.equal(
      await page.evaluate(async () => {
        const { useAuthStore } = await import('/src/stores/auth.ts')
        return useAuthStore().isCatalogAdmin
      }),
      true,
    )
    checks++
    mode = 'pending'
    const pending = reverify()
    await page.getByText('Đang xác minh thông tin phiên.').waitFor()
    assert.equal(await page.getByText(warning, { exact: false }).count(), 0)
    checks++
    mode = 'failure'
    releaseMe()
    await pending
    await page.getByText(warning, { exact: false }).waitFor()
    assert.equal(
      await page.evaluate(async () => {
        const { useAuthStore } = await import('/src/stores/auth.ts')
        return useAuthStore().isCatalogAdmin
      }),
      false,
    )
    checks++
    mode = 'employee'
    await page.locator('.ant-alert-warning').getByRole('button').click()
    await page.getByText(warning, { exact: false }).waitFor({ state: 'detached' })
    checks++

    assignments = [{ id: 'w1', code: 'W1', name: 'Warehouse 1', status: 1 }]
    await page.goto(base + '/sales/orders')
    await page.getByText('SO-001', { exact: true }).first().waitFor()
    assert.equal(await page.getByRole('button', { name: 'Thao tác', exact: true }).count(), 0)
    assert.equal(await page.getByText(warning, { exact: false }).count(), 0)
    assert.deepEqual(errors, [])
    checks += 3
    console.log(
      width +
        'px: session, F5, profile/JWT separation, pending/failure/retry, shared catalog and empty-action regression passed',
    )
    await context.close()
  }
  console.log(checks + ' browser assertions passed')
} finally {
  await browser.close()
}
