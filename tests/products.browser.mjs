// Controlled API fixtures only; this script never connects to the real backend.
import assert from 'node:assert/strict'
import process from 'node:process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
const { chromium } = await import(
  pathToFileURL(join(process.env.TEMP, 'codex-dashboard-browser/node_modules/playwright/index.mjs'))
    .href
)
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
})
const context = await browser.newContext({
  viewport: { width: 1366, height: 768 },
  reducedMotion: 'reduce',
  deviceScaleFactor: 1.25,
})
await context.addInitScript(() =>
  localStorage.setItem('frontend-base:access-token', 'product-ui-test'),
)
const base = process.env.PRODUCTS_TEST_URL || 'http://127.0.0.1:5173'
const artifacts = process.env.PRODUCTS_TEST_ARTIFACTS || 'docs/products-artifacts'
await mkdir(artifacts, { recursive: true })
const allPermissions = [
  ...(await readFile('src/constants/permissions.ts', 'utf8')).matchAll(/'([A-Z][A-Z_]+)'/g),
].map((match) => match[1])
let permissions = [...allPermissions],
  admin = false,
  listError = false
const calls = [],
  errors = [],
  checks = [],
  measurements = []
const product = (index) => ({
  id: `p${index}`,
  code: `SP-${index}`,
  name: `Sản phẩm ${index} có tên dài để kiểm tra hiển thị đầy đủ và xuống dòng đúng trong bảng sản phẩm dùng chung toàn hệ thống`,
  groupId: index === 0 ? 'g0' : 'g204',
  material: 'Nhựa Polyurethane chất lượng cao',
  color: 'Màu trắng kem và màu khác theo yêu cầu',
  dimensions: '120 × 50 mm',
  lengthMeters: 2.4,
  unit: 'cay',
  referencePurchasePrice: 123456,
  defaultSalePrice: index === 0 ? Number.MAX_SAFE_INTEGER : 234567,
  lowStockThreshold: 2147483647,
  description: 'Giữ đầy đủ mô tả và quy cách khi cập nhật trạng thái.',
  status: 1,
  createdAt: '2026-10-21T09:00:00Z',
  updatedAt: '2026-10-22T09:00:00Z',
})
const groups = Array.from({ length: 205 }, (_, index) => ({
  id: `g${index}`,
  code: `G${index}`,
  name: `Nhóm ${index}`,
  status: index === 0 ? 0 : 1,
}))
await context.route('**/api/**', async (route) => {
  const request = route.request(),
    url = new URL(request.url()),
    path = url.pathname.replace(/^\/api/, ''),
    method = request.method(),
    params = Object.fromEntries(url.searchParams)
  if (!url.pathname.startsWith('/api/')) return route.continue()
  const body = request.postDataJSON()
  calls.push({ path, method, params, body })
  const reply = (data, status = 200) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(data),
    })
  if (method === 'OPTIONS') return reply({})
  if (path === '/auth/me')
    return reply({
      id: 'ui-product',
      username: 'product-test',
      fullName: 'Kiểm tra Sản phẩm',
      permissions,
    })
  if (path === '/users/ui-product') return reply({ id: 'ui-product', status: 1 })
  if (path === '/users/ui-product/roles') return reply(admin ? [{ code: 'ADMIN', status: 1 }] : [])
  if (path === '/users/me/warehouses')
    return reply([{ id: 'w1', code: 'K1', name: 'Kho được giao', status: 1 }])
  if (path === '/product-groups') {
    const page = Number(params.page),
      size = Number(params.pageSize)
    return reply({
      page,
      pageSize: size,
      total: groups.length,
      items: groups.slice((page - 1) * size, page * size),
    })
  }
  if (path.startsWith('/product-groups/'))
    return reply(groups.find((group) => group.id === path.split('/').at(-1)))
  if (path === '/products' && method === 'GET') {
    if (listError) return reply({ status: 503, message: 'Lỗi kiểm tra API sản phẩm' }, 503)
    const page = Number(params.page),
      size = Number(params.pageSize),
      total = params.keyword === 'empty' ? 0 : 237
    const items = Array.from(
      { length: Math.max(0, Math.min(size, total - (page - 1) * size)) },
      (_, index) => product((page - 1) * size + index),
    )
    if (params.keyword === 'slow') {
      for (const item of items) item.name = 'KẾT QUẢ CŨ'
      await new Promise((resolve) => setTimeout(resolve, 650))
    }
    if (params.keyword === 'fresh') for (const item of items) item.name = 'KẾT QUẢ MỚI'
    return reply({ page, pageSize: size, total, items })
  }
  if (path.startsWith('/products/') && method === 'GET')
    return reply(product(Number(path.split('/').at(-1).slice(1))))
  if (
    (path === '/products' && method === 'POST') ||
    (path.startsWith('/products/') && method === 'PUT')
  ) {
    await new Promise((resolve) => setTimeout(resolve, 180))
    return reply({ ...product(0), ...body })
  }
  return reply({ items: [], total: 0, page: 1, pageSize: 10 })
})
const page = await context.newPage()
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (/Failed to resolve component|Unhandled|does not provide an export/.test(message.text()))
    errors.push(message.text())
})
const check = (name, value) => {
  assert.ok(value, name)
  checks.push(name)
}
const lists = () => calls.filter((call) => call.path === '/products' && call.method === 'GET')
const ready = async () => {
  await page.locator('.products-panel').waitFor()
  await page.waitForTimeout(450)
  await page.waitForFunction(
    () => document.querySelector('.products-table-region')?.getAttribute('aria-busy') === 'false',
  )
}
const geometry = async (label) => {
  const value = await page.evaluate(() => {
    const footer = document.querySelector('.products-footer').getBoundingClientRect()
    const region = document.querySelector('.products-table-region')
    const rows = [...document.querySelectorAll('.product-row')].map((row) => {
      const r = row.getBoundingClientRect()
      return { height: r.height, bottom: r.bottom }
    })
    return {
      width: innerWidth,
      height: innerHeight,
      scrollHeight: document.documentElement.scrollHeight,
      scrollWidth: document.documentElement.scrollWidth,
      footerBottom: footer.bottom,
      footerTop: footer.top,
      regionHeight: region.clientHeight,
      regionScroll: region.scrollHeight,
      rows,
    }
  })
  measurements.push({ label, ...value, params: lists().at(-1)?.params })
  check(
    `${label}: no page vertical/horizontal scrollbar`,
    value.scrollHeight <= value.height + 1 && value.scrollWidth <= value.width + 1,
  )
  check(
    `${label}: footer visible and no table scrolling`,
    value.footerBottom <= value.height && value.regionScroll <= value.regionHeight + 1,
  )
  check(
    `${label}: every API row visible, stable row height`,
    value.rows.length === Number(lists().at(-1).params.pageSize) &&
      value.rows.every(
        (row) => row.bottom <= value.footerTop && Math.abs(row.height - value.rows[0].height) < 1,
      ),
  )
}
const drawer = () => page.locator('.ant-drawer-content:visible')
const formField = (label) =>
  drawer()
    .locator('.ant-form-item')
    .filter({ has: page.locator('label').filter({ hasText: label }) })
