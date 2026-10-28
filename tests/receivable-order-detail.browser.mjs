// Controlled fixtures only. All network mutations are intercepted.
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
const artifacts = join(process.env.TEMP, 'codex-receivable-order-detail-artifacts')
await mkdir(artifacts, { recursive: true })
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  ignoreDefaultArgs: ['--hide-scrollbars'],
})
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: 'reduce',
  timezoneId: 'Asia/Bangkok',
})
context.setDefaultTimeout(12000)
await context.addInitScript(() =>
  localStorage.setItem('frontend-base:access-token', 'order-detail-test'),
)
const calls = [],
  checks = [],
  errors = [],
  unexpected = [],
  measurements = []
let profile = 'full',
  historyMode = 'many',
  variant = 'partial',
  collectionDone = false,
  refundDone = false
const permissions = [
  'RECEIVABLE_VIEW',
  'PAYMENT_VIEW',
  'PAYMENT_CANCEL',
  'PAYMENT_CREATE',
  'SALES_RETURN_VIEW',
  'SALES_RETURN_CREATE',
  'REFUND_VIEW',
  'REFUND_CREATE',
]
const exactAmount = 9223372036854775807n
const warehouseId = '8504eda5-d866-4039-98be-e27-warehouse-uuid-long'
const makeOrder = (i = 0) => ({
  id: 's' + i,
  code: `BH-${i}-` + 'full-order-code-'.repeat(6),
  warehouseId,
  customerId: variant === 'customer' ? 'customer-uuid' : null,
  customerSnapshot:
    variant === 'customer' ? { name: 'Nguyễn Văn An với tên khách rất dài '.repeat(3) } : null,
  saleDate: '2026-10-19',
  status: variant === 'draft' ? 'DRAFT' : 'CONFIRMED',
  note: 'Ghi chú dài giữ đầy đủ nội dung\n'.repeat(6),
  createdAt: '2026-10-19T02:00:00Z',
  createdBy: 'creator-full-uuid',
  confirmedAt: '2026-10-19T03:00:00Z',
  confirmedBy: 'confirm-full-uuid',
  updatedAt: '2026-10-19T04:00:00Z',
  subtotal: 9600000,
  discountAmount: 0,
  totalAmount: 9600000,
  returnedAmount: 1000000,
  adjustedTotalAmount: 8600000,
  paidAmount: collectionDone ? 8600000 : 5600000,
  refundedAmount: refundDone ? 2600000 : 600000,
  netPaidAmount: collectionDone ? 8000000 : 5000000,
  remainingAmount:
    collectionDone || variant === 'paid' || variant === 'refundable'
      ? 0
      : variant === 'large'
        ? exactAmount
        : 3600000,
  refundableAmount: variant === 'refundable' && !refundDone ? 2000000 : 0,
  paymentStatus:
    collectionDone || variant === 'paid' || variant === 'refundable'
      ? 'PAID'
      : variant === 'unpaid'
        ? 'UNPAID'
        : 'PARTIALLY_PAID',
  version: 1,
  lines: Array.from({ length: variant === 'short' ? 1 : 12 }, (_, n) => ({
    productId: 'product' + n,
    productCode: 'SP-' + n + '-'.repeat(40),
    productName: 'Thanh đà gỗ nhựa với tên sản phẩm dài '.repeat(4),
    quantity: 100,
    unitPrice: 96000,
    lineTotal: 9600000,
    unit: 'cây',
  })),
})
const payment = (i = 0) => ({
  id: 'p' + i,
  code: 'PT-' + i,
  warehouseId,
  salesOrderId: 's0',
  customerId: null,
  amount: 5600000,
  paymentDate: '2026-10-19',
  method: 'CASH',
  status: 'ACTIVE',
  createdAt: '2026-10-19T03:00:00Z',
  createdBy: 'u1',
  note: 'Ghi chú phiếu thu',
  reference: 'REF',
})
const json = (data) =>
  JSON.stringify(data, (_key, value) =>
    typeof value === 'bigint' ? '__int64_' + value : value,
  ).replace(/"__int64_(\d+)"/g, '$1')
