// All API requests are intercepted. No real backend is read or mutated.
import assert from 'node:assert/strict'
import process from 'node:process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
const { chromium } = await import(
  pathToFileURL(join(process.env.TEMP, 'codex-dashboard-browser/node_modules/playwright/index.mjs'))
    .href
)
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
await context.addInitScript(() => {
  localStorage.setItem('frontend-base:access-token', 'receipts-test')
  sessionStorage.setItem('working-warehouse:receipt-user', 'w1')
})
const artifacts = join(process.env.TEMP, 'codex-receipts-artifacts')
await mkdir(artifacts, { recursive: true })
const allPermissions = [
  'STOCK_RECEIPT_VIEW',
  'STOCK_RECEIPT_CREATE',
  'STOCK_RECEIPT_UPDATE',
  'STOCK_RECEIPT_CONFIRM',
  'STOCK_RECEIPT_CANCEL',
  'PRODUCT_VIEW',
]
let permissions = [...allPermissions],
  admin = false,
  scenario = 'normal',
  total = 237,
  detailStatus = 'DRAFT'
let assigned = [
  { id: 'w1', code: 'K1', name: 'Kho được giao', status: 1 },
  { id: 'w2', code: 'K2', name: 'Kho thứ hai', status: 1 },
]
const code = 'PN-' + '0123456789'.repeat(12)
const record = (index = 0) => ({
  id: 'r' + index,
  code: index === 0 ? code : 'PN-' + index,
  warehouseId: 'w1',
  receiptDate: '2026-10-08',
  supplierName: index === 1 ? null : 'Nhà cung cấp kiểm thử',
  note: 'Ghi chú snapshot',
  status: index === 0 ? detailStatus : index % 2 ? 'CONFIRMED' : 'CANCELLED',
  totalAmount: 9223372036854775807n,
  version: 7,
  createdBy: 'u1',
  createdAt: '2026-10-08T03:00:00Z',
  ...(detailStatus === 'CONFIRMED'
    ? { confirmedAt: '2026-10-09T03:00:00Z', confirmedBy: 'u2' }
    : {}),
  lines: [
    {
      productId: 'p1',
      productCode: 'SP-SNAPSHOT',
      productName: 'Tên snapshot của phiếu',
      unit: 'cây',
      quantity: 9223372036854775807n,
      unitPrice: 1,
      lineTotal: 9223372036854775807n,
    },
  ],
})
const calls = [],
  checks = [],
  measurements = [],
  errors = []
const json = (data) =>
  JSON.stringify(data, (_, value) =>
    typeof value === 'bigint' ? '__int__' + value : value,
  ).replace(/"__int__(\d+)"/g, '$1')
