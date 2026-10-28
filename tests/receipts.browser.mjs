// Intercept every API request: this suite never reads or mutates a live backend.
import assert from 'node:assert/strict'
import process from 'node:process'
import { Buffer } from 'node:buffer'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const { chromium } = await import(
  pathToFileURL(
    process.env.PLAYWRIGHT_MODULE ||
      join(process.env.TEMP, 'codex-dashboard-browser/node_modules/playwright/index.mjs'),
  ).href
)
const source = ts.transpileModule(await readFile('src/utils/stock.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const { stringifyStockJson, parseStockJson } = await import(
  'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
)
const artifacts = join(process.env.TEMP, 'codex-receipts-browser')
await mkdir(artifacts, { recursive: true })
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  ignoreDefaultArgs: ['--hide-scrollbars'],
})
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  reducedMotion: 'reduce',
  timezoneId: 'Asia/Bangkok',
})
await context.addInitScript(() => {
  localStorage.setItem('frontend-base:access-token', 'receipt-fixture')
  sessionStorage.setItem('working-warehouse:receipt-user', 'w1')
})
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
  detailStatus = 'DRAFT',
  version = 7,
  detailId = 'r0'
const warehouses = [
  { id: 'w1', code: 'KHO_01', name: 'Kho trung tâm', status: 1 },
  { id: 'w2', code: 'KHO_02', name: 'Kho phía Đông', status: 1 },
  { id: 'w3', code: 'KHO_03', name: 'Kho ngừng hoạt động', status: 0 },
]
const line = (n) => ({
  productId: 'p' + n,
  productCode: 'SP-' + n + '-LONG'.repeat(12),
  productName: 'Tên snapshot sản phẩm ' + n + ' rất dài để kiểm tra cuộn ngang',
  unit: 'cây',
  quantity: n === 0 ? 9007199254740993n : 13,
  unitPrice: n === 0 ? 1 : 313131,
  lineTotal: n === 0 ? 9007199254740993n : 4070703,
})
const receipt = (n = 0) => ({
  id: 'r' + n,
  code: 'PN-' + n + '-LONG'.repeat(24),
  warehouseId: 'w1',
  receiptDate: '2026-10-28',
  supplierName: 'Nhà cung cấp '.repeat(15),
  note: 'Ghi chú dài\n'.repeat(15),
  status: ['DRAFT', 'CONFIRMED', 'CANCELLED'][n % 3],
  totalAmount: 9007199254740993n,
  version,
  createdBy: 'a12b34cd-5678-49ab-9012-cdef34567890',
  createdAt: '2026-10-28T03:00:00Z',
  confirmedBy: n % 3 ? 'confirmed-user' : null,
  confirmedAt: n % 3 ? '2026-10-28T04:00:00Z' : null,
  cancelledBy: n % 3 === 2 ? 'cancelled-user' : null,
  cancelledAt: n % 3 === 2 ? '2026-10-28T05:00:00Z' : null,
  cancellationReason: n % 3 === 2 ? 'Lý do hủy lịch sử' : null,
  lines: Array.from({ length: 24 }, (_, i) => line(i)),
})
const calls = [],
  errors = [],
  unexpected = [],
  checks = [],
  measurements = []
