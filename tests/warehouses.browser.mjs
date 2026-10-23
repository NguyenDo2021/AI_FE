// Controlled API fixtures: browser checks never mutate the real backend.
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
  // Headless Playwright normally hides scrollbars; exercise their real measured height.
  ignoreDefaultArgs: ['--hide-scrollbars'],
})
const context = await browser.newContext({
  viewport: { width: 1366, height: 768 },
  reducedMotion: 'reduce',
  deviceScaleFactor: 1.25,
})
await context.addInitScript(() =>
  localStorage.setItem('frontend-base:access-token', 'warehouse-browser-test'),
)
const base = process.env.WAREHOUSES_TEST_URL || 'http://127.0.0.1:5173'
const artifacts = 'docs/warehouses-artifacts'
await mkdir(artifacts, { recursive: true })
let permissions = [
  'WAREHOUSE_VIEW',
  'WAREHOUSE_CREATE',
  'WAREHOUSE_UPDATE',
  'PRODUCT_VIEW',
  'PRODUCT_GROUP_VIEW',
]
let admin = false,
  scenario = 'normal',
  listTotal = 237,
  savedStatus = 1
const calls = [],
  checks = [],
  errors = [],
  measurements = []
const address = 'Địa chỉ đầy đủ, số 01 đường Nguyễn Chánh, phường Đại Đồng, Nghệ An. '
  .repeat(12)
  .slice(0, 500)
const note = 'Ghi chú đầy đủ, giữ nguyên khi cập nhật trạng thái.\n'.repeat(70).slice(0, 2000)
const warehouse = (index) => ({
  id: `w${index}`,
  code: (`KHO-${index}-` + 'X'.repeat(80)).slice(0, 80),
  name: `Kho ${index} có tên dài để kiểm tra bố cục và cuộn ngang. `.repeat(5).slice(0, 160),
  address: index === 1 ? null : address,
  phone: index === 1 ? '' : '0123 456 789 ext 1',
  note: index === 1 ? null : note,
  status: index === 0 ? savedStatus : index % 2,
  createdAt: '2026-10-21T01:00:00Z',
  updatedAt: '2026-10-22T01:00:00Z',
})
await context.route('**/api/**', async (route) => {
  const request = route.request(),
    url = new URL(request.url()),
    path = url.pathname.slice(4)
  if (!url.pathname.startsWith('/api/')) return route.continue()
  const method = request.method(),
    params = Object.fromEntries(url.searchParams),
    body = request.postDataJSON()
  calls.push({ path, method, params, body })
  const reply = (data, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
  if (path === '/auth/me')
    return reply({
      id: 'warehouse-user',
      username: 'warehouse-test',
      fullName: 'Kiểm tra kho',
      permissions,
    })
  if (path === '/users/warehouse-user') return reply({ id: 'warehouse-user', status: 1 })
  if (path === '/users/warehouse-user/roles')
    return reply(admin ? [{ code: 'ADMIN', status: 1 }] : [])
  if (path === '/users/me/warehouses') return reply([])
  if (path === '/warehouses' && method === 'GET') {
    if (scenario === 'forbidden') return reply({ code: 'FORBIDDEN' }, 403)
    if (scenario === 'list-error') return reply({ message: 'Lỗi tải danh sách kho' }, 503)
    if (scenario === 'unauthorized') return reply({ message: 'Phiên hết hạn' }, 401)
    const page = Number(params.page),
      size = Number(params.pageSize)
    const total = params.keyword === 'empty' ? 0 : params.keyword === 'few' ? 1 : listTotal
    const items = Array.from(
      { length: Math.max(0, Math.min(size, total - (page - 1) * size)) },
      (_, i) => warehouse((page - 1) * size + i),
    )
    if (params.keyword === 'slow') {
      items.forEach((item) => {
        item.name = 'KẾT QUẢ CŨ'
      })
      await new Promise((resolve) => setTimeout(resolve, 650))
    }
    if (params.keyword === 'fresh')
      items.forEach((item) => {
        item.name = 'KẾT QUẢ MỚI'
      })
    return reply({ page, pageSize: size, total, items })
  }
  if (path.startsWith('/warehouses/') && method === 'GET') {
    if (scenario === 'detail-error') return reply({ message: 'Lỗi tải chi tiết kho' }, 500)
    if (scenario === 'access-denied') return reply({ code: 'WAREHOUSE_ACCESS_DENIED' }, 403)
    return reply(warehouse(Number(path.split('/').at(-1).slice(1))))
  }
  if (
    (path === '/warehouses' && method === 'POST') ||
    (path.startsWith('/warehouses/') && method === 'PUT')
  ) {
    if (scenario === 'duplicate')
      return reply({ code: 'WAREHOUSE_CODE_EXISTS', message: 'Mã kho đã tồn tại' }, 409)
    if (scenario === 'validation')
      return reply(
        {
          code: 'VALIDATION_ERROR',
          message: 'Dữ liệu không hợp lệ',
          details: { phone: 'Lỗi điện thoại từ API' },
        },
        400,
      )
    await new Promise((resolve) => setTimeout(resolve, 180))
    if (scenario === 'shrink') listTotal = 0
    if (method === 'PUT') savedStatus = body.status
    return reply({ ...warehouse(0), ...body })
  }
  return reply({ items: [], total: 0, page: 1, pageSize: Number(params.pageSize) || 10 })
})
const page = await context.newPage()
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (msg) => {
  if (/Unhandled|Failed to resolve component|does not provide an export/.test(msg.text()))
    errors.push(msg.text())
})
const check = (name, value) => {
  assert.ok(value, name)
  checks.push(name)
}
const lists = () => calls.filter((call) => call.path === '/warehouses' && call.method === 'GET')
const writes = () => calls.filter((call) => call.method === 'POST' || call.method === 'PUT')
const ready = async () => {
  await page.locator('.warehouses-panel').waitFor()
  await page.waitForTimeout(450)
  await page.waitForFunction(
    () => document.querySelector('.products-table-region')?.getAttribute('aria-busy') === 'false',
  )
}
const keyword = () => page.getByRole('textbox', { name: 'Nhập mã hoặc tên kho…', exact: true })
const drawer = () => page.locator('.ant-drawer-content:visible')
const field = (name) => drawer().getByLabel(name, { exact: true })
const close = async () => {
  await drawer().getByRole('button', { name: 'Hủy', exact: true }).click()
  await page.waitForTimeout(300)
}
const action = (name) =>
  page.locator('.product-actions').first().getByRole('button', { name, exact: true })