await context.route('**/api/**', async (route) => {
  const req = route.request(),
    url = new URL(req.url()),
    path = url.pathname.replace(/^\/api/, ''),
    method = req.method(),
    params = Object.fromEntries(url.searchParams)
  if (!url.pathname.startsWith('/api/')) return route.continue()
  calls.push({ path, method, params, raw: req.postData() })
  const reply = (data, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: json(data) })
  if (path === '/auth/me')
    return reply({
      id: 'order-detail-test',
      username: 'test',
      permissions: profile === 'full' ? permissions : ['RECEIVABLE_VIEW'],
    })
  if (path === '/users/order-detail-test') return reply({ id: 'order-detail-test', status: 1 })
  if (path === '/users/order-detail-test/roles') return reply([])
  if (path === '/users/me/warehouses')
    return reply([{ id: warehouseId, code: 'KHO_01', name: 'Kho Thanh Chương', status: 1 }])
  if (path === '/receivables')
    return reply({
      items: [],
      total: 0,
      page: Number(params.page),
      pageSize: Number(params.pageSize),
    })
  if (path === '/receivables/walk-in-orders')
    return reply({
      items: [makeOrder()],
      total: 1,
      page: Number(params.page),
      pageSize: Number(params.pageSize),
    })
  if (path === '/sales-orders/s0/payments' && method === 'GET') {
    if (historyMode === 'error')
      return reply({ message: 'Lỗi tải lịch sử phiếu thu kiểm thử.' }, 500)
    const page = Number(params.page),
      pageSize = Number(params.pageSize),
      total = historyMode === 'empty' ? 0 : 21
    return reply({
      items: Array.from(
        { length: Math.min(pageSize, Math.max(0, total - (page - 1) * pageSize)) },
        (_, n) => payment(n + (page - 1) * pageSize),
      ),
      total,
      page,
      pageSize,
    })
  }
  if (path === '/sales-orders/s0/payments' && method === 'POST') {
    collectionDone = true
    return reply({ payment: payment(22), order: { ...makeOrder(), salesOrderId: 's0' } })
  }
  if (path === '/sales-orders/s0/refunds' && method === 'POST') {
    refundDone = true
    return reply({
      refund: { id: 'rf1', code: 'HT-001', status: 'ACTIVE' },
      order: { ...makeOrder(), salesOrderId: 's0' },
    })
  }
  if (path === '/sales-orders/s0/returnable-lines')
    return reply(
      makeOrder().lines.map((line) => ({
        ...line,
        soldQuantity: 100,
        returnedQuantity: 0,
        returnableQuantity: 100,
        allocatedDiscountAmount: 0,
        netLineAmount: 9600000,
      })),
    )
  if (/^\/payments\/p\d+$/.test(path)) return reply(payment(Number(path.slice(11))))
  if (/^\/payments\/p\d+\/print$/.test(path))
    return reply({ message: 'Không thể tải PDF kiểm thử.' }, 500)
  if (path === '/refunds')
    return reply({
      items: [],
      total: 0,
      page: Number(params.page),
      pageSize: Number(params.pageSize),
    })
  unexpected.push({ path, method })
  return reply({ message: 'Unexpected API blocked by fixture.' }, 403)
})
const page = await context.newPage()
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (message) => {
  if (
    /Unhandled|Failed to resolve component|ResizeObserver loop|Extraneous non-props/.test(
      message.text(),
    )
  )
    errors.push(message.text())
})
const modal = () => page.locator('.receivable-order-dialog:visible')
const history = () => modal().locator('.payment-history')
const check = (name, value) => {
  assert.ok(value, name)
  checks.push(name)
}
const settle = () => page.waitForTimeout(300)
const waitHistory = async () => {
  await history().locator('[aria-busy="false"]').waitFor()
  await settle()
}
const open = async () => {
  await page.locator('.receivables-page > .receivable-orders [aria-busy="false"]').waitFor()
  await page
    .locator('.receivables-page > .receivable-orders')
    .getByRole('button', { name: 'Chi tiết đơn bán hàng', exact: true })
    .first()
    .click()
  await modal().waitFor()
  await settle()
  if (profile === 'full') await waitHistory()
}
const close = async () => {
  await modal().getByRole('button', { name: 'Đóng', exact: true }).click()
  await modal().waitFor({ state: 'hidden' })
}
const reloadOrder = async () => {
  await close()
  await page
    .locator('.receivables-page > .receivable-orders')
    .getByRole('button', { name: 'Tải lại', exact: true })
    .click()
  await open()
}
const geometry = async () =>
  modal().evaluate((el) => {
    const content = el.querySelector('.ant-modal-content'),
      body = el.querySelector('.ant-modal-body'),
      header = el.querySelector('.ant-modal-header'),
      footer = el.querySelector('.ant-modal-footer')
    const rect = (node) => {
      const r = node.getBoundingClientRect()
      return {
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      }
    }
    return {
      viewport: [innerWidth, innerHeight],
      content: rect(content),
      body: rect(body),
      header: rect(header),
      footer: rect(footer),
      scrollWidth: body.scrollWidth,
      clientWidth: body.clientWidth,
      scrollHeight: body.scrollHeight,
      clientHeight: body.clientHeight,
      identity: rect(el.querySelector('.debt-order-identity')),
      remaining: rect(el.querySelector('.debt-order-remaining')),
      metricColumns: getComputedStyle(
        el.querySelector('.settlement-grid'),
      ).gridTemplateColumns.split(' ').length,
      nestedScrolls: [...body.querySelectorAll('*')]
        .filter(
          (node) =>
            ['auto', 'scroll'].includes(getComputedStyle(node).overflowY) &&
            node.scrollHeight > node.clientHeight + 2,
        )
        .map((node) => node.className),
      productColumns: el.querySelectorAll('.debt-order-products th').length,
      historyColumns: el.querySelectorAll('.payment-history th').length,
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    }
  })
