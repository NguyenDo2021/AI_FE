// Only controlled test fixtures are served. No request reaches a real backend.
import assert from 'node:assert/strict'
import process from 'node:process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
const { chromium } = await import(
  pathToFileURL(join(process.env.TEMP, 'codex-dashboard-browser/node_modules/playwright/index.mjs'))
    .href
)
const artifacts = 'docs/sales-orders-artifacts'
await mkdir(artifacts, { recursive: true })
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  ignoreDefaultArgs: ['--hide-scrollbars'],
})
const context = await browser.newContext({
  viewport: { width: 1366, height: 768 },
  reducedMotion: 'reduce',
  timezoneId: 'Asia/Bangkok',
})
await context.addInitScript(() =>
  localStorage.setItem('frontend-base:access-token', 'sales-ui-test'),
)
const calls = [],
  checks = [],
  measurements = [],
  errors = [],
  unexpected = []
let profile = 'full',
  listMode = 'many'
const overrides = new Map()
const warehouse = {
  id: 'w1',
  code: 'K1',
  name: 'Kho kiểm thử có tên rất dài '.repeat(5),
  status: 1,
}
const permissions = [
  'SALES_ORDER_VIEW',
  'SALES_ORDER_CREATE',
  'SALES_ORDER_UPDATE',
  'SALES_ORDER_CONFIRM',
  'SALES_ORDER_CANCEL',
  'CUSTOMER_VIEW',
  'PRODUCT_VIEW',
  'INVENTORY_VIEW',
  'PAYMENT_VIEW',
  'PAYMENT_CREATE',
]
const json = (data) =>
  JSON.stringify(data, (_key, value) =>
    typeof value === 'bigint' ? '__int64_' + value : value,
  ).replace(/"__int64_(-?\d+)"/g, '$1')
