// API fixtures are local to this test. The real backend never receives these requests.
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
})
const context = await browser.newContext({
  viewport: { width: 1366, height: 768 },
  reducedMotion: 'reduce',
  deviceScaleFactor: 1.25,
})
await context.addInitScript(() =>
  localStorage.setItem('frontend-base:access-token', 'groups-browser-test'),
)
const base = process.env.GROUPS_TEST_URL || 'http://127.0.0.1:5173'
const artifacts = 'docs/product-groups-artifacts'
await mkdir(artifacts, { recursive: true })
let permissions = [
    'PRODUCT_GROUP_VIEW',
    'PRODUCT_GROUP_CREATE',
    'PRODUCT_GROUP_UPDATE',
    'PRODUCT_VIEW',
  ],
  admin = false,
  scenario = 'normal',
  listTotal = 237
const checks = [],
  calls = [],
  errors = [],
  measurements = []
const description = 'Mô tả đầy đủ để kiểm tra giữ nguyên dữ liệu. '.repeat(60).slice(0, 2000)
const group = (index) => ({
  id: `g${index}`,
  code: (`GROUP-${index}-` + 'X'.repeat(80)).slice(0, 80),
  name: (
    `Nhóm sản phẩm ${index} có tên rất dài để kiểm tra hai dòng và không đẩy vỡ bảng ` + 'Tên dài '
  )
    .repeat(3)
    .slice(0, 160),
  description: index === 1 ? null : description,
  status: index % 2 === 0 ? 1 : 0,
  createdAt: '2026-10-21T01:00:00Z',
  updatedAt: '2026-10-22T01:00:00Z',
})
await context.route('**/api/**', async (route) => {
  const request = route.request(),
    url = new URL(request.url())
  if (!url.pathname.startsWith('/api/')) return route.continue()
  const path = url.pathname.slice(4),
    method = request.method(),
    params = Object.fromEntries(url.searchParams),
    body = request.postDataJSON()
  calls.push({ path, method, params, body })
  const reply = (data, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
  if (path === '/auth/me')
    return reply({
      id: 'group-user',
      username: 'groups-test',
      fullName: 'Kiểm tra Nhóm sản phẩm',
      permissions,
    })
  if (path === '/users/group-user') return reply({ id: 'group-user', status: 1 })
  if (path === '/users/group-user/roles') return reply(admin ? [{ code: 'ADMIN', status: 1 }] : [])
  if (path === '/users/me/warehouses') return reply([])
  if (path === '/product-groups' && method === 'GET') {
    if (scenario === 'list-error')
      return reply({ status: 503, message: 'Không tải được nhóm sản phẩm' }, 503)
    if (scenario === 'forbidden') return reply({ status: 403, code: 'FORBIDDEN' }, 403)
    const page = Number(params.page),
      size = Number(params.pageSize),
      total = params.keyword === 'empty' ? 0 : params.keyword === 'few' ? 1 : listTotal
    const items = Array.from(
      { length: Math.max(0, Math.min(size, total - (page - 1) * size)) },
      (_, index) => group((page - 1) * size + index),
    )
    if (params.keyword === 'slow') {
      for (const item of items) item.name = 'KẾT QUẢ CŨ'
      await new Promise((resolve) => setTimeout(resolve, 650))
    }
    if (params.keyword === 'fresh') for (const item of items) item.name = 'KẾT QUẢ MỚI'
    return reply({ page, pageSize: size, total, items })
  }
  if (path.startsWith('/product-groups/') && method === 'GET') {
    if (scenario === 'detail-error')
      return reply({ status: 500, message: 'Lỗi nạp chi tiết nhóm' }, 500)
    return reply(group(Number(path.split('/').at(-1).slice(1))))
  }
  if (
    (path === '/product-groups' && method === 'POST') ||
    (path.startsWith('/product-groups/') && method === 'PUT')
  ) {
    if (scenario === 'duplicate')
      return reply(
        { status: 409, code: 'PRODUCT_GROUP_CODE_EXISTS', message: 'Mã nhóm đã tồn tại' },
        409,
      )
    if (scenario === 'validation')
      return reply(
        {
          status: 400,
          code: 'VALIDATION_ERROR',
          message: 'Dữ liệu không hợp lệ',
          details: { name: 'Tên nhóm không hợp lệ từ API' },
        },
        400,
      )
    if (scenario === 'status-error')
      return reply({ status: 500, message: 'Lỗi đổi trạng thái nhóm' }, 500)
    await new Promise((resolve) => setTimeout(resolve, 180))
    if (scenario === 'shrink') listTotal = 1
    if (scenario === 'zero') listTotal = 0
    return reply({ ...group(0), ...body })
  }
  if (path === '/products')
    return reply({ page: 1, pageSize: Number(params.pageSize), total: 0, items: [] })
  return reply({ items: [], total: 0, page: 1, pageSize: 10 })
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
const lists = () => calls.filter((call) => call.path === '/product-groups' && call.method === 'GET')
const ready = async () => {
  await page.locator('.groups-panel').waitFor()
  await page.waitForTimeout(450)
  await page.waitForFunction(
    () => document.querySelector('.products-table-region')?.getAttribute('aria-busy') === 'false',
  )
}
const keyword = () => page.getByRole('textbox', { name: 'Nhập mã hoặc tên nhóm…', exact: true })
const drawer = () => page.locator('.ant-drawer-content:visible')
const field = (name) => drawer().getByLabel(name, { exact: true })
const close = async () => {
  await drawer().getByRole('button', { name: 'Hủy', exact: true }).click()
  await page.waitForTimeout(300)
}
const firstAction = (name) =>
  page.locator('.product-actions').first().getByRole('button', { name, exact: true })
const changeStatus = async () => {
  await firstAction('Thao tác').click()
  await page.locator('.ant-dropdown:visible').getByRole('menuitem').last().click()
  await page.locator('.ant-modal-confirm:visible .ant-btn-primary').click()
  await ready()
  await page.waitForTimeout(200)
}
const search = async (value) => {
  await keyword().fill(value)
  await keyword().press('Enter')
  await ready()
}
const geometry = async (label) => {
  const value = await page.evaluate(() => {
    const rect = (element) => {
      const r = element.getBoundingClientRect()
      return { top: r.top, bottom: r.bottom, height: r.height }
    }
    return {
      width: innerWidth,
      height: innerHeight,
      scrollHeight: document.documentElement.scrollHeight,
      scrollWidth: document.documentElement.scrollWidth,
      footer: rect(document.querySelector('.products-footer')),
      region: rect(document.querySelector('.products-table-region')),
      regionScroll: document.querySelector('.products-table-region').scrollHeight,
      rows: [...document.querySelectorAll('.product-row')].map(rect),
    }
  })
  measurements.push({ label, ...value, pageSize: lists().at(-1)?.params.pageSize })
  check(
    `${label}: no page or table scroll, footer visible`,
    value.scrollHeight <= value.height + 1 &&
      value.scrollWidth <= value.width + 1 &&
      value.regionScroll <= value.region.height + 1 &&
      value.footer.bottom <= value.height,
  )
  check(
    `${label}: every server row visible with stable height`,
    value.rows.length === Number(lists().at(-1).params.pageSize) &&
      value.rows.every(
        (row) =>
          row.bottom <= value.footer.top + 1 && Math.abs(row.height - value.rows[0].height) < 1,
      ),
  )
}
try {
  await page.goto(base + '/catalog/product-groups')
  await ready()
  check(
    'Group heading, description and purple add action',
    (await page.getByRole('heading', { name: 'Nhóm sản phẩm', exact: true }).count()) === 1 &&
      (await page
        .getByText('Phân loại sản phẩm để tìm kiếm và quản lý thuận tiện.', { exact: true })
        .count()) === 1 &&
      (await page
        .getByRole('button', { name: 'Thêm nhóm sản phẩm', exact: true })
        .evaluate((element) => getComputedStyle(element).backgroundColor === 'rgb(115, 87, 207)')),
  )
  check('Initial group list waits for capacity and makes one server call', lists().length === 1)
  check(
    'Four columns and total come from API',
    (await page.locator('.products-table th').count()) === 4 &&
      (await page.locator('.products-total').innerText()).includes('237'),
  )
  await geometry('1366x768')
  await page.screenshot({ path: artifacts + '/desktop-1366.png', fullPage: true })
  check(
    'Long names, codes and 2000 character descriptions never widen cells',
    (await page
      .locator('.product-name')
      .first()
      .evaluate((element) => element.getBoundingClientRect().height <= 40)) &&
      (await page
        .locator('.group-description')
        .first()
        .evaluate((element) => element.getBoundingClientRect().height <= 40)),
  )
  check(
    'Null description renders em dash and inactive status has a label',
    (await page.locator('.product-row').nth(1).innerText()).includes('—') &&
      (await page.locator('.product-row').nth(1).innerText()).includes('Ngừng hoạt động'),
  )
  await page.locator('.products-footer .ant-pagination-next').click()
  await ready()
  check('Pagination requests the next server page', lists().at(-1).params.page === '2')
  const original = Number(lists().at(-1).params.pageSize)
  await page.setViewportSize({ width: 1920, height: 1080 })
  await ready()
  await geometry('1920x1080')
  check(
    'Resize increases capacity and returns to page 1',
    Number(lists().at(-1).params.pageSize) > original && lists().at(-1).params.page === '1',
  )
  await page.screenshot({ path: artifacts + '/desktop-1920.png', fullPage: true })
  const before = lists().length
  await page.setViewportSize({ width: 1919, height: 1080 })
  await ready()
  check('Same capacity resize makes no API request', lists().length === before)
  for (const [width, height, label] of [
    [1366, 500, 'low-500'],
    [1093, 614, 'zoom-125'],
    [390, 844, 'mobile-390'],
    [320, 640, 'mobile-320'],
  ]) {
    await page.setViewportSize({ width, height })
    await ready()
    await geometry(label)
    await page.screenshot({ path: artifacts + `/${label}.png`, fullPage: true })
  }
  check(
    'Mobile hides secondary description column',
    (await page.locator('.group-description').count()) === 0,
  )
  await page.setViewportSize({ width: 1366, height: 768 })
  await ready()
  await page.locator('.products-footer .ant-pagination-next').click()
  await ready()
  await search(' fresh ')
  check(
    'Enter trims keyword and returns to page 1',
    lists().at(-1).params.keyword === 'fresh' && lists().at(-1).params.page === '1',
  )
  await keyword().fill('slow')
  await keyword().press('Enter')
  await page.waitForTimeout(60)
  await keyword().fill('fresh')
  await keyword().press('Enter')
  await page.waitForTimeout(850)
  check(
    'Old request cannot overwrite the latest data',
    (await page.locator('.product-name').first().innerText()) === 'KẾT QUẢ MỚI',
  )
  await page.locator('.catalog-filters .ant-select').click()
  await page
    .locator('.ant-select-dropdown:visible')
    .getByText('Ngừng hoạt động', { exact: true })
    .click()
  await ready()
  check(
    'Status 0 goes to API',
    lists().at(-1).params.status === '0' && lists().at(-1).params.page === '1',
  )
  const resetBefore = lists().length
  await page.getByRole('button', { name: 'Đặt lại', exact: true }).click()
  await ready()
  check(
    'Reset makes one request, clears filters and returns to page 1',
    lists().length === resetBefore + 1 &&
      lists().at(-1).params.page === '1' &&
      !('status' in lists().at(-1).params) &&
      !('keyword' in lists().at(-1).params),
  )
  check(
    'Global group catalog never uses warehouse/group filters or product mutations',
    lists().every((call) =>
      Object.keys(call.params).every((key) =>
        ['page', 'pageSize', 'keyword', 'status'].includes(key),
      ),
    ) && calls.every((call) => !call.path.startsWith('/products')),
  )
  await firstAction('Chi tiết').click()
  await drawer().getByText(description, { exact: true }).waitFor()
  check(
    'Detail retains full code/name/description and timestamps',
    (await drawer().innerText()).includes(group(0).name) &&
      (await drawer().innerText()).includes(group(0).code) &&
      (await drawer().innerText()).includes('Ngày tạo'),
  )
  await page.screenshot({ path: artifacts + '/detail.png', fullPage: true })
  await close()
  scenario = 'detail-error'
  await firstAction('Chi tiết').click()
  await drawer().getByText('Lỗi nạp chi tiết nhóm', { exact: true }).waitFor()
  check(
    'Detail errors stay in drawer and preserve list rows',
    (await page.locator('.product-row').count()) > 0,
  )
  await close()
  scenario = 'normal'
  await firstAction('Chỉnh sửa').click()
  await field('Tên').waitFor()
  await page.waitForTimeout(250)
  check(
    'Edit loads all four fields without truncating long values',
    (await drawer().locator('.ant-form-item').count()) === 4 &&
      (await field('Mã').inputValue()) === group(0).code &&
      (await field('Tên').inputValue()) === group(0).name &&
      (await field('Mô tả').inputValue()) === description,
  )
  await field('Tên').fill('Tên nhóm đã chỉnh sửa')
  await close()
  await page
    .locator('.ant-modal-confirm')
    .getByText('Có thay đổi chưa lưu', { exact: true })
    .waitFor()
  await page.locator('.ant-modal-confirm:visible .ant-btn-default').click()
  await page.waitForTimeout(250)
  check(
    'Cancelling discard preserves drawer and unsaved values',
    (await drawer().count()) === 1 && (await field('Tên').inputValue()) === 'Tên nhóm đã chỉnh sửa',
  )
  await drawer().getByRole('button', { name: 'Lưu', exact: true }).click()
  await ready()
  await page.waitForTimeout(250)
  const edit = calls.filter((call) => call.method === 'PUT').at(-1)
  check(
    'Edit uses a full four-field PUT without response metadata',
    Object.keys(edit.body).sort().join(',') === 'code,description,name,status' &&
      edit.body.description === description &&
      edit.body.name === 'Tên nhóm đã chỉnh sửa',
  )
  await changeStatus()
  const status = calls.filter((call) => call.method === 'PUT').at(-1)
  check(
    'Status change GETs latest detail and preserves code/name/description',
    status.body.status === 0 &&
      status.body.code === group(0).code &&
      status.body.name === group(0).name &&
      status.body.description === description,
  )
  await page.getByRole('button', { name: 'Thêm nhóm sản phẩm', exact: true }).click()
  await field('Mã').waitFor()
  await drawer().getByRole('button', { name: 'Lưu', exact: true }).click()
  check(
    'Required field validation blocks empty submission',
    (await drawer().getByText('Trường này là bắt buộc', { exact: true }).count()) >= 2,
  )
  await field('Mã').fill('Á-INVALID')
  await field('Tên').fill('Nhóm kiểm thử')
  await drawer().getByRole('button', { name: 'Lưu', exact: true }).click()
  check(
    'Non-ASCII codes are rejected',
    (await drawer()
      .getByText('Mã chỉ nhận chữ ASCII, số, _, - và dấu chấm.', { exact: true })
      .count()) === 1,
  )
  await field('Mã').fill(' new_group-1.2 ')
  await field('Mô tả').fill(description + 'x')
  check(
    'Description has a 2000 character limit and character count',
    (await field('Mô tả').inputValue()).length === 2000 &&
      (await drawer().locator('.ant-input-textarea-show-count').getAttribute('data-count')) ===
        '2000 / 2000',
  )
  scenario = 'duplicate'
  await drawer().getByRole('button', { name: 'Lưu', exact: true }).click()
  await drawer().getByText('Mã nhóm đã tồn tại', { exact: true }).first().waitFor()
  check(
    'Duplicate code API errors map to code field',
    (await drawer().locator('.ant-form-item').first().innerText()).includes('Mã nhóm đã tồn tại'),
  )
  scenario = 'validation'
  await drawer().getByRole('button', { name: 'Lưu', exact: true }).click()
  await drawer().getByText('Tên nhóm không hợp lệ từ API', { exact: true }).waitFor()
  check(
    'API validation errors map to name field',
    (await drawer().locator('.ant-form-item').nth(1).innerText()).includes(
      'Tên nhóm không hợp lệ từ API',
    ),
  )
  scenario = 'normal'
  const writesBefore = calls.filter((call) => call.method === 'POST').length
  await drawer().getByRole('button', { name: 'Lưu', exact: true }).dblclick()
  await ready()
  await page.waitForTimeout(250)
  const created = calls.filter((call) => call.method === 'POST').at(-1)
  check(
    'Create trims and uppercases code with no duplicate submit',
    calls.filter((call) => call.method === 'POST').length === writesBefore + 1 &&
      created.body.code === 'NEW_GROUP-1.2' &&
      created.body.description === description,
  )
  await page.getByRole('button', { name: 'Thêm nhóm sản phẩm', exact: true }).click()
  await field('Tên').fill('Chưa lưu')
  await page.locator('#app-sidebar .sidebar-label[title="Sản phẩm"]').click({ force: true })
  await page
    .locator('.ant-modal-confirm:visible')
    .getByText('Có thay đổi chưa lưu', { exact: true })
    .waitFor()
  await page.locator('.ant-modal-confirm:visible .ant-btn-default').click()
  await page.waitForTimeout(200)
  check(
    'SPA navigation cancellation preserves group editor and route',
    page.url().endsWith('/catalog/product-groups') &&
      (await field('Tên').inputValue()) === 'Chưa lưu',
  )
  check(
    'Unsaved editor prevents beforeunload',
    await page.evaluate(
      () => !window.dispatchEvent(new Event('beforeunload', { cancelable: true })),
    ),
  )
  await close()
  await page.locator('.ant-modal-confirm:visible .ant-btn-primary').click()
  await page.waitForTimeout(250)
  await page.locator('.ant-drawer-content:visible').waitFor({ state: 'hidden' })
  check('Confirmed discard closes the editor', (await drawer().count()) === 0)
  const productRead = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/products' && response.request().method() === 'GET',
  )
  await page.locator('#app-sidebar .sidebar-label[title="Sản phẩm"]').click()
  await page.waitForURL('**/catalog/products')
  await productRead
  await page.waitForFunction(
    () => document.querySelector('.products-table-region')?.getAttribute('aria-busy') === 'false',
  )
  check(
    'SPA navigation to Products starts a measured server request',
    calls.some((call) => call.path === '/products' && call.method === 'GET'),
  )
  await page.locator('#app-sidebar .sidebar-label[title="Nhóm sản phẩm"]').click()
  await page.waitForURL('**/catalog/product-groups')
  await ready()
  check(
    'SPA return to Groups refetches even when capacity is unchanged',
    (await page.locator('.product-row').count()) > 0 && lists().at(-1).params.pageSize !== '100',
  )
  await search('few')
  check(
    'Few records keep footer next to the data instead of a tall blank card',
    await page.evaluate(
      () =>
        document.querySelector('.products-footer').getBoundingClientRect().top -
          document.querySelector('.products-table').getBoundingClientRect().bottom <
        3,
    ),
  )
  await page.screenshot({ path: artifacts + '/few-records.png', fullPage: true })
  await search('empty')
  check(
    'Empty state and API total 0 are explicit',
    (await page.locator('.products-empty').innerText()) === 'Không có dữ liệu' &&
      (await page.locator('.products-total').innerText()).includes('0'),
  )
  scenario = 'list-error'
  await page
    .locator('.products-toolbar')
    .getByRole('button', { name: 'Tải lại', exact: true })
    .click()
  await ready()
  check(
    'List API errors show a retryable state',
    (await page.getByText('Không tải được nhóm sản phẩm', { exact: true }).count()) === 1 &&
      (await page.locator('.product-row').count()) === 0,
  )
  const errorsBefore = lists().length
  await page.waitForTimeout(600)
  check('Errors do not trigger a ResizeObserver request loop', lists().length === errorsBefore)
  scenario = 'normal'
  await page.getByRole('button', { name: 'Đặt lại', exact: true }).click()
  await ready()
  await page.locator('.products-footer .ant-pagination-next').click()
  await ready()
  scenario = 'shrink'
  await changeStatus()
  check(
    'Invalid current page after change is corrected and refetched',
    lists().at(-1).params.page === '1' && (await page.locator('.product-row').count()) === 1,
  )
  scenario = 'normal'
  listTotal = 237
  await page
    .locator('.products-toolbar')
    .getByRole('button', { name: 'Tải lại', exact: true })
    .click()
  await ready()
  await page.locator('.products-footer .ant-pagination-next').click()
  await ready()
  scenario = 'zero'
  await changeStatus()
  check(
    'Total becoming zero also corrects the page to 1',
    lists().at(-1).params.page === '1' && (await page.locator('.product-row').count()) === 0,
  )
  scenario = 'normal'
  listTotal = 237
  scenario = 'status-error'
  await page
    .locator('.products-toolbar')
    .getByRole('button', { name: 'Tải lại', exact: true })
    .click()
  await ready()
  await changeStatus()
  check(
    'Failed status changes show error without pushing pagination out',
    (await page.getByText('Lỗi đổi trạng thái nhóm', { exact: true }).count()) === 1 &&
      (await page.locator('.product-row').count()) === 0 &&
      (await page
        .locator('.products-footer')
        .evaluate((element) => element.getBoundingClientRect().bottom <= innerHeight)),
  )
  scenario = 'normal'
  await page
    .locator('.products-toolbar')
    .getByRole('button', { name: 'Tải lại', exact: true })
    .click()
  await ready()
  await page
    .locator('.product-actions')
    .nth(1)
    .getByRole('button', { name: 'Thao tác', exact: true })
    .click()
  await page
    .locator('.ant-dropdown:visible')
    .getByRole('menuitem', { name: 'Kích hoạt', exact: true })
    .click()
  await page.locator('.ant-modal-confirm:visible .ant-btn-primary').click()
  await ready()
  await page.waitForTimeout(200)
  const activated = calls.filter((call) => call.method === 'PUT').at(-1)
  check(
    'Inactive group can activate with a full latest payload',
    activated.body.status === 1 &&
      activated.body.code === group(1).code &&
      activated.body.name === group(1).name,
  )
  scenario = 'forbidden'
  await page
    .locator('.products-toolbar')
    .getByRole('button', { name: 'Tải lại', exact: true })
    .click()
  await ready()
  check(
    '403 uses shared error/access refresh and clears visible list',
    (await page
      .getByText('Bạn không có quyền thực hiện thao tác này.', { exact: true })
      .count()) === 1 && (await page.locator('.product-row').count()) === 0,
  )
  const forbiddenCalls = lists().length
  await page.waitForTimeout(500)
  check('403 does not automatically loop list requests', lists().length === forbiddenCalls)
  scenario = 'normal'
  permissions = ['PRODUCT_GROUP_VIEW']
  await page.reload()
  await ready()
  check(
    'View-only hides create/edit/status while retaining detail',
    (await page.getByRole('button', { name: 'Thêm nhóm sản phẩm', exact: true }).count()) === 0 &&
      (await page.getByRole('button', { name: 'Chỉnh sửa', exact: true }).count()) === 0 &&
      (await page.getByRole('button', { name: 'Chi tiết', exact: true }).count()) > 0,
  )
  permissions = ['PRODUCT_GROUP_CREATE']
  const createOnlyBefore = lists().length
  await page.reload()
  await ready()
  check(
    'Create-only can open form without fetching list/detail',
    lists().length === createOnlyBefore &&
      (await page.getByRole('button', { name: 'Thêm nhóm sản phẩm', exact: true }).count()) === 1,
  )
  permissions = []
  admin = true
  await page.reload()
  await ready()
  check(
    'Verified ADMIN retains group access without warehouse assignment',
    (await page.locator('.product-row').count()) > 0 &&
      (await page.getByRole('button', { name: 'Thêm nhóm sản phẩm', exact: true }).count()) === 1,
  )
  check(
    'All pageSize values are integers in 1–100',
    lists().every(
      (call) =>
        Number.isInteger(Number(call.params.pageSize)) &&
        Number(call.params.pageSize) >= 1 &&
        Number(call.params.pageSize) <= 100,
    ),
  )
  check(
    'No unsupported DELETE or product mutation is introduced',
    calls.every(
      (call) =>
        call.method !== 'DELETE' && !(call.path.startsWith('/products') && call.method !== 'GET'),
    ),
  )
  check('No application or component errors', errors.length === 0)
  await writeFile(
    artifacts + '/browser-results.json',
    JSON.stringify({ passed: checks.length, checks, measurements, errors }, null, 2),
  )
  console.log(
    JSON.stringify(
      {
        passed: checks.length,
        checks,
        measurements: measurements.map(({ label, pageSize }) => ({ label, pageSize })),
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
