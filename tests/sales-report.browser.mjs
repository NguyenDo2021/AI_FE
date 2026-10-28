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
const artifacts = join(process.env.TEMP, 'codex-sales-report-browser')
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
  localStorage.setItem('frontend-base:access-token', 'sales-report-test'),
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
let rowLimit
let permissions = ['REPORT_SALES_VIEW']
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
  if (path === '/reports/sales/export') {
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
  if (path === '/reports/sales') {
    const capturedError = apiError,
      capturedDelay = delay
    if (capturedDelay) await new Promise((resolve) => setTimeout(resolve, capturedDelay))
    if (capturedError) return reply({ code: capturedError, message: 'Report fixture error' }, 409)
    const size = Number(params.pageSize || 10),
      page = Number(params.page || 1)
    const summary = {
      confirmedOrderCount: 137,
      cancelledConfirmedOrderCount: 7,
      confirmedQuantity: 2553,
      cancelledQuantity: 23,
      grossSalesAmount: 520760000,
      discountAmount: 30222121,
      confirmedSalesAmount: 490537879,
      cancelledSalesAmount: 10000000,
      returnedSalesAmount: 28745856,
      netSalesAmount: largeSummary ? '__EXACT_INT64__' : -162078901,
    }
    const items = empty
      ? []
      : Array.from({ length: rowLimit ?? size }, (_, n) => ({
          warehouseId: 'w' + ((page - 1) * size + n),
          warehouseCode: 'K' + n,
          warehouseName: n === 0 ? 'Warehouse with a very long name '.repeat(10) : 'Warehouse ' + n,
          confirmedOrderCount: n + 1,
          cancelledConfirmedOrderCount: n,
          confirmedQuantity: 100 + n,
          cancelledQuantity: 3 + n,
          grossSalesAmount: 10000 + n * 100,
          discountAmount: 100 + n,
          confirmedSalesAmount: 9900 + n * 100,
          cancelledSalesAmount: 200 + n,
          ...(n === 2 ? {} : { returnedSalesAmount: 3500 + n * 100 }),
          netSalesAmount: n === 0 ? '__EXACT_INT64__' : -91,
        }))
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        items,
        total: empty ? 0 : (rowLimit ?? 137),
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
const listCalls = () => calls.filter((call) => call.path === '/reports/sales')
const exports = () => calls.filter((call) => call.path === '/reports/sales/export')
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
  // Sidebar width animates across the mobile breakpoint. Wait until both its
  // geometry and the table's ResizeObserver updates have settled.
  await page.evaluate(() => {
    globalThis.__salesTableLayout = undefined
  })
  await page.waitForFunction(() => {
    const selectors = [
      '.report-table',
      '.products-table-region',
      '.ant-table-header',
      '.ant-table-body',
      '.products-footer',
      '.ant-table-header th',
      '.ant-table-row td',
    ]
    const signature = selectors
      .map((selector) => {
        const rect = document.querySelector(selector)?.getBoundingClientRect()
        return rect ? [rect.left, rect.right, rect.top, rect.bottom].join(',') : ''
      })
      .join('|')
    const previous = globalThis.__salesTableLayout
    const stable = previous?.signature === signature ? previous.stable + 1 : 0
    globalThis.__salesTableLayout = { signature, stable }
    return stable >= 4
  })
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
      region: rect(region),
      footer: rect(footer),
      panel: rect(document.querySelector('.report-table')),
      rowHeights: [...document.querySelectorAll('.ant-table-row')].map(
        (el) => el.getBoundingClientRect().height,
      ),
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
  check(name + ': all 11 columns', m.header.length === 11 && m.cells.length === 11)
  check(name + ': table scroll stays before pagination', m.body.bottom <= m.footer.top + 1)
  check(name + ': pagination stays inside table panel', m.footer.bottom <= m.panel.bottom + 1)
  check(name + ': horizontal scrolling available', m.scrollWidth > m.clientWidth)
  for (let n = 0; n < 11; n++)
    assert.ok(Math.abs(m.header[n].right - m.cells[n].right) < 2, name + ': header alignment ' + n)
  return m
}
const expectedHeaders = [
  'Kho',
  'Số đơn xác nhận',
  'Số đơn đã xác nhận bị hủy',
  'Số cây xác nhận',
  'Số cây bị hủy',
  'Giá trị trước giảm giá',
  'Giảm giá',
  'Giá trị bán xác nhận',
  'Giá trị bán bị hủy',
  'Giá trị hàng đã trả',
  'Giá trị bán ròng',
]
const assertWarehouseValues = async () => {
  const headerText = await page
    .locator('.ant-table-header th:not(.ant-table-cell-scrollbar)')
    .allInnerTexts()
  assert.deepEqual(
    headerText.map((text) => text.replace(/\s+/g, ' ').trim()),
    expectedHeaders,
  )
  const money = (value) => BigInt(value).toLocaleString('vi-VN') + ' ₫'
  for (let n = 0; n < 2; n++) {
    const values = await page.locator('.ant-table-row').nth(n).locator('td').allInnerTexts()
    assert.deepEqual(values.slice(1), [
      String(n + 1),
      String(n),
      String(100 + n),
      String(3 + n),
      money(10000 + n * 100),
      money(100 + n),
      money(9900 + n * 100),
      money(200 + n),
      money(3500 + n * 100),
      money(n === 0 ? '-9223372036854775808' : -91),
    ])
    check('Warehouse ' + n + ': all ten cells read their own fields, including positive returns')
  }
}
try {
  await page.goto((process.env.SALES_REPORT_TEST_URL || 'http://127.0.0.1:5178') + '/reports/sales')
  await ready()
  check('Initial request exactly once', listCalls().length === 1)
  check('Correct heading', (await page.locator('h1').innerText()).includes('bán hàng'))
  check('All ten metrics present', (await page.locator('[data-metric]').count()) === 10)
  await assertWarehouseValues()
  check(
    'Missing row return field is not replaced by zero',
    (await page.locator('.ant-table-row').nth(2).locator('td').nth(9).innerText()) === '—',
  )
  check(
    'Summary uses backend, not page totals',
    (await page.locator('[data-metric="confirmedOrderCount"]').innerText()) === '137',
  )
  check(
    'Net summary may be negative',
    (await page.locator('[data-metric="netSalesAmount"]').innerText()).startsWith('-162.078.901'),
  )
  const initial = { ...listCalls().at(-1).params }
  check('Default pageSize 10', initial.pageSize === '10')
  check('Expanded fields initially hidden', !(await page.locator('.report-presets').isVisible()))
  const beforeToggle = listCalls().length
  await page.locator('.report-expand').click()
  await select('.report-field--warehouse', 'Kho ngừng hoạt động')
  await page.locator('.report-expand').click()
  check('Draft and expand do not request', listCalls().length === beforeToggle)
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
    exports().at(-1).authorization === 'Bearer sales-report-test',
  )
  exportError = 'EXPORT_TOO_LARGE'
  await page.locator('.report-export').click()
  await page.getByText('Dữ liệu xuất quá lớn. Hãy thu hẹp bộ lọc và thử lại.').waitFor()
  check('JSON blob business error visible')
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
  check('Desktop fits viewport', desktop.pageHeight <= desktop.height + 2)
  check(
    'Wide headers remain readable',
    await page
      .locator('.ant-table-header th')
      .evaluateAll((elements) => elements.every((el) => el.getBoundingClientRect().height <= 72)),
  )
  for (const position of [0, 0.5, 1]) {
    await page.locator('.ant-table-body').evaluate((el, ratio) => {
      el.scrollLeft = (el.scrollWidth - el.clientWidth) * ratio
    }, position)
    await assertGeometry('horizontal scroll ' + position)
    if (position === 1) {
      check(
        'Returns and net sales visible at horizontal end',
        await page.evaluate(() => {
          const body = document.querySelector('.ant-table-body').getBoundingClientRect()
          const headers = [
            ...document.querySelectorAll('.ant-table-header th:not(.ant-table-cell-scrollbar)'),
          ]
          return headers.slice(-2).every((el) => {
            const rect = el.getBoundingClientRect()
            return rect.left >= body.left - 1 && rect.right <= body.right + 1
          })
        }),
      )
      await page.mouse.move(0, 0)
      await page.screenshot({ path: join(artifacts, 'returns-columns.png'), fullPage: true })
    }
  }
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
  const rowHeights = await page
    .locator('.ant-table-row')
    .evaluateAll((elements) => elements.map((el) => el.getBoundingClientRect().height))
  for (const count of [2, 1]) {
    rowLimit = count
    await reload()
    const few = await assertGeometry(count + ' warehouse rows')
    check(
      count + ' rows: unused space reserved without stretching rows',
      few.rowHeights.every((height, n) => Math.abs(height - rowHeights[n]) <= 1),
    )
    check(count + ' rows: no unnecessary vertical scrollbar', few.scrollHeight <= few.clientHeight)
    if (count === 2) await assertWarehouseValues()
  }
  rowLimit = undefined
  await reload()
  await page.screenshot({ path: join(artifacts, 'desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 1440, height: 1200 })
  const closedFilter = await geometry()
  const beforeFilterLayout = listCalls().length
  await page.locator('.report-expand').click()
  const openFilter = await assertGeometry('filter consumes remaining table space')
  check(
    'Filter expansion reduces table body height',
    openFilter.clientHeight < closedFilter.clientHeight,
  )
  await page.locator('.report-expand').click()
  const restoredFilter = await geometry()
  check(
    'Filter collapse restores table body height',
    Math.abs(restoredFilter.clientHeight - closedFilter.clientHeight) <= 1,
  )
  check('Table height changes never request data', listCalls().length === beforeFilterLayout)
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
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.locator('.report-reset').click()
  await ready()
  if ((await page.locator('.report-expand').getAttribute('aria-expanded')) === 'true')
    await page.locator('.report-expand').click()
  largeSummary = true
  await reload()
  check(
    'Summary retains exact negative int64',
    (await page.locator('[data-metric="netSalesAmount"]').innerText()).startsWith(
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
      (await page.locator('[data-metric]:visible').count()) === 10,
    )
  }
  largeSummary = false
  await page.setViewportSize({ width: 1440, height: 1000 })
  await reload()
  const beforeSidebarLayout = listCalls().length
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
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.evaluate(() => {
    document.documentElement.style.zoom = '1.25'
  })
  await assertGeometry('125 percent CSS zoom')
  await page.evaluate(() => {
    document.documentElement.style.zoom = ''
  })
  check(
    'Sidebar, short viewport and zoom never request data',
    listCalls().length === beforeSidebarLayout,
  )
  empty = true
  await reload()
  check('Empty state', await page.locator('.ant-table-placeholder').isVisible())
  const emptyGeometry = await geometry()
  check('Empty state keeps all headers', emptyGeometry.header.length === 11)
  check(
    'Empty state pagination remains outside body',
    emptyGeometry.body.bottom <= emptyGeometry.footer.top + 1,
  )
  check(
    'Empty state pagination remains in panel',
    emptyGeometry.footer.bottom <= emptyGeometry.panel.bottom + 1,
  )
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
  console.log('Passed ' + checks.length + ' sales report browser checks. Artifacts: ' + artifacts)
} finally {
  await page.screenshot({ path: join(artifacts, 'last-state.png'), fullPage: true }).catch(() => {})
  await writeFile(
    join(artifacts, 'results.json'),
    JSON.stringify({ checks, errors, measurements, calls }, null, 2),
  )
  await browser.close()
}
