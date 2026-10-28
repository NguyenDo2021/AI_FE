// All API requests use controlled fixtures. No transaction reaches a real backend.
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
const artifacts = join(process.env.TEMP, 'codex-receivables-artifacts')
await mkdir(artifacts, { recursive: true })
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  ignoreDefaultArgs: ['--hide-scrollbars'],
})
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  reducedMotion: 'reduce',
  timezoneId: 'Asia/Bangkok',
})
context.setDefaultTimeout(12000)
await context.addInitScript(() => {
  localStorage.setItem('frontend-base:access-token', 'receivables-test')
  sessionStorage.setItem('working-warehouse:receivables-test', 'w1')
})
const calls = [],
  errors = [],
  unexpected = [],
  checks = [],
  measurements = []
let mode = 'many',
  paid = false,
  failPayment = false,
  profile = 'full'
const totalDebt = '9223372036854775807'
const order = (i = 0) => ({
  id: 's' + i,
  code: 'BH-' + i + '-long-order-code-'.repeat(4),
  warehouseId: 'w1',
  customerId: null,
  status: 'CONFIRMED',
  saleDate: '2026-10-09',
  createdAt: '2026-10-09T02:00:00Z',
  createdBy: 'u1',
  confirmedAt: '2026-10-09T03:00:00Z',
  confirmedBy: 'u1',
  totalAmount: 190000000,
  returnedAmount: 13571428,
  adjustedTotalAmount: 176428572,
  paidAmount: paid ? 176428572 : 1000000,
  refundedAmount: 0,
  netPaidAmount: paid ? 176428572 : 1000000,
  refundableAmount: 0,
  remainingAmount: paid ? 0 : 175428572,
  paymentStatus: paid ? 'PAID' : 'PARTIALLY_PAID',
  lines: [
    {
      productId: 'p1',
      productCode: 'SP-01',
      productName: 'Sản phẩm thử nghiệm',
      quantity: 10,
      unitPrice: 19000000,
      lineTotal: 190000000,
    },
  ],
})
const list = (params, customer = false) => {
  const total = mode === 'empty' || paid ? 0 : 137
  const page = Number(params.page),
    pageSize = Number(params.pageSize)
  return {
    items: Array.from(
      { length: Math.max(0, Math.min(pageSize, total - (page - 1) * pageSize)) },
      (_, i) =>
        customer
          ? {
              customerId: 'c' + ((page - 1) * pageSize + i),
              warehouseId: 'w1',
              customerCode: 'KH-' + i + '-'.repeat(70),
              customerName: i ? 'Vũ Thùy Dung với tên khách dài '.repeat(4) : 'Anh Bắc',
              outstandingOrderCount: 1,
              totalAmount: 190000000,
              paidAmount: 1000000,
              remainingAmount: 175428572,
            }
          : order((page - 1) * pageSize + i),
    ),
    total,
    page,
    pageSize,
  }
}
await context.route('**/api/**', async (route) => {
  const req = route.request(),
    url = new URL(req.url()),
    path = url.pathname.replace(/^\/api/, ''),
    method = req.method(),
    params = Object.fromEntries(url.searchParams)
  if (!url.pathname.startsWith('/api/')) return route.continue()
  calls.push({ path, method, params, raw: req.postData() })
  const reply = (data, status = 200) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(data).replace(/"EXACT_INT64"/g, totalDebt),
    })
  if (path === '/auth/me')
    return reply({
      id: 'receivables-test',
      username: 'test',
      fullName: 'Kiểm thử công nợ',
      permissions:
        profile === 'admin'
          ? []
          : ['RECEIVABLE_VIEW', ...(profile === 'full' ? ['PAYMENT_CREATE'] : [])],
      roles: profile === 'admin' ? ['ADMIN'] : [],
    })
  if (path === '/users/receivables-test') return reply({ id: 'receivables-test', status: 1 })
  if (path === '/users/receivables-test/roles')
    return reply(profile === 'admin' ? [{ id: 'admin', code: 'ADMIN', status: 1 }] : [])
  if (path === '/users/me/warehouses')
    return reply([
      { id: 'w1', code: 'KHO_01', name: 'Kho Thanh Chương', status: 1 },
      { id: 'w2', code: 'KHO_02', name: 'Kho thứ hai', status: 1 },
    ])
  if (path === '/receivables' || path === '/receivables/walk-in-orders') {
    if (mode === 'error') return reply({ message: 'Lỗi danh sách công nợ kiểm thử.' }, 500)
    return reply(list(params, path === '/receivables'))
  }
  if (/^\/customers\/[^/]+\/receivables$/.test(path)) {
    const customerId = path.split('/')[2]
    if (customerId === 'bad-uuid') return reply({ message: 'UUID khách không hợp lệ.' }, 400)
    return reply({
      customerId,
      warehouseId: 'w1',
      remainingAmount: paid ? 0 : 'EXACT_INT64',
      orders: list(params),
    })
  }
  if (/^\/sales-orders\/s\d+\/payments$/.test(path) && method === 'POST') {
    if (failPayment === 'exceeds')
      return reply(
        { code: 'PAYMENT_EXCEEDS_REMAINING', message: 'Số tiền vượt số còn phải trả.' },
        400,
      )
    if (failPayment)
      return reply(
        {
          message: 'Giữ nội dung biểu mẫu để thử lại.',
          code: 'VALIDATION_ERROR',
          details: { note: 'Ghi chú không hợp lệ.' },
        },
        400,
      )
    paid = true
    return reply({
      payment: { id: 'receipt1', code: 'PT-001', status: 'ACTIVE' },
      order: { ...order(), salesOrderId: path.split('/')[2] },
    })
  }
  unexpected.push({ path, method })
  return reply({ message: 'Unexpected API denied by test.' }, 403)
})
const page = await context.newPage()
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (
    /Unhandled|Failed to resolve component|ResizeObserver loop|Extraneous non-props/.test(
      message.text(),
    )
  )
    errors.push(message.text())
})
const base = process.env.RECEIVABLES_TEST_URL || 'http://127.0.0.1:5178'
const customers = () => page.locator('.receivables-table')
const walkin = () => page.locator('.receivables-page > .receivable-orders')
const debtModal = () => page.locator('.customer-receivables-dialog:visible')
const collectModal = () => page.locator('.collect-payment-dialog:visible')
const listCalls = () =>
  calls.filter(
    (call) => call.path === '/receivables' || call.path === '/receivables/walk-in-orders',
  )