const search = async (value) => {
  await keyword().fill(value)
  await keyword().press('Enter')
  await ready()
}
const geometry = async (label, allowVertical = false) => {
  const value = await page.evaluate(() => {
    const rect = (element) => {
      const r = element.getBoundingClientRect()
      return {
        top: r.top,
        bottom: r.bottom,
        left: r.left,
        right: r.right,
        width: r.width,
        height: r.height,
      }
    }
    const content = document.querySelector('.ant-table-content')
    return {
      width: innerWidth,
      height: innerHeight,
      scrollHeight: document.documentElement.scrollHeight,
      scrollWidth: document.documentElement.scrollWidth,
      footer: rect(document.querySelector('.products-footer')),
      content: rect(content),
      contentHeight: content.clientHeight,
      contentScrollHeight: content.scrollHeight,
      contentWidth: content.clientWidth,
      contentScrollWidth: content.scrollWidth,
      scrollbarHeight: content.offsetHeight - content.clientHeight,
      rows: [...document.querySelectorAll('.ant-table-tbody > tr[data-row-key]')].map(rect),
      headers: [...document.querySelectorAll('.ant-table-thead th')].map((el) =>
        el.textContent.trim(),
      ),
      horizontalScrollers: [...document.querySelectorAll('.warehouses-panel *')].filter(
        (el) =>
          el.scrollWidth > el.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(el).overflowX),
      ).length,
    }
  })
  measurements.push({ label, ...value, pageSize: lists().at(-1)?.params.pageSize })
  check(
    `${label}: all six columns in order`,
    value.headers.join('|') === 'Mã|Tên|Địa chỉ|Số điện thoại|Trạng thái|Thao tác',
  )
  check(
    `${label}: no page horizontal scroll or table vertical scroll`,
    value.scrollWidth <= value.width + 1 && value.contentScrollHeight <= value.contentHeight + 1,
  )
  if (!allowVertical)
    check(
      `${label}: page fits and pagination accessible`,
      value.scrollHeight <= value.height + 1 && value.footer.bottom <= value.height + 1,
    )
  check(
    `${label}: API page rendered completely with stable row height`,
    value.rows.length === Number(lists().at(-1).params.pageSize) &&
      value.rows.every((r) => Math.abs(r.height - 76) < 1 && r.bottom <= value.footer.top + 1),
  )
  check(
    `${label}: only necessary horizontal scrollbar above pagination`,
    value.horizontalScrollers === (value.contentScrollWidth > value.contentWidth + 1 ? 1 : 0) &&
      value.content.bottom <= value.footer.top + 1,
  )
  check(
    `${label}: scrollbar height reserved only when needed`,
    value.scrollbarHeight === (value.contentScrollWidth > value.contentWidth + 1 ? 10 : 0),
  )
  const fixed = []
  for (const position of [0, 0.5, 1]) {
    await page.locator('.ant-table-content').evaluate((el, fraction) => {
      el.scrollLeft = (el.scrollWidth - el.clientWidth) * fraction
    }, position)
    await page.waitForTimeout(90)
    fixed.push(
      await page.evaluate(() => {
        const cell = document.querySelector(
          '.ant-table-tbody > tr[data-row-key] .ant-table-cell-fix-right',
        )
        const head = document.querySelector('.ant-table-thead .ant-table-cell-fix-right')
        const rect = (el) => ({
          left: el.getBoundingClientRect().left,
          right: el.getBoundingClientRect().right,
          position: getComputedStyle(el).position,
          background: getComputedStyle(el).backgroundColor,
        })
        return { cell: rect(cell), head: rect(head) }
      }),
    )
  }
  check(
    `${label}: action header and cells stay fixed from start through end`,
    fixed.every(
      ({ cell, head }) =>
        Math.abs(cell.right - fixed[0].cell.right) < 1 &&
        Math.abs(cell.left - head.left) < 1 &&
        cell.position === 'sticky' &&
        head.position === 'sticky',
    ),
  )
  check(
    `${label}: fixed column background is opaque`,
    fixed.every(
      ({ cell, head }) =>
        !cell.background.startsWith('rgba') && !head.background.startsWith('rgba'),
    ),
  )
  await page.locator('.ant-table-content').evaluate((el) => {
    el.scrollLeft = 0
  })
  await page.waitForTimeout(90)
  await page.screenshot({ path: artifacts + `/${label}.png`, fullPage: true })
}
const changeStatus = async () => {
  await action('Thao tác').click()
  await page.locator('.ant-dropdown:visible').getByRole('menuitem').last().click()
  await page.locator('.ant-modal-confirm:visible .ant-btn-primary').click()
  await ready()
}
try {
  await page.goto(base + '/catalog/warehouses')
  await ready()
  check(
    'Title, description and theme add action',
    (await page.getByRole('heading', { name: 'Quản lý kho', exact: true }).count()) === 1 &&
      (await page
        .getByText('Quản lý thông tin và trạng thái các kho hàng.', { exact: true })
        .count()) === 1 &&
      (await page
        .getByRole('button', { name: 'Thêm kho', exact: true })
        .evaluate((el) => getComputedStyle(el).backgroundColor === 'rgb(115, 87, 207)')),
  )
  check('Initial list makes one measured API request', lists().length === 1)
  check(
    'API total and leading zero phone string',
    (await page.locator('.products-total').innerText()).includes('237') &&
      (await page.locator('.warehouse-phone').first().innerText()) === warehouse(0).phone,
  )
  check(
    'Optional empty fields show em dash',
    (await page.locator('.ant-table-tbody > tr[data-row-key]').nth(1).innerText()).includes('—'),
  )
  check(
    'Address limited to two lines',
    await page
      .locator('.warehouse-address')
      .first()
      .evaluate((el) => el.getBoundingClientRect().height <= 40),
  )
  check(
    'Rows preserve backend order',
    await page
      .locator('.warehouse-code')
      .allTextContents()
      .then((codes) => codes.every((code, i) => code === warehouse(i).code)),
  )
  await geometry('desktop-1366')
  await page.locator('.warehouse-address').first().hover()
  await page.locator('.ant-tooltip:visible').getByText(address, { exact: true }).waitFor()
  check('Address tooltip contains complete address', true)
  await action('Chi tiết').hover()
  check(
    'Hovered fixed cell background stays opaque',
    await page
      .locator('.ant-table-tbody > tr[data-row-key] .ant-table-cell-fix-right')
      .first()
      .evaluate((el) => !getComputedStyle(el).backgroundColor.startsWith('rgba')),
  )
  await page.mouse.move(0, 0)
  await page.locator('.products-footer .ant-pagination-next').click()
  await ready()
  check('Next page uses server pagination', lists().at(-1).params.page === '2')
  await page.setViewportSize({ width: 1920, height: 1080 })
  await ready()
  await geometry('desktop-1920')
  check('Resize returns to page 1', lists().at(-1).params.page === '1')
  const before = lists().length
  await page.setViewportSize({ width: 1919, height: 1080 })
  await ready()
  check('Same capacity resize does not refetch', lists().length === before)
  for (const [width, height, label, low] of [
    [360, 800, 'mobile-360', false],
    [390, 844, 'mobile-390', false],
    [768, 1024, 'tablet-768', false],
    [1024, 768, 'tablet-1024', false],
    [1093, 614, 'zoom-125-simulated', false],
    [1366, 500, 'short-500', true],
    [390, 400, 'keyboard-400', true],
  ]) {
    await page.setViewportSize({ width, height })
    await ready()
    await geometry(label, low)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await ready()
  check(
    'Mobile uses one dropdown button for every action',
    (await page.locator('.product-actions').first().locator('button').count()) === 1,
  )
  await action('Thao tác').click()
  await page.locator('.ant-dropdown:visible').getByRole('menuitem').first().waitFor()
  check(
    'Mobile dropdown exposes detail edit and status',
    (await page.locator('.ant-dropdown:visible .ant-dropdown-menu-item').count()) === 3,
  )
  await page
    .locator('.ant-dropdown:visible')
    .getByRole('menuitem', { name: 'Chi tiết', exact: true })
    .click()
  await drawer().getByText(note, { exact: true }).waitFor()
  check(
    'Mobile detail shows full address note and timestamps',
    (await drawer().innerText()).includes(address) &&
      (await drawer().innerText()).includes('Ngày tạo'),
  )
  await close()
  await page.getByRole('button', { name: 'Thêm kho', exact: true }).click()
  check(
    'Mobile form has all six fields and fits viewport',
    (await drawer().locator('.ant-form-item').count()) === 6 &&
      (await drawer().evaluate((el) => el.getBoundingClientRect().width <= innerWidth)),
  )
  check(
    'Mobile form is one column with accessible footer',
    (await drawer()
      .locator('.catalog-form')
      .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length === 1)) &&
      (await drawer()
        .locator('.ant-drawer-footer')
        .evaluate((el) => el.getBoundingClientRect().bottom <= innerHeight)),
  )
  await page.setViewportSize({ width: 390, height: 400 })
  check(
    'Keyboard height leaves scrollable form and visible footer',
    (await drawer()
      .locator('.ant-drawer-body')
      .evaluate(
        (el) => getComputedStyle(el).overflowY === 'auto' && el.scrollHeight > el.clientHeight,
      )) &&
      (await drawer()
        .locator('.ant-drawer-footer')
        .evaluate((el) => el.getBoundingClientRect().bottom <= innerHeight)),
  )
  await close()
  await page.setViewportSize({ width: 1366, height: 768 })
  await ready()
  const collapse = page
    .locator('header')
    .getByRole('button', { name: 'Thu gọn thanh bên', exact: true })
  await collapse.click()
  await ready()
  await geometry('sidebar-collapsed')
  await page
    .locator('header')
    .getByRole('button', { name: 'Mở rộng thanh bên', exact: true })
    .click()
  await ready()
  await geometry('sidebar-expanded')
  await search(' fresh ')
  check(
    'Enter trims keyword and resets page',
    lists().at(-1).params.keyword === 'fresh' && lists().at(-1).params.page === '1',
  )
  await keyword().fill('slow')
  await keyword().press('Enter')
  await page.waitForTimeout(60)
  check(
    'Pending list request displays loading',
    (await page.locator('.warehouses-panel .ant-spin-spinning').count()) === 1,
  )
  await search('fresh')
  await page.waitForTimeout(750)
  check(
    'Old response cannot overwrite fresh data',
    (await page.locator('.warehouse-name').first().innerText()) === 'KẾT QUẢ MỚI',
  )
  await page.locator('.catalog-filters .ant-select').click()
  await page
    .locator('.ant-select-dropdown:visible')
    .getByText('Ngừng hoạt động', { exact: true })
    .click()
  await ready()
  check('Status zero is sent to API', lists().at(-1).params.status === '0')
  const resets = lists().length
  await page.getByRole('button', { name: 'Đặt lại', exact: true }).click()
  await ready()
  check(
    'Reset sends one request and omits all status',
    lists().length === resets + 1 &&
      !('status' in lists().at(-1).params) &&
      !('keyword' in lists().at(-1).params),
  )
  await action('Chi tiết').click()
  await drawer().getByText(note, { exact: true }).waitFor()
  await page.screenshot({ path: artifacts + '/detail.png', fullPage: true })
  await close()
  scenario = 'detail-error'
  await action('Chi tiết').click()
  await drawer().getByText('Lỗi tải chi tiết kho', { exact: true }).waitFor()
  check('Detail error leaves list intact', (await page.locator('.warehouse-name').count()) > 0)
  await close()
  scenario = 'normal'
  await action('Chỉnh sửa').click()
  await field('Ghi chú').waitFor()
  await page.waitForTimeout(250)
  check(
    'Edit GET retains full values and form is two columns',
    (await field('Địa chỉ').inputValue()) === address &&
      (await field('Ghi chú').inputValue()) === note &&
      (await field('Số điện thoại').inputValue()) === warehouse(0).phone &&
      (await drawer()
        .locator('.catalog-form')
        .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length === 2)),
  )
  await field('Tên').fill('Kho đã sửa')
  await drawer().getByRole('button', { name: 'Lưu', exact: true }).click()
  await ready()
  const edit = writes().at(-1)
  check(
    'Edit is full PUT without metadata',
    edit.method === 'PUT' &&
      Object.keys(edit.body).sort().join(',') === 'address,code,name,note,phone,status' &&
      edit.body.address === address &&
      edit.body.note === note &&
      edit.body.phone === warehouse(0).phone &&
      edit.body.name === 'Kho đã sửa',
  )
  await changeStatus()
  const status = writes().at(-1)
  check(
    'Deactivate GETs current detail then sends full payload',
    status.body.status === 0 &&
      status.body.code === warehouse(0).code &&
      status.body.name === warehouse(0).name &&
      status.body.address === address &&
      status.body.note === note &&
      status.body.phone === warehouse(0).phone,
  )
  await changeStatus()
  check('Activate sends numeric one', writes().at(-1).body.status === 1)
  await page.getByRole('button', { name: 'Thêm kho', exact: true }).click()
  await drawer().getByRole('button', { name: 'Lưu', exact: true }).click()
  check(
    'Required fields block submission',
    (await drawer().getByText('Trường này là bắt buộc', { exact: true }).count()) >= 2,
  )
  await field('Mã').fill('Á-invalid')
  await field('Tên').fill('Kho mới')
  await drawer().getByRole('button', { name: 'Lưu', exact: true }).click()
  check(
    'Non ASCII code rejected',
    (await drawer()
      .getByText('Mã chỉ nhận chữ ASCII, số, _, - và dấu chấm.', { exact: true })
      .count()) === 1,
  )
  await field('Mã').fill(' new_kho-1.2 ')
  await field('Địa chỉ').fill(address + 'x')
  await field('Ghi chú').fill(note + 'x')
  await field('Số điện thoại').fill('01234 ext ABC')
  check(
    'Warehouse limits remain 80 160 500 20 2000',
    (await field('Mã').getAttribute('maxlength')) === '80' &&
      (await field('Tên').getAttribute('maxlength')) === '160' &&
      (await field('Địa chỉ').inputValue()) === address &&
      (await field('Ghi chú').inputValue()) === note &&
      (await field('Số điện thoại').getAttribute('maxlength')) === '20',
  )
  scenario = 'duplicate'
  await drawer().getByRole('button', { name: 'Lưu', exact: true }).click()
  await drawer().getByText('Mã kho đã tồn tại', { exact: true }).first().waitFor()
  check(
    'Duplicate API error mapped to code',
    (await drawer().locator('.ant-form-item').first().innerText()).includes('Mã kho đã tồn tại'),
  )
  scenario = 'validation'
  await drawer().getByRole('button', { name: 'Lưu', exact: true }).click()
  await drawer().getByText('Lỗi điện thoại từ API', { exact: true }).waitFor()
  check('API field validation retained', true)
  scenario = 'normal'
  const writeCount = writes().length
  await drawer().getByRole('button', { name: 'Lưu', exact: true }).dblclick()
  await ready()
  await page.waitForTimeout(200)
  check(
    'Create normalizes code and prevents repeated submit without phone regex',
    writes().length === writeCount + 1 &&
      writes().at(-1).body.code === 'NEW_KHO-1.2' &&
      writes().at(-1).body.phone === '01234 ext ABC',
  )
  await search('empty')
  check(
    'Empty state uses API total zero',
    (await page.locator('.ant-table-placeholder').count()) === 1 &&
      (await page.locator('.products-total').innerText()).includes('0'),
  )
  await search('few')
  check(
    'Few items are not fabricated',
    (await page.locator('.warehouse-name').count()) === 1 &&
      (await page.locator('.products-total').innerText()).includes('1'),
  )
  await page.getByRole('button', { name: 'Đặt lại', exact: true }).click()
  await ready()
  await page.locator('.products-footer .ant-pagination-next').click()
  await ready()
  scenario = 'shrink'
  await changeStatus()
  check(
    'Mutation reducing total to zero returns to page 1',
    lists().at(-1).params.page === '1' && (await page.locator('.warehouse-name').count()) === 0,
  )
  scenario = 'normal'
  listTotal = 237
  await page.locator('.products-toolbar').getByRole('button').click()
  await ready()
  scenario = 'access-denied'
  await action('Chi tiết').click()
  await drawer()
    .getByText('Kho nằm ngoài phạm vi được giao. Hãy tải lại danh sách kho.', { exact: true })
    .waitFor()
  check(
    'Scope denied clears previously displayed rows and detail',
    (await page.locator('.warehouse-name').count()) === 0 &&
      (await drawer().locator('.ant-descriptions').count()) === 0,
  )
  await close()
  scenario = 'normal'
  for (const [label, rights, isAdmin] of [
    ['view-only', ['WAREHOUSE_VIEW'], false],
    ['create-only', ['WAREHOUSE_CREATE'], false],
    ['update', ['WAREHOUSE_VIEW', 'WAREHOUSE_UPDATE'], false],
    ['admin', [], true],
  ]) {
    permissions = rights
    admin = isAdmin
    const count = lists().length
    await page.reload()
    await ready()
    check(
      `${label}: add permission`,
      (await page.getByRole('button', { name: 'Thêm kho', exact: true }).count()) ===
        (rights.includes('WAREHOUSE_CREATE') || isAdmin ? 1 : 0),
    )
    if (label === 'create-only')
      check(
        'Create only cannot request or display list',
        lists().length === count && (await page.locator('.warehouse-name').count()) === 0,
      )
    else
      check(
        `${label}: update permission`,
        (await action('Chỉnh sửa').count()) ===
          (rights.includes('WAREHOUSE_UPDATE') || isAdmin ? 1 : 0),
      )
  }
  admin = false
  permissions = ['WAREHOUSE_VIEW', 'WAREHOUSE_CREATE', 'WAREHOUSE_UPDATE']
  scenario = 'forbidden'
  const count = lists().length
  await page.reload()
  await ready()
  await page.waitForTimeout(700)
  check(
    '403 clears data without request loop',
    lists().length === count + 1 && (await page.locator('.warehouse-name').count()) === 0,
  )
  scenario = 'normal'
  await page.reload()
  await ready()
  scenario = 'list-error'
  await page.locator('.products-toolbar').getByRole('button').click()
  await ready()
  check(
    'List error visible and stale rows cleared',
    (await page.locator('.warehouses-panel').innerText()).includes('Lỗi tải danh sách kho') &&
      (await page.locator('.warehouse-name').count()) === 0,
  )
  scenario = 'unauthorized'
  await page.reload()
  await page.waitForURL('**/login')
  check('401 uses existing session expiration flow', page.url().includes('/login'))
  check(
    'Queries remain within warehouse contract',
    lists().every(
      (call) =>
        Object.keys(call.params).every((key) =>
          ['page', 'pageSize', 'keyword', 'status'].includes(key),
        ) &&
        Number.isInteger(Number(call.params.pageSize)) &&
        Number(call.params.pageSize) >= 1 &&
        Number(call.params.pageSize) <= 100,
    ),
  )
  check(
    'No DELETE or assignment mutation',
    writes().every(
      (call) => call.path === '/warehouses' || /^\/warehouses\/w\d+$/.test(call.path),
    ) && !calls.some((call) => call.method === 'DELETE'),
  )
  check('No browser runtime errors', errors.length === 0)
} finally {
  await writeFile(
    artifacts + '/browser-results.json',
    JSON.stringify({ checks, errors, measurements, calls }, null, 2),
  )
  await browser.close()
}
console.log(`Warehouse browser checks: ${checks.length} passed`)
