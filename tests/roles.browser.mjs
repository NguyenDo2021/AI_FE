// Controlled API fixtures only: this suite never sends requests to the real backend.
import assert from 'node:assert/strict'
import process from 'node:process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const { chromium } = await import(
  pathToFileURL(
    process.env.PLAYWRIGHT_MODULE ||
      join(process.env.TEMP, 'codex-stocktake-browser/node_modules/playwright/index.mjs'),
  ).href
)
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  ignoreDefaultArgs: ['--hide-scrollbars'],
})
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  reducedMotion: 'reduce',
})
await context.addInitScript(() =>
  localStorage.setItem('frontend-base:access-token', 'roles-test-fixture'),
)
const directory = 'docs/roles-artifacts'
await mkdir(directory, { recursive: true })
const checks = [],
  measurements = [],
  calls = [],
  errors = []
let scenario = '',
  access = ['ROLE_VIEW', 'ROLE_CREATE', 'ROLE_UPDATE', 'ROLE_DELETE']
const longText = 'Chuỗi_dài_không_có_khoảng_trắng_'.repeat(30)
const role = (i) => ({
  id: `role-${i}`,
  name: i === 0 ? 'Administrator' : i === 2 ? longText : `Vai trò ${i}`,
  code: i === 0 ? 'ADMIN' : `ROLE_${i}`,
  description: i === 2 ? longText : i === 3 ? null : 'Mô tả vai trò',
  status: i === 3 ? 0 : 1,
  createdAt: '2026-10-01T01:02:03Z',
  updatedAt: i === 3 ? null : '2026-10-02T01:02:03Z',
})
const permissions = Array.from({ length: 103 }, (_, i) => ({
  id: `p-${i}`,
  name: i === 2 ? longText : i === 1 ? 'PRODUCT_VIEW' : `Quyền ${i}`,
  code: i === 2 ? longText : i === 1 ? 'PRODUCT_VIEW' : `PERMISSION_${i}`,
  status: 1,
}))
const outside = { id: 'outside', name: 'Quyền đã gán ngoài danh mục', code: 'OUTSIDE', status: 1 }
let assigned = [permissions[0], outside]
const reply = (route, data, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
await context.route('**/*', async (route) => {
  const request = route.request()
  if (!['fetch', 'xhr'].includes(request.resourceType())) return route.continue()
  const url = new URL(request.url()),
    path = url.pathname.replace(/^\/api(?:\/v1)?/, ''),
    method = request.method(),
    params = Object.fromEntries(url.searchParams)
  const body = request.postDataJSON()
  calls.push({ path, method, params, body })
  if (path === '/auth/me')
    return reply(route, {
      id: 'operator',
      username: 'operator',
      fullName: 'Kiểm tra vai trò',
      permissions: access,
    })
  if (path === '/users/operator') return reply(route, { id: 'operator', status: 1 })
  if (path === '/users/operator/roles' || path === '/users/me/warehouses') return reply(route, [])
  if (path === '/roles' && method === 'GET') {
    const size = Number(params.pageSize),
      page = Number(params.page)
    const items = Array.from({ length: size }, (_, i) => role((page - 1) * size + i))
    if (params.keyword === 'slow') {
      items[0].name = 'STALE'
      await new Promise((resolve) => setTimeout(resolve, 800))
    }
    return reply(route, { items, total: 237, page, pageSize: size })
  }
  if (/^\/roles\/role-\d+\/permissions$/.test(path)) {
    if (method === 'GET') {
      if (scenario === 'load-error')
        return reply(route, { message: 'Không tải được phân quyền' }, 500)
      const data = path.includes('role-3/') ? [permissions[3]] : [...assigned]
      if (scenario === 'slow-assignment' && path.includes('role-1/'))
        await new Promise((resolve) => setTimeout(resolve, 1000))
      return reply(route, data)
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
    if (scenario === 'save-error')
      return reply(route, { message: 'Không lưu được phân quyền' }, 409)
    assigned = body.permissionIds.map((id) =>
      [...permissions, outside].find((item) => item.id === id),
    )
    return reply(route, assigned)
  }
  if (path === '/permissions') {
    if (scenario === 'catalogue-error')
      return reply(route, { message: 'Không tải được danh mục quyền' }, 500)
    const page = Number(params.page),
      size = Number(params.pageSize)
    return reply(route, {
      items: permissions.slice((page - 1) * size, page * size),
      total: permissions.length,
      page,
      pageSize: size,
    })
  }
  if (
    (path === '/roles' && method === 'POST') ||
    (/^\/roles\/role-\d+$/.test(path) && method === 'PUT')
  ) {
    await new Promise((resolve) => setTimeout(resolve, 250))
    if (scenario === 'form-error') return reply(route, { message: 'Mã vai trò đã tồn tại.' }, 409)
    return reply(route, { ...role(1), ...body })
  }
  if (/^\/roles\/role-\d+$/.test(path)) {
    if (method === 'DELETE') return route.fulfill({ status: 204 })
    return reply(route, role(Number(path.split('-').at(-1))))
  }
  return reply(route, [])
})
const page = await context.newPage()
page.setDefaultTimeout(10000)
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (/Unhandled|Failed to resolve component|Not found.*locale/.test(message.text()))
    errors.push(message.text())
})
const settle = () => page.waitForTimeout(160)
const check = (label, fn) =>
  Promise.resolve()
    .then(fn)
    .then(() => {
      checks.push(label)
      console.log(`PASS ${label}`)
    })
