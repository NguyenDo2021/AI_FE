// Controlled fixtures only: every API request is intercepted; no real transaction is sent.
import assert from 'node:assert/strict'
import process from 'node:process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const { chromium } = await import(
  pathToFileURL(
    process.env.PLAYWRIGHT_MODULE ||
      join(process.env.TEMP, 'codex-stocktake-browser/node_modules/playwright/index.mjs'),
  ).href
)
const artifacts = join(process.env.TEMP, 'codex-returns-refunds-artifacts')
await mkdir(artifacts, { recursive: true })
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  ignoreDefaultArgs: ['--hide-scrollbars'],
})
const context = await browser.newContext({
  viewport: { width: 1366, height: 900 },
  reducedMotion: 'reduce',
  timezoneId: 'Asia/Saigon',
})
context.setDefaultTimeout(12000)
await context.addInitScript(() =>
  localStorage.setItem('frontend-base:access-token', 'returns-ui-test'),
)
const calls = [],
  errors = [],
  unexpected = [],
  checks = [],
  measurements = []
let profile = 'full',
  listMode = 'many',
  failWrite = false
let paymentCount = 2
const permissions = [
  'SALES_RETURN_VIEW',
  'SALES_RETURN_CREATE',
  'SALES_RETURN_UPDATE',
  'SALES_RETURN_CONFIRM',
  'SALES_RETURN_CANCEL',
  'REFUND_VIEW',
  'REFUND_CREATE',
  'REFUND_CANCEL',
  'SALES_ORDER_VIEW',
  'PAYMENT_VIEW',
]
const sourceId = '11111111-1111-4111-8111-111111111111'
const product = {
  productId: 'p1',
  productCode: 'PHAO-01',
  productName: 'Phào sóng ốp tường',
  unit: 'cây',
  soldQuantity: 100,
  returnedQuantity: 0,
  returnableQuantity: 100,
  lineTotal: 39900000,
  allocatedDiscountAmount: 0,
  netLineAmount: 39900000,
}
const source = {
  id: sourceId,
  code: 'BH-001',
  warehouseId: 'w1',
  warehouseName: 'Kho Thanh Chương',
  customerName: 'Nguyễn Văn An',
  saleDate: '2026-10-27',
  totalAmount: 39900000,
}
const summary = {
  salesOrderId: sourceId,
  code: 'BH-001',
  warehouseId: 'w1',
  customerId: 'customer-uuid',
  customerSnapshot: { name: 'Nguyễn Văn An', code: 'KH-001' },
  saleDate: '2026-10-27',
  status: 'CONFIRMED',
  totalAmount: 39900000,
  returnedAmount: 35910000,
  adjustedTotalAmount: 3990000,
  paidAmount: 9000000,
  refundedAmount: 0,
  netPaidAmount: 9000000,
  remainingAmount: 0,
  refundableAmount: 5010000,
  paymentStatus: 'PAID',
}
let savedReturn = {
  id: 'r0',
  code: 'TH-0001',
  salesOrderId: sourceId,
  warehouseId: 'w1',
  customerId: 'customer-uuid',
  returnDate: '2026-10-27',
  reason: 'Khách trả hàng',
  note: 'Ghi chú được giữ nguyên',
  status: 'DRAFT',
  totalAmount: 35910000,
  version: 1,
  createdBy: 'creator-uuid',
  createdAt: '2026-10-27T02:00:00Z',
  updatedBy: 'creator-uuid',
  updatedAt: '2026-10-27T02:00:00Z',
  lines: [{ ...product, quantity: 90, returnAmount: 35910000 }],
}
let savedRefund = {
  id: 'h0',
  code: 'HT-0001',
  salesOrderId: sourceId,
  warehouseId: 'w1',
  customerId: 'customer-uuid',
  amount: 5010000,
  refundDate: '2026-10-27',
  method: 'CASH',
  reference: null,
  reason: 'Hoàn tiền hàng trả',
  note: null,
  status: 'ACTIVE',
  createdBy: 'creator-uuid',
  createdAt: '2026-10-27T02:00:00Z',
}
const refundRow = (n) => ({
  ...savedRefund,
  id: 'h' + n,
  code: n === 0 ? 'HT-0001' : 'HT-' + n + '-' + 'long-code-'.repeat(10),
  reason: 'Lý do dài '.repeat(40),
  amount: n === 1 ? 9223372036854775807n : 5010000,
})
const returnRow = (n) =>
  n === 0
    ? savedReturn
    : { ...savedReturn, id: 'r' + n, code: 'TH-' + n + '-' + 'long-code-'.repeat(10) }