const item = (n) => ({
  id: 's' + n,
  code: 'DH-' + n + '-'.repeat(90),
  warehouseId: 'w1',
  customerId: n === 0 ? null : n === 6 ? 'inactive' : 'c1',
  customerSnapshot:
    n === 0 || n === 6
      ? null
      : {
          code: 'KH-SNAPSHOT',
          name: 'Tên khách lịch sử '.repeat(8),
          phone: '0900000001',
          address: 'Địa chỉ lịch sử',
        },
  saleDate: '2026-10-09',
  status: n === 0 || n === 6 ? 'DRAFT' : 'CONFIRMED',
  subtotal: n === 0 ? 0 : 20000,
  discountAmount: n === 0 ? 0 : 1000,
  totalAmount: n === 5 ? 9223372036854775807n : n === 0 ? 0 : 19000,
  returnedAmount: n === 3 || n === 4 ? 19000 : 0,
  adjustedTotalAmount: n === 3 || n === 4 || n === 0 ? 0 : 19000,
  paidAmount: n === 2 ? 5000 : n === 3 || n === 4 ? 19000 : 0,
  refundedAmount: n === 4 ? 19000 : 0,
  netPaidAmount: n === 2 ? 5000 : n === 3 ? 19000 : 0,
  refundableAmount: n === 3 ? 19000 : 0,
  remainingAmount: n === 1 ? 19000 : n === 2 ? 14000 : 0,
  paymentStatus: n === 2 ? 'PARTIALLY_PAID' : n === 3 || n === 4 ? 'PAID' : 'UNPAID',
  note: 'Ghi chú kiểm thử '.repeat(30),
  version: 7,
  createdBy: 'test-user',
  createdAt: '2026-10-09T02:00:00Z',
  updatedAt: '2026-10-09T03:00:00Z',
  lines: [
    {
      productId: 'p1',
      productCode: 'SP-SNAPSHOT',
      productName: 'Sản phẩm lịch sử '.repeat(12),
      unit: 'cây',
      quantity: 1,
      unitPrice: 20000,
      lineTotal: 20000,
    },
  ],
  ...overrides.get('s' + n),
})
await context.route('**/api/**', async (route) => {
  const request = route.request(),
    url = new URL(request.url())
  if (!url.pathname.startsWith('/api/')) return route.continue()
  const path = url.pathname.replace(/^\/api/, '')
  const params = Object.fromEntries(url.searchParams),
    method = request.method(),
    raw = request.postData()
  calls.push({ path, method, params, raw })
  const reply = (data, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: json(data) })
  if (path === '/auth/me')
    return reply({
      id: 'sales-ui',
      username: 'test',
      fullName: 'Kiểm thử đơn bán',
      permissions:
        profile === 'full' ? permissions : profile === 'viewer' ? ['SALES_ORDER_VIEW'] : [],
    })
  if (path === '/users/sales-ui') return reply({ id: 'sales-ui', status: 1 })
  if (path === '/users/sales-ui/roles')
    return reply(profile === 'admin' ? [{ code: 'ADMIN', status: 1 }] : [])
  if (path === '/users/me/warehouses') return reply([warehouse])
  if (path === '/sales-orders' && method === 'GET') {
    const page = Number(params.page),
      pageSize = Number(params.pageSize)
    const total = listMode === 'empty' ? 0 : listMode === 'few' ? 1 : 137
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
  if (path === '/sales-orders' && method === 'POST')
    return reply({ ...item(0), id: 'created', version: 1 })
  const match = path.match(/^\/sales-orders\/s(\d+)(?:\/(confirm|cancel|payments))?$/)
  if (match) {
    const n = Number(match[1]),
      action = match[2]
    if (action === 'payments') return reply({ items: [], total: 0, page: 1, pageSize: 10 })
    if (method === 'GET') return reply(item(n))
    if (action === 'confirm' || action === 'cancel') {
      overrides.set('s' + n, {
        ...overrides.get('s' + n),
        status: action === 'confirm' ? 'CONFIRMED' : 'CANCELLED',
        version: 8,
      })
      return reply(item(n))
    }
    if (method === 'PUT') return reply({ ...item(n), version: 8 })
  }
  if (path === '/products')
    return reply({
      items: [
        {
          id: 'p1',
          code: 'SP1',
          name: 'Sản phẩm có giá int64',
          status: 1,
          defaultSalePrice: 9223372036854775807n,
        },
        { id: 'p2', code: 'SP2', name: 'Sản phẩm giá không đồng', status: 1, defaultSalePrice: 0 },
      ],
      total: 2,
      page: Number(params.page),
      pageSize: Number(params.pageSize),
    })
  if (path === '/customers')
    return reply({
      items: [
        { id: 'c1', warehouseId: 'w1', code: 'KH1', name: 'Khách đang hoạt động', status: 1 },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
    })
  if (path === '/customers/inactive')
    return reply({
      id: 'inactive',
      warehouseId: 'w1',
      code: 'KH-CU',
      name: 'Khách đã ngừng hoạt động',
      status: 0,
    })
  if (path.includes('/inventory'))
    return reply({
      items: [{ productId: params.productId, quantity: 0 }],
      total: 1,
      page: 1,
      pageSize: 1,
    })
  unexpected.push({ path, method })
  return reply({ message: 'Unmocked endpoint denied by test' }, 403)
})
const page = await context.newPage()
page.setDefaultTimeout(10000)
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (/ResizeObserver loop|Unhandled|Failed to resolve component/.test(message.text()))
    errors.push(message.text())
})
const base = process.env.SALES_ORDERS_TEST_URL || 'http://127.0.0.1:5177'
const listCalls = () =>
  calls.filter((call) => call.path === '/sales-orders' && call.method === 'GET')
