// Presentation checks use controlled API fixtures and never contact a real backend.
import assert from 'node:assert/strict'
import process from 'node:process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
const { chromium } = await import(
  pathToFileURL(join(process.env.TEMP, 'codex-dashboard-browser/node_modules/playwright/index.mjs'))
    .href
)
const artifacts = 'docs/collect-payment-artifacts'
await mkdir(artifacts, { recursive: true })
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  ignoreDefaultArgs: ['--hide-scrollbars'],
})
const context = await browser.newContext({
  viewport: { width: 1366, height: 900 },
  timezoneId: 'Asia/Bangkok',
  reducedMotion: 'reduce',
})
await context.addInitScript(() =>
  localStorage.setItem('frontend-base:access-token', 'collect-ui-fixture'),
)
const checks = [],
  measurements = [],
  calls = [],
  errors = [],
  unexpected = []
const check = (name, condition = true) => {
  assert.ok(condition, name)
  checks.push(name)
}
const json = (value) =>
  JSON.stringify(value, (_key, item) =>
    typeof item === 'bigint' ? '__int64_' + item : item,
  ).replace(/"__int64_(-?\d+)"/g, '$1')
const originalOrder = {
  id: 'collect-order',
  code: 'BH-COLLECTION-' + 'Mã đơn dài kiểm thử-'.repeat(12),
  warehouseId: 'w1',
  customerId: null,
  status: 'CONFIRMED',
  saleDate: '2026-10-26',
  subtotal: 47000000,
  discountAmount: 0,
  totalAmount: 47000000,
  returnedAmount: 8000000,
  adjustedTotalAmount: 39000000,
  paidAmount: 4000000,
  refundedAmount: 0,
  netPaidAmount: 4000000,
  refundableAmount: 0,
  remainingAmount: 35000000,
  paymentStatus: 'PARTIALLY_PAID',
  version: 7,
  createdBy: 'fixture',
  createdAt: '2026-10-26T00:00:00Z',
  updatedAt: '2026-10-26T00:00:00Z',
  lines: [],
}
let order = { ...originalOrder },
  responseMode = 'success',
  release
await context.route('**/api/**', async (route) => {
  const request = route.request(),
    url = new URL(request.url())
  if (!url.pathname.startsWith('/api/')) return route.continue()
  const path = url.pathname.slice(4),
    method = request.method(),
    raw = request.postData()
  calls.push({ path, method, raw, headers: request.headers() })
  const reply = (value, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: json(value) })
  if (path === '/auth/me')
    return reply({
      id: 'collection-user',
      username: 'collection-test',
      fullName: 'Kiểm thử thu tiền',
      permissions: ['SALES_ORDER_VIEW', 'PAYMENT_CREATE'],
    })
  if (path === '/users/collection-user') return reply({ id: 'collection-user', status: 1 })
  if (path === '/users/collection-user/roles') return reply([])
  if (path === '/users/me/warehouses')
    return reply([{ id: 'w1', code: 'K1', name: 'Kho kiểm thử', status: 1 }])
  if (path === '/sales-orders' && method === 'GET')
    return reply({ items: [order], total: 1, page: 1, pageSize: 10 })
  if (path === '/sales-orders/collect-order' && method === 'GET') return reply(order)
  if (path === '/sales-orders/collect-order/payments' && method === 'POST') {
    if (responseMode === 'hold')
      await new Promise((resolve) => {
        release = resolve
      })
    if (responseMode === 'field-error')
      return reply(
        {
          message: 'Dữ liệu kiểm thử không hợp lệ.',
          code: 'VALIDATION_ERROR',
          details: {
            amount: 'Số tiền kiểm thử bị từ chối.',
            reference: 'Tham chiếu kiểm thử không hợp lệ.',
          },
        },
        400,
      )
    if (responseMode === 'uncertain') return reply({ message: 'Lỗi dịch vụ kiểm thử.' }, 503)
    if (responseMode === 'conflict')
      return reply({ message: 'Xung đột khóa kiểm thử.', code: 'IDEMPOTENCY_CONFLICT' }, 409)
    const amount = BigInt(raw.match(/"amount":(\d+)/)[1])
    order = {
      ...order,
      paidAmount: BigInt(order.paidAmount) + amount,
      netPaidAmount: BigInt(order.netPaidAmount) + amount,
      remainingAmount: BigInt(order.remainingAmount) - amount,
      paymentStatus: BigInt(order.remainingAmount) === amount ? 'PAID' : 'PARTIALLY_PAID',
    }
    return reply({
      payment: {
        id: 'collection-payment',
        code: 'PT-FIXTURE',
        salesOrderId: order.id,
        warehouseId: 'w1',
        amount,
        paymentDate: '2026-10-26',
        method: 'CASH',
        status: 'ACTIVE',
        createdAt: '2026-10-26T00:00:00Z',
        createdBy: 'fixture',
      },
      order: { ...order, salesOrderId: order.id },
    })
  }
  unexpected.push({ path, method })
  return reply({ message: 'Unmocked API denied by the browser test.' }, 403)
})
const page = await context.newPage()
page.setDefaultTimeout(10000)
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (/Unhandled|Failed to resolve component|ResizeObserver loop/.test(message.text()))
    errors.push(message.text())
})
const base = process.env.SALES_ORDERS_TEST_URL || 'http://127.0.0.1:5177'
const modal = () => page.locator('.collect-payment-dialog:visible')
const amount = () => modal().locator('#collection-amount')
const primary = () => modal().locator('.collection-footer .ant-btn-primary')
const fillRemaining = () =>
  modal().getByRole('button', { name: 'Điền số tiền còn lại', exact: true })
