// Customer workflows against controlled API fixtures; never mutates the real backend.
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
})
await context.addInitScript(() => {
  localStorage.setItem('frontend-base:access-token', 'customers-test')
  sessionStorage.setItem('working-warehouse:customer-user', 'w1')
})
const artifacts = 'docs/customers-artifacts'
await mkdir(artifacts, { recursive: true })
const allPermissions = ['CUSTOMER_VIEW', 'CUSTOMER_CREATE', 'CUSTOMER_UPDATE']
let permissions = [...allPermissions],
  admin = false,
  scenario = 'normal'
const warehouseData = [
  { id: 'w1', code: 'K1', name: 'Kho Thanh Chương', status: 1 },
  { id: 'w2', code: 'K2', name: 'Kho Diễn Châu', status: 1 },
  { id: 'w3', code: 'K3', name: 'Kho ngừng hoạt động', status: 0 },
]
let assigned = [...warehouseData]
const code = 'KH-' + '0123456789'.repeat(12)
const address = 'Địa chỉ đầy đủ, đường Nguyễn Chánh, Nghệ An. '.repeat(20).slice(0, 500)
const note = 'Ghi chú khách hàng giữ nguyên khi đổi trạng thái.\n'.repeat(30).slice(0, 1500)
let record = {
  id: 'c0',
  warehouseId: 'w1',
  code,
  name: 'Nguyễn Thị Hương',
  phone: '0900000068',
  address,
  note,
  status: 1,
  createdAt: '2026-10-01T01:00:00Z',
  updatedAt: '2026-10-23T02:00:00Z',
}
const calls = [],
  checks = [],
  errors = []
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
      id: 'customer-user',
      username: 'customer-test',
      fullName: 'Kiểm tra Khách hàng',
      permissions,
    })
  if (path === '/users/customer-user') return reply({ id: 'customer-user', status: 1 })
  if (path === '/users/customer-user/roles')
    return reply(admin ? [{ code: 'ADMIN', status: 1 }] : [])
  if (path === '/users/me/warehouses') return reply(assigned)
  if (path === '/customers' && method === 'GET') {
    if (scenario === 'list-error') return reply({ message: 'Lỗi danh sách khách hàng' }, 503)
    if (scenario === 'forbidden-list') return reply({ message: 'Không có quyền truy cập kho' }, 403)
    const page = Number(params.page) || 1,
      pageSize = Number(params.pageSize) || 10,
      total = params.keyword === 'empty' ? 0 : 137
    const warehouseId = params.warehouseId || assigned[0]?.id || 'w1'
    const items = Array.from(
      { length: Math.max(0, Math.min(pageSize, total - (page - 1) * pageSize)) },
      (_, i) => {
        const index = (page - 1) * pageSize + i
        return {
          ...record,
          id: 'c' + index,
          warehouseId,
          name:
            index === 0 ? record.name : ('Khách ' + index + ' tên dài ').repeat(12).slice(0, 160),
          phone: index === 1 ? null : record.phone,
          address: index === 1 ? null : record.address,
        }
      },
    )
    if (scenario === 'foreign-list')
      items.push({ ...record, id: 'foreign', warehouseId: 'w9', name: 'KHÁCH NGOÀI PHẠM VI' })
    return reply({ items, page, pageSize, total })
  }
  if (path.startsWith('/customers/') && method === 'GET') {
    if (scenario === 'detail-error') return reply({ message: 'Lỗi tải chi tiết khách hàng' }, 503)
    const snapshot = { ...record }
    if (scenario === 'slow-detail') await new Promise((resolve) => setTimeout(resolve, 700))
    return reply(scenario === 'foreign-detail' ? { ...snapshot, warehouseId: 'w9' } : snapshot)
  }
  if (
    (path === '/customers' && method === 'POST') ||
    (path.startsWith('/customers/') && method === 'PUT')
  ) {
    await new Promise((resolve) => setTimeout(resolve, 350))
    if (scenario === 'validation')
      return reply(
        { message: 'Dữ liệu không hợp lệ', details: { phone: 'Điện thoại bị trùng từ API' } },
        400,
      )
    if (scenario === 'conflict') return reply({ message: 'Bản ghi đã thay đổi' }, 409)
    if (scenario === 'save-error') return reply({ message: 'Lỗi lưu khách hàng' }, 503)
    if (scenario === 'forbidden-save') return reply({ message: 'Quyền kho đã bị thu hồi' }, 403)
    if (method === 'POST')
      return reply({ ...record, ...body, id: 'created', code: 'KH-BE-GENERATED' })
    record = { ...record, ...body }
    return reply(record)
  }
  return reply({ items: [], total: 0 })
})
const page = await context.newPage()
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (/Unhandled|Failed to resolve component|ResizeObserver loop/.test(message.text()))
    errors.push(message.text())
})
const base = process.env.CUSTOMERS_TEST_URL || 'http://127.0.0.1:5173'
const check = (name, value = true) => {
  assert.ok(value, name)
  checks.push(name)
}
const writes = () => calls.filter((call) => call.method === 'POST' || call.method === 'PUT')
const lists = () => calls.filter((call) => call.path === '/customers' && call.method === 'GET')
const reads = () =>
  calls.filter((call) => call.path.startsWith('/customers/') && call.method === 'GET')
