// Controlled API fixtures only; never sends a request to a real backend.
import assert from 'node:assert/strict'
import process from 'node:process'
import { Buffer } from 'node:buffer'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const { chromium } = await import(
  pathToFileURL(join(process.env.TEMP, 'codex-dashboard-browser/node_modules/playwright/index.mjs'))
    .href
)
const artifacts = join(process.env.TEMP, 'codex-payments-artifacts')
await mkdir(artifacts, { recursive: true })
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  ignoreDefaultArgs: ['--hide-scrollbars'],
})
const context = await browser.newContext({
  viewport: { width: 1366, height: 900 },
  reducedMotion: 'reduce',
  timezoneId: 'Asia/Bangkok',
  acceptDownloads: true,
})
await context.addInitScript(() =>
  globalThis.localStorage?.setItem('frontend-base:access-token', 'payment-ui-test'),
)
const calls = [],
  checks = [],
  errors = [],
  unexpected = [],
  measurements = []
const overrides = new Map()
let listMode = 'many',
  pdfMode = 'valid',
  cancelMode = 'success',
  profile = 'full'
const json = (data) =>
  JSON.stringify(data, (_key, value) =>
    typeof value === 'bigint' ? '__int64_' + value : value,
  ).replace(/"__int64_(-?\d+)"/g, '$1')
const item = (n) => ({
  id: 'p' + n,
  code: 'PT-' + n + '-' + 'a744b5c36ca3424aa77fdb390ea0edce'.repeat(2),
  salesOrderId: 'sales-order-uuid-' + n + '-'.repeat(45),
  warehouseId: 'w1',
  customerId: n === 2 ? null : 'customer-uuid-' + 'c'.repeat(40),
  amount: n === 0 ? 9223372036854775807n : 10000000,
  paymentDate: '2026-10-27',
  method: n % 2 ? 'CASH' : 'BANK_TRANSFER',
  reference: 'Tham chiếu '.repeat(12),
  note: 'Ghi chú dài cần giữ nguyên nội dung và cho phép xuống dòng. '.repeat(15),
  status: n === 1 ? 'CANCELLED' : 'ACTIVE',
  createdBy: 'creator-uuid',
  createdAt: '2026-10-27T02:00:00Z',
  ...(n === 1
    ? {
        cancelledBy: 'cancel-user-uuid',
        cancelledAt: '2026-10-27T03:00:00Z',
        cancellationReason: 'Đã ghi nhận trùng phiếu thu.',
      }
    : {}),
  ...overrides.get('p' + n),
})
// A small valid PDF fixture is returned unchanged by the backend route.
const stream = 'BT /F1 18 Tf 40 350 Td (PAYMENT RECEIPT - BACKEND PDF FIXTURE) Tj ET'
const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 420] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  '<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream',
]
let pdf = '%PDF-1.4\n'
const offsets = [0]
for (const [i, object] of objects.entries()) {
  offsets.push(Buffer.byteLength(pdf))
  pdf += i + 1 + ' 0 obj\n' + object + '\nendobj\n'
}
const start = Buffer.byteLength(pdf)
pdf +=
  'xref\n0 6\n0000000000 65535 f \n' +
  offsets
    .slice(1)
    .map((offset) => String(offset).padStart(10, '0') + ' 00000 n \n')
    .join('') +
  'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' +
  start +
  '\n%%EOF'