await context.route('**/*', async (route) => {
  const req = route.request()
  if (!['xhr', 'fetch'].includes(req.resourceType())) return route.continue()
  const url = new URL(req.url()),
    path = url.pathname.replace(/^\/api/, ''),
    method = req.method(),
    params = Object.fromEntries(url.searchParams)
  const raw = req.postData()
  calls.push({ path, method, params, raw })
  const reply = (data, status = 200) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: stringifyStockJson(data),
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  if (method === 'OPTIONS') return reply({})
  if (path === '/auth/me')
    return reply({
      id: 'receipt-user',
      username: 'receipt-test',
      fullName: 'Kiểm tra phiếu nhập',
      permissions,
    })
  if (path === '/users/receipt-user') return reply({ id: 'receipt-user', status: 1 })
  if (path === '/users/receipt-user/roles')
    return reply(admin ? [{ code: 'ADMIN', status: 1 }] : [])
  if (path === '/users/me/warehouses') return reply(warehouses)
  if (path === '/products')
    return reply({
      items: [0, 1, 2].map((n) => ({
        id: 'pick' + n,
        code: 'CHON-' + n,
        name: 'Sản phẩm chọn ' + n,
        status: 1,
      })),
      total: 3,
      page: 1,
      pageSize: 100,
    })
  if (path === '/stock-receipts' && method === 'GET') {
    if (scenario === 'list-error')
      return reply({ code: 'SERVER_ERROR', message: 'Lỗi danh sách giả lập' }, 500)
    const total = scenario === 'empty' ? 0 : 137,
      page = Number(params.page),
      pageSize = Number(params.pageSize)
    return reply({
      items: Array.from(
        { length: Math.max(0, Math.min(pageSize, total - (page - 1) * pageSize)) },
        (_, i) => receipt((page - 1) * pageSize + i),
      ),
      total,
      page,
      pageSize,
    })
  }
  if (/^\/stock-receipts\/[^/]+$/.test(path) && method === 'GET') {
    detailId = path.split('/').at(-1)
    const n = Number(detailId.slice(1)) || 0
    detailStatus = receipt(n).status
    const value = { ...receipt(n), id: detailId, status: detailStatus }
    if (scenario === 'detail-slow') await new Promise((resolve) => setTimeout(resolve, 700))
    if (scenario === 'scope')
      return reply({ code: 'WAREHOUSE_ACCESS_DENIED', message: 'Kho ngoài phạm vi' }, 403)
    return reply(value)
  }
  if (path.startsWith('/stock-receipts') && ['POST', 'PUT'].includes(method)) {
    if (scenario === 'conflict')
      return reply({ code: 'VERSION_CONFLICT', message: 'Version cũ' }, 409)
    if (scenario === 'insufficient')
      return reply({ code: 'INSUFFICIENT_STOCK', message: 'Thiếu tồn' }, 409)
    if (scenario === 'write-error')
      return reply({ code: 'SERVER_ERROR', message: 'Lỗi lưu giả lập' }, 500)
    await new Promise((resolve) => setTimeout(resolve, 120))
    if (path.endsWith('/confirm')) detailStatus = 'CONFIRMED'
    else if (path.endsWith('/cancel')) detailStatus = 'CANCELLED'
    return reply({ ...receipt(), id: detailId, status: detailStatus, version: ++version })
  }
  unexpected.push({ path, method })
  return reply({ message: 'Unexpected API request' }, 500)
})
const page = await context.newPage()
page.setDefaultTimeout(10000)
page.on('pageerror', (error) => errors.push(error.message))
const base = process.env.RECEIPTS_TEST_URL || 'http://127.0.0.1:5173'
const pause = () => page.waitForTimeout(150)
const listCalls = () => calls.filter((c) => c.path === '/stock-receipts' && c.method === 'GET')
const writes = () => calls.filter((c) => ['POST', 'PUT'].includes(c.method))
const modal = () => page.locator('.stock-receipt-dialog .ant-modal-content:visible')
const openRow = async (action, n = 0) => {
  await page
    .locator('.receipt-list .ant-table-tbody > tr[data-row-key]')
    .nth(n)
    .getByRole('button', { name: action, exact: true })
    .click()
  await modal().waitFor()
  await page.waitForFunction(
    () => !document.querySelector('.stock-receipt-dialog .ant-spin-spinning'),
  )
  await pause()
}
const closeModal = async () => {
  await modal()
    .locator('.ant-modal-footer')
    .getByRole('button', { name: /^(Đóng|Quay lại)$/ })
    .click()
  await page
    .locator('.stock-receipt-dialog .ant-modal-content:visible')
    .waitFor({ state: 'hidden' })
}
const check = (name) => {
  checks.push(name)
  process.stdout.write('PASS ' + name + '\n')
}
const measure = async (label) => {
  await pause()
  const value = await page.evaluate(() => {
    const content = document.querySelector('.stock-receipt-dialog .ant-modal-content'),
      footer = content?.querySelector('.ant-modal-footer')
    const rect = footer?.getBoundingClientRect(),
      modalRect = content?.getBoundingClientRect()
    return {
      width: innerWidth,
      height: innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      modalWidth: modalRect?.width,
      modalLeft: modalRect?.left,
      modalRight: modalRect?.right,
      footerTop: rect?.top,
      footerBottom: rect?.bottom,
    }
  })
  measurements.push({ label, ...value })
  assert.ok(
    value.documentWidth <= value.width + 1,
    `${label}: page horizontal overflow ${JSON.stringify(value)}`,
  )
  if (value.modalWidth) {
    assert.ok(
      value.modalLeft >= 0 && value.modalRight <= value.width + 1,
      `${label}: modal horizontal overflow`,
    )
    assert.ok(
      value.footerTop >= 0 && value.footerBottom <= value.height + 1,
      `${label}: footer outside viewport`,
    )
  }
}