const json = (data) =>
  JSON.stringify(data, (_key, value) =>
    typeof value === 'bigint' ? '__int64_' + value : value,
  ).replace(/"__int64_(-?\d+)"/g, '$1')
await context.route('**/*', async (route) => {
  const request = route.request(),
    url = new URL(request.url())
  if (!['fetch', 'xhr'].includes(request.resourceType())) return route.continue()
  const path = url.pathname.replace(/^\/api/, ''),
    method = request.method(),
    params = Object.fromEntries(url.searchParams)
  calls.push({ path, method, params, raw: request.postData() })
  const reply = (data, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: json(data) })
  if (path === '/auth/me')
    return reply({
      id: 'returns-ui',
      username: 'test',
      fullName: 'Kiểm thử trả hoàn',
      permissions: profile === 'full' ? permissions : ['SALES_RETURN_VIEW', 'REFUND_VIEW'],
    })
  if (path === '/users/returns-ui') return reply({ id: 'returns-ui', status: 1 })
  if (path === '/users/returns-ui/roles') return reply([])
  if (path === '/users/me/warehouses')
    return reply([{ id: 'w1', code: 'TC', name: 'Kho Thanh Chương', status: 1 }])
  if (path === '/sales-orders/returnable-orders')
    return reply({ items: [source], total: 1, page: 1, pageSize: 10 })
  if (path === '/sales-orders/' + sourceId + '/returnable-lines') return reply([product])
  if (['/sales-returns', '/refundables', '/refunds'].includes(path) && method === 'GET') {
    if (listMode === 'error') return reply({ message: 'Lỗi danh sách kiểm thử' }, 500)
    const page = Number(params.page),
      pageSize = Number(params.pageSize),
      total = listMode === 'empty' ? 0 : 137
    return reply({
      items: Array.from(
        { length: Math.max(0, Math.min(pageSize, total - (page - 1) * pageSize)) },
        (_, i) => {
          const n = (page - 1) * pageSize + i
          return path === '/sales-returns'
            ? returnRow(n)
            : path === '/refunds'
              ? refundRow(n)
              : { ...summary, salesOrderId: n === 0 ? sourceId : 'order-' + n, code: 'BH-' + n }
        },
      ),
      total,
      page,
      pageSize,
    })
  }
  if (path === '/sales-returns' && method === 'POST') {
    const input = request.postDataJSON()
    savedReturn = {
      ...savedReturn,
      ...input,
      id: 'r0',
      lines: [{ ...product, quantity: input.lines[0].quantity, returnAmount: 35910000 }],
    }
    return reply(savedReturn)
  }
  if (/^\/sales-returns\/r\d+$/.test(path)) {
    if (method === 'PUT') {
      const input = request.postDataJSON()
      savedReturn = {
        ...savedReturn,
        ...input,
        lines: [{ ...product, quantity: input.lines[0].quantity, returnAmount: 35910000 }],
        version: savedReturn.version + 1,
      }
    }
    return reply(savedReturn)
  }
  if (path === '/sales-returns/r0/confirm' || path === '/sales-returns/r0/cancel') {
    savedReturn = {
      ...savedReturn,
      status: path.endsWith('confirm') ? 'CONFIRMED' : 'CANCELLED',
      version: savedReturn.version + 1,
    }
    return reply(savedReturn)
  }
  if (path === '/sales-orders/' + sourceId + '/refunds') {
    if (failWrite)
      return reply(
        { message: 'Khoản cần hoàn đã thay đổi', code: 'REFUND_EXCEEDS_REFUNDABLE' },
        400,
      )
    Object.assign(summary, { refundedAmount: 5010000, netPaidAmount: 3990000, refundableAmount: 0 })
    return reply({ refund: savedRefund, order: summary })
  }
  if (/^\/refunds\/h\d+$/.test(path)) return reply(savedRefund)
  if (path === '/refunds/h0/cancel') {
    if (failWrite) return reply({ message: 'Từ chối hủy kiểm thử', code: 'INVALID_REQUEST' }, 400)
    savedRefund = {
      ...savedRefund,
      status: 'CANCELLED',
      cancelledAt: '2026-10-27T03:00:00Z',
      cancelledBy: 'cancel-user',
      cancellationReason: request.postDataJSON().reason,
    }
    Object.assign(summary, { refundedAmount: 0, netPaidAmount: 9000000, refundableAmount: 5010000 })
    return reply({ refund: savedRefund, order: summary })
  }
  if (path === '/sales-orders/' + sourceId)
    return reply({
      ...summary,
      id: sourceId,
      subtotal: 39900000,
      discountAmount: 0,
      version: 7,
      lines: [{ ...product, quantity: 100, unitPrice: 399000, lineTotal: 39900000 }],
      createdBy: 'creator',
      createdAt: '2026-10-27T02:00:00Z',
      updatedAt: '2026-10-27T02:00:00Z',
    })
  if (path === '/sales-orders/' + sourceId + '/payments')
    return reply({
      items: Array.from({ length: Math.min(paymentCount, Number(params.pageSize)) }, (_, n) => ({
        id: 'p' + n,
        code: 'PT-' + n + '-' + 'long-code-'.repeat(8),
        salesOrderId: sourceId,
        warehouseId: 'w1',
        customerId: 'customer-uuid',
        amount: n === 0 ? 300000000 : 30000000,
        paymentDate: '2026-10-27',
        method: 'BANK_TRANSFER',
        status: 'ACTIVE',
        createdBy: 'creator-uuid',
        createdAt: '2026-10-27T02:00:00Z',
      })),
      total: paymentCount,
      page: Number(params.page),
      pageSize: Number(params.pageSize),
    })
  unexpected.push({ path, method })
  return reply({ message: 'Unexpected fixture request' }, 403)
})
const page = await context.newPage()
page.on('pageerror', (error) => errors.push(error.message))
const base = process.env.RETURNS_TEST_URL || 'http://127.0.0.1:5173'
const check = (name, condition) => {
  assert.ok(condition, name)
  checks.push(name)
}
const list = () => page.locator('.rr-list')
const modal = () => page.locator('.return-refund-dialog:visible')
const ready = async () => {
  await list().waitFor()
  await page.locator('.rr-list .ant-table-tbody tr.ant-table-row').first().waitFor()
  await page.waitForTimeout(150)
}
const visit = async (path) => {
  await page.goto(base + path)
  await ready()
}
const close = async () => {
  await modal().getByRole('button', { name: 'Đóng', exact: true }).click()
  await modal().waitFor({ state: 'hidden' })
}
const geometry = async (label) => {
  await page.waitForTimeout(200)
  const measure = await page.evaluate(() => {
    const body = document.querySelector('.rr-list .ant-table-body'),
      footer = document.querySelector('.rr-pagination'),
      actions = document.querySelector('.rr-list tbody .ant-table-cell-fix-right')
    const rect = (element) => {
      const b = element.getBoundingClientRect()
      return { x: b.x, y: b.y, width: b.width, height: b.height, bottom: b.bottom, right: b.right }
    }
    return {
      viewport: { width: innerWidth, height: innerHeight },
      pageWidth: document.documentElement.scrollWidth,
      body: rect(body),
      footer: rect(footer),
      actions: rect(actions),
      scroll: {
        width: body.scrollWidth,
        height: body.scrollHeight,
        clientWidth: body.clientWidth,
        clientHeight: body.clientHeight,
      },
    }
  })
  measurements.push({ label, ...measure })
  check(label + ': no horizontal page overflow', measure.pageWidth <= measure.viewport.width + 1)
  check(label + ': pagination visible', measure.footer.bottom <= measure.viewport.height + 1)
  check(label + ': table scrolls horizontally', measure.scroll.width > measure.scroll.clientWidth)
  check(label + ': action cell stays within table', measure.actions.right <= measure.body.right + 2)
}
let failure
try {
  for (const [path, endpoint] of [
    ['/sales/returns', '/sales-returns'],
    ['/sales/refundables', '/refundables'],
    ['/sales/refunds', '/refunds'],
  ]) {
    await visit(path)
    await geometry(endpoint + ' desktop')
    const count = () => calls.filter((c) => c.path === endpoint && c.method === 'GET').length
    for (const size of [20, 50, 100, 10]) {
      const before = count()
      await page.locator('.rr-page-size').click()
      await page
        .locator('.ant-select-dropdown:visible')
        .getByText(size + ' / trang', { exact: true })
        .click()
      await page.waitForTimeout(250)
      check(endpoint + ': one API call for pageSize ' + size, count() === before + 1)
      check(
        endpoint + ': correct server pageSize ' + size,
        calls.filter((c) => c.path === endpoint).at(-1).params.pageSize === String(size),
      )
    }
    const before = count()
    await page.getByRole('button', { name: 'Trang sau', exact: true }).click()
    await page.waitForTimeout(200)
    check(endpoint + ': one API call for next page', count() === before + 1)
    await page.getByRole('button', { name: 'Trang trước', exact: true }).click()
    await page.waitForTimeout(200)
    for (const [width, height] of [
      [768, 1024],
      [390, 844],
      [1366, 500],
    ]) {
      const prior = count()
      await page.setViewportSize({ width, height })
      await geometry(endpoint + ' ' + width + 'x' + height)
      check(endpoint + ': resize makes no API request ' + width, count() === prior)
    }
    await page.setViewportSize({ width: 1366, height: 900 })
    await page.screenshot({ path: join(artifacts, endpoint.slice(1) + '.png') })
  }
  await visit('/sales/returns')
  await page.getByRole('button', { name: /Tạo phiếu trả/ }).click()
  await modal().getByRole('combobox').first().fill('BH-001')
  await page.locator('.ant-select-dropdown:visible').getByText('BH-001', { exact: true }).click()
  await modal().getByLabel('Lý do', { exact: true }).fill('Khách trả hàng')
  await modal().getByLabel('Số cây muốn trả: Phào sóng ốp tường').fill('90')
  await modal().getByRole('button', { name: 'Cập nhật hạn mức, giữ bản nhập' }).click()
  check(
    'refresh limits keeps entered quantity',
    (await modal().getByLabel('Số cây muốn trả: Phào sóng ốp tường').inputValue()) === '90',
  )
  await modal().getByRole('button', { name: 'Lưu phiếu trả nháp' }).click()
  await modal().getByText('Giá trị trả dự kiến', { exact: true }).waitFor()
  check(
    'return creation sends UUID',
    JSON.parse(calls.find((c) => c.path === '/sales-returns' && c.method === 'POST').raw)
      .salesOrderId === sourceId,
  )
  check(
    'receive confirmation is initially disabled',
    await modal().getByRole('button', { name: 'Xác nhận nhận hàng' }).isDisabled(),
  )
  await modal().getByRole('button', { name: 'Sửa nháp', exact: true }).click()
  await modal().getByLabel('Số cây muốn trả: Phào sóng ốp tường').fill('89')
  await modal().getByRole('button', { name: 'Lưu phiếu trả nháp' }).click()
  await modal().getByText('Giá trị trả dự kiến', { exact: true }).waitFor()
  await page.screenshot({ path: join(artifacts, 'return-detail.png') })
  await modal().getByRole('checkbox').check()
  await modal().getByRole('button', { name: 'Xác nhận nhận hàng' }).click()
  await modal().getByText('Giá trị trả đã xác nhận', { exact: true }).waitFor()
  await close()
  await visit('/sales/refundables')
  await list().getByRole('button', { name: 'Hoàn tiền', exact: true }).first().click()
  check(
    'refund starts empty and unchecked',
    (await modal().getByLabel('Số tiền hoàn (VND)', { exact: true }).inputValue()) === '' &&
      !(await modal().getByRole('checkbox').isChecked()),
  )
  await modal().getByRole('button', { name: 'Điền khoản cần hoàn' }).click()
  await modal().getByLabel('Lý do', { exact: true }).fill('Hoàn tiền hàng trả')
  await modal().getByRole('checkbox').check()
  await page.screenshot({ path: join(artifacts, 'refund-form.png') })
  await page.setViewportSize({ width: 390, height: 600 })
  const submitBounds = await modal()
    .getByRole('button', { name: 'Ghi nhận khoản đã chi' })
    .boundingBox()
  check(
    'refund footer accessible on mobile',
    submitBounds && submitBounds.y + submitBounds.height <= 600,
  )
  await modal().getByRole('button', { name: 'Ghi nhận khoản đã chi' }).click()
  await modal().waitFor({ state: 'hidden' })
  await page.setViewportSize({ width: 1366, height: 900 })
  await visit('/sales/refunds')
  await list().getByRole('button', { name: 'Chi tiết / xử lý' }).first().click()
  await modal().getByText('Thông tin định danh', { exact: true }).click()
  await modal().locator('.rr-identifiers[open]').waitFor()
  await page.screenshot({ path: join(artifacts, 'refund-detail.png') })
  await modal().getByRole('button', { name: 'Hủy ghi nhận sai' }).click()
  await modal()
    .getByText('Chỉ đảo ghi nhận hoàn tiền sai; không ghi nhận thu tiền từ khách.')
    .waitFor()
  check('only one visible modal during cancellation', (await modal().count()) === 1)
  await modal().getByRole('button', { name: 'Quay lại' }).click()
  check(
    'back retains expanded identifiers',
    (await modal().locator('.rr-identifiers[open]').count()) === 1,
  )
  await modal().getByRole('button', { name: 'Hủy ghi nhận sai' }).click()
  await modal().getByLabel('Lý do hủy', { exact: true }).fill('Ghi nhận trùng phiếu')
  failWrite = true
  await modal().getByRole('button', { name: 'Xác nhận hủy ghi nhận' }).click()
  await modal().locator('.ant-alert-error').waitFor()
  check(
    'failed cancellation keeps reason',
    (await modal().getByLabel('Lý do hủy', { exact: true }).inputValue()) ===
      'Ghi nhận trùng phiếu',
  )
  await page.screenshot({ path: join(artifacts, 'refund-cancel.png') })
  failWrite = false
  await modal().getByRole('button', { name: 'Xác nhận hủy ghi nhận' }).click()
  await modal().getByText('Thông tin hủy ghi nhận', { exact: true }).waitFor()
  check(
    'cancelled refund hides cancel action',
    (await modal().getByRole('button', { name: 'Hủy ghi nhận sai' }).count()) === 0,
  )
  await close()
  await list().getByRole('button', { name: 'Xem đơn', exact: true }).first().click()
  await page
    .locator('.sales-order-dialog:visible')
    .getByText('Thông tin đơn', { exact: true })
    .waitFor()
  check(
    'sales order reuses existing dialog',
    (await page.locator('.sales-order-dialog:visible').count()) === 1,
  )
  const salesDialog = page.locator('.sales-order-dialog:visible')
  const history = salesDialog.locator('.payment-history--embedded')
  await history.locator('tbody tr.ant-table-row').last().waitFor()
  for (const [width, height] of [
    [1883, 844],
    [1366, 900],
    [768, 1024],
    [390, 844],
    [1366, 500],
  ]) {
    await page.setViewportSize({ width, height })
    await history.scrollIntoViewIfNeeded()
    await page.waitForTimeout(200)
    const bounds = await history.evaluate((element) => {
      const box = (selector) => {
        const b = element.querySelector(selector).getBoundingClientRect()
        return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, height: b.height }
      }
      const body = element.querySelector('.ant-table-body')
      const dialog = element.closest('.ant-modal-content')
      return {
        filters: box('.payment-filters'),
        toolbar: box('.products-toolbar'),
        header: box('.ant-table-header'),
        tableBody: box('.ant-table-body'),
        lastRow: box('tbody tr.ant-table-row:last-child'),
        pagination: box('.products-footer'),
        panel: box('.payment-list-panel'),
        columnCount: element.querySelectorAll('.ant-table-thead th:not(.ant-table-cell-scrollbar)')
          .length,
        dialogWidth: dialog.clientWidth,
        dialogScrollWidth: dialog.scrollWidth,
        bodyWidth: body.clientWidth,
        bodyScrollWidth: body.scrollWidth,
      }
    })
    measurements.push({ label: 'embedded payments ' + width + 'x' + height, ...bounds })
    check(
      'embedded filters above history toolbar ' + width,
      bounds.filters.bottom <= bounds.toolbar.top + 1,
    )
    check(
      'embedded toolbar above table header ' + width,
      bounds.toolbar.bottom <= bounds.header.top + 1,
    )
    check(
      'embedded pagination below table body ' + width,
      bounds.tableBody.bottom <= bounds.pagination.top + 1,
    )
    check(
      'two payment rows have no large blank space ' + width,
      bounds.tableBody.bottom - bounds.lastRow.bottom < 45,
    )
    check(
      'both payment rows stay fully visible ' + width,
      bounds.lastRow.bottom <= bounds.tableBody.bottom + 1,
    )
    check('embedded history keeps all eight columns ' + width, bounds.columnCount === 8)
    check('embedded table scrolls horizontally ' + width, bounds.bodyScrollWidth > bounds.bodyWidth)
    check(
      'sales modal has no horizontal overflow ' + width,
      bounds.dialogScrollWidth <= bounds.dialogWidth + 1,
    )
    await page.screenshot({
      path: join(artifacts, 'order-payments-' + width + 'x' + height + '.png'),
    })
  }
  paymentCount = 10
  await history.locator('.products-toolbar').getByRole('button').click()
  await history.locator('tbody tr.ant-table-row').nth(9).waitFor()
  const manyRows = await history
    .locator('.ant-table-body')
    .evaluate((element) => ({ height: element.clientHeight, scrollHeight: element.scrollHeight }))
  check('many embedded payments scroll inside table', manyRows.scrollHeight > manyRows.height)
  check(
    'embedded history height stays bounded',
    (await history.locator('.payment-list-panel').boundingBox()).height <= 500,
  )
  paymentCount = 0
  await history.locator('.products-toolbar').getByRole('button').click()
  await history.getByText('Không có dữ liệu', { exact: true }).waitFor()
  check(
    'empty embedded history keeps pagination',
    await history.locator('.products-footer').isVisible(),
  )
  await page.setViewportSize({ width: 1366, height: 900 })
  await page
    .locator('.sales-order-dialog:visible')
    .getByRole('button', { name: 'Đóng', exact: true })
    .click()
  profile = 'viewer'
  await page.reload()
  await ready()
  check(
    'viewer cannot open sales order',
    (await list().getByRole('button', { name: 'Xem đơn' }).count()) === 0,
  )
  await list().getByRole('button', { name: 'Chi tiết / xử lý' }).first().click()
  check('viewer can inspect refund detail', (await modal().count()) === 1)
  check(
    'viewer cannot cancel',
    (await modal().getByRole('button', { name: 'Hủy ghi nhận sai' }).count()) === 0,
  )
  await close()
  listMode = 'empty'
  await page.getByRole('button', { name: 'Tải lại danh sách' }).click()
  await list().getByText('Không có dữ liệu.', { exact: true }).waitFor()
  listMode = 'error'
  await page.getByRole('button', { name: 'Tải lại danh sách' }).click()
  await page.locator('.rr-page > .ant-alert-error').waitFor()
  check('no unauthorized catalog or unexpected API', unexpected.length === 0)
  check('no browser runtime errors', errors.length === 0)
} catch (error) {
  failure = error
  await page.screenshot({ path: join(artifacts, 'failure.png'), fullPage: true })
} finally {
  await writeFile(
    join(artifacts, 'results.json'),
    JSON.stringify(
      { checks, measurements, errors, unexpected, calls, failure: failure?.message },
      null,
      2,
    ),
  )
  await browser.close()
}
if (failure) throw failure
console.log(JSON.stringify({ passed: checks.length, artifacts, errors, unexpected }, null, 2))