const writes = () => calls.filter((call) => call.method === 'POST')
const open = async () => {
  await page.locator('.sales-orders-panel').waitFor()
  await page.waitForFunction(
    () => document.querySelector('.products-table-region')?.getAttribute('aria-busy') === 'false',
  )
  await page
    .locator('.sales-orders-panel .order-actions')
    .getByRole('button', { name: 'Thao tác', exact: true })
    .click()
  await page
    .locator('.ant-dropdown:visible')
    .getByRole('menuitem', { name: /Thu tiền|Thử lại lần thu/, exact: true })
    .click()
  await modal().waitFor()
  await modal().evaluate((el) =>
    Promise.all(
      el
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  )
}
const close = async () => {
  await modal().getByRole('button', { name: 'Đóng', exact: true }).click()
  await page.locator('.collect-payment-dialog').waitFor({ state: 'hidden' })
}
const geometry = async () =>
  modal().evaluate((el) => {
    const r = (selector) => {
      const box = el.querySelector(selector).getBoundingClientRect()
      return {
        top: box.top,
        left: box.left,
        right: box.right,
        bottom: box.bottom,
        width: box.width,
        height: box.height,
      }
    }
    const body = el.querySelector('.ant-modal-body')
    return {
      viewport: [innerWidth, innerHeight],
      dpr: devicePixelRatio,
      modal: r('.ant-modal'),
      header: r('.ant-modal-header'),
      body: r('.ant-modal-body'),
      footer: r('.ant-modal-footer'),
      date: r('.collection-form-row .ant-picker'),
      method: r('.collection-form-row .ant-select'),
      amount: r('.collection-amount-input'),
      reference: r('#collection-reference'),
      fill: r('.collection-fill'),
      label: r('.collection-amount-heading label'),
      summary: r('.collection-summary'),
      totals: [...el.querySelectorAll('.collection-summary-values > div')].map((item) => ({
        top: item.getBoundingClientRect().top,
      })),
      scrollHeight: body.scrollHeight,
      clientHeight: body.clientHeight,
      scrollWidth: body.scrollWidth,
      clientWidth: body.clientWidth,
      fillColor: getComputedStyle(el.querySelector('.collection-fill')).color,
      primaryColor: getComputedStyle(el.querySelector('.collection-footer .ant-btn-primary'))
        .backgroundColor,
      codeEllipsis: getComputedStyle(el.querySelector('.collection-code')).textOverflow,
    }
  })
let failure
try {
  await page.goto(base + '/sales/orders')
  await open()
  check(
    'Header wallet icon and close control',
    (await modal().locator('.collection-heading-icon svg').count()) === 1 &&
      (await modal().locator('.ant-modal-close').count()) === 1,
  )
  check('No automatic amount fill on open', (await amount().inputValue()) === '')
  const initialDate = await modal().locator('#collection-date').inputValue()
  check(
    'Exact remaining amount uses DTO after returns',
    (await modal().locator('.collection-remaining dd').innerText()).includes('35.000.000'),
  )
  check(
    'Existing manual payment note retained',
    (await modal().locator('.collection-manual-note').innerText()).includes(
      'Ghi nhận thanh toán thủ công. Chuyển khoản chưa được ngân hàng xác minh.',
    ),
  )
  check(
    'Footer keeps Close and collection action, no Reset',
    (await modal().getByRole('button', { name: 'Đóng', exact: true }).count()) === 1 &&
      (await modal().getByRole('button', { name: 'Đặt lại', exact: true }).count()) === 0 &&
      (await primary().innerText()).includes('Ghi nhận thu tiền'),
  )
  await modal().locator('#collection-reference').fill('r'.repeat(205))
  await modal().locator('#collection-note').fill('n'.repeat(2005))
  check(
    'Limits retained',
    (await modal().locator('#collection-reference').inputValue()).length === 200 &&
      (await modal().locator('#collection-note').inputValue()).length === 2000,
  )
  await modal().locator('#collection-reference').fill('')
  await modal().locator('#collection-note').fill('')
  await modal().locator('.collection-code').hover()
  await page.getByRole('tooltip').waitFor()
  check('Full code in tooltip', (await page.getByRole('tooltip').innerText()) === order.code)
  await page.mouse.move(0, 0)
  const cdp = await context.newCDPSession(page)
  for (const [width, height, zoom] of [
    [1366, 900, false],
    [1366, 768, false],
    [390, 844, false],
    [360, 740, false],
    [390, 400, false],
    [1366, 420, false],
    [1093, 614, true],
  ]) {
    await page.setViewportSize({ width, height })
    if (zoom)
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1.25,
        mobile: false,
      })
    await page.waitForTimeout(150)
    const m = await geometry()
    check(
      width + 'x' + height + ': width and internal overflow',
      m.modal.width <= width - 20 &&
        (width < 600 || (m.modal.width >= 560 && m.modal.width <= 600)) &&
        m.scrollWidth <= m.clientWidth + 1,
    )
    check(
      width + 'x' + height + ': accessible header/footer',
      m.header.top >= 0 &&
        m.footer.bottom <= height &&
        m.body.top >= m.header.bottom - 1 &&
        m.body.bottom <= m.footer.top + 1,
    )
    check(
      width + 'x' + height + ': responsive date/method row',
      width <= 480 ? m.method.top > m.date.bottom : Math.abs(m.date.top - m.method.top) < 1,
    )
    check(
      width + 'x' + height + ': totals same row and consistent inputs',
      Math.abs(m.totals[0].top - m.totals[1].top) < 1 &&
        Math.abs(m.date.height - m.method.height) < 1 &&
        Math.abs(m.reference.height - m.method.height) < 1,
    )
    check(
      width + 'x' + height + ': purple action and code ellipsis',
      m.primaryColor === 'rgb(115, 87, 207)' &&
        m.fillColor === 'rgb(115, 87, 207)' &&
        m.codeEllipsis === 'ellipsis',
    )
    measurements.push({
      scenario: zoom ? '125% equivalent CSS viewport/DPR, not native browser zoom' : 'normal',
      ...m,
    })
    if (width === 390 && height === 400) {
      const headerTop = m.header.top,
        footerTop = m.footer.top
      await modal()
        .locator('.ant-modal-body')
        .evaluate((el) => {
          el.scrollTop = el.scrollHeight
        })
      const after = await geometry()
      check(
        'Short-screen body scroll preserves header/footer',
        after.header.top === headerTop && after.footer.top === footerTop,
      )
    }
    if ((width === 1366 && height === 900) || (width === 390 && height === 844) || zoom)
      await page.screenshot({
        path: join(artifacts, zoom ? 'zoom-125-equivalent.png' : 'modal-' + width + '.png'),
        fullPage: true,
        animations: 'disabled',
      })
    if (zoom) await cdp.send('Emulation.clearDeviceMetricsOverride')
  }
  await page.setViewportSize({ width: 1366, height: 900 })
  const beforeValidation = writes().length
  await amount().fill('0')
  await primary().click()
  await modal().locator('.ant-form-item-explain-error').waitFor()
  check(
    'Zero validation remains visible at amount field',
    writes().length === beforeValidation &&
      (await modal().locator('.ant-form-item-explain-error').innerText()).includes(
        'Nhập số nguyên',
      ),
  )
  await amount().fill('35000001')
  await primary().click()
  check(
    'Exceeds remaining validation and no write',
    writes().length === beforeValidation &&
      (await modal().innerText()).includes('vượt số còn phải trả'),
  )
  await fillRemaining().click()
  check('Fill remaining uses existing exact handler', (await amount().inputValue()) === '35000000')
  await amount().fill('1')
  responseMode = 'field-error'
  await primary().click()
  await modal().getByText('Số tiền kiểm thử bị từ chối.', { exact: true }).waitFor()
  check(
    'Backend field errors and common error retained',
    (await modal().locator('.ant-alert-error').count()) === 1 &&
      (await modal().getByText('Tham chiếu kiểm thử không hợp lệ.', { exact: true }).count()) === 1,
  )
  await page.screenshot({
    path: join(artifacts, 'validation-errors.png'),
    fullPage: true,
    animations: 'disabled',
  })
  responseMode = 'hold'
  const beforeBusy = writes().length
  await primary().click()
  await modal().locator('.ant-btn-loading').waitFor()
  check(
    'Sending locks form, fill and close',
    (await amount().isDisabled()) &&
      (await fillRemaining().isDisabled()) &&
      (await modal().getByRole('button', { name: 'Đóng', exact: true }).isDisabled()) &&
      (await modal().locator('.ant-modal-close').count()) === 0,
  )
  await primary().dispatchEvent('click')
  check('Sending still prevents double submit', writes().length === beforeBusy + 1)
  await page.screenshot({
    path: join(artifacts, 'sending.png'),
    fullPage: true,
    animations: 'disabled',
  })
  responseMode = 'success'
  release()
  await page.locator('.collect-payment-dialog').waitFor({ state: 'hidden' })
  await page.waitForFunction(
    () => document.querySelector('.products-table-region')?.getAttribute('aria-busy') === 'false',
  )
  check(
    'Success closes and updates authoritative summary',
    (await page.locator('.sales-orders-panel .order-money').allTextContents()).some(
      (text) => text.trim() === '4.000.001',
    ),
  )
  const exactNormal = writes().at(-1)
  check(
    'Payload has original fields, numeric amount and idempotency key',
    exactNormal.raw ===
      JSON.stringify({
        amount: 1,
        paymentDate: initialDate,
        method: 'CASH',
        reference: null,
        note: null,
      }) && /^[0-9a-f-]{36}$/i.test(exactNormal.headers['idempotency-key']),
  )
  order = {
    ...originalOrder,
    totalAmount: 9223372036854775807n,
    adjustedTotalAmount: 9223372036854775807n,
    returnedAmount: 0,
    paidAmount: 0,
    netPaidAmount: 0,
    remainingAmount: 9223372036854775807n,
  }
  await page.reload()
  await open()
  check(
    'Exact int64 summary without Number conversion',
    (await modal().locator('.collection-remaining dd').innerText()).includes(
      '9.223.372.036.854.775.807',
    ),
  )
  await fillRemaining().click()
  check('Exact int64 fill', (await amount().inputValue()) === '9223372036854775807')
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
    await page.waitForTimeout(150)
    const m = await geometry()
    check('Int64 ' + width + ': fits content', m.scrollWidth <= m.clientWidth + 1)
    await page.screenshot({
      path: join(artifacts, 'int64-' + width + '.png'),
      fullPage: true,
      animations: 'disabled',
    })
  }
  await page.setViewportSize({ width: 1366, height: 900 })
  responseMode = 'uncertain'
  await primary().click()
  await modal().locator('.ant-alert-error').waitFor()
  check(
    'Ambiguous failure keeps retry warning and freezes data',
    (await amount().isDisabled()) &&
      (await fillRemaining().isDisabled()) &&
      (await modal().locator('.ant-alert-warning').count()) === 1 &&
      (await primary().innerText()).includes('Thử lại đúng request cũ'),
  )
  const originalWrite = writes().at(-1)
  check(
    'Int64 is a numeric JSON token',
    originalWrite.raw.includes('"amount":9223372036854775807') &&
      !originalWrite.raw.includes('"amount":"'),
  )
  await close()
  await open()
  check(
    'Reopen restores exact pending amount',
    (await amount().inputValue()) === '9223372036854775807' && (await amount().isDisabled()),
  )
  responseMode = 'conflict'
  await primary().click()
  await modal()
    .getByText('Khóa bị xung đột. Giữ request để kiểm tra, không tạo khóa thay thế.', {
      exact: true,
    })
    .waitFor()
  check(
    'Retry keeps original request and idempotency key',
    writes().at(-1).raw === originalWrite.raw &&
      writes().at(-1).headers['idempotency-key'] === originalWrite.headers['idempotency-key'],
  )
  check(
    'Conflict action stays disabled and close remains available',
    (await primary().isDisabled()) &&
      !(await modal().getByRole('button', { name: 'Đóng', exact: true }).isDisabled()),
  )
  await page.screenshot({
    path: join(artifacts, 'retry-conflict.png'),
    fullPage: true,
    animations: 'disabled',
  })
  check('No runtime errors or unmocked API', errors.length === 0 && unexpected.length === 0)
} catch (error) {
  failure = error
  await page.screenshot({
    path: join(artifacts, 'failure.png'),
    fullPage: true,
    animations: 'disabled',
  })
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
console.log(
  JSON.stringify(
    { passed: checks.length, measurements: measurements.length, errors, unexpected, artifacts },
    null,
    2,
  ),
)
