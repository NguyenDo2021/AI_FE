// Controlled fixtures; this suite never reads or changes backend data.
import assert from 'node:assert/strict'
import process from 'node:process'
import { Buffer } from 'node:buffer'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const { chromium } = await import(
  pathToFileURL(
    process.env.PLAYWRIGHT_MODULE ||
      join(process.env.TEMP, 'codex-stocktake-browser/node_modules/playwright/index.mjs'),
  ).href
)
const artifacts = join(process.env.TEMP, 'codex-low-stock-report-browser')
await mkdir(artifacts, { recursive: true })
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  ignoreDefaultArgs: ['--hide-scrollbars'],
})
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: 'reduce',
})
await context.addInitScript(() =>
  localStorage.setItem('frontend-base:access-token', 'low-stock-report-test'),
)
const calls = [],
  checks = [],
  errors = [],
  measurements = []
let empty = false,
  apiError = '',
  exportError = '',
  delay = 0
let permissions = ['REPORT_LOW_STOCK_VIEW', 'PRODUCT_VIEW']
await context.route('**/api/**', async (route) => {
  const request = route.request(),
    url = new URL(request.url())
  if (!url.pathname.startsWith('/api/')) return route.continue()
  const path = url.pathname.replace(/^\/api/, ''),
    params = Object.fromEntries(url.searchParams)
  calls.push({ path, params, authorization: request.headers().authorization })
  const reply = (data, status = 200) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(data),
    })
  if (path === '/auth/me')
    return reply({
      id: 'report-user',
      username: 'report',
      fullName: 'Kiểm tra báo cáo',
      permissions,
    })
  if (path === '/users/report-user') return reply({ id: 'report-user', status: 1 })
  if (path === '/users/report-user/roles') return reply([])
  if (path === '/users/me/warehouses')
    return reply([
      { id: 'w1', code: 'K01', name: 'Kho trung tâm', status: 1 },
      { id: 'w2', code: 'K02', name: 'Kho tên rất dài '.repeat(8), status: 1 },
    ])
  if (path === '/products')
    return reply({
      items: [{ id: 'p1', code: 'P01', name: 'Sản phẩm thử nghiệm', unit: 'Hộp', status: 1 }],
      total: 1,
      page: 1,
      pageSize: 100,
    })
  if (path === '/reports/low-stock/export') {
    if (exportError) return reply({ code: exportError, message: 'Thông báo BE', status: 422 }, 422)
    await new Promise((resolve) => setTimeout(resolve, 150))
    return route.fulfill({
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      headers: {
        'content-disposition': "attachment; filename*=UTF-8''t%E1%BB%93n-th%E1%BA%A5p.xlsx",
        'access-control-expose-headers': 'Content-Disposition',
      },
      body: Buffer.from([0x50, 0x4b, 3, 4, 0]),
    })
  }
  if (path === '/reports/low-stock') {
    const capturedDelay = delay,
      capturedError = apiError,
      capturedEmpty = empty
    if (capturedDelay) await new Promise((resolve) => setTimeout(resolve, capturedDelay))
    if (capturedError) return reply({ code: capturedError, message: 'Lỗi báo cáo từ BE' }, 409)
    const size = Number(params.pageSize || 10),
      page = Number(params.page || 1)
    const items = capturedEmpty
      ? []
      : Array.from({ length: size }, (_, n) => ({
          warehouseId: params.warehouseId || (n % 2 ? 'w2' : 'w1'),
          warehouseCode: n % 2 ? 'K02' : 'K01',
          warehouseName: n === 0 ? 'Kho tên rất dài '.repeat(8) : 'Kho trung tâm',
          productId: 'p' + Math.floor(((page - 1) * size + n) / 2),
          productCode: 'SP-' + Math.floor(n / 2),
          productName: n === 0 ? 'Sản phẩm tên rất dài '.repeat(10) : 'Sản phẩm thử nghiệm',
          unit: 'Hộp',
          quantity: n === 0 ? 0 : 2,
          lowStockThreshold: n === 1 ? '__EXACT_INT64__' : 10,
          // Deliberately authoritative, never recomputed by FE.
          shortageQuantity: n === 1 ? '__EXACT_INT64__' : 7,
        }))
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        items,
        total: capturedEmpty ? 0 : 137,
        page,
        pageSize: size,
      }).replaceAll('"__EXACT_INT64__"', '9223372036854775807'),
    })
  }
  return reply({})
})
const page = await context.newPage()
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (
    /ResizeObserver loop|Unhandled|Failed to resolve component|Duplicate keys/.test(message.text())
  )
    errors.push(message.text())
})
const listCalls = () => calls.filter((call) => call.path === '/reports/low-stock')
const exports = () => calls.filter((call) => call.path === '/reports/low-stock/export')
const check = (name, condition = true) => {
  assert.ok(condition, name)
  checks.push(name)
}
const ready = async () => {
  await page.locator('.report-table').waitFor()
  await page.waitForFunction(
    () => document.querySelector('.products-table-region')?.getAttribute('aria-busy') === 'false',
  )
  await page.waitForTimeout(150)
}
const search = async () => {
  await page.locator('.report-search').click()
  await ready()
}
const reload = async () => {
  await page.locator('.products-toolbar button').click()
  await ready()
}
const select = async (field, text) => {
  await page.locator(field + ' .ant-select').click()
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: text })
    .click()
}
const geometry = async (name) => {
  await page.waitForTimeout(250)
  const m = await page.evaluate(() => {
    const body = document.querySelector('.ant-table-body')
    const rect = (el) => {
      const r = el.getBoundingClientRect()
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
    }
    return {
      width: innerWidth,
      height: innerHeight,
      pageWidth: document.documentElement.scrollWidth,
      pageHeight: document.documentElement.scrollHeight,
      body: rect(body),
      panel: rect(document.querySelector('.report-table')),
      footer: rect(document.querySelector('.products-footer')),
      clientHeight: body.clientHeight,
      scrollHeight: body.scrollHeight,
      clientWidth: body.clientWidth,
      scrollWidth: body.scrollWidth,
      header: [...document.querySelectorAll('.ant-table-header th')]
        .filter((el) => !el.classList.contains('ant-table-cell-scrollbar'))
        .map(rect),
      cells: [...document.querySelector('.ant-table-row').querySelectorAll('td')].map(rect),
    }
  })
  measurements.push({ name, ...m })
  check(name + ': no page horizontal overflow', m.pageWidth <= m.width + 1)
  check(name + ': all six columns', m.header.length === 6 && m.cells.length === 6)
  check(name + ': pagination outside scroll', m.body.bottom <= m.footer.top + 1)
  check(name + ': pagination contained in panel', m.footer.bottom <= m.panel.bottom + 1)
  for (let n = 0; n < 6; n++)
    check(name + ': header aligned ' + n, Math.abs(m.header[n].right - m.cells[n].right) < 2)
  return m
}
try {
  await page.goto(
    (process.env.LOW_STOCK_REPORT_TEST_URL || 'http://127.0.0.1:5178') + '/reports/low-stock',
  )
  await ready()
  check('Initial request once', listCalls().length === 1)
  assert.deepEqual(listCalls()[0].params, { page: '1', pageSize: '10' })
  check('Correct title', (await page.locator('h1').innerText()) === 'Báo cáo hàng tồn thấp')
  check(
    'Total uses server count',
    (await page.locator('.report-pair-count').innerText()).includes('137'),
  )
  check(
    'Backend unit preserved',
    (await page.locator('.ant-table-row').first().innerText()).includes('Hộp'),
  )
  check('Exact zero displayed', (await page.locator('.report-zero').count()) === 1)
  check(
    'Authoritative shortage preserved',
    (await page.locator('.report-shortage').first().innerText()) === '7',
  )
  check(
    'Exact int64 displayed',
    (await page.locator('.ant-table-row').nth(1).innerText()).includes('9.223.372.036.854.775.807'),
  )
  await select('.report-field--warehouse', 'K02')
  await select('.report-field--product', 'Sản phẩm thử nghiệm')
  check('Draft edits do not request', listCalls().length === 1)
  await reload()
  assert.deepEqual(listCalls().at(-1).params, { page: '1', pageSize: '10' })
  await search()
  check('Submit once', listCalls().length === 3)
  assert.deepEqual(listCalls().at(-1).params, {
    warehouseId: 'w2',
    productId: 'p1',
    page: '1',
    pageSize: '10',
  })
  await page.locator('.report-field--warehouse .ant-select-clear').click({ force: true })
  const downloadEvent = page.waitForEvent('download')
  await page.locator('.report-export').click()
  const download = await downloadEvent
  check('UTF-8 filename', download.suggestedFilename() === 'tồn-thấp.xlsx')
  assert.deepEqual(exports().at(-1).params, { warehouseId: 'w2', productId: 'p1' })
  check('Export authorized', exports().at(-1).authorization === 'Bearer low-stock-report-test')
  exportError = 'EXPORT_TOO_LARGE'
  await page.locator('.report-export').click()
  await page.getByText('Dữ liệu xuất quá lớn. Hãy thu hẹp bộ lọc và thử lại.').waitFor()
  check('JSON blob too large guidance')
  exportError = 'CUSTOM_ERROR'
  await page.locator('.report-export').click()
  await page.locator('.ant-alert-message').filter({ hasText: 'Thông báo BE' }).waitFor()
  check('Backend JSON blob message visible')
  exportError = ''
  const beforeReset = listCalls().length
  await page.locator('.report-reset').click()
  await ready()
  check('Reset requests once', listCalls().length === beforeReset + 1)
  assert.deepEqual(listCalls().at(-1).params, { page: '1', pageSize: '10' })
  const beforeEnter = listCalls().length
  await page.locator('.report-search').focus()
  await page.keyboard.press('Enter')
  await ready()
  check('Enter submits once', listCalls().length === beforeEnter + 1)
  for (const size of [20, 50, 100, 10]) {
    const before = listCalls().length
    await select('.list-pagination-controls', size + ' / trang')
    await ready()
    check(
      'Server page size ' + size,
      listCalls().length === before + 1 && listCalls().at(-1).params.pageSize === String(size),
    )
  }
  await page.locator('.ant-pagination-item-2').click()
  await ready()
  check('Server page 2', listCalls().at(-1).params.page === '2')
  check(
    'Total stable across pages',
    (await page.locator('.report-pair-count').innerText()).includes('137'),
  )
  await reload()
  check('Reload preserves page', listCalls().at(-1).params.page === '2')
  const desktop = await geometry('1440 desktop')
  check('Desktop fits viewport', desktop.pageHeight <= desktop.height + 2)
  check('Many rows scroll vertically', desktop.scrollHeight > desktop.clientHeight)
  check(
    'Numbers fit cells',
    await page
      .locator('.report-quantity')
      .evaluateAll((els) => els.every((el) => el.scrollWidth <= el.parentElement.clientWidth)),
  )
  const headerTop = await page
    .locator('.ant-table-header')
    .evaluate((el) => el.getBoundingClientRect().top)
  await page.locator('.ant-table-body').evaluate((el) => {
    el.scrollTop = 120
  })
  check(
    'Fixed header',
    (await page.locator('.ant-table-header').evaluate((el) => el.getBoundingClientRect().top)) ===
      headerTop,
  )
  await page.locator('.ant-table-body').evaluate((el) => {
    el.scrollTop = 0
  })
  await page.mouse.move(0, 0)
  await page.waitForTimeout(200)
  await page.screenshot({ path: join(artifacts, 'desktop.png'), fullPage: true })
  const beforeLayout = listCalls().length
  for (const width of [320, 375, 390, 414, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    const m = await geometry(width + ' collapsed')
    if (width < 768) {
      check(width + ': internal horizontal scroll', m.scrollWidth > m.clientWidth)
      check(width + ': form hidden', !(await page.locator('.report-filter-form').isVisible()))
      const toggle = page.locator('.report-mobile-toggle')
      check(width + ': aria controls', !!(await toggle.getAttribute('aria-controls')))
      await toggle.focus()
      await page.keyboard.press('Tab')
      check(
        width + ': hidden fields skip Tab',
        await page.evaluate(() => !document.activeElement.closest('.report-filter-form')),
      )
      await toggle.click()
      check(width + ': open aria', (await toggle.getAttribute('aria-expanded')) === 'true')
      await geometry(width + ' expanded')
      check(
        width + ': fields full width',
        await page.locator('.report-field').evaluateAll((els) => {
          const rects = els.map((el) => el.getBoundingClientRect())
          return (
            Math.abs(rects[0].left - rects[1].left) < 1 &&
            Math.abs(rects[0].width - rects[1].width) < 1
          )
        }),
      )
      if (width === 390)
        await page.screenshot({ path: join(artifacts, 'mobile-open.png'), fullPage: true })
      await toggle.click()
      if (width === 390)
        await page.screenshot({ path: join(artifacts, 'mobile-closed.png'), fullPage: true })
    }
  }
  check('Resize and toggles never request', listCalls().length === beforeLayout)
  await page.setViewportSize({ width: 390, height: 900 })
  await page.locator('.report-mobile-toggle').click()
  await select('.report-field--product', 'Sản phẩm thử nghiệm')
  await page.locator('.report-mobile-toggle').click()
  await page.setViewportSize({ width: 1440, height: 1000 })
  check(
    'Draft persists across breakpoint',
    (await page.locator('.report-field--product').innerText()).includes('Sản phẩm thử nghiệm'),
  )
  await page.setViewportSize({ width: 390, height: 900 })
  await page.locator('.report-mobile-toggle').click()
  const beforeMobileSearch = listCalls().length
  await search()
  check(
    'Mobile submit once and stays open',
    listCalls().length === beforeMobileSearch + 1 &&
      (await page.locator('.report-mobile-toggle').getAttribute('aria-expanded')) === 'true',
  )
  await page.locator('.report-mobile-toggle').click()
  await page.setViewportSize({ width: 1440, height: 1000 })
  const sidebarToggle = page.locator('.app-header button[aria-label*="thanh bên"]')
  await sidebarToggle.click()
  await geometry('sidebar changed')
  await sidebarToggle.click()
  await geometry('sidebar restored')
  await page.setViewportSize({ width: 1024, height: 500 })
  await geometry('short viewport')
  await page.locator('.products-footer').scrollIntoViewIfNeeded()
  check('Short viewport pagination reachable', await page.locator('.list-page-size').isVisible())
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.evaluate(() => {
    document.documentElement.style.zoom = '1.25'
  })
  await geometry('125 percent CSS zoom')
  await page.evaluate(() => {
    document.documentElement.style.zoom = ''
  })
  empty = true
  await reload()
  check('Empty state', await page.locator('.ant-table-placeholder').isVisible())
  check('Empty total', (await page.locator('.report-pair-count').innerText()).includes('0 cặp'))
  empty = false
  apiError = 'CUSTOM_ERROR'
  await reload()
  check(
    'Error shown and old data cleared',
    (await page.getByText('Lỗi báo cáo từ BE').first().isVisible()) &&
      (await page.locator('.ant-table-row').count()) === 0,
  )
  apiError = ''
  delay = 300
  await page.locator('.products-toolbar button').click()
  check(
    'Loading state',
    (await page.locator('.products-table-region').getAttribute('aria-busy')) === 'true',
  )
  await ready()
  delay = 0
  permissions = []
  await page.reload()
  await page.waitForURL('**/403')
  check('Route permission enforced')
  check('No runtime or observer errors', errors.length === 0)
  console.log('Passed ' + checks.length + ' low stock browser checks. Artifacts: ' + artifacts)
} finally {
  await page.screenshot({ path: join(artifacts, 'last-state.png'), fullPage: true }).catch(() => {})
  await writeFile(
    join(artifacts, 'results.json'),
    JSON.stringify({ checks, errors, measurements, calls }, null, 2),
  )
  await browser.close()
}