const check = (name, value = true) => {
  assert.ok(value, name)
  checks.push(name)
}
const ready = async () => {
  await page.locator('.sales-orders-panel').waitFor()
  await page.waitForFunction(
    () => document.querySelector('.products-table-region')?.getAttribute('aria-busy') === 'false',
  )
  await page.waitForTimeout(200)
}
const geometry = async () =>
  page.evaluate(() => {
    const body = document.querySelector('.sales-orders-panel .ant-table-body')
    const r = (el) => {
      const b = el.getBoundingClientRect()
      return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width }
    }
    const headers = [
      ...document.querySelectorAll('.sales-orders-panel .ant-table-header th'),
    ].filter((e) => !e.classList.contains('ant-table-cell-scrollbar'))
    const cells = [
      ...(document.querySelector('.sales-orders-panel .ant-table-row')?.querySelectorAll('td') ||
        []),
    ]
    return {
      viewport: [innerWidth, innerHeight],
      pageWidth: document.documentElement.scrollWidth,
      pageHeight: document.documentElement.scrollHeight,
      dpr: devicePixelRatio,
      body: r(body),
      footer: r(document.querySelector('.products-footer')),
      scrollTop: body.scrollTop,
      scrollWidth: body.scrollWidth,
      clientWidth: body.clientWidth,
      scrollHeight: body.scrollHeight,
      clientHeight: body.clientHeight,
      headers: headers.map(r),
      cells: cells.map(r),
      rowCount: document.querySelectorAll('.sales-orders-panel .ant-table-row').length,
      fixedBg: cells.length ? getComputedStyle(cells.at(-1)).backgroundColor : null,
      headerBg: getComputedStyle(headers.at(-1)).backgroundColor,
      fixedZ: cells.length ? getComputedStyle(cells.at(-1)).zIndex : null,
      headerZ: getComputedStyle(headers.at(-1)).zIndex,
      moneyWrap: [...document.querySelectorAll('.sales-orders-panel .order-money')].some(
        (e) => e.offsetHeight > 22,
      ),
    }
  })
const assertGeometry = (m) => {
  assert.equal(m.headers.length, 17)
  assert.ok(m.pageWidth <= m.viewport[0] + 1, 'No page horizontal overflow')
  assert.ok(m.body.bottom <= m.footer.top + 1, 'Pagination outside table scrolling area')
  assert.ok(m.scrollWidth > m.clientWidth, 'All columns scroll horizontally inside table')
  assert.ok(!m.moneyWrap, 'Money never wraps')
  if (m.cells.length) {
    for (let i = 0; i < 17; i++) {
      assert.ok(Math.abs(m.headers[i].left - m.cells[i].left) < 2, 'Header/body left aligned ' + i)
      assert.ok(
        Math.abs(m.headers[i].right - m.cells[i].right) < 2,
        'Header/body right aligned ' + i,
      )
    }
    assert.notEqual(m.fixedBg, 'rgba(0, 0, 0, 0)')
    assert.ok(Number(m.headerZ) > Number(m.fixedZ))
  }
}
const setSize = async (size) => {
  await page.locator('.list-page-size').click()
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: new RegExp('^' + size + '\\s*/') })
    .click()
  await ready()
}
const modal = () => page.locator('.sales-order-dialog:visible')
const close = async () => {
  await modal().getByRole('button', { name: 'Đóng', exact: true }).click()
  await page.waitForTimeout(180)
}
const menu = async (row, action) => {
  await page
    .locator('.sales-orders-panel .ant-table-row')
    .nth(row)
    .getByRole('button', { name: 'Thao tác', exact: true })
    .click()
  await page
    .locator('.ant-dropdown:visible')
    .getByRole('menuitem', { name: action, exact: true })
    .click()
  await page.waitForTimeout(180)
}
const formGeometry = async () =>
  modal().evaluate((el) => {
    const r = (s) => {
      const e = el.querySelector(s),
        b = e.getBoundingClientRect()
      return { left: b.left, right: b.right, top: b.top, bottom: b.bottom }
    }
    const body = el.querySelector('.ant-modal-body')
    return {
      main: r('.order-editor-main'),
      summary: r('.order-summary'),
      body: r('.ant-modal-body'),
      footer: r('.ant-modal-footer'),
      modalWidth: el.querySelector('.ant-modal').getBoundingClientRect().width,
      width: innerWidth,
      bodyClient: body.clientHeight,
      bodyScroll: body.scrollHeight,
    }
  })
