// Browser checks use controlled API fixtures and never contact the real backend.
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
  viewport: { width: 1440, height: 900 },
  reducedMotion: 'reduce',
})
await context.addInitScript(() =>
  localStorage.setItem('frontend-base:access-token', 'users-browser-test'),
)
const artifacts = 'docs/users-artifacts'
await mkdir(artifacts, { recursive: true })
let permissions = [
  'USER_VIEW',
  'USER_CREATE',
  'USER_UPDATE',
  'USER_DELETE',
  'USER_WAREHOUSE_VIEW',
  'USER_WAREHOUSE_ASSIGN',
]
let admin = false,
  scenario = '',
  total = 237
const calls = [],
  checks = [],
  measurements = [],
  errors = []
const role = (id, code, name, status = 1) => ({ id, code, name, status })
const roles = [
  role('00000000-0000-4000-8000-000000000001', 'ADMIN', 'Administrator'),
  role('00000000-0000-4000-8000-000000000002', 'SALE', 'Nhân viên bán hàng'),
  role(
    '00000000-0000-4000-8000-000000000003',
    'WAREHOUSE',
    'Nhân viên kho có tên rất dài '.repeat(5),
  ),
  role('00000000-0000-4000-8000-000000000004', 'OLD', 'Vai trò đã ngừng hoạt động', 0),
]
const outsideRole = role(
  '00000000-0000-4000-8000-000000000005',
  'OUTSIDE',
  'Vai trò ngoài danh sách chọn',
)
let assignments = [roles[0], roles[1], outsideRole]
const warehouses = [0, 1, 2].map((i) => ({
  id: `warehouse-${i}`,
  code: `KHO_${i}`,
  name: i === 2 ? 'Tên kho rất dài để kiểm tra xuống dòng '.repeat(8) : `Kho ${i}`,
  status: i === 1 ? 0 : 1,
}))
let assignedWarehouses = [warehouses[0]]
const user = (i) => ({
  id: `user-${i}`,
  username: `user_${i}`,
  fullName: i === 0 ? 'Người dùng đầu tiên' : `Người dùng ${i}`,
  email: i === 1 ? 'email-dai-'.repeat(12) + '@example.com' : `user${i}@example.com`,
  phone: i === 2 ? null : '0987654321',
  status: i % 2 ? 0 : 1,
  createdAt: '2026-10-01T01:02:03Z',
  updatedAt: i === 2 ? null : '2026-10-02T01:02:03Z',
  updatedByName: i === 2 ? null : 'Người cập nhật có tên dài '.repeat(4),
})
const reply = (route, data, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
await context.route('**/api/**', async (route) => {
  const request = route.request(),
    url = new URL(request.url())
  if (!url.pathname.startsWith('/api/')) return route.continue()
  const path = url.pathname.slice(4),
    method = request.method(),
    params = Object.fromEntries(url.searchParams),
    body = request.postDataJSON()
  calls.push({ path, method, params, body })
  if (path === '/auth/me')
    return reply(route, {
      id: 'operator',
      username: 'operator',
      fullName: 'Kiểm thử người dùng',
      permissions,
    })
  if (path === '/users/operator') return reply(route, { id: 'operator', status: 1 })
  if (path === '/users/operator/roles') return reply(route, admin ? [roles[0]] : [])
  if (path === '/users/me/warehouses') return reply(route, warehouses)
  if (path === '/roles')
    return reply(route, { items: roles, total: roles.length, page: 1, pageSize: 100 })
  if (path.match(/^\/users\/user-\d+\/roles$/)) {
    if (method === 'GET') {
      const data = path.includes('user-1/') ? [roles[2]] : [...assignments]
      if (scenario === 'slow-roles' && path.includes('user-0/'))
        await new Promise((r) => setTimeout(r, 1000))
      if (scenario === 'role-load-error')
        return reply(route, { message: 'Không tải được vai trò' }, 500)
      return reply(route, data)
    }
    await new Promise((r) => setTimeout(r, 250))
    if (scenario === 'role-save-error')
      return reply(route, { message: 'Không lưu được vai trò' }, 409)
    assignments = body.roleIds.map((id) => [...roles, outsideRole].find((r) => r.id === id))
    return reply(route, assignments)
  }
  if (path.match(/^\/users\/user-\d+\/roles\//)) {
    await new Promise((r) => setTimeout(r, 350))
    if (scenario === 'role-delete-error')
      return reply(route, { message: 'Không gỡ được vai trò' }, 409)
    assignments = assignments.filter((r) => r.id !== path.split('/').at(-1))
    return route.fulfill({ status: 204 })
  }
  if (path.match(/^\/users\/user-\d+\/warehouses$/)) {
    if (scenario === 'warehouse-load-error')
      return reply(route, { message: 'Không tải được kho' }, 500)
    const data = path.includes('user-1/') ? [warehouses[2]] : [...assignedWarehouses]
    if (scenario === 'slow-warehouses' && path.includes('user-0/'))
      await new Promise((r) => setTimeout(r, 1000))
    return reply(route, data)
  }
  if (path.match(/^\/users\/user-\d+\/warehouses\//)) {
    await new Promise((r) => setTimeout(r, 250))
    if (scenario === 'warehouse-write-error')
      return reply(route, { message: 'Không thay đổi được kho' }, 409)
    const id = path.split('/').at(-1)
    if (method === 'DELETE') {
      assignedWarehouses = assignedWarehouses.filter((w) => w.id !== id)
      return route.fulfill({ status: 204 })
    }
    assignedWarehouses.push(warehouses.find((w) => w.id === id))
    return reply(
      route,
      warehouses.find((w) => w.id === id),
    )
  }
  if (path === '/users' && method === 'GET') {
    if (scenario === 'list-error')
      return reply(route, { message: 'Không tải được người dùng' }, 500)
    const count = params.keyword === 'empty' ? 0 : total
    const size = Number(params.pageSize),
      offset = (Number(params.page) - 1) * size
    const items = Array.from({ length: Math.max(0, Math.min(size, count - offset)) }, (_, i) =>
      user(offset + i),
    )
    if (params.keyword === 'slow') {
      items[0].username = 'STALE'
      await new Promise((r) => setTimeout(r, 700))
    }
    return reply(route, { items, total: count, page: Number(params.page), pageSize: size })
  }
  if (
    (path === '/users' && method === 'POST') ||
    (path.match(/^\/users\/user-\d+$/) && method === 'PUT')
  ) {
    await new Promise((r) => setTimeout(r, 250))
    if (scenario === 'form-error') return reply(route, { message: 'Email đã tồn tại' }, 409)
    return reply(route, { ...user(0), ...body })
  }
  if (path.match(/^\/users\/user-\d+$/) && method === 'DELETE')
    return route.fulfill({ status: 204 })
  if (path.match(/^\/users\/user-\d+$/)) return reply(route, user(Number(path.split('-').at(-1))))
  return reply(route, { items: [], total: 0 })
})
const page = await context.newPage()
page.setDefaultTimeout(10000)
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (msg) => {
  if (
    /Unhandled|Failed to resolve component|does not provide an export|Not found.*locale/.test(
      msg.text(),
    )
  )
    errors.push(msg.text())
})
const check = (name, value) => {
  assert.ok(value, name)
  checks.push(name)
  console.log(name)
}
const listCalls = () => calls.filter((c) => c.path === '/users' && c.method === 'GET')
const writes = () => calls.filter((c) => ['POST', 'PUT', 'DELETE'].includes(c.method))
const ready = async () => {
  await page.locator('.user-page').waitFor()
  await page.waitForFunction(
    () => document.querySelector('.products-table-region')?.getAttribute('aria-busy') === 'false',
  )
  await page.waitForTimeout(150)
}
const firstAction = (name) =>
  page.locator('.user-page__actions').first().getByRole('button', { name, exact: true })
const drawer = () => page.locator('.ant-drawer-content:visible')
const modal = () => page.locator('.ant-modal:visible')
const closeDrawer = async (name) => {
  await drawer().locator('.ant-drawer-footer').getByRole('button', { name, exact: true }).click()
  await page.waitForTimeout(350)
}
const go = async () => {
  await page.goto('http://127.0.0.1:5173/system/user')
  await ready()
}
const geometry = async (label) => {
  const result = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    footerBottom: document.querySelector('.products-footer').getBoundingClientRect().bottom,
    columns: [
      ...document.querySelectorAll('.ant-table-thead th:not(.ant-table-cell-scrollbar)'),
    ].map((el) => el.textContent.trim()),
    table: document.querySelector('.ant-table-body').getBoundingClientRect().toJSON(),
    fixed: document.querySelector('.ant-table-tbody .ant-table-cell-fix-right') !== null,
  }))
  measurements.push({ label, ...result })
  check(`${label}: page has no horizontal overflow`, result.scrollWidth <= result.width + 1)
  check(
    `${label}: ten separate columns`,
    result.columns.join('|') ===
      'STT|Tên đăng nhập|Họ và tên|Email|Số điện thoại|Trạng thái|Ngày tạo|Ngày cập nhật|Cập nhật bởi|Thao tác',
  )
  check(`${label}: action column fixed only on desktop`, result.fixed === result.width >= 768)
}
const overlayGeometry = async (label, locator) => {
  const value = await locator.evaluate((el) => {
    const r = el.getBoundingClientRect()
    return {
      left: r.left,
      right: r.right,
      width: innerWidth,
      overflow: [
        ...el.querySelectorAll(
          'form,.assignment-user,.assignment-card,.assignment-note,.assignment-footer,.form-footer,.role-choices,.role-choice,.ant-drawer-body',
        ),
      ]
        .filter((e) => e.scrollWidth > e.clientWidth + 1)
        .map((e) => ({ cls: e.className, scroll: e.scrollWidth, client: e.clientWidth })),
    }
  })
  measurements.push({ label, overlay: value })
  console.log(JSON.stringify({ label, overlay: value }))
  check(
    `${label}: overlay fits viewport and content wraps`,
    value.left >= -1 && value.right <= value.width + 1 && !value.overflow.length,
  )
  const footer = locator.locator('.ant-drawer-footer,.ant-modal-footer')
  const rect = await footer.boundingBox()
  check(
    `${label}: footer accessible`,
    rect.y + rect.height <= (await page.viewportSize()).height + 1,
  )
}
try {
  await go()
  check('one initial user list request', listCalls().length === 1)
  check('default server pagination is 10', listCalls().at(-1).params.pageSize === '10')
  await geometry('desktop 1440')
  check('desktop pagination fits screen', measurements.at(-1).footerBottom <= 900)
  const initial = listCalls().length
  await page.locator('#user-keyword').fill('draft')
  await page.waitForTimeout(400)
  check('typing does not request data', listCalls().length === initial)
  await page.locator('.user-list .products-toolbar button').click()
  await ready()
  check('reload uses applied filters rather than draft', !listCalls().at(-1).params.keyword)
  await page.locator('#user-keyword').press('Enter')
  await ready()
  check(
    'Enter submits exactly once at page one',
    listCalls().length === initial + 2 &&
      listCalls().at(-1).params.keyword === 'draft' &&
      listCalls().at(-1).params.page === '1',
  )
  await page
    .locator('.user-page__filters')
    .getByRole('button', { name: 'Đặt lại', exact: true })
    .click()
  await ready()
  check(
    'reset requests exactly once and clears keyword',
    listCalls().length === initial + 3 && !listCalls().at(-1).params.keyword,
  )
  for (const size of [20, 50, 100, 10]) {
    const before = listCalls().length
    await page.locator('.list-page-size').click()
    await page
      .locator('.ant-select-dropdown:visible')
      .getByText(`${size} / trang`, { exact: true })
      .click()
    await ready()
    check(
      `server page size ${size} requests once`,
      listCalls().at(-1).params.pageSize === String(size) && listCalls().length === before + 1,
    )
  }
  await page.locator('.ant-pagination-item-2').click()
  await ready()
  await page.locator('#user-keyword').fill('unapplied')
  await page.getByRole('button', { name: 'Thêm người dùng', exact: true }).click()
  await modal().waitFor()
  await modal().getByRole('button', { name: 'Lưu', exact: true }).click()
  await page.waitForTimeout(100)
  check(
    'required fields validated before write',
    writes().length === 0 && (await modal().locator('.ant-form-item-explain-error').count()) === 3,
  )
  await modal().getByLabel('Tên đăng nhập', { exact: true }).fill('new_user')
  await modal().getByLabel('Họ và tên', { exact: true }).fill('Người dùng mới')
  await modal().getByLabel('Email', { exact: true }).fill('invalid')
  await modal().getByRole('button', { name: 'Lưu', exact: true }).click()
  await page.waitForTimeout(100)
  check('existing email validation retained', writes().length === 0)
  await modal().getByLabel('Email', { exact: true }).fill('new@example.com')
  scenario = 'form-error'
  await modal().getByRole('button', { name: 'Lưu', exact: true }).click()
  await page.waitForTimeout(450)
  check(
    'form API error preserves entered data',
    (await modal().getByText('Email đã tồn tại', { exact: true }).count()) === 1 &&
      (await modal().getByLabel('Tên đăng nhập', { exact: true }).inputValue()) === 'new_user',
  )
  scenario = ''
  await modal().getByRole('button', { name: 'Lưu', exact: true }).dblclick()
  await ready()
  await page.waitForTimeout(350)
  check(
    'form duplicate submit blocked and original payload retained',
    writes().filter((c) => c.path === '/users').length === 2 &&
      Object.keys(
        writes()
          .filter((c) => c.path === '/users')
          .at(-1).body,
      )
        .sort()
        .join(',') === 'email,fullName,status,username',
  )
  check(
    'modal success retains page and applied filters',
    listCalls().at(-1).params.page === '2' && !listCalls().at(-1).params.keyword,
  )
  await page.locator('.ant-pagination-item-1').click()
  await ready()
  await firstAction('Chỉnh sửa').click()
  await modal().waitFor()
  check(
    'edit loads selected user fields',
    (await modal().getByLabel('Tên đăng nhập', { exact: true }).inputValue()) === 'user_0',
  )
  await modal().getByRole('button', { name: 'Hủy', exact: true }).click()
  await page.waitForTimeout(400)
  await firstAction('Gán vai trò').click()
  await drawer().waitFor()
  await page.waitForTimeout(350)
  check(
    'assigned roles outside option list preserved',
    (await drawer().locator('.assignment-card').count()) === 3,
  )
  const adminCheckbox = drawer()
    .locator('.role-choice')
    .filter({ hasText: 'Administrator' })
    .getByRole('checkbox')
  check(
    'ADMIN checked and protected according to existing rule',
    (await adminCheckbox.isChecked()) && (await adminCheckbox.isDisabled()),
  )
  await drawer()
    .locator('.role-choice')
    .filter({ hasText: 'Nhân viên kho' })
    .getByRole('checkbox')
    .check()
  check(
    'draft checkbox does not change saved assignments',
    (await drawer().locator('.assignment-card').count()) === 3 &&
      writes().filter((c) => c.path.endsWith('/roles')).length === 0,
  )
  await drawer()
    .locator('.assignment-card')
    .filter({ hasText: 'Nhân viên bán hàng' })
    .getByRole('button', { name: 'Gỡ vai trò', exact: true })
    .click()
  check(
    'role save blocked while DELETE is pending',
    await drawer().getByRole('button', { name: 'Lưu', exact: true }).isDisabled(),
  )
  await page.waitForTimeout(500)
  check(
    'direct removal updates saved assignments and draft',
    (await drawer().locator('.assignment-card').count()) === 2 &&
      !(await drawer()
        .locator('.role-choice')
        .filter({ hasText: 'Nhân viên bán hàng' })
        .getByRole('checkbox')
        .isChecked()),
  )
  check(
    'other draft selection survives direct removal',
    await drawer()
      .locator('.role-choice')
      .filter({ hasText: 'Nhân viên kho' })
      .getByRole('checkbox')
      .isChecked(),
  )
  await drawer().getByRole('button', { name: 'Lưu', exact: true }).click()
  await page.waitForTimeout(500)
  await ready()
  const rolePut = writes()
    .filter((c) => c.path.endsWith('/roles'))
    .at(-1)
  check(
    'role PUT uses UUIDs, preserves ADMIN and outside role, excludes removed role',
    JSON.stringify(rolePut.body.roleIds.sort()) ===
      JSON.stringify([roles[0].id, roles[2].id, outsideRole.id].sort()),
  )
  await firstAction('Gán vai trò').click()
  await page.waitForTimeout(300)
  await drawer()
    .locator('.role-choice')
    .filter({ hasText: 'Nhân viên bán hàng' })
    .getByRole('checkbox')
    .check()
  await closeDrawer('Hủy')
  await firstAction('Gán vai trò').click()
  await page.waitForTimeout(300)
  check(
    'cancel discards unsaved selection',
    !(await drawer()
      .locator('.role-choice')
      .filter({ hasText: 'Nhân viên bán hàng' })
      .getByRole('checkbox')
      .isChecked()),
  )
  await closeDrawer('Hủy')
  await firstAction('Kho được giao').click()
  await page.waitForTimeout(350)
  check(
    'inactive warehouse cannot be newly assigned',
    await drawer()
      .locator('.assignment-card')
      .filter({ hasText: 'KHO_1' })
      .getByRole('button', { name: 'Gán kho', exact: true })
      .isDisabled(),
  )
  await drawer()
    .locator('.assignment-card')
    .filter({ hasText: 'KHO_2' })
    .getByRole('button', { name: 'Gán kho', exact: true })
    .click()
  await page.waitForTimeout(500)
  const warehousePut = writes()
    .filter((c) => c.path.includes('/warehouses/'))
    .at(-1)
  check(
    'warehouse PUT changes one link without body',
    warehousePut.method === 'PUT' &&
      warehousePut.path.endsWith('/warehouse-2') &&
      warehousePut.body === null &&
      assignedWarehouses.length === 2,
  )
  await drawer()
    .locator('.assignment-card')
    .filter({ hasText: 'KHO_0' })
    .getByRole('button', { name: 'Gỡ kho', exact: true })
    .click()
  await page
    .locator('.ant-modal-confirm')
    .getByRole('button', { name: /OK|Xác nhận/ })
    .click()
  await page.waitForTimeout(500)
  check(
    'warehouse removal preserves other assignment',
    assignedWarehouses.length === 1 && assignedWarehouses[0].id === 'warehouse-2',
  )
  scenario = 'warehouse-write-error'
  await drawer()
    .locator('.assignment-card')
    .filter({ hasText: 'KHO_0' })
    .getByRole('button', { name: 'Gán kho', exact: true })
    .click()
  await page.waitForTimeout(500)
  check(
    'warehouse error keeps both lists visible',
    (await drawer().getByText('Không thay đổi được kho', { exact: true }).count()) === 1 &&
      (await drawer().locator('.assignment-card').count()) === 3,
  )
  scenario = ''
  await closeDrawer('Đóng')
  check(
    'drawer close returns focus to trigger',
    await firstAction('Kho được giao').evaluate((el) => el === document.activeElement),
  )
  for (const width of [320, 375, 390, 414, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.waitForTimeout(300)
    await geometry(`width ${width}`)
    if (width < 768) {
      check(
        `${width}: mobile fields initially hidden`,
        !(await page.locator('#user-keyword').isVisible()),
      )
      const before = listCalls().length
      await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click()
      check(
        `${width}: expanded filter retains draft`,
        (await page.locator('#user-keyword').inputValue()) === 'unapplied',
      )
      await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click()
      check(
        `${width}: toggle does not fetch and has aria attributes`,
        listCalls().length === before &&
          (await page
            .getByRole('button', { name: 'Bộ lọc', exact: true })
            .getAttribute('aria-expanded')) === 'false',
      )
    }
    await page.getByRole('button', { name: 'Thêm người dùng', exact: true }).click()
    await page.waitForTimeout(400)
    await overlayGeometry(`form ${width}`, modal())
    for (const status of ['Hoạt động', 'Ngừng hoạt động']) {
      if (status === 'Ngừng hoạt động') {
        await modal().locator('.ant-select').click()
        await page
          .locator('.ant-select-dropdown:visible')
          .getByText(status, { exact: true })
          .click()
      }
      const alignment = await modal().evaluate((el) => {
        const phone = el.querySelector('input[placeholder="+84901234567"]').getBoundingClientRect()
        const select = el.querySelector('.ant-select-selector').getBoundingClientRect()
        const label = el
          .querySelector('.ant-select-selection-item .status-label')
          .getBoundingClientRect()
        const dot = el
          .querySelector('.ant-select-selection-item .status-label i')
          .getBoundingClientRect()
        return {
          phone: phone.toJSON(),
          select: select.toJSON(),
          label: label.toJSON(),
          dot: dot.toJSON(),
        }
      })
      measurements.push({ label: `status ${status} ${width}`, alignment })
      check(
        `${width}: ${status} select matches input height and centers text/dot`,
        Math.abs(alignment.phone.height - alignment.select.height) < 1 &&
          Math.abs(
            alignment.label.y +
              alignment.label.height / 2 -
              alignment.select.y -
              alignment.select.height / 2,
          ) < 2 &&
          Math.abs(
            alignment.dot.y +
              alignment.dot.height / 2 -
              alignment.label.y -
              alignment.label.height / 2,
          ) < 1 &&
          (width < 600 || Math.abs(alignment.phone.y - alignment.select.y) < 1),
      )
    }
    const buttonHeights = await modal()
      .locator('.form-footer button')
      .evaluateAll((elements) => elements.map((el) => el.getBoundingClientRect().height))
    check(
      `${width}: form buttons compact on desktop and touchable on mobile`,
      buttonHeights.every((height) => height === (width < 600 ? 44 : 32)),
    )
    if ([390, 1440].includes(width))
      await page.screenshot({ path: `${artifacts}/form-${width}.png`, fullPage: true })
    await modal().getByRole('button', { name: 'Hủy', exact: true }).click()
    await page.waitForTimeout(400)
    await firstAction('Kho được giao').click()
    await page.waitForTimeout(400)
    await overlayGeometry(`warehouse ${width}`, drawer())
    await closeDrawer('Đóng')
    await firstAction('Gán vai trò').click()
    await page.waitForTimeout(400)
    await overlayGeometry(`role ${width}`, drawer())
    if ([390, 1440].includes(width))
      await page.screenshot({ path: `${artifacts}/roles-${width}.png`, fullPage: true })
    await closeDrawer('Hủy')
  }
  await page.setViewportSize({ width: 390, height: 580 })
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'Thêm người dùng', exact: true }).click()
  await page.waitForTimeout(400)
  await overlayGeometry('short mobile form', modal())
  await modal().getByRole('button', { name: 'Hủy', exact: true }).click()
  await page.waitForTimeout(400)
  await page.setViewportSize({ width: 1440, height: 900 })
  scenario = 'slow-roles'
  await firstAction('Gán vai trò').click()
  await page.waitForTimeout(100)
  await closeDrawer('Hủy')
  await page
    .locator('.user-page__actions')
    .nth(1)
    .getByRole('button', { name: 'Gán vai trò', exact: true })
    .click()
  await page.waitForTimeout(1100)
  check(
    'old role response cannot overwrite newly opened user',
    (await drawer().locator('.assignment-card').count()) === 1 &&
      (await drawer()
        .locator('.assignment-user')
        .textContent()
        .then((s) => s.includes('user_1'))),
  )
  await closeDrawer('Hủy')
  scenario = 'slow-warehouses'
  await firstAction('Kho được giao').click()
  await page.waitForTimeout(100)
  await closeDrawer('Đóng')
  await page
    .locator('.user-page__actions')
    .nth(1)
    .getByRole('button', { name: 'Kho được giao', exact: true })
    .click()
  await page.waitForTimeout(1100)
  check(
    'old warehouse response cannot overwrite newly opened user',
    (await drawer().locator('.assignment-card').filter({ hasText: 'KHO_2' }).count()) === 1 &&
      (await drawer()
        .locator('.assignment-user')
        .textContent()
        .then((s) => s.includes('user_1'))),
  )
  await closeDrawer('Đóng')
  scenario = 'role-load-error'
  await firstAction('Gán vai trò').click()
  await page.waitForTimeout(400)
  check(
    'role load failure has retry and blocks empty save',
    (await drawer().getByText('Không tải được vai trò', { exact: true }).count()) === 1 &&
      (await drawer().getByRole('button', { name: 'Lưu', exact: true }).isDisabled()),
  )
  scenario = ''
  await drawer().getByRole('button', { name: 'Tải lại', exact: true }).click()
  await page.waitForTimeout(400)
  await drawer()
    .locator('.role-choice')
    .filter({ hasText: 'Nhân viên bán hàng' })
    .getByRole('checkbox')
    .check()
  scenario = 'role-save-error'
  await drawer().getByRole('button', { name: 'Lưu', exact: true }).click()
  await page.waitForTimeout(450)
  check(
    'role PUT failure preserves draft and saved assignments',
    (await drawer().getByText('Không lưu được vai trò', { exact: true }).count()) === 1 &&
      (await drawer()
        .locator('.role-choice')
        .filter({ hasText: 'Nhân viên bán hàng' })
        .getByRole('checkbox')
        .isChecked()) &&
      (await drawer().locator('.assignment-card').count()) === 3,
  )
  scenario = 'role-delete-error'
  await drawer()
    .locator('.assignment-card')
    .filter({ hasText: 'Vai trò ngoài danh sách' })
    .getByRole('button', { name: 'Gỡ vai trò', exact: true })
    .click()
  await page.waitForTimeout(500)
  check(
    'role DELETE failure retains assignment',
    (await drawer().getByText('Không gỡ được vai trò', { exact: true }).count()) === 1 &&
      (await drawer().locator('.assignment-card').count()) === 3,
  )
  await closeDrawer('Hủy')
  scenario = ''
  const beforeStatus = listCalls().length
  await page.locator('#user-status').click()
  await page
    .locator('.ant-select-dropdown:visible')
    .getByText('Ngừng hoạt động', { exact: true })
    .click()
  check('changing status alone does not fetch', listCalls().length === beforeStatus)
  await page
    .locator('.user-page__filters')
    .getByRole('button', { name: 'Tìm kiếm', exact: true })
    .click()
  await ready()
  check(
    'status zero is sent with applied keyword',
    listCalls().at(-1).params.status === '0' && listCalls().at(-1).params.keyword === 'unapplied',
  )
  await page.locator('#user-keyword').fill('empty')
  await page.locator('#user-keyword').press('Enter')
  await ready()
  check(
    'empty list renders no data and zero server total',
    (await page.locator('.ant-table-placeholder').count()) === 1 &&
      (await page.getByText('Hiển thị 0–0 / 0 người dùng', { exact: true }).count()) === 1,
  )
  await page
    .locator('.user-page__filters')
    .getByRole('button', { name: 'Đặt lại', exact: true })
    .click()
  await ready()
  scenario = 'list-error'
  await page.locator('.user-list .products-toolbar button').click()
  await ready()
  check(
    'list error displays backend message with retry',
    (await page
      .locator('.user-page > .ant-alert')
      .getByText('Không tải được người dùng', { exact: true })
      .count()) === 1,
  )
  scenario = ''
  await page
    .locator('.user-page > .ant-alert')
    .getByRole('button', { name: 'Tải lại', exact: true })
    .click()
  await ready()
  await page.getByRole('button', { name: 'Thu gọn thanh bên', exact: true }).first().click()
  await page.waitForTimeout(400)
  await geometry('collapsed sidebar 1440')
  await page.locator('.ant-message-notice').last().waitFor({ state: 'hidden' })
  await page.locator('.ant-table-body').evaluate((el) => {
    el.scrollLeft = 0
    el.scrollTop = 0
  })
  await page.screenshot({ path: `${artifacts}/list-1440.png`, fullPage: true })
  const scrollResult = await page.locator('.ant-table-body').evaluate((el) => {
    const header = document.querySelector('.ant-table-header').getBoundingClientRect().top
    el.scrollLeft = el.scrollWidth
    el.scrollTop = el.scrollHeight
    const action = el.querySelector('.ant-table-cell-fix-right').getBoundingClientRect(),
      body = el.getBoundingClientRect()
    return {
      header,
      after: document.querySelector('.ant-table-header').getBoundingClientRect().top,
      inside: action.right <= body.right + 1 && action.left >= body.left,
      color: getComputedStyle(el.querySelector('.ant-table-cell-fix-right')).backgroundColor,
      vertical: el.scrollHeight > el.clientHeight,
    }
  })
  check(
    'table body scrolls with stationary header and opaque fixed actions',
    scrollResult.header === scrollResult.after &&
      scrollResult.inside &&
      scrollResult.color !== 'rgba(0, 0, 0, 0)' &&
      scrollResult.vertical,
  )
  await firstAction('Chi tiết').click()
  await page.waitForTimeout(400)
  check(
    'existing detail flow still fetches selected user',
    (await drawer().getByText('user_0', { exact: true }).count()) === 1,
  )
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  const beforeDelete = writes().length
  await firstAction('Xóa').click()
  await page.waitForTimeout(100)
  await page.locator('.ant-modal-confirm').getByRole('button', { name: 'Hủy', exact: true }).click()
  await page.waitForTimeout(300)
  check('user deletion still requires confirmation', writes().length === beforeDelete)
  await page.setViewportSize({ width: 390, height: 700 })
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click()
  await page.locator('#user-keyword').fill('mobile')
  const beforeMobile = listCalls().length
  await page.locator('#user-keyword').press('Enter')
  await ready()
  check(
    'mobile search submits once and leaves filters expanded',
    listCalls().length === beforeMobile + 1 && (await page.locator('#user-keyword').isVisible()),
  )
  await page.locator('.ant-table-body').evaluate((el) => {
    el.scrollLeft = 0
    el.scrollTop = 0
  })
  await page.screenshot({ path: `${artifacts}/list-390-expanded.png`, fullPage: true })
  await page.setViewportSize({ width: 1024, height: 700 })
  await page.waitForTimeout(400)
  check(
    'filter state survives breakpoint change',
    (await page.locator('#user-keyword').inputValue()) === 'mobile',
  )
  check(
    'warehouse drawer never reads global warehouse catalog',
    !calls.some((c) => c.path === '/warehouses'),
  )
  permissions = ['USER_VIEW', 'USER_WAREHOUSE_VIEW']
  await go()
  check(
    'view-only user keeps warehouse action and hides write actions',
    (await firstAction('Kho được giao').count()) === 1 &&
      (await firstAction('Gán vai trò').count()) === 0 &&
      (await firstAction('Chỉnh sửa').count()) === 0 &&
      (await firstAction('Xóa').count()) === 0 &&
      (await page.getByRole('button', { name: 'Thêm người dùng', exact: true }).count()) === 0,
  )
  await firstAction('Kho được giao').click()
  await page.waitForTimeout(300)
  check(
    'view-only warehouse drawer has no assignment/removal buttons',
    (await drawer()
      .getByRole('button', { name: /Gán kho|Gỡ kho/ })
      .count()) === 0,
  )
  await closeDrawer('Đóng')
  admin = true
  permissions = ['USER_VIEW']
  await go()
  await firstAction('Kho được giao').click()
  await page.waitForTimeout(400)
  check(
    'verified catalog ADMIN retains warehouse permission exception',
    (await drawer().getByRole('button', { name: 'Gán kho', exact: true }).count()) > 0 &&
      (await drawer().getByRole('button', { name: 'Gỡ kho', exact: true }).count()) > 0,
  )
  await closeDrawer('Đóng')
  check('no uncaught browser errors', errors.length === 0)
  await writeFile(
    `${artifacts}/results.json`,
    JSON.stringify({ checks, measurements, errors, calls }, null, 2),
  )
  console.log(JSON.stringify({ passed: checks.length, errors }, null, 2))
} catch (error) {
  await page.screenshot({ path: `${artifacts}/failure.png`, fullPage: true })
  await writeFile(
    `${artifacts}/results.json`,
    JSON.stringify({ checks, measurements, errors, calls, failure: error.stack }, null, 2),
  )
  throw error
} finally {
  await browser.close()
}