await context.route('**/api/**', async (route) => {
  const request = route.request(),
    url = new URL(request.url()),
    path = url.pathname.replace(/^\/api/, ''),
    method = request.method(),
    params = Object.fromEntries(url.searchParams)
  if (!url.pathname.startsWith('/api/')) return route.continue()
  calls.push({
    path,
    method,
    params,
    raw: request.postData(),
    authorization: request.headers().authorization,
  })
  const reply = (data, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: json(data) })
  if (path === '/auth/me')
    return reply({
      id: 'payment-ui',
      username: 'test',
      fullName: 'Kiểm thử phiếu thu',
      permissions: profile === 'full' ? ['PAYMENT_VIEW', 'PAYMENT_CANCEL'] : ['PAYMENT_VIEW'],
    })
  if (path === '/users/payment-ui') return reply({ id: 'payment-ui', status: 1 })
  if (path === '/users/payment-ui/roles') return reply([])
  if (path === '/users/me/warehouses')
    return reply([
      { id: 'w1', code: 'HN', name: 'Kho Hà Nội với tên kho rất dài '.repeat(3), status: 1 },
    ])
  if (path === '/payments') {
    if (listMode === 'error') return reply({ message: 'Không thể tải phiếu thu kiểm thử.' }, 500)
    const total = listMode === 'empty' ? 0 : 137,
      page = Number(params.page),
      pageSize = Number(params.pageSize)
    return reply({
      items: Array.from(
        { length: Math.max(0, Math.min(pageSize, total - (page - 1) * pageSize)) },
        (_, i) => item((page - 1) * pageSize + i),
      ),
      total,
      page,
      pageSize,
    })
  }
  const match = path.match(/^\/payments\/p(\d+)(?:\/(print|cancel))?$/)
  if (match) {
    const n = Number(match[1]),
      action = match[2]
    if (action === 'print') {
      await new Promise((resolve) => setTimeout(resolve, 150))
      if (pdfMode === 'error')
        return reply({ code: 'PAYMENT_PDF_FAILED', message: 'Lỗi PDF kiểm thử' }, 500)
      return route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        headers: {
          'Content-Disposition': 'inline; filename="bien-lai-test.pdf"',
          'Access-Control-Expose-Headers': 'Content-Disposition',
        },
        body: Buffer.from(pdf),
      })
    }
    if (action === 'cancel') {
      await new Promise((resolve) => setTimeout(resolve, 500))
      if (cancelMode === 'error')
        return reply(
          {
            code: 'VALIDATION_ERROR',
            message: 'Lý do cần kiểm tra lại.',
            details: { reason: 'Lý do chưa hợp lệ từ backend.' },
          },
          400,
        )
      overrides.set('p' + n, {
        status: 'CANCELLED',
        cancellationReason: JSON.parse(request.postData()).reason,
        cancelledBy: 'payment-ui',
        cancelledAt: '2026-10-27T04:00:00Z',
      })
      return reply({
        payment: item(n),
        order: {
          salesOrderId: item(n).salesOrderId,
          totalAmount: 10000000,
          paidAmount: 0,
          remainingAmount: 10000000,
          paymentStatus: 'UNPAID',
        },
      })
    }
    return reply(item(n))
  }
  unexpected.push({ path, method })
  return reply({ message: 'Unexpected API denied by browser test.' }, 403)
})
const page = await context.newPage()
page.setDefaultTimeout(12000)
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => {
  if (/ResizeObserver loop|Unhandled|Failed to resolve component/.test(m.text()))
    errors.push(m.text())
})
const base = process.env.PAYMENTS_TEST_URL || 'http://127.0.0.1:5173'
const check = (name, condition = true) => {
  assert.ok(condition, name)
  checks.push(name)
}
const listCalls = () => calls.filter((call) => call.path === '/payments')
const printCalls = () => calls.filter((call) => call.path.endsWith('/print'))
const cancelCalls = () => calls.filter((call) => call.path.endsWith('/cancel'))
const ready = async () => {
  await page.locator('.payment-list-panel').waitFor()
  await page.waitForFunction(
    () => document.querySelector('.products-table-region')?.getAttribute('aria-busy') === 'false',
  )
  await page.waitForTimeout(200)
}
const modal = (kind) => page.locator('.payment-' + kind + '-dialog .ant-modal:visible')
const openAction = async (row, name) => {
  const target = page.locator('.payment-list-panel .ant-table-row').nth(row)
  if (await target.getByRole('button', { name: 'Thao tác phiếu thu', exact: true }).count()) {
    await target.getByRole('button', { name: 'Thao tác phiếu thu', exact: true }).click()
    await page.locator('.ant-dropdown:visible').getByRole('menuitem', { name, exact: true }).click()
  } else await target.getByRole('button', { name, exact: true }).click()
  await page.waitForTimeout(350)
}
const geometry = () =>
  page.evaluate(() => {
    const rect = (el) => {
      const r = el.getBoundingClientRect()
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width }
    }
    const body = document.querySelector('.payment-list-panel .ant-table-body')
    return {
      viewport: [innerWidth, innerHeight],
      pageWidth: document.documentElement.scrollWidth,
      pageHeight: document.documentElement.scrollHeight,
      body: rect(body),
      footer: rect(document.querySelector('.products-footer')),
      scrollWidth: body.scrollWidth,
      clientWidth: body.clientWidth,
      scrollHeight: body.scrollHeight,
      clientHeight: body.clientHeight,
      actions: rect(document.querySelector('.payment-list-panel .ant-table-row td:last-child')),
      headers: document.querySelectorAll(
        '.payment-list-panel .ant-table-header th:not(.ant-table-cell-scrollbar)',
      ).length,
    }
  })
