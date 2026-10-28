// Controlled fixtures: this suite never reads or changes backend data.
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
const artifacts = join(process.env.TEMP, 'codex-payments-report-browser')
await mkdir(artifacts, { recursive: true })
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  ignoreDefaultArgs: ['--hide-scrollbars'],
})
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  timezoneId: 'Asia/Bangkok',
  reducedMotion: 'reduce',
})
await context.addInitScript(() =>
  localStorage.setItem('frontend-base:access-token', 'payments-report-test'),
)
const calls = [],
  checks = [],
  errors = [],
  measurements = []
let empty = false,
  largeSummary = false,
  apiError = '',
  exportError = '',
  delay = 0
let permissions = ['REPORT_PAYMENT_VIEW']
const warehouses = [
  { id: 'w1', code: 'K01', name: 'Kho trung tâm', status: 1 },
  { id: 'w2', code: 'K02', name: 'Kho ngừng hoạt động', status: 0 },
]
await context.route('**/api/**', async (route) => {
  const request = route.request(),
    url = new URL(request.url())
  if (!url.pathname.startsWith('/api/')) return route.continue()
  const path = url.pathname.replace(/^\/api/, ''),
    params = Object.fromEntries(url.searchParams)
  calls.push({ path, params, authorization: request.headers().authorization })
  const reply = (data, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
  if (path === '/auth/me')
    return reply({
      id: 'report-user',
      username: 'report',
      fullName: 'Kiểm tra báo cáo',
      permissions,
    })
  if (path === '/users/report-user') return reply({ id: 'report-user', status: 1 })
  if (path === '/users/report-user/roles') return reply([])
  if (path === '/users/me/warehouses') return reply(warehouses)
  if (path === '/reports/payments/export') {
    if (exportError)
      return reply({ code: exportError, message: 'Export fixture error', status: 422 }, 422)
    await new Promise((resolve) => setTimeout(resolve, 100))
    return route.fulfill({
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      headers: {
        'content-disposition': "attachment; filename*=UTF-8''b%C3%A1o-c%C3%A1o.xlsx",
        'access-control-expose-headers': 'Content-Disposition',
      },
      body: Buffer.from([0x50, 0x4b, 3, 4, 0]),
    })
  }
  if (path === '/reports/payments') {
    const capturedError = apiError,
      capturedDelay = delay
    if (capturedDelay) await new Promise((resolve) => setTimeout(resolve, capturedDelay))
    if (capturedError) return reply({ code: capturedError, message: 'Report fixture error' }, 409)
    const size = Number(params.pageSize || 10),
      page = Number(params.page || 1)
    const summary = {
      createdPaymentCount: 137,
      cancelledPaymentCount: 0,
      recordedCashAmount: 121565001,
      recordedBankTransferAmount: 366713000,
      reversedCashAmount: 0,
      reversedBankTransferAmount: 0,
      netCashAmount: largeSummary ? '__EXACT_INT64__' : 121565001,
      netBankTransferAmount: 366713000,
      netRecordedAmount: largeSummary ? '__EXACT_INT64__' : 488278001,
      createdRefundCount: 1,
      cancelledRefundCount: 0,
      recordedRefundCashAmount: 5010000,
      recordedRefundBankTransferAmount: 0,
      reversedRefundCashAmount: 0,
      reversedRefundBankTransferAmount: 0,
      netRefundedCashAmount: 5010000,
      netRefundedBankTransferAmount: 0,
      netRefundedAmount: largeSummary ? '__EXACT_INT64__' : 5010000,
      // Intentionally differs from netRecordedAmount - netRefundedAmount.
      netCashFlowAmount: largeSummary ? '__EXACT_INT64__' : -162078901,
    }
    const items = empty
      ? []
      : Array.from({ length: size }, (_, n) => ({
          ...summary,
          warehouseId: 'w' + ((page - 1) * size + n),
          warehouseCode: 'K' + n,
          warehouseName: n === 0 ? 'Warehouse with a very long name '.repeat(10) : 'Warehouse ' + n,
          createdPaymentCount: n + 1,
          netCashFlowAmount: n === 0 ? '__EXACT_INT64__' : -91,
        }))
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        items,
        total: empty ? 0 : 137,
        page,
        pageSize: size,
        summary,
        period: { from: params.from, to: params.to, timezone: 'Asia/Ho_Chi_Minh' },
      }).replaceAll('"__EXACT_INT64__"', '-9223372036854775808'),
    })
  }

  return reply({})
})
const page = await context.newPage()
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (/ResizeObserver loop|Unhandled|Failed to resolve component/.test(message.text()))
    errors.push(message.text())
})
const listCalls = () => calls.filter((call) => call.path === '/reports/payments')
const exports = () => calls.filter((call) => call.path === '/reports/payments/export')
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
const geometry = async () => {
  await page.waitForTimeout(200)
  return page.evaluate(() => {
    const body = document.querySelector('.ant-table-body'),
      region = document.querySelector('.products-table-region'),
      footer = document.querySelector('.products-footer')
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
      region: rect(region),
      footer: rect(footer),
      clientHeight: body.clientHeight,
      scrollHeight: body.scrollHeight,
      clientWidth: body.clientWidth,
      scrollWidth: body.scrollWidth,
      header: [...document.querySelectorAll('.ant-table-header th')]
        .filter((el) => !el.classList.contains('ant-table-cell-scrollbar'))
        .map(rect),
      cells: [...(document.querySelector('.ant-table-row')?.querySelectorAll('td') || [])].map(
        rect,
      ),
    }
  })
}
const assertGeometry = async (name) => {
  const m = await geometry()
  measurements.push({ name, ...m })
  check(name + ': no page horizontal overflow', m.pageWidth <= m.width + 1)
  check(name + ': all 20 columns', m.header.length === 20 && m.cells.length === 20)
  check(name + ': table scroll stays before pagination', m.body.bottom <= m.footer.top + 1)
  check(name + ': pagination stays in panel', m.footer.bottom <= m.panel.bottom + 1)
  check(name + ': horizontal scrolling available', m.scrollWidth > m.clientWidth)
  const overflowing = await page
    .locator(
      '.report-heading .ant-btn, .metric-card, .detail-panel, .report-field, .products-footer',
    )
    .evaluateAll((elements) =>
      elements
        .filter((el) => el.getClientRects().length)
        .flatMap((el) => {
          const rect = el.getBoundingClientRect()
          const width = document.documentElement.clientWidth
          return rect.left >= -1 && rect.right <= width + 1
            ? []
            : [{ class: el.className, left: rect.left, right: rect.right, width }]
        }),
    )
  assert.deepEqual(overflowing, [], name + ': controls and panels stay inside viewport')
  check(name + ': controls and panels stay inside viewport')
  for (let n = 0; n < 20; n++)
    assert.ok(Math.abs(m.header[n].right - m.cells[n].right) < 2, name + ': header alignment ' + n)
  return m
}
try {
  await page.goto(
    (process.env.PAYMENTS_REPORT_TEST_URL || 'http://127.0.0.1:5178') + '/reports/payments',
  )
  await ready()
  check('Initial request exactly once', listCalls().length === 1)
  check('Correct heading', (await page.locator('h1').innerText()).includes('thu / hoàn'))
  check('All nineteen metrics present', (await page.locator('[data-metric]').count()) === 19)
  check('Three primary cards', (await page.locator('.primary-metrics [data-metric]').count()) === 3)
  check(
    'Eight receipt metrics',
    (await page.locator('.detail-panel--receipts [data-metric]').count()) === 8,
  )
  check(
    'Eight refund metrics',
    (await page.locator('.detail-panel--refunds [data-metric]').count()) === 8,
  )
  check(
    'Net cash flow emphasized',
    (await page.locator('.metric-card--net [data-metric="netCashFlowAmount"]').count()) === 1,
  )
  check(
    'Period timezone visible',
    (await page.locator('.report-period').innerText()).includes('Asia/Ho_Chi_Minh'),
  )
  check(
    'Summary uses backend, not page totals',
    (await page.locator('[data-metric="createdPaymentCount"]').innerText()) === '137',
  )
  check(
    'Net summary may be negative',
    (await page.locator('[data-metric="netCashFlowAmount"]').innerText()).startsWith(
      '-162.078.901',
    ),
  )
  const initial = { ...listCalls().at(-1).params }
  check('Default pageSize 10', initial.pageSize === '10')
  check('Expanded fields initially hidden', !(await page.locator('.report-presets').isVisible()))
  const beforeToggle = listCalls().length
  await page.locator('.report-expand').click()
  await select('.report-field--warehouse', 'Kho ngừng hoạt động')
  await page.locator('.report-expand').click()
  check('Draft and expand do not request', listCalls().length === beforeToggle)
  check(
    'Draft warehouse does not relabel scope',
    !(await page.locator('.report-scope').innerText()).startsWith('K02'),
  )
  await reload()
  assert.deepEqual(listCalls().at(-1).params, initial)
  check('Reload keeps applied filters')
  await search()
  check('Search exactly once', listCalls().length === beforeToggle + 2)
  check('Inactive warehouse applied', listCalls().at(-1).params.warehouseId === 'w2')
  await page.locator('.report-field--warehouse .ant-select-clear').click({ force: true })
  const applied = { ...listCalls().at(-1).params }
  const downloadEvent = page.waitForEvent('download')
  await page.locator('.report-export').click()
  const download = await downloadEvent
  assert.equal(download.suggestedFilename(), 'báo-cáo.xlsx')
  check('UTF-8 download filename')
  const exportParams = { ...applied }
  delete exportParams.page
  delete exportParams.pageSize
  assert.deepEqual(exports().at(-1).params, exportParams)
  check('Export uses applied filters without pagination')
  check(
    'Export uses existing Authorization',
    exports().at(-1).authorization === 'Bearer payments-report-test',
  )
  exportError = 'EXPORT_TOO_LARGE'
  await page.locator('.report-export').click()
  await page.getByText('Dữ liệu xuất quá lớn. Hãy thu hẹp bộ lọc và thử lại.').waitFor()
  check('JSON blob business error visible')
  exportError = 'CUSTOM_ERROR'
  await page.locator('.report-export').click()
  await page.locator('.ant-alert-message').filter({ hasText: 'Export fixture error' }).waitFor()
  check('JSON blob backend message preserved')
  exportError = ''
  await page.locator('.report-reset').click()
  await ready()
  check(
    'Reset restores defaults',
    listCalls().at(-1).params.warehouseId === undefined &&
      listCalls().at(-1).params.productId === undefined,
  )
  await page.locator('.report-expand').click()
  for (const text of ['Hôm nay', 'Tháng này', 'Tháng trước']) {
    const before = listCalls().length
    await page.locator('.report-presets button').filter({ hasText: text }).click()
    await ready()
    check(text + ' requests once', listCalls().length === before + 1)
  }
  const fromInput = page.locator('.report-field--from input'),
    toInput = page.locator('.report-field--to input')
  await page.locator('.report-reset').click()
  await ready()
  await fromInput.click()
  await page.waitForTimeout(300)
  await page
    .locator(
      '.ant-picker-dropdown:visible td[title="' +
        initial.from.slice(0, 8) +
        '20"] .ant-picker-cell-inner',
    )
    .click()
  await page.waitForTimeout(300)
  await toInput.click()
  await page.waitForTimeout(300)
  await page
    .locator('.ant-picker-dropdown:visible td[title="' + initial.from + '"] .ant-picker-cell-inner')
    .click()
  const beforeInvalid = listCalls().length
  await page.locator('.report-search').click()
  await page.locator('.report-validation').waitFor()
  check('Invalid range does not call API', listCalls().length === beforeInvalid)
  await page.locator('.report-reset').click()
  await ready()
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
      'pageSize ' + size + ' server request once',
      listCalls().length === before + 1 && listCalls().at(-1).params.pageSize === String(size),
    )
  }
  await page.locator('.ant-pagination-item-2').click()
  await ready()
  check('Pagination sends page 2', listCalls().at(-1).params.page === '2')
  check(
    'Summary stays global across pages',
    (await page.locator('[data-metric="createdPaymentCount"]').innerText()) === '137',
  )
  const beforeReload = listCalls().length
  await reload()
  check(
    'Reload keeps page and requests once',
    listCalls().length === beforeReload + 1 && listCalls().at(-1).params.page === '2',
  )
  await page.locator('.report-reset').click()
  await ready()
  if ((await page.locator('.report-expand').getAttribute('aria-expanded')) === 'true')
    await page.locator('.report-expand').click()
  const desktop = await assertGeometry('1440 desktop')
  check('Desktop table body scrolls internally', desktop.scrollHeight > desktop.clientHeight)
  await page.locator('.ant-table-body').evaluate((el) => {
    el.scrollLeft = el.scrollWidth
  })
  check(
    'Negative int64 exact',
    (await page.locator('.ant-table-row').first().innerText()).includes(
      '-9.223.372.036.854.775.808',
    ),
  )
  check(
    'Exact numbers fit their cells',
    await page
      .locator('.report-quantity')
      .evaluateAll((els) => els.every((el) => el.scrollWidth <= el.parentElement.clientWidth)),
  )
  const headerTop = await page
    .locator('.ant-table-header')
    .evaluate((el) => el.getBoundingClientRect().top)
  await page.locator('.ant-table-body').evaluate((el) => {
    el.scrollTop = 100
  })
  check(
    'Header stays fixed during vertical scroll',
    (await page.locator('.ant-table-header').evaluate((el) => el.getBoundingClientRect().top)) ===
      headerTop,
  )
  await page.locator('.ant-table-body').evaluate((el) => {
    el.scrollLeft = 0
    el.scrollTop = 0
  })
  await page.mouse.move(0, 0)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: join(artifacts, 'desktop.png'), fullPage: true })
  const beforeLayout = listCalls().length
  for (const width of [320, 375, 390, 414, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await assertGeometry(width + ' collapsed')
    if (width < 768) {
      check(
        width + ': collapsed mobile controls hidden',
        !(await page.locator('.report-search').isVisible()) && !(await fromInput.isVisible()),
      )
      const toggle = page.locator('.report-mobile-toggle')
      await toggle.focus()
      await page.keyboard.press('Tab')
      check(
        width + ': hidden fields skipped by Tab',
        await page.evaluate(() => !document.activeElement.closest('.report-filter-form')),
      )
      check(width + ': aria-controls provided', !!(await toggle.getAttribute('aria-controls')))
      await toggle.click()
      check(
        width + ': filter expanded aria',
        (await toggle.getAttribute('aria-expanded')) === 'true',
      )
      check(
        width + ': all fields visible',
        (await fromInput.isVisible()) && (await page.locator('.report-presets').isVisible()),
      )
      if (width === 320) {
        await fromInput.click()
        await page.locator('.ant-picker-dropdown:visible').waitFor()
        check(
          '320: calendar fits usable viewport',
          await page.locator('.ant-picker-dropdown:visible').evaluate((el) => {
            const rect = el.getBoundingClientRect()
            return rect.left >= -1 && rect.right <= document.documentElement.clientWidth + 1
          }),
        )
        await page.keyboard.press('Escape')
      }
      await assertGeometry(width + ' expanded')
      const boxes = await page.locator('.report-field').evaluateAll((els) =>
        els
          .filter((el) => el.getClientRects().length)
          .map((el) => ({
            top: el.getBoundingClientRect().top,
            right: el.getBoundingClientRect().right,
          })),
      )
      check(
        width + ': single-column order',
        boxes[0].top < boxes[1].top && boxes[1].top < boxes[2].top,
      )
      check(
        width + ': fields fit viewport',
        boxes.every((box) => box.right <= width),
      )
      check(
        width + ': no inner expand button',
        (await page.locator('.report-expand').count()) === 0,
      )
      if (width === 390)
        await page.screenshot({ path: join(artifacts, 'mobile-expanded.png'), fullPage: true })
      await toggle.click()
      const beforePanels = listCalls().length
      await page.locator('.detail-panel--receipts .detail-toggle').click()
      check(
        width + ': receipt group collapses independently',
        !(await page.locator('.detail-panel--receipts dl').isVisible()) &&
          (await page.locator('.detail-panel--refunds dl').isVisible()),
      )
      await page.locator('.detail-panel--refunds .detail-toggle').click()
      await assertGeometry(width + ' details collapsed')
      await page.locator('.detail-panel--receipts .detail-toggle').click()
      await page.locator('.detail-panel--refunds .detail-toggle').click()
      check(width + ': panels do not request', listCalls().length === beforePanels)
      if (width === 390) {
        await page.evaluate(() => window.scrollTo(0, 0))
        await page.screenshot({ path: join(artifacts, 'mobile-collapsed.png'), fullPage: true })
      }
    } else {
      await page.locator('.report-expand').click()
      await assertGeometry(width + ' expanded')
      await page.locator('.report-expand').click()
    }
  }
  check('Resize and toggles never request', listCalls().length === beforeLayout)
  await page.setViewportSize({ width: 390, height: 900 })
  await page.locator('.report-mobile-toggle').click()
  await select('.report-field--warehouse', 'Kho ngừng hoạt động')
  await page.locator('.report-mobile-toggle').click()
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.locator('.report-expand').click()
  check(
    'Draft survives breakpoint and collapse',
    (await page.locator('.report-field--warehouse').innerText()).includes('Kho ngừng hoạt động'),
  )
  check('Draft and breakpoint changes do not request', listCalls().length === beforeLayout)
  await page.setViewportSize({ width: 390, height: 900 })
  await page.locator('.report-mobile-toggle').click()
  const beforeMobileSearch = listCalls().length
  await search()
  check(
    'Mobile search requests once and stays open',
    listCalls().length === beforeMobileSearch + 1 &&
      (await page.locator('.report-mobile-toggle').getAttribute('aria-expanded')) === 'true',
  )
  await page.locator('.report-mobile-toggle').click()
  apiError = 'REPORT_PERIOD_TOO_LARGE'
  await reload()
  check(
    'Backend validation opens hidden mobile form',
    (await page.locator('.report-mobile-toggle').getAttribute('aria-expanded')) === 'true' &&
      (await page.locator('.report-validation').isVisible()),
  )
  apiError = ''
  await page.locator('.report-reset').click()
  await ready()
  await page.locator('.report-mobile-toggle').click()
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.locator('.report-reset').click()
  await ready()
  if ((await page.locator('.report-expand').getAttribute('aria-expanded')) === 'true')
    await page.locator('.report-expand').click()
  largeSummary = true
  await reload()
  check(
    'Summary retains exact negative int64',
    (await page.locator('[data-metric="netCashFlowAmount"]').innerText()).startsWith(
      '-9.223.372.036.854.775.808',
    ),
  )
  for (const width of [320, 375, 390, 414, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await assertGeometry(width + ' long summary')
    check(
      width + ': long summary values stay inside cards',
      await page
        .locator('[data-metric]')
        .evaluateAll((els) => els.every((el) => el.scrollWidth <= el.clientWidth + 1)),
    )
    check(
      width + ': all summary metrics remain visible',
      (await page.locator('[data-metric]:visible').count()) === 19,
    )
  }
  largeSummary = false
  await page.setViewportSize({ width: 1440, height: 1000 })
  await reload()
  const sidebarToggle = page.locator('.app-header button[aria-label*="thanh bên"]')
  if (await sidebarToggle.count()) {
    await sidebarToggle.click()
    await page.waitForTimeout(350)
    await assertGeometry('sidebar changed')
    await sidebarToggle.click()
    await page.waitForTimeout(350)
    await assertGeometry('sidebar restored')
  }
  await page.setViewportSize({ width: 1024, height: 500 })
  await page.locator('.report-expand').click()
  await assertGeometry('short viewport')
  await page.locator('.products-footer').scrollIntoViewIfNeeded()
  check('Short viewport pagination reachable', await page.locator('.list-page-size').isVisible())
  check(
    'All metrics retained on short viewport',
    (await page.locator('[data-metric]:visible').count()) === 19,
  )
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.evaluate(() => {
    document.documentElement.style.zoom = '1.25'
  })
  await assertGeometry('125 percent CSS zoom')
  await page.evaluate(() => {
    document.documentElement.style.zoom = ''
  })
  empty = true
  await reload()
  check('Empty state', await page.locator('.ant-table-placeholder').isVisible())
  empty = false
  apiError = 'NUMERIC_OVERFLOW'
  await reload()
  check(
    'Error visible and stale rows cleared',
    (await page
      .getByText('Tổng báo cáo vượt giới hạn số của hệ thống. Cần quản trị viên kiểm tra.')
      .first()
      .isVisible()) && (await page.locator('.ant-table-row').count()) === 0,
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
  check('Route permission still enforced')
  check('No runtime or ResizeObserver errors', errors.length === 0)
  console.log(
    'Passed ' + checks.length + ' payments report browser checks. Artifacts: ' + artifacts,
  )
} finally {
  await page.screenshot({ path: join(artifacts, 'last-state.png'), fullPage: true }).catch(() => {})
  await writeFile(
    join(artifacts, 'results.json'),
    JSON.stringify({ checks, errors, measurements, calls }, null, 2),
  )
  await browser.close()
}