const drawer = () => page.locator('.ant-drawer-content:visible')
const field = (name) => drawer().getByLabel(name, { exact: true })
const ready = async () => {
  await page.locator('.customers-panel').waitFor()
  await page.waitForFunction(
    () => document.querySelector('.products-table-region')?.getAttribute('aria-busy') === 'false',
  )
  await page.waitForTimeout(200)
}
const start = async () => {
  await page.goto(base + '/sales/customers')
  await ready()
}
const close = async () => {
  await drawer()
    .getByRole('button', { name: /^(Hủy|Đóng)$/ })
    .click()
  await drawer().waitFor({ state: 'hidden' })
}
const action = async (name) => {
  await page.locator('.customer-actions').first().getByRole('button', { name, exact: true }).click()
}
const menuAction = async (name) => {
  await action('Thao tác')
  await page.locator('.ant-dropdown:visible').getByRole('menuitem', { name, exact: true }).click()
}
const waitEdit = async () => {
  await field('Tên').waitFor()
  await page.waitForFunction(
    () => !document.querySelector('.ant-drawer-content .ant-spin-spinning'),
  )
}
const choose = async (selector, text) => {
  await selector.click()
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: text })
    .click()
}
try {
  await start()
  check(
    'Description and labeled filters present',
    await page
      .getByText('Quản lý thông tin khách hàng theo từng kho.', { exact: true })
      .isVisible(),
  )
  check(
    'Theme matches warehouse purple',
    await page
      .getByRole('button', { name: 'Thêm khách hàng', exact: true })
      .evaluate((el) => getComputedStyle(el).backgroundColor === 'rgb(115, 87, 207)'),
  )
  check(
    'Initial warehouse follows current working warehouse',
    lists().at(-1).params.warehouseId === 'w1',
  )
  check(
    'Customer code remains unchanged in data',
    (await page.locator('.customer-code').first().innerText()) === code,
  )
  check(
    'Long code is ellipsized visually',
    await page
      .locator('.customer-code')
      .first()
      .evaluate(
        (el) => el.scrollWidth > el.clientWidth && getComputedStyle(el).textOverflow === 'ellipsis',
      ),
  )
  await action('Chi tiết')
  await drawer().locator('.customer-detail').waitFor()
  check(
    'Detail shows complete code address note and phone',
    (await drawer().getByText(code, { exact: true }).isVisible()) &&
      (await drawer().getByText(address, { exact: true }).isVisible()) &&
      (await drawer().getByText(note.trim(), { exact: true }).isVisible()) &&
      (await drawer().getByText('0900000068', { exact: true }).isVisible()),
  )
  check(
    'Detail has timestamps and read-only text',
    (await drawer().getByText('Ngày tạo', { exact: true }).isVisible()) &&
      (await drawer().locator('input,textarea').count()) === 0,
  )
  check(
    'Detail does not offer save or delete',
    (await drawer().getByRole('button', { name: 'Lưu', exact: true }).count()) === 0 &&
      (await drawer().getByRole('button', { name: 'Xóa', exact: true }).count()) === 0,
  )
  await page.screenshot({ path: artifacts + '/detail-desktop.png' })
  await close()
  await page.getByRole('button', { name: 'Thêm khách hàng', exact: true }).click()
  await waitEdit()
  check(
    'Create defaults to working warehouse',
    await drawer()
      .locator('#customer-warehouse')
      .evaluate((el) => el.closest('.ant-select').innerText.includes('Kho Thanh Chương')),
  )
  check(
    'Desktop form uses two columns',
    await drawer()
      .locator('.customer-form')
      .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length === 2),
  )
  check(
    'Generated customer code is not an input',
    (await drawer().locator('input[id*=code]').count()) === 0,
  )
  const beforeInvalid = writes().length
  await drawer().getByRole('button', { name: 'Lưu', exact: true }).click()
  await drawer().getByText('Tên bắt buộc, tối đa 160 ký tự.', { exact: true }).waitFor()
  check('Name validation prevents request', writes().length === beforeInvalid)
  await field('Tên').fill('  Khách tạo mới  ')
  await field('Điện thoại').fill('0900123456')
  await field('Địa chỉ').fill('  Địa chỉ tạo mới  ')
  await field('Ghi chú').fill('  Ghi chú tạo mới  ')
  check(
    'Form limits preserve contract',
    (await field('Tên').getAttribute('maxlength')) === '160' &&
      (await field('Điện thoại').getAttribute('maxlength')) === '20' &&
      (await field('Địa chỉ').evaluate((el) =>
        el.closest('[data-count]').getAttribute('data-count').endsWith(' / 500'),
      )) &&
      (await field('Ghi chú').evaluate((el) =>
        el.closest('[data-count]').getAttribute('data-count').endsWith(' / 2000'),
      )),
  )
  await field('Địa chỉ').fill('A'.repeat(600))
  await field('Ghi chú').fill('N'.repeat(2100))
  check(
    'Textareas enforce existing 500/2000 character limits',
    (await field('Địa chỉ').inputValue()).length === 500 &&
      (await field('Ghi chú').inputValue()).length === 2000,
  )
  await field('Địa chỉ').fill('  Địa chỉ tạo mới  ')
  await field('Ghi chú').fill('  Ghi chú tạo mới  ')
  scenario = 'validation'
  await drawer().getByRole('button', { name: 'Lưu', exact: true }).click()
  await drawer().getByText('Điện thoại bị trùng từ API', { exact: true }).waitFor()
  check(
    'API validation maps to phone field',
    await field('Điện thoại').evaluate((el) => !!el.closest('.ant-form-item-has-error')),
  )
  check('Failed save keeps entered data', (await field('Tên').inputValue()) === '  Khách tạo mới  ')
  scenario = 'normal'
  const beforeCreate = writes().length,
    beforeCreateLists = lists().length
  await drawer().getByRole('button', { name: 'Lưu', exact: true }).dblclick()
  check(
    'Saving disables close',
    await drawer().getByRole('button', { name: 'Hủy', exact: true }).isDisabled(),
  )
  await drawer().waitFor({ state: 'hidden' })
  await ready()
  check(
    'Create sends one POST and one list reload',
    writes().length === beforeCreate + 1 && lists().length === beforeCreateLists + 1,
  )
  assert.deepEqual(writes().at(-1).body, {
    name: 'Khách tạo mới',
    phone: '0900123456',
    address: 'Địa chỉ tạo mới',
    note: 'Ghi chú tạo mới',
    status: 1,
    warehouseId: 'w1',
  })
  check('Create payload uses server code and string phone')
  await action('Sửa')
  await waitEdit()
  check(
    'Edit fetches complete current detail',
    (await field('Địa chỉ').inputValue()) === record.address &&
      (await field('Ghi chú').inputValue()) === record.note.trim(),
  )
  check(
    'Edit warehouse is immutable and code is complete',
    (await field('Kho').isDisabled()) &&
      (await drawer().getByText(code, { exact: true }).isVisible()),
  )
  await field('Tên').fill('Tên chưa lưu')
  const beforeReload = reads().length
  await drawer().getByRole('button', { name: 'Tải lại dữ liệu gốc', exact: true }).click()
  await page.locator('.ant-modal-confirm').waitFor()
  check(
    'Reload asks before discarding unsaved data',
    reads().length === beforeReload && (await field('Tên').inputValue()) === 'Tên chưa lưu',
  )
  await page.locator('.ant-modal-confirm .ant-btn-default').click()
  await page.locator('.ant-modal-confirm').waitFor({ state: 'hidden' })
  check('Cancel reload preserves edits', (await field('Tên').inputValue()) === 'Tên chưa lưu')
  await drawer().getByRole('button', { name: 'Tải lại dữ liệu gốc', exact: true }).click()
  await page.locator('.ant-modal-confirm .ant-btn-primary').click()
  await page.locator('.ant-modal-confirm').waitFor({ state: 'hidden' })
  await waitEdit()
  check(
    'Confirmed reload restores original detail',
    reads().length === beforeReload + 1 && (await field('Tên').inputValue()) === record.name,
  )
  await field('Tên').fill('Khách đã sửa')
  scenario = 'conflict'
  await drawer().getByRole('button', { name: 'Lưu', exact: true }).click()
  await drawer()
    .getByText(/Bản ghi đã thay đổi/)
    .waitFor()
  check('409 keeps unsaved form', (await field('Tên').inputValue()) === 'Khách đã sửa')
  scenario = 'normal'
  const editExpected = {
    name: 'Khách đã sửa',
    phone: record.phone,
    address: record.address,
    note: record.note.trim(),
    status: record.status,
  }
  await drawer().getByRole('button', { name: 'Lưu', exact: true }).click()
  await drawer().waitFor({ state: 'hidden' })
  await ready()
  assert.deepEqual(writes().at(-1).body, editExpected)
  check('Edit PUT keeps full contact fields and omits warehouse and code')
  const beforeToggle = writes().length
  await menuAction('Ngừng hoạt động')
  await drawer().getByText('Ngừng hoạt động khách hàng?', { exact: true }).waitFor()
  check('Status change requires explicit confirmation', writes().length === beforeToggle)
  await close()
  check('Cancel status change sends no PUT', writes().length === beforeToggle)
  const toggleExpected = { ...editExpected, status: 0 }
  await menuAction('Ngừng hoạt động')
  await drawer().getByText('Ngừng hoạt động khách hàng?', { exact: true }).waitFor()
  await drawer().getByRole('button', { name: 'Ngừng hoạt động', exact: true }).dblclick()
  await drawer().waitFor({ state: 'hidden' })
  await ready()
  assert.deepEqual(writes().at(-1).body, toggleExpected)
  check('Deactivate sends one PUT preserving every field', writes().length === beforeToggle + 1)
  await menuAction('Kích hoạt')
  await drawer().getByText('Kích hoạt khách hàng?', { exact: true }).waitFor()
  await drawer().getByRole('button', { name: 'Kích hoạt', exact: true }).click()
  await drawer().waitFor({ state: 'hidden' })
  await ready()
  check(
    'Reactivate preserves contact fields',
    record.status === 1 &&
      record.note === editExpected.note &&
      record.address === editExpected.address,
  )
  scenario = 'detail-error'
  await action('Sửa')
  await drawer().getByText('Lỗi tải chi tiết khách hàng', { exact: true }).waitFor()
  check(
    'Detail load error blocks saving',
    await drawer().getByRole('button', { name: 'Lưu', exact: true }).isDisabled(),
  )
  await close()
  scenario = 'foreign-detail'
  const beforeForeign = writes().length
  await action('Sửa')
  await drawer().getByText('Kho không còn trong phạm vi được phép.', { exact: true }).waitFor()
  check(
    'Foreign detail cannot be edited',
    (await drawer().getByRole('button', { name: 'Lưu', exact: true }).isDisabled()) &&
      writes().length === beforeForeign,
  )
  await close()
  scenario = 'normal'
  // Preserve the existing one-way relation: header changes the page filter;
  // changing the page filter does not change the working warehouse.
  await choose(page.locator('.warehouse-selector__select'), /^K2/)
  await ready()
  check('Working warehouse updates page filter', lists().at(-1).params.warehouseId === 'w2')
  await choose(page.locator('.filters .customer-filter').first().locator('.ant-select'), /^K1/)
  await ready()
  check(
    'Page filter does not change working warehouse',
    lists().at(-1).params.warehouseId === 'w1' &&
      (await page
        .locator('.warehouse-selector__select')
        .innerText()
        .then((text) => text.includes('Kho Diễn Châu'))),
  )
  const beforeNoPerRow = reads().length
  await page
    .locator('.customers-panel')
    .getByRole('button', { name: 'Tải lại', exact: true })
    .click()
  await ready()
  check(
    'List never requests warehouse or customer detail per row',
    reads().length === beforeNoPerRow,
  )
  await page.screenshot({ path: artifacts + '/list-desktop.png' })
  for (const [width, height] of [
    [1920, 1080],
    [1024, 768],
    [768, 900],
    [390, 844],
    [360, 740],
    [390, 400],
  ]) {
    await page.setViewportSize({ width, height })
    await page.waitForTimeout(300)
    check(
      'List ' + width + 'x' + height + ' keeps all columns without horizontal page overflow',
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= innerWidth + 1 &&
          document.querySelectorAll('.ant-table-header th:not(.ant-table-cell-scrollbar)')
            .length === 7,
      ),
    )
    await page.getByRole('button', { name: 'Thêm khách hàng', exact: true }).click()
    await waitEdit()
    check(
      'Drawer ' + width + 'x' + height + ' fits viewport with accessible footer',
      await drawer().evaluate((el) => {
        const r = el.getBoundingClientRect(),
          footer = el.querySelector('.ant-drawer-footer').getBoundingClientRect()
        return r.width <= innerWidth + 1 && footer.bottom <= innerHeight + 1 && footer.top >= 0
      }),
    )
    if (width <= 650)
      check(
        'Mobile ' + width + 'x' + height + ' form uses one column',
        await drawer()
          .locator('.customer-form')
          .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length === 1),
      )
    if (height === 400)
      check(
        'Keyboard-height form scrolls inside drawer',
        await drawer()
          .locator('.ant-drawer-body')
          .evaluate(
            (el) => el.scrollHeight > el.clientHeight && getComputedStyle(el).overflowY === 'auto',
          ),
      )
    if (width === 390 && height === 844)
      await page.screenshot({ path: artifacts + '/create-mobile.png' })
    await close()
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page
    .locator('.customer-actions')
    .first()
    .getByRole('button', { name: 'Thao tác', exact: true })
    .click()
  await page.locator('.ant-dropdown:visible .ant-dropdown-menu-item').nth(2).waitFor()
  check(
    'Mobile menu keeps all three actions',
    (await page.locator('.ant-dropdown:visible .ant-dropdown-menu-item').count()) === 3,
  )
  await page
    .locator('.ant-dropdown:visible')
    .getByRole('menuitem', { name: 'Chi tiết', exact: true })
    .click()
  await drawer().locator('.customer-detail').waitFor()
  check(
    'Mobile detail keeps full code and note',
    (await drawer().getByText(code, { exact: true }).isVisible()) &&
      (await drawer().getByText(note.trim(), { exact: true }).isVisible()),
  )
  await close()
  await page.setViewportSize({ width: 1366, height: 768 })
  scenario = 'slow-detail'
  await action('Sửa')
  await page.waitForTimeout(70)
  assigned = [warehouseData[1]]
  await page.locator('.warehouse-selector__reload').evaluate((el) => el.click())
  await drawer().waitFor({ state: 'hidden' })
  await page.waitForTimeout(800)
  check(
    'Scope revocation closes drawer and discards old detail',
    (await page.locator('.ant-drawer-content:visible').count()) === 0,
  )
  assigned = [warehouseData[0]]
  scenario = 'foreign-list'
  permissions = ['CUSTOMER_VIEW']
  await start()
  check(
    'View-only staff cannot create or edit',
    (await page.getByRole('button', { name: 'Thêm khách hàng', exact: true }).count()) === 0 &&
      (await page
        .locator('.customer-actions')
        .getByRole('button', { name: 'Sửa', exact: true })
        .count()) === 0,
  )
  check(
    'Staff cannot see records outside assigned warehouses',
    !(await page.locator('.ant-table-tbody').innerText()).includes('KHÁCH NGOÀI PHẠM VI'),
  )
  await action('Chi tiết')
  await drawer().locator('.customer-detail').waitFor()
  check('View-only staff can inspect assigned customer')
  await close()
  permissions = []
  admin = true
  scenario = 'normal'
  await start()
  check(
    'Verified active ADMIN retains existing permission exception',
    (await page.getByRole('button', { name: 'Thêm khách hàng', exact: true }).isVisible()) &&
      (await page
        .locator('.customer-actions')
        .first()
        .getByRole('button', { name: 'Sửa', exact: true })
        .isVisible()),
  )
  admin = false
  permissions = [...allPermissions]
  assigned = []
  const beforeNoScope = lists().length
  await page.goto(base + '/sales/customers')
  await page
    .getByText('Không có kho trong phạm vi được phép. Tải lại kho trên thanh công cụ.', {
      exact: true,
    })
    .waitFor()
  check('No assigned warehouse prevents list API', lists().length === beforeNoScope)
  assigned = [warehouseData[0]]
  scenario = 'forbidden-list'
  await page.goto(base + '/sales/customers')
  await page.getByText('Không có quyền truy cập kho', { exact: true }).first().waitFor()
  check(
    '403 list clears data and refreshes existing scope endpoint',
    (await page.locator('.ant-table-row').count()) === 0 &&
      calls.filter((call) => call.path === '/users/me/warehouses').length > 1,
  )
  scenario = 'normal'
  await start()
  await action('Sửa')
  await waitEdit()
  scenario = 'forbidden-save'
  await drawer().getByRole('button', { name: 'Lưu', exact: true }).click()
  await drawer().getByText('Quyền kho đã bị thu hồi', { exact: true }).waitFor()
  check(
    '403 mutation blocks repeat save',
    await drawer().getByRole('button', { name: 'Lưu', exact: true }).isDisabled(),
  )
  await close()
  assert.deepEqual(errors, [])
  check('No runtime or ResizeObserver errors')
  await writeFile(
    artifacts + '/browser-results.json',
    JSON.stringify({ checks, calls, errors }, null, 2),
  )
  console.log(JSON.stringify({ passed: checks.length, errors }, null, 2))
} catch (error) {
  await page.screenshot({ path: artifacts + '/failure.png' })
  await writeFile(
    artifacts + '/failure.json',
    JSON.stringify({ message: error.message, checks, calls, errors }, null, 2),
  )
  throw error
} finally {
  await browser.close()
}