const debtCalls = () => calls.filter((call) => /^\/customers\//.test(call.path))
const check = (name, condition) => {
  assert.ok(condition, name)
  checks.push(name)
}
const settle = () => page.waitForTimeout(250)
const ready = async (panel = customers()) => {
  await panel.waitFor()
  await panel.locator('.products-table-region[aria-busy="false"]').waitFor()
  await settle()
}
const closeDebt = async () => {
  await debtModal().getByRole('button', { name: 'Đóng', exact: true }).click()
  await debtModal().waitFor({ state: 'hidden' })
}
const selectSize = async (panel, size) => {
  await panel.locator('.list-page-size').click()
  await page
    .locator('.ant-select-dropdown:visible')
    .locator('.ant-select-item-option')
    .filter({ hasText: new RegExp(`^${size} / trang$`) })
    .click()
  await ready(panel)
}
const geometry = async () =>
  page.evaluate(() => {
    const panel = document.querySelector('.receivables-page > .fitted-list-panel')
    const body = panel.querySelector('.ant-table-body'),
      footer = panel.querySelector('.products-footer'),
      header = panel.querySelector('.ant-table-header')
    return {
      viewport: [innerWidth, innerHeight],
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      bodyHeight: body.clientHeight,
      bodyWidth: body.clientWidth,
      scrollWidth: body.scrollWidth,
      scrollHeight: body.scrollHeight,
      footerTop: footer.getBoundingClientRect().top,
      bodyBottom: body.getBoundingClientRect().bottom,
      sticky: getComputedStyle(panel.querySelector('td.ant-table-cell-fix-right')).position,
      headerWidth: header.clientWidth,
      headerTop: header.getBoundingClientRect().top,
    }
  })
let failure
try {
  await page.goto(base + '/sales/receivables')
  await ready()
  check('initial request once', listCalls().length === 1)
  check(
    'default context and 10 rows',
    listCalls()[0].params.warehouseId === 'w1' && listCalls()[0].params.pageSize === '10',
  )
  check(
    'eight distinct customer columns',
    (await customers().locator('.ant-table-header th').count()) >= 8,
  )
  check(
    'desktop UUID collapsed',
    !(await page.getByRole('textbox', { name: 'UUID khách', exact: true }).isVisible()),
  )
  let count = listCalls().length
  const keyword = page.getByRole('textbox', { name: 'Mã / tên / số điện thoại khách', exact: true })
  await keyword.fill('0901234567')
  await settle()
  check('typing does not search', listCalls().length === count)
  await keyword.press('Enter')
  await ready()
  check(
    'Enter submits once',
    listCalls().length === count + 1 && listCalls().at(-1).params.keyword === '0901234567',
  )
  await page.getByRole('button', { name: 'Mở rộng', exact: true }).click()
  await page.getByRole('textbox', { name: 'UUID khách', exact: true }).fill('c0')
  count = listCalls().length
  await page.getByRole('button', { name: 'Thu gọn', exact: true }).click()
  await page.getByRole('button', { name: 'Mở rộng', exact: true }).click()
  check(
    'expand preserves draft without fetch',
    listCalls().length === count &&
      (await page.getByRole('textbox', { name: 'UUID khách', exact: true }).inputValue()) === 'c0',
  )
  await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click()
  await ready()
  check('UUID is not a list filter', !('customerId' in listCalls().at(-1).params))
  count = listCalls().length
  await page.getByRole('button', { name: 'Đặt lại', exact: true }).click()
  await ready()
  check(
    'reset once and retains warehouse context',
    listCalls().length === count + 1 &&
      listCalls().at(-1).params.warehouseId === 'w1' &&
      !('keyword' in listCalls().at(-1).params),
  )
  await page.getByRole('textbox', { name: 'UUID khách', exact: true }).fill('bad-uuid')
  await page.getByRole('textbox', { name: 'UUID khách', exact: true }).press('Enter')
  await debtModal().getByText('UUID khách không hợp lệ.', { exact: true }).waitFor()
  check(
    'invalid UUID preserves backend error and never searches list',
    listCalls().length === count + 1,
  )
  await closeDebt()
  await page.getByRole('button', { name: 'Thu gọn', exact: true }).click()
  await customers().getByRole('button', { name: 'Chi tiết công nợ', exact: true }).first().click()
  await debtModal().locator('.customer-debt-total strong').waitFor()
  const debtText = await debtModal().locator('.customer-debt-total strong').innerText()
  check('int64 total is exact from backend', debtText.replace(/\D/g, '') === totalDebt)
  check(
    'response warehouse displayed',
    (await debtModal().locator('.customer-debt-scope').innerText()).includes('Kho Thanh Chương'),
  )
  check(
    'all 12 order columns remain',
    (await debtModal().locator('.ant-table-header th').count()) >= 12,
  )
  await selectSize(debtModal().locator('.receivable-orders'), 20)
  check(
    'detail total independent of page size',
    (await debtModal().locator('.customer-debt-total strong').innerText()) === debtText,
  )
  const beforeReload = [listCalls().length, debtCalls().length]
  await debtModal().getByRole('button', { name: 'Tải lại công nợ', exact: true }).click()
  await ready(debtModal().locator('.receivable-orders'))
  check(
    'manual reload refreshes detail and list once each',
    listCalls().length === beforeReload[0] + 1 && debtCalls().length === beforeReload[1] + 1,
  )
  await page.screenshot({ path: join(artifacts, 'customer-detail-desktop.png'), fullPage: true })
  await closeDebt()
  await selectSize(customers(), 50)
  for (const width of [320, 375, 390, 414, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await settle()
    const beforeLayout = calls.length
    if (width < 768) {
      check(`mobile ${width} starts closed`, !(await keyword.isVisible()))
      await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click()
      check(
        `mobile ${width} all filters visible`,
        (await keyword.isVisible()) &&
          (await page.getByRole('textbox', { name: 'UUID khách', exact: true }).isVisible()) &&
          (await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).isVisible()) &&
          (await page.getByRole('button', { name: 'Đặt lại', exact: true }).isVisible()),
      )
      check(
        `mobile ${width} no nested toggle`,
        !(await page.getByRole('button', { name: 'Mở rộng', exact: true }).isVisible()),
      )
      await keyword.fill('draft retained')
      if (width === 320) {
        const beforeSearch = listCalls().length
        await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click()
        await ready()
        check(
          'mobile submit once and stays open',
          listCalls().length === beforeSearch + 1 && (await keyword.isVisible()),
        )
        const beforeReset = listCalls().length
        await page.getByRole('button', { name: 'Đặt lại', exact: true }).click()
        await ready()
        check(
          'mobile reset once and stays open',
          listCalls().length === beforeReset + 1 && (await keyword.isVisible()),
        )
        await keyword.fill('draft retained')
      }
      await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click()
      await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click()
      check(`mobile ${width} draft retained`, (await keyword.inputValue()) === 'draft retained')
      await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click()
    }
    const g = await geometry()
    measurements.push(g)
    check(`no page overflow ${width}`, g.pageWidth <= g.viewportWidth + 1)
    check(
      `scroll and fixed action ${width}`,
      g.scrollWidth > g.bodyWidth && g.bodyHeight >= 80 && g.sticky === 'sticky',
    )
    check(`pagination outside body ${width}`, g.footerTop >= g.bodyBottom - 1)
    if (width !== 320) check(`layout no API ${width}`, calls.length === beforeLayout)
    await page.screenshot({ path: join(artifacts, `customers-${width}.png`), fullPage: true })
    await customers().getByRole('button', { name: 'Chi tiết công nợ', exact: true }).first().click()
    await debtModal().locator('.customer-debt-total strong').waitFor()
    const modalGeometry = await debtModal().evaluate((el) => {
      const body = el.querySelector('.ant-modal-body'),
        footer = el.querySelector('.ant-modal-footer')
      const name = el.querySelector('.customer-debt-summary h2').getBoundingClientRect()
      const money = el.querySelector('.customer-debt-total').getBoundingClientRect()
      return {
        bodyWidth: body.clientWidth,
        scrollWidth: body.scrollWidth,
        footerBottom: footer.getBoundingClientRect().bottom,
        viewportHeight: innerHeight,
        nameBottom: name.bottom,
        moneyTop: money.top,
      }
    })
    check(
      `modal body and footer fit ${width}`,
      modalGeometry.scrollWidth <= modalGeometry.bodyWidth + 1 &&
        modalGeometry.footerBottom <= modalGeometry.viewportHeight,
    )
    if (width < 768)
      check(`modal summary stacked ${width}`, modalGeometry.moneyTop >= modalGeometry.nameBottom)
    await closeDebt()
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await settle()
  count = calls.length
  const sidebarToggle = page.locator('.app-header__navigation button').first()
  await sidebarToggle.click()
  await settle()
  check('sidebar resize no API', calls.length === count)
  let g = await geometry()
  check('sidebar resize fits table', g.pageWidth <= g.viewportWidth + 1)
  await sidebarToggle.click()
  for (const size of [100, 20, 10]) {
    await selectSize(customers(), size)
    check(`server page size ${size}`, listCalls().at(-1).params.pageSize === String(size))
  }
  await page.setViewportSize({ width: 1024, height: 430 })
  await settle()
  g = await geometry()
  check(
    'short screen nonnegative table and accessible pagination',
    g.bodyHeight >= 80 && g.footerTop >= g.bodyBottom - 1,
  )
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByRole('tab', { name: 'Đơn khách lẻ chưa thanh toán', exact: true }).click()
  await ready(walkin())
  check(
    'walk-in only supported warehouse filter',
    !(await keyword.count()) &&
      !(await page.getByRole('textbox', { name: 'UUID khách', exact: true }).count()) &&
      !('keyword' in listCalls().at(-1).params),
  )
  check(
    'walk-in all 12 columns and separate actions',
    (await walkin().locator('.ant-table-header th').count()) >= 12 &&
      (await walkin().getByRole('button', { name: 'Thu tiền', exact: true }).count()) > 0,
  )
  await walkin().getByRole('button', { name: 'Chi tiết đơn bán hàng', exact: true }).first().click()
  await page.locator('.receivable-order-dialog:visible').waitFor()
  await settle()
  await page
    .locator('.receivable-order-dialog:visible')
    .getByRole('button', { name: 'Đóng', exact: true })
    .click()
  check(
    'closing order returns to walk-in tab',
    (await page
      .getByRole('tab', { name: 'Đơn khách lẻ chưa thanh toán', exact: true })
      .getAttribute('aria-selected')) === 'true',
  )
  await page.setViewportSize({ width: 320, height: 700 })
  await walkin().getByRole('button', { name: 'Chi tiết đơn bán hàng', exact: true }).first().click()
  await page.locator('.receivable-order-dialog:visible').waitFor()
  await settle()
  const orderGeometry = await page
    .locator('.receivable-order-dialog:visible .ant-modal-body')
    .evaluate((el) => ({ width: el.clientWidth, scrollWidth: el.scrollWidth }))
  measurements.push({ orderGeometry })
  check(
    'mobile order detail contains its horizontal overflow',
    orderGeometry.scrollWidth <= orderGeometry.width + 1,
  )
  await page
    .locator('.receivable-order-dialog:visible')
    .getByRole('button', { name: 'Đóng', exact: true })
    .click()
  failPayment = true
  await walkin().getByRole('button', { name: 'Thu tiền', exact: true }).first().click()
  await collectModal().locator('#collection-amount').fill('175428572')
  await collectModal().locator('#collection-reference').fill('REF-test')
  await collectModal().locator('#collection-note').fill('Ghi chú giữ lại')
  await collectModal().getByRole('button', { name: 'Ghi nhận thu tiền', exact: true }).click()
  await collectModal().getByText('Giữ nội dung biểu mẫu để thử lại.', { exact: true }).waitFor()
  check(
    'collection errors retain all fields',
    (await collectModal().locator('#collection-reference').inputValue()) === 'REF-test' &&
      (await collectModal().locator('#collection-note').inputValue()) === 'Ghi chú giữ lại',
  )
  failPayment = false
  const beforePay = listCalls().length
  await collectModal().getByRole('button', { name: 'Ghi nhận thu tiền', exact: true }).dblclick()
  await collectModal().waitFor({ state: 'hidden' })
  await ready(walkin())
  check(
    'success refreshes once and removes fully paid orders',
    listCalls().length === beforePay + 1 &&
      (await walkin().getByRole('button', { name: 'Thu tiền', exact: true }).count()) === 0,
  )
  check(
    'single successful payment request despite double click',
    calls.filter((call) => call.method === 'POST').length === 2,
  )
  paid = false
  mode = 'empty'
  await walkin().getByRole('button', { name: 'Tải lại', exact: true }).click()
  await ready(walkin())
  check('empty state', (await walkin().locator('.ant-table-placeholder').count()) > 0)
  mode = 'error'
  await walkin().getByRole('button', { name: 'Tải lại', exact: true }).click()
  await page.getByText('Lỗi danh sách công nợ kiểm thử.', { exact: true }).first().waitFor()
  check('API error visible', true)
  mode = 'many'
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByRole('tab', { name: 'Công nợ khách hàng', exact: true }).click()
  await ready()
  await customers().getByRole('button', { name: 'Chi tiết công nợ', exact: true }).first().click()
  await debtModal().locator('.customer-debt-total strong').waitFor()
  failPayment = 'exceeds'
  await debtModal().getByRole('button', { name: 'Thu tiền', exact: true }).first().click()
  await collectModal().locator('#collection-amount').fill('175428572')
  await collectModal().locator('#collection-note').fill('Giữ biểu mẫu khi tải lại công nợ')
  const beforeConflict = [listCalls().length, debtCalls().length]
  await collectModal().getByRole('button', { name: 'Ghi nhận thu tiền', exact: true }).click()
  await ready(debtModal().locator('.receivable-orders'))
  check(
    'business error refresh preserves nested collection form',
    (await collectModal().isVisible()) &&
      (await collectModal().locator('#collection-note').inputValue()) ===
        'Giữ biểu mẫu khi tải lại công nợ',
  )
  check(
    'business error refreshes detail and list once',
    listCalls().length === beforeConflict[0] + 1 && debtCalls().length === beforeConflict[1] + 1,
  )
  failPayment = false
  const beforeCustomerPay = [listCalls().length, debtCalls().length]
  await collectModal().getByRole('button', { name: 'Ghi nhận thu tiền', exact: true }).click()
  await collectModal().waitFor({ state: 'hidden' })
  await ready(debtModal().locator('.receivable-orders'))
  check(
    'customer collection refreshes backend total and both lists once',
    listCalls().length === beforeCustomerPay[0] + 1 &&
      debtCalls().length === beforeCustomerPay[1] + 1 &&
      (await debtModal().locator('.customer-debt-total strong').innerText()) === '0 VND',
  )
  await closeDebt()
  paid = false
  profile = 'readonly'
  await page.reload()
  await ready()
  await customers().getByRole('button', { name: 'Chi tiết công nợ', exact: true }).first().click()
  await debtModal().locator('.customer-debt-total strong').waitFor()
  check(
    'receivable-only user can view detail but cannot collect',
    (await debtModal().getByRole('button', { name: 'Thu tiền', exact: true }).count()) === 0,
  )
  await closeDebt()
  check('no unauthorized catalog/customer/order lookup', unexpected.length === 0)
  profile = 'admin'
  await page.reload()
  await ready()
  await page.getByRole('tab', { name: 'Đơn khách lẻ chưa thanh toán', exact: true }).click()
  await ready(walkin())
  check(
    'verified ADMIN exception still allows collection',
    (await walkin().getByRole('button', { name: 'Thu tiền', exact: true }).count()) > 0,
  )
  check('no runtime or observer errors', errors.length === 0)
} catch (error) {
  failure = error
  await page.screenshot({ path: join(artifacts, 'failure.png'), fullPage: true }).catch(() => {})
} finally {
  await writeFile(
    join(artifacts, 'results.json'),
    JSON.stringify(
      { checks, measurements, calls, errors, unexpected, failure: failure?.stack },
      null,
      2,
    ),
  )
  await browser.close()
}
console.log(
  JSON.stringify(
    { passed: checks.length, artifacts, errors, unexpected, failure: failure?.message },
    null,
    2,
  ),
)
if (failure) throw failure