await context.route('**/api/**', async (route) => {
  const request = route.request(),
    url = new URL(request.url()),
    path = url.pathname.slice(4),
    method = request.method(),
    params = Object.fromEntries(url.searchParams),
    raw = request.postData()
  if (!url.pathname.startsWith('/api/')) return route.continue()
  calls.push({ path, method, params, raw })
  const reply = (data, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: json(data) })
  if (path === '/auth/me')
    return reply({
      id: 'receipt-user',
      username: 'receipt-test',
      fullName: 'Kiểm thử phiếu nhập',
      permissions,
    })
  if (path === '/users/receipt-user') return reply({ id: 'receipt-user', status: 1 })
  if (path === '/users/receipt-user/roles')
    return reply(admin ? [{ code: 'ADMIN', status: 1 }] : [])
  if (path === '/users/me/warehouses') return reply(assigned)
  if (path === '/products')
    return reply({
      items: [{ id: 'p1', code: 'SP-CURRENT', name: 'Tên danh mục hiện tại', status: 1 }],
      total: 1,
      page: 1,
      pageSize: 100,
    })
  if (path === '/stock-receipts' && method === 'GET') {
    if (scenario === 'list-forbidden')
      return reply({ code: 'FORBIDDEN', message: 'Forbidden' }, 403)
    const page = Number(params.page),
      pageSize = Number(params.pageSize)
    const items = Array.from(
      { length: Math.max(0, Math.min(pageSize, total - (page - 1) * pageSize)) },
      (_, i) => ({
        ...record((page - 1) * pageSize + i),
        warehouseId: params.warehouseId || assigned[0].id,
      }),
    )
    if (params.status)
      items.forEach((item) => {
        item.status = params.status
        item.code = 'PN-' + params.status
      })
    if (params.status === 'DRAFT') await new Promise((resolve) => setTimeout(resolve, 600))
    return reply({ items, page, pageSize, total })
  }
  if (path.startsWith('/stock-receipts/') && method === 'GET') {
    if (scenario === 'detail-denied') return reply({ code: 'WAREHOUSE_ACCESS_DENIED' }, 403)
    return reply(record())
  }
  if (path.startsWith('/stock-receipts') && ['POST', 'PUT'].includes(method)) {
    await new Promise((resolve) => setTimeout(resolve, 250))
    if (scenario === 'conflict') return reply({ code: 'VERSION_CONFLICT', message: 'Changed' }, 409)
    if (scenario === 'insufficient')
      return reply({ code: 'INSUFFICIENT_STOCK', message: 'No stock' }, 409)
    return reply({
      ...record(),
      status: path.endsWith('/confirm')
        ? 'CONFIRMED'
        : path.endsWith('/cancel')
          ? 'CANCELLED'
          : 'DRAFT',
      version: 8,
    })
  }
  return reply({ items: [], total: 0 })
})
const page = await context.newPage()
page.setDefaultTimeout(10000)
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (/Unhandled|Failed to resolve component|ResizeObserver loop/.test(message.text()))
    errors.push(message.text())
})
const base = process.env.RECEIPTS_TEST_URL || 'http://127.0.0.1:5173'
const check = (name, condition = true) => {
  assert.ok(condition, name)
  checks.push(name)
}
const lists = () => calls.filter((c) => c.path === '/stock-receipts' && c.method === 'GET')
const writes = () => calls.filter((c) => ['POST', 'PUT'].includes(c.method))
const ready = async () => {
  await page.locator('.receipts-panel').waitFor()
  await page.waitForFunction(
    () => document.querySelector('.products-table-region')?.getAttribute('aria-busy') === 'false',
  )
  await page.waitForTimeout(150)
}
const start = async () => {
  await page.goto(base + '/stock/receipts')
  await ready()
}
const modal = () => page.locator('.ant-modal:visible')
const close = async () => {
  await modal()
    .locator('.receipt-dialog-footer')
    .getByRole('button', { name: /^(Hủy|Đóng)$/ })
    .click()
  await modal().waitFor({ state: 'hidden' })
}
const choose = async (selector, text) => {
  await selector.click()
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: text })
    .click()
}
const chooseDate = async (id, iso) => {
  await page.locator(id).click()
  const popup = page.locator('.ant-picker-dropdown:visible')
  for (let i = 0; i < 24; i++) {
    const target = popup.locator(`.ant-picker-cell-in-view[title="${iso}"]`)
    if (await target.count()) {
      await target.click()
      return
    }
    const current = await popup
      .locator('.ant-picker-cell-in-view[title]')
      .first()
      .getAttribute('title')
    await popup
      .locator(iso < current ? '.ant-picker-header-prev-btn' : '.ant-picker-header-next-btn')
      .click()
  }
  throw new Error('Calendar date unavailable: ' + iso)
}
const setSize = async (size) => {
  await choose(page.locator('.list-page-size'), new RegExp('^' + size + '\\s*/'))
  await ready()
}
const action = async (name) => {
  if (name === 'Chi tiết phiếu nhập')
    await page
      .locator('.receipt-actions')
      .first()
      .getByRole('button', { name, exact: true })
      .click()
  else {
    await page
      .locator('.receipt-actions')
      .first()
      .getByRole('button', { name: 'Thao tác', exact: true })
      .click()
    await page.locator('.ant-dropdown:visible').getByRole('menuitem', { name, exact: true }).click()
  }
  await modal().locator('.receipt-summary').waitFor()
}
const metrics = () =>
  page.evaluate(() => {
    const body = document.querySelector('.receipts-panel .ant-table-body'),
      region = document.querySelector('.products-table-region'),
      footer = document.querySelector('.products-footer')
    const box = (el) => {
      const r = el.getBoundingClientRect()
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
    }
    const headers = [...document.querySelectorAll('.receipts-panel .ant-table-header th')].filter(
      (el) => !el.classList.contains('ant-table-cell-scrollbar'),
    )
    const cells = [
      ...(document.querySelector('.receipts-panel tr.ant-table-row')?.querySelectorAll('td') || []),
    ]
    const scrollers = (axis) =>
      [...region.querySelectorAll('*')].filter((el) =>
        axis === 'x'
          ? el.scrollWidth > el.clientWidth + 1 &&
            /auto|scroll/.test(getComputedStyle(el).overflowX)
          : el.scrollHeight > el.clientHeight + 1 &&
            /auto|scroll/.test(getComputedStyle(el).overflowY),
      ).length
    return {
      width: innerWidth,
      height: innerHeight,
      pageWidth: document.documentElement.scrollWidth,
      pageHeight: document.documentElement.scrollHeight,
      body: box(body),
      region: box(region),
      footer: box(footer),
      headers: headers.map(box),
      cells: cells.map(box),
      scrollTop: body.scrollTop,
      clientHeight: body.clientHeight,
      scrollHeight: body.scrollHeight,
      clientWidth: body.clientWidth,
      scrollWidth: body.scrollWidth,
      xScrollers: scrollers('x'),
      yScrollers: scrollers('y'),
    }
  })