const checkModal = async (kind) => {
  const m = await modal(kind).evaluate((el) => {
    const box = el.getBoundingClientRect(),
      footer = el.querySelector('.ant-modal-footer').getBoundingClientRect(),
      body = el.querySelector('.ant-modal-body')
    return {
      width: box.width,
      left: box.left,
      right: box.right,
      bottom: footer.bottom,
      vh: innerHeight,
      vw: innerWidth,
      bodyOverflow: body.scrollHeight > body.clientHeight,
      gridColumns: el.querySelector('.payment-info-grid')
        ? getComputedStyle(el.querySelector('.payment-info-grid')).gridTemplateColumns.split(' ')
            .length
        : null,
    }
  })
  measurements.push({ kind, ...m })
  check(
    kind + ': modal fits width and footer remains accessible',
    m.left >= 0 && m.right <= m.vw + 1 && m.bottom <= m.vh + 1,
  )
  return m
}
const setSize = async (size) => {
  await page.locator('.list-page-size').click()
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: new RegExp('^' + size + '\\s*/') })
    .click()
  await ready()
}
let failure
try {
  await page.goto(base + '/sales/payments')
  await ready()
  check('Default server page size is 10', listCalls().at(-1).params.pageSize === '10')
  check(
    'Int64 amount stays exact',
    (await page.locator('.payment-money').first().innerText()).includes(
      '9.223.372.036.854.775.807',
    ),
  )
  check('Eight separate columns', (await geometry()).headers === 8)
  for (const size of [20, 50, 100, 10]) {
    const count = listCalls().length
    await setSize(size)
    check(
      'One server request when switching size ' + size,
      listCalls().length === count + 1 &&
        listCalls().at(-1).params.page === '1' &&
        listCalls().at(-1).params.pageSize === String(size),
    )
  }
  await page.locator('#payment-filter-order').fill('sales-source-uuid')
  await page.locator('#payment-filter-customer').fill('customer-filter-uuid')
  for (const id of ['payment-filter-from', 'payment-filter-to']) {
    await page.locator('#' + id).click()
    await page.locator('.ant-picker-dropdown:visible .ant-picker-today-btn').click()
  }
  const selectedDate = await page.locator('#payment-filter-from').inputValue()
  await ready()
  check(
    'UUID and inclusive date query unchanged',
    listCalls().at(-1).params.salesOrderId === 'sales-source-uuid' &&
      listCalls().at(-1).params.customerId === 'customer-filter-uuid' &&
      listCalls().at(-1).params.from === selectedDate &&
      listCalls().at(-1).params.to === selectedDate,
  )
  await page.getByRole('button', { name: 'Đặt lại', exact: true }).click()
  await ready()
  await page.locator('.ant-pagination-item-2').click()
  await ready()
  const previous = listCalls().length
  await openAction(0, 'Chi tiết')
  await modal('detail').locator('.payment-amount-summary').waitFor()
  check('Opening detail does not fetch PDF', printCalls().length === 0)
  await modal('detail').getByRole('button', { name: 'Đóng', exact: true }).click()
  await page.waitForTimeout(350)
  check(
    'Detail close keeps server page and does not reload list',
    listCalls().length === previous && listCalls().at(-1).params.page === '2',
  )
  await page.locator('.ant-pagination-item-1').click()
  await ready()
  for (const [label, width, height] of [
    ['desktop', 1366, 900],
    ['tablet', 900, 800],
    ['mobile', 390, 844],
    ['short', 1366, 560],
    ['keyboard', 390, 500],
  ]) {
    const before = listCalls().length
    await page.setViewportSize({ width, height })
    await ready()
    await page.waitForTimeout(200)
    const g = await geometry()
    measurements.push({ label, ...g })
    check(label + ': resize never fetches data', listCalls().length === before)
    check(
      label + ': no page horizontal overflow; separate pagination and horizontal table scroll',
      g.pageWidth <= width + 1 &&
        g.body.bottom <= g.footer.top + 1 &&
        g.scrollWidth > g.clientWidth,
    )
    if (label === 'desktop' || label === 'tablet')
      check(label + ': list fits screen', g.pageHeight <= height + 1)
    await page.locator('.ant-table-body').evaluate((el) => {
      el.scrollLeft = 400
      el.scrollTop = 200
    })
    const after = await geometry()
    check(
      label + ': fixed action column remains visible',
      after.actions.right <= width + 1 && after.actions.left >= 0,
    )
    await page.screenshot({ path: join(artifacts, label + '-list.png'), fullPage: true })
    await openAction(0, 'Chi tiết')
    await modal('detail').locator('.payment-amount-summary').waitFor()
    const detailGeometry = await checkModal('detail')
    await page.screenshot({ path: join(artifacts, label + '-detail.png'), fullPage: true })
    if (width <= 480)
      check(label + ': detail uses one information column', detailGeometry.gridColumns === 1)
    await modal('detail').getByText('Thông tin định danh', { exact: true }).click()
    check(
      label + ': identifiers remain available',
      await modal('detail').getByText('creator-uuid', { exact: true }).isVisible(),
    )
    await modal('detail').getByRole('button', { name: 'Hủy ghi nhận sai', exact: true }).click()
    await modal('cancel').locator('textarea').waitFor()
    await page.waitForTimeout(350)
    await checkModal('cancel')
    check(label + ': separate cancel replaces detail modal', (await modal('detail').count()) === 0)
    await page.screenshot({ path: join(artifacts, label + '-cancel.png'), fullPage: true })
    await modal('cancel').getByRole('button', { name: 'Quay lại', exact: true }).click()
    await modal('detail').locator('.payment-amount-summary').waitFor()
    check(
      label + ': back restores original detail',
      (await modal('detail').innerText()).includes(item(0).code),
    )
    await modal('detail').getByRole('button', { name: 'Đóng', exact: true }).click()
    await page.waitForTimeout(350)
  }
  await page.setViewportSize({ width: 1366, height: 900 })
  await ready()
  await openAction(0, 'Hủy ghi nhận sai')
  await modal('cancel').getByRole('button', { name: 'Xác nhận hủy ghi nhận', exact: true }).click()
  await modal('cancel').getByText('Lý do bắt buộc, tối đa 2000 ký tự.').waitFor()
  check(
    'Cancel reason is required with inline error',
    (await modal('cancel').getByText('Lý do bắt buộc, tối đa 2000 ký tự.').isVisible()) &&
      cancelCalls().length === 0,
  )
  cancelMode = 'error'
  await modal('cancel').locator('textarea').fill('Giữ lý do khi API lỗi')
  await modal('cancel').getByRole('button', { name: 'Xác nhận hủy ghi nhận', exact: true }).click()
  await modal('cancel').getByText('Lý do chưa hợp lệ từ backend.').waitFor()
  check(
    'API failure preserves reason and dialog',
    (await modal('cancel').locator('textarea').inputValue()) === 'Giữ lý do khi API lỗi',
  )
  cancelMode = 'success'
  const count = cancelCalls().length
  await modal('cancel').getByRole('button', { name: 'Xác nhận hủy ghi nhận', exact: true }).click()
  await page.waitForFunction(
    () => !document.querySelector('.payment-cancel-dialog .ant-modal-close'),
  )
  check(
    'Pending cancellation disables back and close',
    (await modal('cancel').getByRole('button', { name: 'Quay lại', exact: true }).isDisabled()) &&
      (await modal('cancel').locator('.ant-modal-close').count()) === 0,
  )
  await ready()
  await page.waitForTimeout(700)
  check(
    'Success closes list cancellation and submits once',
    (await modal('cancel').count()) === 0 && cancelCalls().length === count + 1,
  )
  check(
    'Cancellation payload contains trimmed reason only',
    cancelCalls().at(-1).raw === '{"reason":"Giữ lý do khi API lỗi"}',
  )
  await openAction(2, 'Chi tiết')
  await modal('detail').getByRole('button', { name: 'Hủy ghi nhận sai', exact: true }).click()
  await modal('cancel').locator('textarea').fill('Hủy từ chi tiết')
  await modal('cancel').getByRole('button', { name: 'Xác nhận hủy ghi nhận', exact: true }).click()
  await modal('detail').getByText('Thông tin hủy ghi nhận', { exact: true }).waitFor()
  check(
    'Detail cancellation updates detail with authoritative result',
    (await modal('detail').innerText()).includes('Hủy từ chi tiết'),
  )
  await modal('detail').getByRole('button', { name: 'Đóng', exact: true }).click()
  await page.waitForTimeout(350)
  await openAction(1, 'Chi tiết')
  check(
    'Cancelled receipt has audit and can still print',
    (await modal('detail').getByText('Thông tin hủy ghi nhận', { exact: true }).isVisible()) &&
      (await modal('detail')
        .getByRole('button', { name: 'Hủy ghi nhận sai', exact: true })
        .count()) === 0,
  )
  await modal('detail').getByRole('button', { name: 'Xem/in biên lai', exact: true }).click()
  await modal('receipt').locator('iframe').waitFor()
  await modal('receipt')
    .getByRole('button', { name: 'In', exact: true })
    .waitFor({ state: 'visible' })
  await page.waitForFunction(
    () => !document.querySelector('.payment-receipt-dialog .ant-btn-primary')?.disabled,
  )
  check(
    'PDF uses authenticated GET and blob URL',
    printCalls().at(-1).method === 'GET' &&
      printCalls().at(-1).authorization === 'Bearer payment-ui-test' &&
      (await modal('receipt').locator('iframe').getAttribute('src')).startsWith('blob:'),
  )
  await checkModal('receipt')
  await page.waitForTimeout(500)
  await page.screenshot({ path: join(artifacts, 'receipt.png'), fullPage: true })
  const downloadPromise = page.waitForEvent('download')
  await modal('receipt').getByRole('button', { name: 'Tải PDF', exact: true }).click()
  check(
    'Download uses server filename',
    (await downloadPromise).suggestedFilename() === 'bien-lai-test.pdf',
  )
  const popupPromise = page.waitForEvent('popup')
  await modal('receipt').getByRole('button', { name: 'Mở PDF riêng', exact: true }).click()
  const popup = await popupPromise
  await modal('receipt').getByRole('button', { name: 'Đóng', exact: true }).click()
  await page.waitForTimeout(350)
  check(
    'Separate PDF survives viewer close and detail returns',
    !popup.isClosed() && (await modal('detail').count()) === 1,
  )
  await popup.close()
  await modal('detail').getByRole('button', { name: 'Đóng', exact: true }).click()
  await page.waitForTimeout(350)
  pdfMode = 'error'
  await openAction(1, 'Xem/in biên lai')
  await modal('receipt').getByRole('button', { name: 'Thử lại', exact: true }).waitFor()
  check(
    'Blob JSON PDF error has business message',
    (await modal('receipt').innerText()).includes('Không tạo được PDF biên lai.'),
  )
  pdfMode = 'valid'
  await modal('receipt').getByRole('button', { name: 'Thử lại', exact: true }).click()
  await modal('receipt').locator('iframe').waitFor()
  await page.setViewportSize({ width: 390, height: 500 })
  await page.waitForTimeout(350)
  await checkModal('receipt')
  await modal('receipt').getByRole('button', { name: 'Đóng', exact: true }).click()
  await page.waitForTimeout(350)
  listMode = 'empty'
  await page.locator('.products-toolbar').getByRole('button').click()
  await ready()
  check(
    'Empty state is visible',
    await page
      .locator('.payment-list-panel .ant-table-placeholder')
      .getByText('Kh\u00f4ng c\u00f3 d\u1eef li\u1ec7u', { exact: true })
      .isVisible(),
  )
  listMode = 'error'
  await page.locator('.products-toolbar').getByRole('button').click()
  await ready()
  check(
    'List error offers reload and remains visible',
    (await page.locator('.payment-history').innerText()).includes(
      'Không thể tải phiếu thu kiểm thử.',
    ),
  )
  listMode = 'many'
  profile = 'viewer'
  await page.reload()
  await ready()
  await openAction(0, 'Chi tiết')
  check(
    'PAYMENT_VIEW alone can view detail and cannot cancel',
    (await modal('detail')
      .getByRole('button', { name: 'Hủy ghi nhận sai', exact: true })
      .count()) === 0,
  )
  check('No extra customer, order or catalog API', unexpected.length === 0)
  check('No runtime or resize errors', errors.length === 0)
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