try {
  await page.goto(base + '/stock/receipts')
  await page.getByRole('heading', { name: 'Danh sách phiếu nhập', exact: true }).waitFor()
  await page.waitForFunction(
    () => document.querySelectorAll('.receipt-list tr[data-row-key]').length === 10,
  )
  assert.ok(!(await page.locator('.receipts-page').innerText()).includes('common.all'))
  assert.equal(await page.locator('.receipt-list .ant-table-thead th').count(), 8)
  const beforeExpand = listCalls().length
  await page.getByRole('button', { name: 'Mở rộng', exact: true }).click()
  await page.getByRole('button', { name: 'Thu gọn', exact: true }).click()
  assert.equal(listCalls().length, beforeExpand)
  const statusInput = page.getByLabel('Trạng thái', { exact: true })
  await statusInput.click()
  await page
    .locator('.ant-select-dropdown:visible')
    .getByTitle('Đã xác nhận', { exact: true })
    .click()
  await pause()
  assert.equal(listCalls().length, beforeExpand)
  await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click()
  await pause()
  assert.equal(listCalls().at(-1).params.status, 'CONFIRMED')
  assert.equal(listCalls().at(-1).params.page, '1')
  check('desktop filters submit once; expand/collapse makes no API request')

  await page.getByRole('button', { name: 'Mở rộng', exact: true }).click()
  await page.getByLabel('Từ ngày nhập', { exact: true }).click()
  await page.locator('.ant-picker-dropdown:visible td[title="2026-10-01"]').click()
  await page.locator('.ant-picker-dropdown:visible').waitFor({ state: 'hidden' })
  await page.getByLabel('Đến ngày nhập (bao gồm)', { exact: true }).click()
  await page.locator('.ant-picker-dropdown:visible td[title="2026-10-28"]').click()
  await page.locator('.ant-picker-dropdown:visible').waitFor({ state: 'hidden' })
  const beforeEnter = listCalls().length
  await page.getByLabel('Đến ngày nhập (bao gồm)', { exact: true }).press('Enter')
  await pause()
  assert.equal(listCalls().at(-1).params.from, '2026-10-01')
  assert.equal(listCalls().at(-1).params.to, '2026-10-28')
  assert.equal(listCalls().length, beforeEnter + 1)
  await page.getByRole('button', { name: 'Thu gọn', exact: true }).click()
  assert.equal(await page.getByLabel('Từ ngày nhập', { exact: true }).isVisible(), false)
  check('inclusive date filters use the existing YYYY-MM-DD contract and retain hidden values')

  for (const size of [20, 50, 100, 10]) {
    await page.locator('.stocktake-table__size .ant-select-selector').click()
    await page
      .locator('.ant-select-dropdown:visible')
      .getByTitle(String(size), { exact: true })
      .click()
    await page.locator('.ant-select-dropdown:visible').waitFor({ state: 'hidden' })
    await pause()
    assert.equal(listCalls().at(-1).params.pageSize, String(size))
  }
  await page.getByRole('button', { name: 'Đặt lại', exact: true }).click()
  await pause()
  assert.deepEqual(listCalls().at(-1).params, { page: '1', pageSize: '10', warehouseId: 'w1' })
  const scrolling = await page.locator('.receipt-list .ant-table-content').evaluate((el) => {
    el.scrollLeft = el.scrollWidth
    const action = el.querySelector('td.ant-table-cell-fix-right')
    return { horizontal: el.scrollWidth > el.clientWidth, fixed: getComputedStyle(action).position }
  })
  assert.ok(scrolling.horizontal)
  assert.equal(scrolling.fixed, 'sticky')
  check('server page sizes 10/20/50/100; reset restores warehouse context; actions stay sticky')

  await openRow('Chi tiết phiếu nhập')
  assert.ok((await modal().innerText()).includes('9.007.199.254.740.993'))
  await modal().locator('summary').click()
  assert.ok((await modal().innerText()).includes('a12b34cd-5678-49ab-9012-cdef34567890'))
  assert.equal(await modal().locator('.receipt-detail-table .ant-table-thead th').count(), 6)
  await measure('desktop-detail')
  await page.screenshot({ path: join(artifacts, 'desktop-detail.png') })
  await closeModal()
  check('detail uses exact int64 totals, complete snapshot columns and expandable audit')

  await page.getByRole('button', { name: 'Tạo phiếu nhập', exact: true }).click()
  await modal().waitFor()
  await modal().getByLabel('Nhà cung cấp', { exact: true }).fill('Nhà cung cấp kiểm thử')
  const row = () => modal().locator('.receipt-entry-row').first()
  await row().locator('.ant-select').click()
  await page.locator('.ant-select-dropdown:visible').getByTitle('CHON-0 — Sản phẩm chọn 0').click()
  await row().getByRole('textbox', { name: 'Số lượng 1', exact: true }).fill('9007199254740993')
  await row().getByRole('textbox', { name: 'Đơn giá 1', exact: true }).fill('1')
  assert.ok(
    (await modal().locator('.receipt-estimate').innerText()).includes('9.007.199.254.740.993'),
  )
  await modal().getByRole('button', { name: 'Thêm sản phẩm', exact: true }).click()
  await modal().getByRole('button', { name: 'Xóa dòng 2', exact: true }).click()
  assert.equal(
    await row().getByRole('textbox', { name: 'Số lượng 1', exact: true }).inputValue(),
    '9007199254740993',
  )
  await row().getByRole('textbox', { name: 'Đơn giá 1', exact: true }).fill('0')
  scenario = 'write-error'
  await modal().getByRole('button', { name: 'Lưu phiếu nháp', exact: true }).click()
  await modal().getByText('Lỗi lưu giả lập', { exact: true }).waitFor()
  assert.equal(
    await modal().getByLabel('Nhà cung cấp', { exact: true }).inputValue(),
    'Nhà cung cấp kiểm thử',
  )
  scenario = 'normal'
  await modal().getByRole('button', { name: 'Lưu phiếu nháp', exact: true }).click()
  await modal().waitFor({ state: 'hidden' })
  const created = parseStockJson(writes().at(-1).raw)
  assert.equal(created.lines[0].quantity, 9007199254740993n)
  assert.equal(created.lines[0].unitPrice, 0)
  assert.equal(created.warehouseId, 'w1')
  check(
    'create preserves row values and exact totals; zero price valid; API errors retain form; retry succeeds',
  )

  await openRow('Sửa phiếu nhập')
  assert.equal(await modal().getByLabel('Kho', { exact: true }).isDisabled(), true)
  await modal().getByLabel('Nhà cung cấp', { exact: true }).fill('Cập nhật nhà cung cấp')
  await modal().getByRole('button', { name: 'Lưu phiếu nháp', exact: true }).click()
  await modal().waitFor({ state: 'hidden' })
  const updated = parseStockJson(writes().at(-1).raw)
  assert.equal(writes().at(-1).method, 'PUT')
  assert.ok(!('warehouseId' in updated))
  assert.ok('version' in updated)
  check('edit keeps warehouse locked and sends existing replacement payload with version')

  await openRow('Xác nhận phiếu')
  scenario = 'conflict'
  await modal().getByRole('button', { name: 'Xác nhận phiếu', exact: true }).click()
  await modal().locator('.ant-alert-error').waitFor()
  assert.equal(
    await modal().getByRole('button', { name: 'Xác nhận phiếu', exact: true }).isDisabled(),
    true,
  )
  scenario = 'normal'
  await modal().getByRole('button', { name: 'Tải lại chi tiết', exact: true }).click()
  await pause()
  const beforeConfirm = writes().length
  await modal().getByRole('button', { name: 'Xác nhận phiếu', exact: true }).dblclick()
  await modal().waitFor({ state: 'hidden' })
  assert.equal(writes().length, beforeConfirm + 1)
  check('confirmation blocks stale-version retry until reload and prevents duplicate submit')

  await openRow('Hủy phiếu', 1)
  await modal().getByLabel('Lý do hủy', { exact: true }).fill('   ')
  const beforeCancel = writes().length
  await modal().getByRole('button', { name: 'Hủy phiếu', exact: true }).click()
  assert.equal(writes().length, beforeCancel)
  await modal().getByLabel('Lý do hủy', { exact: true }).fill('Hủy phiếu kiểm thử')
  scenario = 'insufficient'
  await modal().getByRole('button', { name: 'Hủy phiếu', exact: true }).click()
  await modal().locator('.ant-alert-error').waitFor()
  assert.equal(
    await modal().getByLabel('Lý do hủy', { exact: true }).inputValue(),
    'Hủy phiếu kiểm thử',
  )
  scenario = 'normal'
  await modal().getByRole('button', { name: 'Tải lại chi tiết', exact: true }).click()
  await pause()
  await modal().getByRole('button', { name: 'Hủy phiếu', exact: true }).click()
  await modal().waitFor({ state: 'hidden' })
  assert.equal(parseStockJson(writes().at(-1).raw).reason, 'Hủy phiếu kiểm thử')
  await openRow('Hủy phiếu')
  assert.ok((await modal().innerText()).includes('Hủy phiếu nháp không thay đổi tồn kho.'))
  await modal().getByRole('button', { name: 'Hủy phiếu', exact: true }).click()
  await modal().waitFor({ state: 'hidden' })
  assert.ok(!('reason' in parseStockJson(writes().at(-1).raw)))
  check(
    'confirmed cancellation requires reason, preserves it after insufficient stock; draft reason optional',
  )

  for (const width of [320, 375, 390, 414, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await measure('list-' + width)
    const count = listCalls().length
    const toggle = page.getByRole('button', { name: 'Bộ lọc', exact: true })
    if (await toggle.isVisible()) {
      await toggle.click()
      assert.equal(await toggle.getAttribute('aria-expanded'), 'true')
      assert.equal(await page.getByLabel('Từ ngày nhập', { exact: true }).isVisible(), true)
      assert.equal(
        await page.getByRole('button', { name: 'Mở rộng', exact: true }).isVisible(),
        false,
      )
      await measure('filter-open-' + width)
      await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click()
      await pause()
      assert.equal(await toggle.getAttribute('aria-expanded'), 'true')
      await page.getByRole('button', { name: 'Đặt lại', exact: true }).click()
      await pause()
      await toggle.click()
      await page.screenshot({ path: join(artifacts, `list-${width}.png`) })
      assert.equal(listCalls().length, count + 2)
    } else assert.equal(listCalls().length, count)
    for (const [action, n] of [
      ['Chi tiết phiếu nhập', 2],
      ['Xác nhận phiếu', 0],
      ['Hủy phiếu', 1],
    ]) {
      await openRow(action, n)
      await measure(`${action}-${width}`)
      await closeModal()
    }
    await page.getByRole('button', { name: 'Tạo phiếu nhập', exact: true }).click()
    await modal().waitFor()
    await modal().getByRole('button', { name: 'Thêm sản phẩm', exact: true }).click()
    await measure('create-' + width)
    await modal().getByRole('button', { name: 'Lưu phiếu nháp', exact: true }).click()
    assert.ok((await modal().innerText()).includes('Bắt buộc nhập.'))
    await measure('create-validation-' + width)
    if (width === 390 || width === 1440)
      await page.screenshot({ path: join(artifacts, `create-${width}.png`) })
    await closeModal()
  }
  check(
    '320/375/390/414/768/1024/1440: filters, all modals, validation, no page horizontal overflow; footer visible',
  )

  for (const viewport of [
    { width: 1440, height: 500 },
    { width: 844, height: 390 },
    { width: 375, height: 500 },
  ]) {
    await page.setViewportSize(viewport)
    await measure('short-list-' + viewport.width)
    await openRow('Hủy phiếu', 1)
    await measure('short-cancel-' + viewport.width)
    await closeModal()
    await page.getByRole('button', { name: 'Tạo phiếu nhập', exact: true }).click()
    await modal().waitFor()
    await measure('short-create-' + viewport.width)
    await closeModal()
  }
  check('short screens and mobile landscape keep modal footer accessible')

  await page.setViewportSize({ width: 1440, height: 900 })
  const beforeLayout = listCalls().length
  const sidebarButton = page
    .locator('.app-header')
    .getByRole('button', { name: /Thu gọn thanh bên|Mở rộng thanh bên/ })
  if (await sidebarButton.count()) {
    await sidebarButton.click()
    await pause()
    await measure('sidebar-toggle')
  }
  await page.locator('.receipt-list .basic-table__toolbar button').hover()
  await page.locator('.receipt-list .basic-table__toolbar button').focus()
  await measure('reload-focus')
  assert.equal(listCalls().length, beforeLayout)
  check('sidebar resize and reload hover/focus cause no requests or page overflow')

  scenario = 'empty'
  await page.locator('.receipt-list .basic-table__toolbar button').click()
  await page.getByText('Không có dữ liệu', { exact: true }).waitFor()
  scenario = 'list-error'
  await page.locator('.receipt-list .basic-table__toolbar button').click()
  await page.getByText('Lỗi danh sách giả lập', { exact: true }).waitFor()
  scenario = 'normal'
  await page.locator('.receipt-list .basic-table__toolbar button').click()
  await pause()
  scenario = 'scope'
  await openRow('Chi tiết phiếu nhập')
  assert.equal(await modal().locator('.receipt-summary').count(), 0)
  await closeModal()
  scenario = 'normal'
  check('empty, list error and warehouse-access error states render without stale detail')

  permissions = ['STOCK_RECEIPT_VIEW']
  await page.reload()
  await page.getByRole('heading', { name: 'Danh sách phiếu nhập', exact: true }).waitFor()
  await pause()
  assert.equal(await page.getByRole('button', { name: 'Tạo phiếu nhập', exact: true }).count(), 0)
  assert.equal(await page.locator('.receipt-actions button').count(), 10)
  permissions = []
  admin = true
  await page.reload()
  await page.getByRole('heading', { name: 'Danh sách phiếu nhập', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Tạo phiếu nhập', exact: true }).waitFor()
  check('view-only permissions hide mutations; existing ADMIN exception remains available')
  assert.deepEqual(unexpected, [])
  assert.deepEqual(errors, [])
  await writeFile(
    join(artifacts, 'results.json'),
    JSON.stringify({ checks, measurements, errors, unexpected, requests: calls.length }, null, 2),
  )
  process.stdout.write(`Completed ${checks.length} browser checks. Artifacts: ${artifacts}\n`)
} catch (error) {
  await page.screenshot({ path: join(artifacts, 'failure.png') }).catch(() => undefined)
  await writeFile(
    join(artifacts, 'failure.json'),
    JSON.stringify(
      {
        checks,
        errors,
        unexpected,
        measurements,
        text: await page.locator('body').innerText(),
        calls: calls.slice(-8),
      },
      null,
      2,
    ),
  )
  throw error
} finally {
  await browser.close()
}