let failure
try {
  await page.goto(base + '/sales/orders')
  await ready()
  check(
    'Default size 10 and one initial list request',
    listCalls().length === 1 && listCalls()[0].params.pageSize === '10',
  )
  check('Empty customer filter omits customerId', !('customerId' in listCalls()[0].params))
  check(
    'Exact heading and description',
    await page
      .getByText('Quản lý đơn bán và theo dõi thanh toán, trả hàng.', { exact: true })
      .isVisible(),
  )
  assertGeometry(await geometry())
  check(
    'List retains zero money',
    (await page.locator('.ant-table-row').first().locator('.order-money').first().innerText()) ===
      '0',
  )
  check(
    'Large int64 displayed exactly',
    (await page
      .locator('.ant-table-row')
      .nth(5)
      .locator('.order-money-total')
      .first()
      .innerText()) === '9.223.372.036.854.775.807',
  )
  check(
    'PAID still shows refund need from refundableAmount',
    await page
      .locator('.ant-table-row')
      .nth(3)
      .getByText('Cần hoàn tiền', { exact: true })
      .isVisible(),
  )
  check(
    'Refunded PAID has no refund-needed label',
    (await page
      .locator('.ant-table-row')
      .nth(4)
      .getByText('Cần hoàn tiền', { exact: true })
      .count()) === 0,
  )
  for (const size of [20, 50, 100, 10, 50]) {
    const before = listCalls().length
    await setSize(size)
    check(
      'Size ' + size + ': single server request and page 1',
      listCalls().length === before + 1 &&
        listCalls().at(-1).params.page === '1' &&
        listCalls().at(-1).params.pageSize === String(size),
    )
    check(
      'Size ' + size + ': server row count and API total',
      (await geometry()).rowCount === size &&
        (await page.locator('.products-total').innerText()).includes('137'),
    )
    assertGeometry(await geometry())
  }
  await page.locator('.sales-orders-panel .ant-table-body').evaluate((el) => {
    el.scrollTop = 140
  })
  await page.locator('.ant-pagination-next').click()
  await ready()
  check('Page change resets vertical scroll', (await geometry()).scrollTop === 0)
  await setSize(100)
  check(
    'Size change resets page and vertical scroll',
    listCalls().at(-1).params.page === '1' && (await geometry()).scrollTop === 0,
  )
  const initial = await geometry()
  await page.locator('.sales-orders-panel .ant-table-body').evaluate((el) => {
    el.scrollTop = 900
    el.scrollLeft = 500
  })
  await page.waitForTimeout(250)
  const scrolled = await geometry()
  assertGeometry(scrolled)
  check(
    'Header and actions fixed in both directions',
    initial.headers.at(-1).top === scrolled.headers.at(-1).top &&
      Math.abs(initial.cells.at(-1).right - scrolled.cells.at(-1).right) < 2,
  )
  check(
    'Horizontal scrollbar reachable above remaining rows',
    scrolled.body.bottom <= scrolled.footer.top &&
      scrolled.scrollTop < scrolled.scrollHeight - scrolled.clientHeight,
  )
  await page.locator('.sales-orders-panel .ant-table-row').first().locator('td').last().hover()
  check(
    'Fixed hover background matches ordinary cells',
    await page
      .locator('.sales-orders-panel .ant-table-row')
      .first()
      .evaluate(
        (el) =>
          getComputedStyle(el.firstElementChild).backgroundColor ===
          getComputedStyle(el.lastElementChild).backgroundColor,
      ),
  )
  let before = listCalls().length
  await page
    .locator('.app-header')
    .getByRole('button', { name: /Mở rộng thanh bên|Thu gọn thanh bên/ })
    .click()
  await page.waitForTimeout(400)
  check(
    'Sidebar preserves size and sends no request',
    listCalls().length === before && listCalls().at(-1).params.pageSize === '100',
  )
  await page.locator('.sales-orders-panel .ant-table-body').evaluate((el) => {
    el.scrollLeft = 0
    el.scrollTop = 0
  })
  const cdp = await context.newCDPSession(page)
  for (const [width, height] of [
    [360, 740],
    [390, 844],
    [768, 900],
    [1024, 768],
    [1366, 768],
    [1920, 1080],
    [1093, 614],
    [390, 400],
    [1366, 420],
  ]) {
    await page.setViewportSize({ width, height })
    if (width === 1093)
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1.25,
        mobile: false,
      })
    await page.waitForTimeout(450)
    // Ant updates its fixed-header colgroup in a separate ResizeObserver batch.
    await page.waitForFunction(
      () => {
        const head = [
          ...document.querySelectorAll('.sales-orders-panel .ant-table-header th'),
        ].filter((e) => !e.classList.contains('ant-table-cell-scrollbar'))
        const cells = [
          ...(document
            .querySelector('.sales-orders-panel .ant-table-row')
            ?.querySelectorAll('td') || []),
        ]
        return cells.every((cell, i) => {
          const a = cell.getBoundingClientRect(),
            b = head[i]?.getBoundingClientRect()
          return b && Math.abs(a.left - b.left) < 2 && Math.abs(a.right - b.right) < 2
        })
      },
      null,
      { timeout: 5000 },
    )
    let m = await geometry()
    assertGeometry(m)
    check(
      'Resize ' + width + 'x' + height + ': no API request, 17 columns, size 100',
      listCalls().length === before,
    )
    measurements.push({
      kind: width === 1093 ? '125% equivalent CSS viewport/DPR (not native browser zoom)' : 'list',
      ...m,
    })
    await page.getByRole('button', { name: 'Tạo đơn bán hàng', exact: true }).click()
    await modal().evaluate((el) =>
      Promise.all(
        el
          .getAnimations({ subtree: true })
          .map((animation) => animation.finished.catch(() => undefined)),
      ),
    )
    const f = await formGeometry()
    check(
      'Form ' + width + 'x' + height + ': fits viewport',
      f.modalWidth <= width && (height <= 450 || f.body.bottom <= f.footer.top + 1),
    )
    check(
      'Form responsive columns ' + width,
      width > 1100 ? f.summary.left >= f.main.right : f.summary.top >= f.main.bottom,
    )
    measurements.push({ kind: 'form', viewport: [width, height], ...f })
    if ([390, 1366].includes(width) && height > 450)
      await page.screenshot({
        path: join(artifacts, 'form-' + width + '.png'),
        fullPage: true,
        animations: 'disabled',
      })
    await close()
    if ([390, 1366].includes(width) && height > 450)
      await page.screenshot({
        path: join(artifacts, 'list-' + width + '.png'),
        fullPage: true,
        animations: 'disabled',
      })
    if (width === 1093) await cdp.send('Emulation.clearDeviceMetricsOverride')
  }
  await page.setViewportSize({ width: 1366, height: 768 })
  await page.evaluate(() => window.scrollTo(0, 0))
  for (const [mode, expected] of [
    ['few', 1],
    ['empty', 0],
    ['many', 100],
  ]) {
    listMode = mode
    await page.locator('.products-toolbar').getByRole('button').click()
    await ready()
    assertGeometry(await geometry())
    check(mode + ' rows and API count', (await geometry()).rowCount === expected)
  }
  await setSize(10)
  await page.locator('.sales-orders-panel .ant-table-body').evaluate((el) => {
    el.scrollLeft = 0
    el.scrollTop = 0
  })
  await page.getByRole('button', { name: 'Tạo đơn bán hàng', exact: true }).click()
  await modal()
    .locator('.ant-select')
    .filter({ has: page.locator('#sale-warehouse') })
    .locator('.ant-select-selector')
    .click()
  await page.locator('.ant-select-dropdown:visible .ant-select-item-option').first().click()
  const product = () => modal().locator('.order-lines-table .ant-select').first()
  await product().click()
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: 'SP1' })
    .click()
  const price = () => modal().getByRole('textbox', { name: 'Đơn giá dòng 1', exact: true })
  check('Selector loads exact int64 price', (await price().inputValue()) === '9223372036854775807')
  await price().fill('0')
  await modal().getByRole('textbox', { name: 'Số lượng dòng 1', exact: true }).fill('2')
  check('Manual zero price survives quantity edits', (await price().inputValue()) === '0')
  const inventoryCalls = calls.filter((call) => call.path.includes('/inventory')).length
  await modal().locator('#sale-note').fill('Giữ dữ liệu khi đổi kích thước')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(300)
  check(
    'Form resize preserves line values and note',
    (await price().inputValue()) === '0' &&
      (await modal().locator('#sale-note').inputValue()) === 'Giữ dữ liệu khi đổi kích thước' &&
      (await modal()
        .getByRole('textbox', { name: 'Số lượng dòng 1', exact: true })
        .inputValue()) === '2',
  )
  check(
    'Form resize does not refetch advisory inventory',
    calls.filter((call) => call.path.includes('/inventory')).length === inventoryCalls,
  )
  await page.setViewportSize({ width: 1366, height: 768 })
  await modal().getByRole('button', { name: 'Thêm dòng', exact: true }).click()
  check(
    'Adding lines preserves entered values',
    (await price().inputValue()) === '0' &&
      (await modal().locator('.order-lines-table tbody tr').count()) === 2,
  )
  await modal().getByRole('button', { name: 'Bỏ dòng 2', exact: true }).click()
  await modal().locator('#sale-discount').fill('1')
  await modal().getByRole('button', { name: 'Lưu nháp', exact: true }).click()
  check(
    'Excess discount is visible, never clamped',
    (await modal().locator('#sale-discount').inputValue()) === '1' &&
      (await modal().innerText()).includes('không vượt tạm tính'),
  )
  await modal().locator('#sale-discount').fill('0')
  await modal().getByRole('button', { name: 'Lưu nháp', exact: true }).click()
  await ready()
  await page.waitForTimeout(200)
  const create = calls.find((call) => call.path === '/sales-orders' && call.method === 'POST')
  check(
    'Retail draft payload keeps numeric zero and all lines',
    create &&
      JSON.parse(create.raw).customerId === null &&
      JSON.parse(create.raw).lines[0].unitPrice === 0 &&
      JSON.parse(create.raw).lines[0].quantity === 2,
  )
  await menu(0, 'Sửa')
  await modal().locator('#sale-note').fill('Bản sửa kiểm thử')
  check('Warehouse remains locked on edit', await modal().locator('#sale-warehouse').isDisabled())
  await modal().getByRole('button', { name: 'Lưu nháp', exact: true }).click()
  await ready()
  await page.waitForTimeout(200)
  const edit = calls.find((call) => call.path === '/sales-orders/s0' && call.method === 'PUT')
  check(
    'Edit keeps version and omits warehouse',
    edit && JSON.parse(edit.raw).version === 7 && !('warehouseId' in JSON.parse(edit.raw)),
  )
  await menu(0, 'Xác nhận xuất')
  await modal().getByRole('button', { name: 'Xác nhận xuất hàng', exact: true }).click()
  await ready()
  await page.waitForTimeout(200)
  check(
    'Confirm uses unchanged version payload',
    calls.some((call) => call.path === '/sales-orders/s0/confirm' && call.raw === '{"version":7}'),
  )
  await menu(0, 'Hủy')
  await modal().locator('textarea').fill('Đã thu hồi hàng kiểm thử')
  await modal().getByRole('checkbox').check()
  await modal().getByRole('button', { name: 'Hủy đơn', exact: true }).click()
  await ready()
  await page.waitForTimeout(200)
  check(
    'Confirmed cancellation keeps reason and goodsReturned',
    calls.some(
      (call) =>
        call.path === '/sales-orders/s0/cancel' && JSON.parse(call.raw).goodsReturned === true,
    ),
  )
  await page
    .locator('.ant-table-row')
    .nth(3)
    .getByRole('button', { name: 'Chi tiết', exact: true })
    .click()
  await modal().getByText('Tên khách lịch sử', { exact: false }).waitFor()
  check(
    'Detail retains snapshot, audit, money and refund hint',
    (await modal().innerText()).includes('SP-SNAPSHOT') &&
      (await modal().innerText()).includes('Thông tin ghi nhận') &&
      (await modal().innerText()).includes('Cần hoàn tiền'),
  )
  await close()
  await menu(6, 'Sửa')
  check(
    'Inactive old customer remains selected',
    (await modal().innerText()).includes('Ngừng hoạt động'),
  )
  await close()
  await menu(1, 'Thu tiền')
  check(
    'Existing collection dialog opens',
    await page.getByText('Thu tiền đơn bán', { exact: true }).isVisible(),
  )
  await page
    .locator('.ant-modal:visible')
    .last()
    .getByRole('button', { name: 'Đóng', exact: true })
    .click()
  for (const nextProfile of ['viewer', 'admin']) {
    profile = nextProfile
    await page.reload()
    await ready()
    check(
      nextProfile + ': warehouse scope stays assigned',
      !listCalls().at(-1).params.warehouseId || listCalls().at(-1).params.warehouseId === 'w1',
    )
    check(
      nextProfile + ': create follows existing permission/admin rule',
      (await page.getByRole('button', { name: 'Tạo đơn bán hàng', exact: true }).count()) ===
        (nextProfile === 'admin' ? 1 : 0),
    )
  }
  check('No real or unmocked API was used', unexpected.length === 0)
  check('No browser runtime or observer errors', errors.length === 0)
} catch (error) {
  failure = error
  measurements.push({ kind: 'failure', ...(await geometry()) })
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