const geometry = async (desktop) => {
  // Ant updates its separate header colgroup in a later ResizeObserver batch.
  await page.waitForFunction(() => {
    const headers = [...document.querySelectorAll('.receipts-panel .ant-table-header th')].filter(
      (el) => !el.classList.contains('ant-table-cell-scrollbar'),
    )
    const cells = [
      ...(document.querySelector('.receipts-panel tr.ant-table-row')?.querySelectorAll('td') || []),
    ]
    return (
      cells.length === 8 &&
      cells.every((el, i) => {
        const a = el.getBoundingClientRect(),
          b = headers[i]?.getBoundingClientRect()
        return b && Math.abs(a.left - b.left) < 2 && Math.abs(a.right - b.right) < 2
      })
    )
  })
  const m = await metrics()
  measurements.push(m)
  check('No document horizontal overflow at ' + m.width, m.pageWidth <= m.width + 1)
  if (desktop)
    check('Desktop document has no vertical scrollbar at ' + m.width, m.pageHeight <= m.height + 2)
  check('One data scroller per axis', m.xScrollers <= 1 && m.yScrollers <= 1)
  check(
    'Scrollbar reachable above pagination',
    m.body.bottom <= m.region.bottom + 1 && m.region.bottom <= m.footer.top + 1,
  )
  check('All eight columns retained', m.headers.length === 8)
  if (m.cells.length)
    m.headers.forEach((h, i) =>
      check(
        'Header/body alignment ' + i,
        Math.abs(h.left - m.cells[i].left) < 2 && Math.abs(h.right - m.cells[i].right) < 2,
      ),
    )
  return m
}
try {
  await start()
  check('Default size is 10', lists().at(-1).params.pageSize === '10')
  check('API total displayed', (await page.locator('.products-total').innerText()).includes('237'))
  check(
    'Long code preserved and truncated',
    await page
      .locator('.receipt-code-text')
      .first()
      .evaluate(
        (el) =>
          el.textContent.length === 123 &&
          el.scrollWidth > el.clientWidth &&
          getComputedStyle(el).textOverflow === 'ellipsis',
      ),
  )
  check(
    'Missing supplier uses em dash',
    (await page
      .locator('.receipts-panel tr.ant-table-row')
      .nth(1)
      .locator('td')
      .nth(3)
      .innerText()) === '—',
  )
  check(
    'Integer money remains exact',
    (await page.locator('.receipt-money').first().innerText()) === '9.223.372.036.854.775.807 ₫',
  )
  check(
    'Business date stays on 08/10',
    (await page
      .locator('.receipts-panel tr.ant-table-row')
      .first()
      .locator('td')
      .nth(2)
      .innerText()) === '08/10/2026',
  )
  check(
    'Existing local timestamp formatter',
    (await page
      .locator('.receipts-panel tr.ant-table-row')
      .first()
      .locator('td')
      .nth(6)
      .innerText()) === '08/10/2026 10:00:00',
  )
  await page.locator('.receipt-code').first().hover()
  await page.getByRole('tooltip').getByText(code, { exact: true }).waitFor()
  check('Tooltip exposes full unchanged receipt code')
  await page.mouse.move(0, 0)
  for (const size of [20, 50, 100, 10]) {
    const before = lists().length
    await setSize(size)
    check(
      'Size ' + size + ' requests server page 1 once',
      lists().length === before + 1 &&
        lists().at(-1).params.page === '1' &&
        lists().at(-1).params.pageSize === String(size),
    )
    check(
      'Server row count ' + size,
      (await page.locator('.receipts-panel tr.ant-table-row').count()) === size,
    )
  }
  await setSize(100)
  for (const [width, height] of [
    [360, 800],
    [390, 844],
    [768, 1024],
    [1024, 768],
    [1366, 768],
    [1920, 1080],
  ]) {
    const before = lists().length
    await page.setViewportSize({ width, height })
    await page.waitForFunction((desktop) => {
      const sidebar = document.querySelector('.app-sidebar')
      return Math.abs(sidebar.getBoundingClientRect().width - (desktop ? 256 : 0)) < 1
    }, width >= 768)
    await page.waitForTimeout(400)
    const m = await geometry(width >= 768)
    check(
      'Resize does not request API at ' + width,
      lists().length === before && lists().at(-1).params.pageSize === '100',
    )
    const body = page.locator('.receipts-panel .ant-table-body')
    const fixedBefore = m.headers.at(-1)
    await body.evaluate((el) => {
      el.scrollTop = 150
      el.scrollLeft = 240
    })
    await page.waitForTimeout(100)
    const after = await metrics()
    measurements.push({ afterScroll: true, ...after })
    check(
      'Action header fixed on both axes at ' + width,
      Math.abs(after.headers.at(-1).right - fixedBefore.right) < 2 &&
        Math.abs(after.headers.at(-1).top - fixedBefore.top) < 2,
    )
    check(
      'Action body stays fixed horizontally at ' + width,
      Math.abs(after.cells.at(-1).right - m.cells.at(-1).right) < 2,
    )
    await body.evaluate((el) => {
      el.scrollTop = 0
      el.scrollLeft = 0
    })
    await page.screenshot({ path: join(artifacts, 'list-' + width + '.png'), fullPage: true })
    await page.getByRole('button', { name: 'Tạo phiếu nhập', exact: true }).click()
    await modal().locator('#receipt-supplier').fill('Dữ liệu không mất khi resize')
    await modal().getByRole('button', { name: '+ Thêm sản phẩm', exact: true }).click()
    await modal().getByLabel('Số lượng 2', { exact: true }).fill('123')
    check(
      'Form retains all lines and input at ' + width,
      (await modal().getByLabel('Số lượng 2', { exact: true }).inputValue()) === '123',
    )
    check(
      'Footer inside viewport at ' + width,
      await modal()
        .locator('.receipt-dialog-footer')
        .evaluate((el) => {
          const r = el.getBoundingClientRect()
          return r.top >= 0 && r.bottom <= innerHeight + 1
        }),
    )
    if (width <= 650)
      check(
        'Mobile receipt information is one column',
        await modal()
          .locator('.receipt-grid')
          .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length === 1),
      )
    await page.screenshot({ path: join(artifacts, 'form-' + width + '.png') })
    await close()
  }
  const cdp = await context.newCDPSession(page)
  await page.setViewportSize({ width: 1093, height: 614 })
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1093,
    height: 614,
    deviceScaleFactor: 1.25,
    mobile: false,
  })
  await page.waitForTimeout(700)
  await geometry(true)
  console.log('Layout and responsive checks complete')
  check('125% zoom equivalent CSS viewport 1093x614')
  await page.screenshot({ path: join(artifacts, 'zoom-125.png') })
  await cdp.send('Emulation.clearDeviceMetricsOverride')
  await page.setViewportSize({ width: 1366, height: 768 })
  let before = lists().length
  await page.locator('.app-header__toggle, .app-header button').first().click()
  await page.waitForTimeout(350)
  check('Sidebar resizing does not reload API', lists().length === before)
  await page.locator('.receipts-panel .ant-table-body').evaluate((el) => {
    el.scrollTop = 500
  })
  await page.locator('.ant-pagination-next').click()
  await ready()
  check('Page change resets vertical scroll', (await metrics()).scrollTop === 0)
  await choose(page.locator('.receipt-filters .ant-select').nth(1), 'Đã xác nhận')
  await ready()
  check(
    'Filter resets page and keeps size',
    lists().at(-1).params.page === '1' &&
      lists().at(-1).params.pageSize === '100' &&
      lists().at(-1).params.status === 'CONFIRMED',
  )
  await setSize(20)
  check('Size change keeps filter', lists().at(-1).params.status === 'CONFIRMED')
  await page.getByRole('button', { name: 'Đặt lại', exact: true }).click()
  await ready()
  await chooseDate('#receipt-filter-from', '2026-10-09')
  await chooseDate('#receipt-filter-to', '2026-10-08')
  await page.getByText('Khoảng thời gian không hợp lệ.', { exact: true }).first().waitFor()
  before = lists().length
  await page.locator('.products-toolbar button').click()
  await page.waitForTimeout(200)
  check('Invalid date range blocks API', lists().length === before)
  await page.getByRole('button', { name: 'Đặt lại', exact: true }).click()
  await ready()
  await chooseDate('#receipt-filter-from', '2026-10-08')
  await chooseDate('#receipt-filter-to', '2026-10-08')
  await ready()
  check(
    'Inclusive receiptDate bounds unchanged',
    lists().at(-1).params.from === '2026-10-08' && lists().at(-1).params.to === '2026-10-08',
  )
  await page.getByRole('button', { name: 'Đặt lại', exact: true }).click()
  await ready()
  await choose(page.locator('.receipt-filters .ant-select').nth(1), 'Nháp')
  await choose(page.locator('.receipt-filters .ant-select').nth(1), 'Đã xác nhận')
  await ready()
  await page.waitForTimeout(700)
  check(
    'Stale response cannot overwrite newest filter',
    (await page.locator('.receipt-code').first().innerText()) === 'PN-CONFIRMED',
  )
  await page.getByRole('button', { name: 'Đặt lại', exact: true }).click()
  await ready()
  total = 0
  await page.locator('.products-toolbar button').click()
  await ready()
  check(
    'Empty state has zero server total',
    (await page.locator('.receipts-panel tr.ant-table-row').count()) === 0 &&
      (await page.locator('.list-range').innerText()).includes('0–0 / 0'),
  )
  total = 237
  await page.locator('.products-toolbar button').click()
  await ready()
  console.log('Filter, stale response and empty-state checks complete')
  await action('Chi tiết phiếu nhập')
  check(
    'Snapshot displayed without catalog replacement',
    (await modal().innerText()).includes('Tên snapshot của phiếu') &&
      !(await modal().innerText()).includes('Tên danh mục hiện tại'),
  )
  check('View has no editable form', (await modal().locator('form').count()) === 0)
  await close()
  await action('Sửa phiếu nhập')
  check(
    'Warehouse is immutable during edit',
    await modal().locator('#receipt-warehouse').isDisabled(),
  )
  await modal().getByLabel('Đơn giá 1', { exact: true }).fill('0')
  await modal().getByRole('button', { name: 'Lưu', exact: true }).click()
  await modal().waitFor({ state: 'hidden' })
  await ready()
  check(
    'Edit preserves int64, version and omits warehouse',
    writes().at(-1).raw.includes('9223372036854775807') &&
      JSON.parse(writes().at(-1).raw).version === 7 &&
      !writes().at(-1).raw.includes('warehouseId'),
  )
  await page.getByRole('button', { name: 'Tạo phiếu nhập', exact: true }).click()
  await choose(modal().locator('.receipt-lines-table .ant-select'), 'Tên danh mục hiện tại')
  await modal().getByLabel('Số lượng 1', { exact: true }).fill('10')
  await modal().getByLabel('Đơn giá 1', { exact: true }).fill('100')
  await modal().getByRole('button', { name: 'Lưu', exact: true }).click()
  await modal().waitFor({ state: 'hidden' })
  await ready()
  check(
    'Create draft uses existing payload',
    writes().at(-1).path === '/stock-receipts' &&
      JSON.parse(writes().at(-1).raw).warehouseId === 'w1' &&
      !writes().at(-1).raw.includes('version'),
  )
  await action('Xác nhận phiếu')
  before = writes().length
  await modal().getByRole('button', { name: 'Xác nhận phiếu', exact: true }).dblclick()
  await modal().waitFor({ state: 'hidden' })
  await ready()
  check(
    'Confirm sends latest version exactly once',
    writes().length === before + 1 && writes().at(-1).raw === '{"version":7}',
  )
  await action('Hủy phiếu')
  await modal().getByRole('button', { name: 'Hủy phiếu', exact: true }).click()
  await modal().waitFor({ state: 'hidden' })
  await ready()
  check('Draft cancellation reason remains optional', writes().at(-1).raw === '{"version":7}')
  detailStatus = 'CONFIRMED'
  await page.locator('.products-toolbar button').click()
  await ready()
  await action('Hủy phiếu')
  before = writes().length
  await modal().getByRole('button', { name: 'Hủy phiếu', exact: true }).click()
  await modal()
    .getByText('Lý do hủy phiếu đã xác nhận phải có nội dung và tối đa 2000 ký tự.', {
      exact: true,
    })
    .waitFor()
  check(
    'Confirmed cancel requires reason and warns of stock reversal',
    writes().length === before &&
      (await modal().innerText()).includes('Hệ thống có thể từ chối hủy nếu không đủ tồn kho.'),
  )
  scenario = 'insufficient'
  await modal().locator('#receipt-cancel-reason').fill('Sai phiếu')
  await modal().getByRole('button', { name: 'Hủy phiếu', exact: true }).click()
  await modal()
    .getByText('Không đủ tồn kho để hủy phiếu. Dữ liệu chưa thay đổi.', { exact: true })
    .waitFor()
  check(
    'Insufficient stock preserves detail and blocks repeat',
    await modal().getByRole('button', { name: 'Hủy phiếu', exact: true }).isDisabled(),
  )
  await close()
  scenario = 'normal'
  await action('Hủy phiếu')
  await modal().locator('#receipt-cancel-reason').fill('  Sai phiếu  ')
  await modal().getByRole('button', { name: 'Hủy phiếu', exact: true }).click()
  await modal().waitFor({ state: 'hidden' })
  await ready()
  check(
    'Confirmed cancellation keeps trimmed reason and version',
    writes().at(-1).raw === '{"version":7,"reason":"Sai phiếu"}',
  )
  detailStatus = 'DRAFT'
  await page.locator('.products-toolbar button').click()
  await ready()
  await action('Sửa phiếu nhập')
  scenario = 'conflict'
  await modal().locator('#receipt-note').fill('Giữ nội dung chưa lưu')
  await modal().getByRole('button', { name: 'Lưu', exact: true }).click()
  await page.waitForTimeout(350)
  check(
    'Conflict preserves inputs and blocks retry',
    (await modal().locator('#receipt-note').inputValue()) === 'Giữ nội dung chưa lưu' &&
      (await modal().getByRole('button', { name: 'Lưu', exact: true }).isDisabled()),
  )
  await close()
  scenario = 'normal'
  detailStatus = 'CANCELLED'
  await page.locator('.products-toolbar button').click()
  await ready()
  check(
    'Cancelled receipt only offers detail',
    (await page.locator('.receipt-actions').first().getByRole('button').count()) === 1,
  )
  await action('Chi tiết phiếu nhập')
  check('Cancelled receipt is read-only', (await modal().locator('form').count()) === 0)
  await close()
  detailStatus = 'DRAFT'
  await page.locator('.products-toolbar button').click()
  await ready()
  await choose(page.locator('.receipt-filter-warehouse .ant-select'), 'K2')
  await ready()
  check('Warehouse filter keeps its existing API scope', lists().at(-1).params.warehouseId === 'w2')
  await page.getByRole('button', { name: 'Đặt lại', exact: true }).click()
  await ready()
  check(
    'Reset does not modify working warehouse',
    await page
      .locator('.app-header__warehouse')
      .innerText()
      .then((text) => text.includes('Kho được giao')),
  )
  console.log('Create, edit, confirm, cancel and conflict checks complete')
  for (const permission of [
    'STOCK_RECEIPT_UPDATE',
    'STOCK_RECEIPT_CONFIRM',
    'STOCK_RECEIPT_CANCEL',
  ]) {
    permissions = ['STOCK_RECEIPT_VIEW', permission]
    await start()
    check(
      'Create hidden without CREATE: ' + permission,
      (await page.getByRole('button', { name: 'Tạo phiếu nhập', exact: true }).count()) === 0,
    )
    await page
      .locator('.receipt-actions')
      .first()
      .getByRole('button', { name: 'Thao tác', exact: true })
      .click()
    await page.locator('.ant-dropdown:visible .ant-dropdown-menu-item').first().waitFor()
    check(
      'Only permitted secondary action: ' + permission,
      (await page.locator('.ant-dropdown:visible .ant-dropdown-menu-item').count()) === 1,
    )
    await page.keyboard.press('Escape')
  }
  permissions = ['STOCK_RECEIPT_VIEW']
  await start()
  check(
    'View-only has detail but no secondary actions',
    (await page.locator('.receipt-actions').first().getByRole('button').count()) === 1,
  )
  permissions = []
  admin = true
  assigned = [assigned[0]]
  await start()
  check(
    'ADMIN exception preserves create permission',
    await page.getByRole('button', { name: 'Tạo phiếu nhập', exact: true }).isVisible(),
  )
  await page.getByRole('button', { name: 'Tạo phiếu nhập', exact: true }).click()
  check(
    'ADMIN warehouse choices remain assigned scope',
    (await modal().locator('.receipt-grid .ant-select-selection-item').innerText()) ===
      'K1 — Kho được giao',
  )
  await close()
  await modal().waitFor({ state: 'hidden' })
  scenario = 'detail-denied'
  await page
    .locator('.receipt-actions')
    .first()
    .getByRole('button', { name: 'Chi tiết phiếu nhập', exact: true })
    .click()
  await modal().getByText('Bạn không có quyền truy cập chức năng này.', { exact: true }).waitFor()
  check(
    'Warehouse access denial renders no receipt data',
    (await modal().locator('.receipt-summary').count()) === 0,
  )
  await close()
  scenario = 'normal'
  permissions = [...allPermissions]
  admin = false
  await start()
  await page.setViewportSize({ width: 390, height: 400 })
  await page.getByRole('button', { name: 'Tạo phiếu nhập', exact: true }).click()
  check(
    'Virtual keyboard height keeps footer reachable',
    await modal()
      .locator('.receipt-dialog-footer')
      .evaluate((el) => el.getBoundingClientRect().bottom <= innerHeight + 1),
  )
  check(
    'Short viewport form scrolls',
    await modal()
      .locator('.receipt-dialog-body')
      .evaluate((el) => el.scrollHeight > el.clientHeight),
  )
  await close()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Tạo phiếu nhập', exact: true }).click()
  await modal().locator('#receipt-note').fill('Giữ dữ liệu khi resize')
  await modal().getByRole('button', { name: '+ Thêm sản phẩm', exact: true }).click()
  await page.setViewportSize({ width: 1024, height: 768 })
  check(
    'Resize preserves form and line count',
    (await modal().locator('#receipt-note').inputValue()) === 'Giữ dữ liệu khi resize' &&
      (await modal().locator('.receipt-lines-table tbody tr').count()) === 2,
  )
  await close()
  await page.setViewportSize({ width: 390, height: 844 })
  await page
    .locator('.receipt-actions')
    .first()
    .getByRole('button', { name: 'Thao tác', exact: true })
    .click()
  await page.locator('.ant-dropdown:visible .ant-dropdown-menu-item').first().waitFor()
  check(
    'Mobile menu retains all three permitted actions',
    (await page.locator('.ant-dropdown:visible .ant-dropdown-menu-item').count()) === 3,
  )
  check(
    'Mobile menu is not clipped',
    await page.locator('.ant-dropdown:visible').evaluate((el) => {
      const r = el.getBoundingClientRect()
      return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight
    }),
  )
  await page.keyboard.press('Escape')
  scenario = 'list-forbidden'
  await page.locator('.products-toolbar button').click()
  await ready()
  check(
    'FORBIDDEN clears list and shows error',
    (await page.locator('.receipts-panel tr.ant-table-row').count()) === 0 &&
      (await page
        .locator('.receipts-page > .ant-alert')
        .innerText()
        .then((text) => text.includes('Bạn không có quyền'))),
  )
  check(
    'No unsupported keyword query added',
    lists().every((call) => !('keyword' in call.params)),
  )
  assert.deepEqual(errors, [])
  check('No runtime or ResizeObserver errors')
  await writeFile(
    join(artifacts, 'browser-results.json'),
    JSON.stringify({ checks, measurements, calls, errors }, null, 2),
  )
  console.log(JSON.stringify({ passed: checks.length, artifacts, errors }, null, 2))
} catch (error) {
  await page.screenshot({ path: join(artifacts, 'failure.png'), fullPage: true })
  await writeFile(
    join(artifacts, 'failure.json'),
    JSON.stringify({ message: error.message, checks, measurements, calls, errors }, null, 2),
  )
  throw error
} finally {
  await browser.close()
}