const listCalls = () => calls.filter((call) => call.path === '/roles' && call.method === 'GET')
const writes = () =>
  calls.filter((call) => call.method === 'PUT' && call.path.endsWith('/permissions'))
const dialog = () => page.locator('.role-dialog:visible')
const row = (i) => page.locator(`.ant-table-body tr[data-row-key="role-${i}"]`)
const openPermissions = async (i) => {
  await row(i).getByRole('button', { name: 'Phân quyền', exact: true }).click()
  await dialog().waitFor()
  await page.locator('.role-permissions-grid').waitFor()
}
const cancel = async () => {
  await dialog().getByRole('button', { name: 'Hủy', exact: true }).click()
  await dialog().waitFor({ state: 'hidden' })
}
const box = (id) =>
  page
    .locator('.role-permission-option')
    .filter({ has: page.getByText(id, { exact: true }) })
    .getByRole('checkbox')
const geometry = async (label) => {
  // Measure settled drawer/tooltip transforms, not intermediate animation frames.
  await page.waitForTimeout(400)
  const value = await page.evaluate(() => {
    const visible = (selector) =>
      [...document.querySelectorAll(selector)].filter(
        (el) => el.getBoundingClientRect().width && el.getBoundingClientRect().height,
      )
    const bounds = (el) => {
      const rect = el.getBoundingClientRect()
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
      }
    }
    return {
      viewport: innerWidth,
      height: innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      panels: visible(
        '.role-dialog, .role-dialog .ant-modal-content, .ant-drawer-content-wrapper, .ant-modal-close, .role-dialog .ant-modal-footer, .ant-drawer-footer',
      ).map(bounds),
      overflowing: visible('.role-dialog .ant-modal-body, .ant-drawer-body').map((el) => ({
        client: el.clientWidth,
        scroll: el.scrollWidth,
      })),
    }
  })
  measurements.push({ label, ...value })
  assert.ok(
    value.documentWidth <= value.viewport + 1 && value.bodyWidth <= value.viewport + 1,
    `${label}: page overflow ${JSON.stringify(value)}`,
  )
  for (const panel of value.panels) {
    assert.ok(
      panel.left >= -1 && panel.right <= value.viewport + 1,
      `${label}: horizontal portal overflow`,
    )
    assert.ok(
      panel.top >= -1 && panel.bottom <= value.height + 1,
      `${label}: vertical portal overflow ${JSON.stringify(panel)}`,
    )
  }
  for (const panel of value.overflowing)
    assert.ok(panel.scroll <= panel.client + 1, `${label}: portal body overflow`)
}
try {
  await page.goto(process.env.ROLES_TEST_URL || 'http://127.0.0.1:5173/system/role')
  await row(1).waitFor()
  await check('Initial list uses page 1 / 10 and eight independent columns', async () => {
    assert.equal(listCalls().length, 1)
    assert.equal(listCalls()[0].params.pageSize, '10')
    assert.equal(
      await page.locator('.ant-table-header th:not(.ant-table-cell-scrollbar)').count(),
      8,
    )
  })
  await check(
    'Draft filters do not affect reload or paging; Enter applies exactly once',
    async () => {
      await page.locator('#role-keyword').fill('draft')
      let count = listCalls().length
      await page.getByRole('button', { name: 'Tải lại', exact: true }).click()
      await settle()
      assert.equal(listCalls().length, count + 1)
      assert.equal(listCalls().at(-1).params.keyword, undefined)
      await page.locator('.ant-pagination-next').click()
      await row(10).waitFor()
      assert.equal(listCalls().at(-1).params.keyword, undefined)
      count = listCalls().length
      await page.locator('#role-keyword').press('Enter')
      await row(1).waitFor()
      assert.equal(listCalls().length, count + 1)
      assert.equal(listCalls().at(-1).params.keyword, 'draft')
      assert.equal(listCalls().at(-1).params.page, '1')
      await page.locator('#role-keyword').fill('unsent')
      await page.getByRole('button', { name: 'Tải lại', exact: true }).click()
      await settle()
      assert.equal(listCalls().at(-1).params.keyword, 'draft')
      await page.getByRole('button', { name: 'Đặt lại', exact: true }).click()
      await settle()
      assert.equal(listCalls().at(-1).params.keyword, undefined)
      await page.locator('.list-page-size').click()
      await page.locator('.ant-select-item-option').filter({ hasText: '20 / trang' }).click()
      await settle()
      assert.equal(listCalls().at(-1).params.pageSize, '20')
      assert.equal(listCalls().at(-1).params.page, '1')
      await page.locator('.list-page-size').click()
      await page.locator('.ant-select-item-option').filter({ hasText: '10 / trang' }).click()
      await settle()
    },
  )
  await check(
    'Status and all page sizes use applied filters; stale list responses are ignored',
    async () => {
      await page.locator('.role-filter .ant-select').click()
      await page.getByTitle('Ngừng hoạt động', { exact: true }).click()
      await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click()
      await settle()
      assert.equal(listCalls().at(-1).params.status, '0')
      for (const size of [50, 100, 10]) {
        const count = listCalls().length
        await page.locator('.list-page-size').click()
        await page
          .locator('.ant-select-item-option')
          .filter({ hasText: `${size} / trang` })
          .click()
        await settle()
        assert.equal(listCalls().length, count + 1)
        assert.equal(listCalls().at(-1).params.pageSize, String(size))
        assert.equal(listCalls().at(-1).params.status, '0')
      }
      await page.locator('#role-keyword').fill('slow')
      await page.locator('#role-keyword').press('Enter')
      await page.locator('#role-keyword').fill('fast')
      await page.locator('#role-keyword').press('Enter')
      await page.waitForTimeout(1000)
      assert.equal(await page.getByText('STALE', { exact: true }).count(), 0)
      await page.getByRole('button', { name: 'Đặt lại', exact: true }).click()
      await settle()
    },
  )
  await check(
    'Permission pagination, filtering and hidden assignments survive toggles and payload',
    async () => {
      await openPermissions(1)
      assert.equal(await page.locator('.role-permission-option').count(), 104)
      assert.equal(writes().length, 0)
      const search = page.getByPlaceholder('Tìm theo tên hoặc mã quyền')
      await search.fill('PRODUCT_VIEW')
      await box('PRODUCT_VIEW').check()
      assert.match(await page.locator('.role-permissions-toolbar').innerText(), /3/)
      await search.fill('PERMISSION_102')
      await box('PERMISSION_102').check()
      assert.match(await page.locator('.role-permissions-toolbar').innerText(), /4/)
      await search.fill('')
      assert.ok(await box('PERMISSION_0').isChecked())
      assert.ok(await box('OUTSIDE').isChecked())
      assert.ok(await box('PRODUCT_VIEW').isChecked())
      await box('PRODUCT_VIEW').uncheck()
      await box('PRODUCT_VIEW').check()
      await dialog().getByRole('button', { name: 'Lưu', exact: true }).dblclick()
      await dialog().waitFor({ state: 'hidden' })
      assert.equal(writes().length, 1)
      assert.deepEqual(
        new Set(writes()[0].body.permissionIds),
        new Set(['p-0', 'outside', 'p-1', 'p-102']),
      )
    },
  )
  await check(
    'Cancel drops drafts; save errors preserve drafts; ADMIN selection stays disabled',
    async () => {
      await openPermissions(1)
      await box('PRODUCT_VIEW').uncheck()
      await cancel()
      await openPermissions(1)
      assert.ok(await box('PRODUCT_VIEW').isChecked())
      await box('PRODUCT_VIEW').uncheck()
      scenario = 'save-error'
      await dialog().getByRole('button', { name: 'Lưu', exact: true }).click()
      await dialog().getByText('Không lưu được phân quyền').waitFor()
      assert.equal(await box('PRODUCT_VIEW').isChecked(), false)
      await cancel()
      scenario = ''
      await openPermissions(0)
      assert.ok(await box('PERMISSION_0').isDisabled())
      await cancel()
    },
  )
  await check('Both load failures block saving; retry restores editing', async () => {
    for (const failure of ['load-error', 'catalogue-error']) {
      scenario = failure
      await row(1).getByRole('button', { name: 'Phân quyền', exact: true }).click()
      await dialog().getByRole('alert').waitFor()
      assert.ok(await dialog().getByRole('button', { name: 'Lưu', exact: true }).isDisabled())
      assert.equal(await page.locator('.role-permission-option').count(), 0)
      scenario = ''
      await dialog().getByRole('button', { name: 'Tải lại', exact: true }).click()
      await page.locator('.role-permissions-grid').waitFor()
      await cancel()
    }
  })
  await check('Late responses from a cancelled role cannot overwrite another role', async () => {
    scenario = 'slow-assignment'
    await row(1).getByRole('button', { name: 'Phân quyền', exact: true }).click()
    await dialog().waitFor()
    await cancel()
    await openPermissions(3)
    await page.waitForTimeout(1200)
    assert.match(await page.locator('.role-identity').innerText(), /ROLE_3/)
    assert.ok(await box('PERMISSION_3').isChecked())
    assert.equal(await box('PRODUCT_VIEW').isChecked(), false)
    await cancel()
    scenario = ''
  })
  await check('Create/edit retain validation, payload conversion and API errors', async () => {
    await page.getByRole('button', { name: 'Thêm vai trò', exact: true }).click()
    await dialog().getByRole('button', { name: 'Lưu', exact: true }).click()
    await page.locator('.ant-form-item-explain-error').first().waitFor()
    await page.getByPlaceholder('Nhập tên vai trò', { exact: true }).fill('  Vai trò mới  ')
    await page.getByPlaceholder('Nhập mã vai trò', { exact: true }).fill('bad-code')
    await dialog().getByRole('button', { name: 'Lưu', exact: true }).click()
    await settle()
    assert.equal(calls.filter((call) => call.method === 'POST').length, 0)
    await page.getByPlaceholder('Nhập mã vai trò', { exact: true }).fill('  Mixed_case1  ')
    await page.getByPlaceholder('Nhập mô tả vai trò', { exact: true }).fill('  Mô tả  ')
    scenario = 'form-error'
    await dialog().getByRole('button', { name: 'Lưu', exact: true }).click()
    await dialog().getByText('Mã vai trò đã tồn tại.', { exact: true }).waitFor()
    assert.equal(
      await page.getByPlaceholder('Nhập tên vai trò', { exact: true }).inputValue(),
      '  Vai trò mới  ',
    )
    scenario = ''
    await dialog().getByRole('button', { name: 'Lưu', exact: true }).dblclick()
    await dialog().waitFor({ state: 'hidden' })
    const post = calls.filter((call) => call.method === 'POST')
    assert.equal(post.length, 2)
    assert.deepEqual(post.at(-1).body, {
      name: 'Vai trò mới',
      code: 'Mixed_case1',
      description: 'Mô tả',
      status: 1,
    })
    await row(1).getByRole('button', { name: 'Chỉnh sửa', exact: true }).click()
    await dialog().waitFor()
    assert.equal(await page.getByPlaceholder('Nhập mã vai trò', { exact: true }).isEditable(), true)
    await page.getByPlaceholder('Nhập tên vai trò', { exact: true }).fill('  Đã sửa  ')
    await dialog().getByRole('button', { name: 'Lưu', exact: true }).click()
    await dialog().waitFor({ state: 'hidden' })
    assert.deepEqual(
      calls.find((call) => call.path === '/roles/role-1' && call.method === 'PUT').body,
      { name: 'Đã sửa', code: 'ROLE_1', description: 'Mô tả vai trò', status: 1 },
    )
  })
  await check(
    'Responsive list, form, permissions, detail and tooltips at all requested widths',
    async () => {
      for (const width of [320, 375, 390, 414, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 })
        await settle()
        if (width < 768) {
          const toggle = page.getByRole('button', { name: 'Bộ lọc', exact: true })
          if ((await toggle.getAttribute('aria-expanded')) === 'true') await toggle.click()
          assert.equal(await page.locator('#role-keyword').isVisible(), false)
          await toggle.click()
          await page.locator('#role-keyword').fill('keep-draft')
          await toggle.click()
          await toggle.click()
          assert.equal(await page.locator('#role-keyword').inputValue(), 'keep-draft')
          await toggle.click()
        }
        await geometry(`list-${width}`)
        await page.getByRole('button', { name: 'Thêm vai trò', exact: true }).click()
        await dialog().waitFor()
        await geometry(`form-${width}`)
        if (width === 390)
          await page.screenshot({ path: `${directory}/mobile-form.png`, fullPage: true })
        await cancel()
        const body = page.locator('.ant-table-body')
        await body.evaluate((el) => {
          el.scrollLeft = el.scrollWidth
        })
        await openPermissions(1)
        await geometry(`permissions-${width}`)
        if (width === 1440)
          await page.screenshot({ path: `${directory}/desktop-permissions.png`, fullPage: true })
        await page.getByPlaceholder('Tìm theo tên hoặc mã quyền').fill('PRODUCT_VIEW')
        await box('PRODUCT_VIEW').hover()
        await geometry(`permissions-filtered-${width}`)
        await cancel()
        await row(2).getByRole('button', { name: 'Chi tiết', exact: true }).click()
        await page.locator('.role-detail').waitFor()
        await geometry(`detail-${width}`)
        assert.ok((await page.locator('.role-detail-fields').innerText()).includes(longText))
        if (width < 768) {
          const stacked = await page
            .locator('.role-detail-field')
            .evaluateAll((fields) =>
              fields.every(
                (field) =>
                  field.querySelector('dd').getBoundingClientRect().top >=
                  field.querySelector('dt').getBoundingClientRect().bottom,
              ),
            )
          assert.ok(stacked)
        }
        if (width === 390)
          await page.screenshot({ path: `${directory}/mobile-detail.png`, fullPage: true })
        await page
          .locator('.role-detail-footer')
          .getByRole('button', { name: 'Đóng', exact: true })
          .click()
        await page.locator('.role-detail').waitFor({ state: 'hidden' })
        await row(1).getByRole('button', { name: 'Phân quyền', exact: true }).hover()
        await settle()
        await geometry(`tooltip-${width}`)
        await body.evaluate((el) => {
          el.scrollLeft = 0
        })
        if (width === 390 || width === 1440)
          await page.screenshot({ path: `${directory}/list-${width}.png`, fullPage: true })
      }
    },
  )
  await check('Short screens and sidebar states keep controls reachable', async () => {
    for (const width of [390, 1024]) {
      await page.setViewportSize({ width, height: 360 })
      await settle()
      await page.getByRole('button', { name: 'Thêm vai trò', exact: true }).click()
      await dialog().waitFor()
      await geometry(`short-form-${width}`)
      await cancel()
      await page.locator('.ant-table-body').evaluate((el) => {
        el.scrollLeft = el.scrollWidth
      })
      await openPermissions(1)
      await geometry(`short-permissions-${width}`)
      await cancel()
      await page.locator('.app-header__icon-button').click()
      await page.waitForTimeout(350)
      await geometry(`sidebar-toggled-${width}`)
      if (width < 768) await page.locator('.sidebar-close').click()
      else await page.locator('.app-header__icon-button').click()
      await page.waitForTimeout(350)
      await geometry(`sidebar-restored-${width}`)
    }
  })
  await check('Delete confirmation and view-only permissions retain access behavior', async () => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await settle()
    await row(1).getByRole('button', { name: 'Xóa', exact: true }).click()
    await page
      .locator('.ant-modal-confirm')
      .getByRole('button', { name: 'Hủy', exact: true })
      .click()
    assert.equal(calls.filter((call) => call.method === 'DELETE').length, 0)
    await row(1).getByRole('button', { name: 'Xóa', exact: true }).click()
    await page
      .locator('.ant-modal-confirm')
      .getByRole('button', { name: 'Xóa', exact: true })
      .click()
    await page.locator('.ant-modal-confirm').waitFor({ state: 'hidden' })
    assert.equal(calls.filter((call) => call.method === 'DELETE').length, 1)
    access = ['ROLE_VIEW']
    await page.reload()
    await row(1).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Thêm vai trò', exact: true }).count(), 0)
    assert.equal(await row(1).getByRole('button').count(), 1)
    assert.equal(await page.evaluate(() => document.body.style.overflow), '')
  })
  assert.deepEqual(errors, [])
} catch (cause) {
  await page.screenshot({ path: `${directory}/failure.png`, fullPage: true })
  throw cause
} finally {
  await writeFile(
    `${directory}/results.json`,
    JSON.stringify({ checks, measurements, errors, calls }, null, 2),
  )
  await browser.close()
}