const closeDrawer = async () => {
  await drawer().getByRole('button', { name: 'Hủy', exact: true }).click()
  await page.waitForTimeout(300)
}
const openMenu = async () => {
  await page
    .locator('.product-actions')
    .first()
    .getByRole('button', { name: 'Thao tác', exact: true })
    .click()
}
try {
  await page.goto(base + '/catalog/products')
  await ready()
  check(
    'Groups fetch all 205 records across three pages',
    calls
      .filter((call) => call.path === '/product-groups')
      .map((call) => call.params.page)
      .join(',') === '1,2,3',
  )
  check('Initial list waits for measurement and requests one server page', lists().length === 1)
  check(
    'API total is shown independently of current page items',
    (await page.locator('.products-total').innerText()).includes('237'),
  )
  check(
    'Product primary action uses login purple',
    await page
      .getByRole('button', { name: 'Thêm sản phẩm', exact: true })
      .evaluate((element) => getComputedStyle(element).backgroundColor === 'rgb(115, 87, 207)'),
  )
  check(
    '1366 desktop prioritizes five columns with the 256px sidebar',
    (await page.locator('.products-table th').count()) === 5,
  )
  await geometry('1366x768')
  await page.screenshot({ path: artifacts + '/desktop-1366.png', fullPage: true })
  const originalSize = Number(lists().at(-1).params.pageSize)
  await page.locator('.products-footer .ant-pagination-next').click()
  await ready()
  check('Server pagination requests page 2', lists().at(-1).params.page === '2')
  await page.setViewportSize({ width: 1920, height: 1080 })
  await ready()
  await geometry('1920x1080')
  check(
    'Resize increases pageSize and resets to page 1',
    Number(lists().at(-1).params.pageSize) > originalSize && lists().at(-1).params.page === '1',
  )
  await page.screenshot({ path: artifacts + '/desktop-1920.png', fullPage: true })
  const countBefore = lists().length
  await page.setViewportSize({ width: 1919, height: 1080 })
  await ready()
  check('Resize with unchanged capacity does not call API', lists().length === countBefore)
  for (const [width, height, label] of [
    [1366, 500, 'low-500'],
    [1093, 614, '125%-equivalent-1366x768'],
    [960, 768, 'narrow'],
    [390, 844, 'mobile-390'],
    [320, 640, 'mobile-320'],
  ]) {
    await page.setViewportSize({ width, height })
    await ready()
    await geometry(label)
    await page.screenshot({ path: artifacts + `/${label}.png`, fullPage: true })
  }
  // Equivalent 125% browser zoom: reduced CSS viewport rendered with DPR 1.25.
  await page.setViewportSize({ width: 1093, height: 614 })
  await ready()
  await geometry('zoom-125%-DPR-1.25')
  await page.screenshot({ path: artifacts + '/zoom-125.png', fullPage: true })
  await page.setViewportSize({ width: 1366, height: 768 })
  await ready()
  const keyword = page.getByRole('textbox', { name: 'Tìm theo mã hoặc tên', exact: true })
  await page.locator('.products-footer .ant-pagination-next').click()
  await ready()
  await keyword.fill(' fresh ')
  await keyword.press('Enter')
  await ready()
  check(
    'Enter searches trimmed keyword and resets to page 1',
    lists().at(-1).params.keyword === 'fresh' && lists().at(-1).params.page === '1',
  )
  await keyword.fill('slow')
  await keyword.press('Enter')
  await page.waitForTimeout(70)
  await keyword.fill('fresh')
  await keyword.press('Enter')
  await page.waitForTimeout(850)
  check(
    'Late response cannot replace the latest result',
    (await page.locator('.product-name').first().innerText()) === 'KẾT QUẢ MỚI',
  )
  await page.locator('.catalog-filters .ant-select').nth(0).click()
  await page.locator('.catalog-filters .ant-select').nth(0).locator('input').fill('Nhóm 204')
  await page.locator('.ant-select-dropdown:visible').getByText('Nhóm 204', { exact: true }).click()
  await ready()
  check(
    'Group beyond first API page is selectable and sent',
    lists().at(-1).params.groupId === 'g204',
  )
  await page.locator('.catalog-filters .ant-select').nth(1).click()
  await page
    .locator('.ant-select-dropdown:visible')
    .getByText('Ngừng hoạt động', { exact: true })
    .click()
  await ready()
  check('Inactive status is sent as 0', lists().at(-1).params.status === '0')
  await page.getByRole('button', { name: 'Đặt lại', exact: true }).click()
  await ready()
  check(
    'Reset clears every API filter and returns to page 1',
    ['keyword', 'status', 'groupId'].every((key) => !(key in lists().at(-1).params)) &&
      lists().at(-1).params.page === '1',
  )
  const beforeReload = lists().length
  await page
    .locator('.products-toolbar')
    .getByRole('button', { name: 'Tải lại', exact: true })
    .click()
  await ready()
  check('Reload requests a server page', lists().length === beforeReload + 1)
  check(
    'Warehouse never appears in product API params',
    lists().every((call) => !('warehouseId' in call.params)),
  )
  await page
    .locator('.product-actions')
    .first()
    .getByRole('button', { name: 'Chi tiết', exact: true })
    .click()
  await drawer().getByText(product(0).description, { exact: true }).waitFor()
  check(
    'Detail shows all current fields and full product name',
    (await drawer().innerText()).includes(product(0).name) &&
      (await drawer().innerText()).includes(product(0).dimensions),
  )
  await closeDrawer()
  await page
    .locator('.product-actions')
    .first()
    .getByRole('button', { name: 'Chỉnh sửa', exact: true })
    .click()
  await formField('Tên').locator('input').waitFor()
  await page.waitForTimeout(350)
  check(
    'Edit drawer retains all 13 fields',
    (await drawer().locator('.ant-form-item').count()) === 13,
  )
  check(
    'Inactive original group remains visible',
    (await formField('Nhóm sản phẩm').innerText()).includes('Nhóm 0'),
  )
  check(
    'Price input preserves exact safe integer',
    (await formField('Giá bán mặc định (VND)').locator('input').inputValue()) ===
      String(Number.MAX_SAFE_INTEGER),
  )
  await formField('Tên').locator('input').fill('Sản phẩm đã chỉnh sửa')
  await drawer().getByRole('button', { name: 'Lưu', exact: true }).click()
  await ready()
  await page.waitForTimeout(250)
  const edit = calls.filter((call) => call.method === 'PUT').at(-1)
  check(
    'Edit PUT preserves full payload including inactive group and exact prices',
    edit.body.name === 'Sản phẩm đã chỉnh sửa' &&
      edit.body.groupId === 'g0' &&
      edit.body.defaultSalePrice === Number.MAX_SAFE_INTEGER &&
      edit.body.dimensions === product(0).dimensions &&
      edit.body.description === product(0).description,
  )
  await openMenu()
  await page.getByRole('menuitem', { name: 'Ngừng hoạt động', exact: true }).click()
  await page.locator('.ant-modal-confirm .ant-btn-primary').click()
  await ready()
  await page.waitForTimeout(250)
  const status = calls.filter((call) => call.method === 'PUT').at(-1)
  check(
    'Status PUT fetches detail and retains all fields',
    status.body.status === 0 &&
      status.body.groupId === 'g0' &&
      status.body.description === product(0).description &&
      status.body.dimensions === product(0).dimensions &&
      status.body.defaultSalePrice === Number.MAX_SAFE_INTEGER,
  )
  await page.getByRole('button', { name: 'Thêm sản phẩm', exact: true }).click()
  await page.waitForTimeout(300)
  await drawer().getByRole('button', { name: 'Lưu', exact: true }).click()
  check(
    'Required validation blocks empty create',
    (await drawer().getByText('Trường này là bắt buộc', { exact: true }).count()) >= 3,
  )
  await formField('Mã').locator('input').fill('TEST-CREATE')
  await formField('Tên').locator('input').fill('Sản phẩm kiểm thử')
  await formField('Nhóm sản phẩm').locator('.ant-select').click()
  await formField('Nhóm sản phẩm').locator('input').fill('Nhóm 204')
  await page.locator('.ant-select-dropdown:visible').getByText('Nhóm 204', { exact: true }).click()
  const saveButton = drawer().getByRole('button', { name: 'Lưu', exact: true })
  const footerRect = await saveButton.boundingBox()
  check(
    'Drawer save footer remains in viewport with scrollable body',
    footerRect.y + footerRect.height <= 768 &&
      (await drawer()
        .locator('.ant-drawer-body')
        .evaluate((element) => element.scrollHeight > element.clientHeight)),
  )
  await page.screenshot({ path: artifacts + '/create-drawer.png', fullPage: true })
  await saveButton.dblclick()
  await ready()
  await page.waitForTimeout(300)
  check(
    'Create succeeds without duplicate submission',
    calls.filter((call) => call.path === '/products' && call.method === 'POST').length === 1,
  )
  await keyword.fill('empty')
  await keyword.press('Enter')
  await ready()
  check(
    'Empty response shows explicit empty state and API total 0',
    (await page.locator('.products-empty').innerText()).includes('Không có dữ liệu') &&
      (await page.locator('.products-total').innerText()).includes('0'),
  )
  listError = true
  await page
    .locator('.products-toolbar')
    .getByRole('button', { name: 'Tải lại', exact: true })
    .click()
  await ready()
  check(
    'API error is visible and stale rows are cleared',
    (await page.getByText('Lỗi kiểm tra API sản phẩm', { exact: true }).count()) === 1 &&
      (await page.locator('.product-row').count()) === 0,
  )
  const errorCalls = lists().length
  await page.waitForTimeout(650)
  check('API errors do not cause a resize/request loop', lists().length === errorCalls)
  listError = false
  await page.getByRole('button', { name: 'Đặt lại', exact: true }).click()
  await ready()
  await page.setViewportSize({ width: 390, height: 844 })
  await ready()
  check('Mobile filters are collapsed initially', !(await keyword.isVisible()))
  await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click()
  await ready()
  check('Mobile filters expand and remain usable', await keyword.isVisible())
  await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click()
  await ready()
  await openMenu()
  await page
    .locator('.ant-dropdown:visible')
    .getByRole('menuitem', { name: 'Chi tiết', exact: true })
    .waitFor()
  check(
    'Mobile menu exposes detail and update',
    (await page
      .locator('.ant-dropdown:visible')
      .getByRole('menuitem', { name: 'Chi tiết', exact: true })
      .count()) === 1 &&
      (await page
        .locator('.ant-dropdown:visible')
        .getByRole('menuitem', { name: 'Chỉnh sửa', exact: true })
        .count()) === 1,
  )
  await page.keyboard.press('Escape')
  await page.mouse.click(10, 150)
  await page.setViewportSize({ width: 1366, height: 768 })
  permissions = ['PRODUCT_VIEW', 'PRODUCT_GROUP_VIEW']
  await page.reload()
  await ready()
  check(
    'View-only hides create, edit and status actions',
    (await page.getByRole('button', { name: 'Thêm sản phẩm', exact: true }).count()) === 0 &&
      (await page.getByRole('button', { name: 'Chỉnh sửa', exact: true }).count()) === 0 &&
      (await page
        .locator('.product-actions')
        .first()
        .getByRole('button', { name: 'Thao tác', exact: true })
        .count()) === 0,
  )
  permissions = ['PRODUCT_CREATE', 'PRODUCT_GROUP_VIEW']
  const beforeCreateOnly = lists().length
  await page.reload()
  await ready()
  check(
    'Create-only keeps existing access without list requests',
    lists().length === beforeCreateOnly &&
      (await page.getByRole('button', { name: 'Thêm sản phẩm', exact: true }).count()) === 1,
  )
  permissions = []
  admin = true
  await page.reload()
  await ready()
  check(
    'Verified database ADMIN retains catalog access',
    (await page.getByRole('button', { name: 'Thêm sản phẩm', exact: true }).count()) === 1 &&
      (await page.locator('.product-row').count()) > 0,
  )
  check(
    'Every pageSize is an integer within 1–100',
    lists().every(
      (call) =>
        Number.isInteger(Number(call.params.pageSize)) &&
        Number(call.params.pageSize) >= 1 &&
        Number(call.params.pageSize) <= 100,
    ),
  )
  check('No application or unresolved component errors', errors.length === 0)
  await writeFile(
    artifacts + '/browser-results.json',
    JSON.stringify({ passed: checks.length, checks, measurements, errors }, null, 2),
  )
  console.log(
    JSON.stringify(
      {
        passed: checks.length,
        checks,
        measurements: measurements.map(({ label, params }) => ({
          label,
          pageSize: params.pageSize,
        })),
        errors,
      },
      null,
      2,
    ),
  )
} catch (error) {
  await page.screenshot({ path: artifacts + '/failure.png', fullPage: true })
  await writeFile(
    artifacts + '/failure.json',
    JSON.stringify({ checks, measurements, calls, errors, error: String(error) }, null, 2),
  )
  throw error
} finally {
  await browser.close()
}