let failure
try {
  await page.goto(
    (process.env.RECEIVABLES_TEST_URL || 'http://127.0.0.1:5178') + '/sales/receivables',
  )
  await page.getByRole('tab', { name: 'Đơn khách lẻ chưa thanh toán', exact: true }).click()
  await open()
  check(
    'summary uses walk-in fallback and payment status',
    (await modal().locator('.debt-order-customer-row').innerText()).includes('Khách lẻ') &&
      (await modal().locator('.debt-order-customer-row').innerText()).includes(
        'Thanh toán một phần',
      ),
  )
  check(
    'remaining uses backend adjusted metric',
    (await modal().locator('.debt-order-remaining strong').innerText()).replace(/\D/g, '') ===
      '3600000',
  )
  check(
    'all 8 settlement metrics remain',
    (await modal().locator('.settlement-grid > div').count()) === 8,
  )
  check(
    'products are not paginated',
    (await modal().locator('.debt-order-products .ant-table-row').count()) === 12 &&
      (await modal().locator('.debt-order-products .ant-pagination').count()) === 0,
  )
  const beforeAudit = calls.length
  await modal().locator('.debt-order-audit summary').click()
  check(
    'audit expands without API',
    calls.length === beforeAudit &&
      (await modal().locator('.debt-order-audit').getAttribute('open')) !== null,
  )
  check(
    'full identifiers and audit retained',
    (await modal().locator('.debt-order-audit').innerText()).includes('creator-full-uuid') &&
      (await modal().locator('.debt-order-audit').innerText()).includes(makeOrder().code),
  )
  await modal().locator('.debt-order-audit summary').press('Enter')
  check(
    'audit keyboard collapse',
    (await modal().locator('.debt-order-audit').getAttribute('open')) === null,
  )
  for (const width of [320, 375, 390, 414, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await settle()
    const beforeResize = calls.length,
      g = await geometry()
    measurements.push(g)
    check(
      `modal bounds ${width}`,
      g.content.left >= 0 &&
        g.content.right <= width + 1 &&
        g.content.top >= 0 &&
        g.content.bottom <= 900,
    )
    check(
      `no modal/page horizontal overflow ${width}`,
      g.scrollWidth <= g.clientWidth + 1 && g.pageWidth <= g.viewportWidth + 1,
    )
    check(
      `fixed header and footer ${width}`,
      g.header.bottom <= g.body.top + 1 && g.footer.top >= g.body.bottom - 1,
    )
    check(
      `single modal body vertical scroll ${width}`,
      g.scrollHeight > g.clientHeight && g.nestedScrolls.length === 0,
    )
    check(`all product/history columns ${width}`, g.productColumns === 5 && g.historyColumns >= 8)
    if (width < 768)
      check(
        `mobile stacked summary and metrics ${width}`,
        g.remaining.top >= g.identity.bottom && g.metricColumns === 1,
      )
    check(`resize has no requests ${width}`, calls.length === beforeResize)
    await modal()
      .locator('.ant-modal-body')
      .evaluate((el) => {
        el.scrollTop = 0
      })
    await page.screenshot({ path: join(artifacts, `order-${width}.png`), fullPage: true })
  }
  for (const [width, height] of [
    [768, 375],
    [390, 350],
    [1024, 430],
  ]) {
    await page.setViewportSize({ width, height })
    await settle()
    const g = await geometry()
    measurements.push(g)
    check(
      `short/landscape ${width}x${height}`,
      g.content.bottom <= height + 1 &&
        g.footer.height >= 50 &&
        g.body.height > 0 &&
        g.scrollWidth <= g.clientWidth + 1,
    )
  }
  // A 1440x900 display at 150% browser zoom has a 960x600 CSS viewport.
  await page.setViewportSize({ width: 960, height: 600 })
  await settle()
  const zoom = await geometry()
  check(
    '150% zoom equivalent CSS viewport',
    zoom.content.bottom <= 600 && zoom.scrollWidth <= zoom.clientWidth + 1,
  )
  await page.setViewportSize({ width: 1440, height: 1000 })
  await settle()
  await history().locator('#payment-filter-status-s0').click()
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: /^Đã hủy$/ })
    .click()
  await waitHistory()
  check(
    'history status filter retains supported query',
    calls.filter((call) => call.path === '/sales-orders/s0/payments').at(-1).params.status ===
      'CANCELLED',
  )
  await history().getByRole('button', { name: 'Đặt lại', exact: true }).click()
  await waitHistory()
  await history().locator('.list-page-size').click()
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: /^20 \/ trang$/ })
    .click()
  await waitHistory()
  await history().locator('.ant-pagination-next button').click()
  await waitHistory()
  check(
    'history server pagination remains independent',
    calls.filter((call) => call.path === '/sales-orders/s0/payments').at(-1).params.page === '2',
  )
  check(
    'history action stays fixed right',
    await history()
      .locator('td.ant-table-cell-fix-right')
      .first()
      .evaluate((el) => getComputedStyle(el).position === 'sticky'),
  )
  const returnButton = modal()
    .locator('.order-payment-actions')
    .getByRole('button', { name: 'Trả hàng', exact: true })
  await returnButton.click()
  const returnModal = page.locator('.return-refund-dialog:visible')
  await returnModal.waitFor()
  await returnModal.getByRole('button', { name: 'Đóng', exact: true }).click()
  await returnModal.waitFor({ state: 'hidden' })
  await settle()
  check(
    'closing return restores action focus',
    await returnButton.evaluate((el) => el === document.activeElement),
  )
  const collectButton = modal()
    .locator('.order-payment-actions')
    .getByRole('button', { name: 'Thu tiền', exact: true })
  await collectButton.click()
  await page
    .locator('.collect-payment-dialog:visible')
    .getByRole('button', { name: 'Đóng', exact: true })
    .click()
  await page.locator('.collect-payment-dialog:visible').waitFor({ state: 'hidden' })
  await settle()
  check(
    'closing collection restores action focus',
    await collectButton.evaluate((el) => el === document.activeElement),
  )
  check(
    'refund history link retains source order query',
    (
      await modal()
        .getByRole('link', { name: 'Lịch sử hoàn tiền', exact: true })
        .getAttribute('href')
    ).includes('salesOrderId=s0'),
  )
  await history().getByRole('button', { name: 'Chi tiết', exact: true }).first().click()
  await page.locator('.payment-detail-dialog:visible').waitFor()
  await page
    .locator('.payment-detail-dialog:visible')
    .getByRole('button', { name: 'Đóng', exact: true })
    .click()
  await page.locator('.payment-detail-dialog:visible').waitFor({ state: 'hidden' })
  check('payment history details reused', true)
  await history().getByRole('button', { name: 'Hủy ghi nhận sai', exact: true }).first().click()
  await page.locator('.payment-cancel-dialog:visible').waitFor()
  check('cancel action preserved', true)
  await page
    .locator('.payment-cancel-dialog:visible')
    .getByRole('button', { name: 'Quay lại', exact: true })
    .click()
  await history().getByRole('button', { name: 'Xem/in biên lai', exact: true }).first().click()
  await page.locator('.payment-receipt-dialog:visible').waitFor()
  await page.locator('.payment-receipt-dialog:visible .ant-alert-error').waitFor()
  check('receipt blob errors stay in existing viewer', true)
  await page
    .locator('.payment-receipt-dialog:visible')
    .getByRole('button', { name: 'Đóng', exact: true })
    .click()
  historyMode = 'empty'
  await history().getByRole('button', { name: 'Tải lại', exact: true }).click()
  await waitHistory()
  check(
    'empty history state preserved',
    (await history().locator('.ant-table-placeholder').count()) > 0,
  )
  historyMode = 'error'
  await history().getByRole('button', { name: 'Tải lại', exact: true }).click()
  await waitHistory()
  check(
    'backend history errors visible',
    (await history().innerText()).includes('Lỗi tải lịch sử phiếu thu kiểm thử.'),
  )
  historyMode = 'many'
  variant = 'customer'
  await reloadOrder()
  check(
    'customer snapshot displayed',
    (await modal().locator('.debt-order-customer').innerText()).includes('Nguyễn Văn An'),
  )
  variant = 'large'
  await reloadOrder()
  check(
    'int64 amount remains exact',
    (await modal().locator('.debt-order-remaining strong').innerText()).replace(/\D/g, '') ===
      String(exactAmount),
  )
  for (const [value, label] of [
    ['unpaid', 'Chưa thanh toán'],
    ['paid', 'Đã thanh toán'],
    ['draft', 'Không áp dụng'],
  ]) {
    variant = value
    await reloadOrder()
    check(
      `backend status ${value}`,
      (await modal().locator('.debt-order-customer-row').innerText()).includes(label),
    )
    if (value !== 'unpaid')
      check(
        `no collection in ${value}`,
        (await modal()
          .locator('.order-payment-actions')
          .getByRole('button', { name: 'Thu tiền', exact: true })
          .count()) === 0,
      )
  }
  variant = 'refundable'
  await reloadOrder()
  await modal()
    .locator('.order-payment-actions')
    .getByRole('button', { name: 'Hoàn tiền', exact: true })
    .click()
  await page.locator('.return-refund-dialog:visible').waitFor()
  check('refund action and form retained', true)
  await page.locator('.return-refund-dialog:visible #refund-amount').fill('2000000')
  await page
    .locator('.return-refund-dialog:visible #refund-reason')
    .fill('Đã chi trả lại cho khách')
  await page.locator('.return-refund-dialog:visible').getByRole('checkbox').check()
  await page
    .locator('.return-refund-dialog:visible')
    .getByRole('button', { name: 'Ghi nhận khoản đã chi', exact: true })
    .click()
  await page.locator('.return-refund-dialog:visible').waitFor({ state: 'hidden' })
  await waitHistory()
  check(
    'refund success keeps authoritative metrics and closes nested form',
    (await modal().locator('.settlement-grid').innerText()).includes('2.600.000') &&
      (await modal()
        .locator('.order-payment-actions')
        .getByRole('button', { name: 'Hoàn tiền', exact: true })
        .count()) === 0,
  )
  variant = 'partial'
  await reloadOrder()
  const beforePay = calls.filter(
    (call) => call.path === '/sales-orders/s0/payments' && call.method === 'GET',
  ).length
  await modal()
    .locator('.order-payment-actions')
    .getByRole('button', { name: 'Thu tiền', exact: true })
    .click()
  const collection = page.locator('.collect-payment-dialog:visible')
  await collection.locator('#collection-amount').fill('3600000')
  await collection.getByRole('button', { name: 'Ghi nhận thu tiền', exact: true }).click()
  await collection.waitFor({ state: 'hidden' })
  await waitHistory()
  check(
    'authoritative summary refresh after collection',
    (await modal().locator('.debt-order-remaining strong').innerText()).replace(/\D/g, '') === '0',
  )
  check(
    'payment history invalidates once',
    calls.filter((call) => call.path === '/sales-orders/s0/payments' && call.method === 'GET')
      .length ===
      beforePay + 1,
  )
  await close()
  check(
    'closing detail preserves walk-in tab',
    (await page
      .getByRole('tab', { name: 'Đơn khách lẻ chưa thanh toán', exact: true })
      .getAttribute('aria-selected')) === 'true',
  )
  collectionDone = false
  profile = 'readonly'
  await page.reload()
  await page.getByRole('tab', { name: 'Đơn khách lẻ chưa thanh toán', exact: true }).click()
  await open()
  check(
    'read-only cannot collect/return/refund or request history',
    (await modal().locator('.order-payment-actions .ant-btn').count()) === 0 &&
      (await modal().locator('.payment-history').count()) === 0,
  )
  check('no unexpected API or runtime errors', unexpected.length === 0 && errors.length === 0)
} catch (error) {
  failure = error
  await page.screenshot({ path: join(artifacts, 'failure.png'), fullPage: true }).catch(() => {})
} finally {
  await writeFile(
    join(artifacts, 'results.json'),
    JSON.stringify(
      { checks, calls, measurements, unexpected, errors, failure: failure?.stack },
      null,
      2,
    ),
  )
  await browser.close()
}
console.log(
  JSON.stringify(
    { passed: checks.length, artifacts, unexpected, errors, failure: failure?.message },
    null,
    2,
  ),
)
if (failure) throw failure
