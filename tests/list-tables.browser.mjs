// Controlled server fixtures; no real backend reads or mutations.
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
await context.addInitScript(() =>
  localStorage.setItem('frontend-base:access-token', 'list-tables-test'),
)
const artifacts = 'docs/list-tables-artifacts'
await mkdir(artifacts, { recursive: true })
const calls = [],
  results = [],
  errors = []
const permissions = ['PRODUCT', 'PRODUCT_GROUP', 'WAREHOUSE', 'CUSTOMER'].flatMap((prefix) =>
  ['VIEW', 'CREATE', 'UPDATE'].map((suffix) => prefix + '_' + suffix),
)
const warehouse = { id: 'w1', code: 'K1', name: 'Kho được giao', status: 1 }
let restricted = false
await context.route('**/api/**', async (route) => {
  const req = route.request(),
    url = new URL(req.url()),
    path = url.pathname.replace(/^\/api/, '')
  if (!url.pathname.startsWith('/api/')) return route.continue()
  const params = Object.fromEntries(url.searchParams)
  calls.push({ path, params, method: req.method() })
  const reply = (data, status = 200) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(data),
    })
  if (path === '/auth/me')
    return reply({
      id: 'table-user',
      username: 'table-test',
      fullName: 'Kiểm tra bảng',
      permissions: restricted ? ['CUSTOMER_VIEW'] : permissions,
    })
  if (path === '/users/table-user') return reply({ id: 'table-user', status: 1 })
  if (path === '/users/table-user/roles') return reply([])
  if (path === '/users/me/warehouses') return reply([warehouse])
  if (['/products', '/product-groups', '/warehouses', '/customers'].includes(path)) {
    const page = Number(params.page) || 1,
      pageSize = Number(params.pageSize) || 10
    const total = params.keyword === 'empty' ? 0 : params.keyword === 'few' ? 1 : 137
    const items = Array.from(
      { length: Math.max(0, Math.min(pageSize, total - (page - 1) * pageSize)) },
      (_, i) => {
        const n = (page - 1) * pageSize + i
        return {
          id: 'row' + n,
          code: 'CODE-' + n + '-'.repeat(100),
          name:
            params.keyword === 'slow'
              ? 'KẾT QUẢ CŨ'
              : params.keyword === 'fresh'
                ? 'KẾT QUẢ MỚI'
                : 'Tên dài ' + n + ' nội dung kiểm tra bảng '.repeat(16),
          groupId: 'row0',
          warehouseId: 'w1',
          status: params.status === undefined ? n % 2 : Number(params.status),
          phone: n === 1 ? null : '0900000068',
          address: n === 1 ? null : 'Địa chỉ rất dài '.repeat(40),
          description: 'Mô tả dài '.repeat(40),
          material: 'PU',
          color: 'Trắng',
          lengthMeters: 2.4,
          defaultSalePrice: 234567,
          referencePurchasePrice: 123456,
          lowStockThreshold: 9999,
          unit: 'cay',
        }
      },
    )
    if (params.keyword === 'slow') await new Promise((resolve) => setTimeout(resolve, 650))
    return reply({ page, pageSize, total, items })
  }
  return reply({})
})
const page = await context.newPage()
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (/ResizeObserver loop|Unhandled|Failed to resolve component/.test(message.text()))
    errors.push(message.text())
})
const cdp = await context.newCDPSession(page)
const base = process.env.LIST_TABLES_TEST_URL || 'http://127.0.0.1:5173'
const listCalls = (path) => calls.filter((call) => call.path === path && call.method === 'GET')
const ready = async () => {
  await page.locator('.fitted-list-panel').waitFor()
  await page.waitForFunction(
    () => document.querySelector('.products-table-region')?.getAttribute('aria-busy') === 'false',
  )
  await page.waitForTimeout(180)
}
const keyword = () =>
  page.locator('.catalog-filters input.ant-input, .customers-page .filters input.ant-input').first()
const search = async (text, customers) => {
  await keyword().fill(text)
  if (!customers) await keyword().press('Enter')
  await ready()
}
const sizeValue = () => page.locator('.list-page-size .ant-select-selection-item').innerText()
const setSize = async (size) => {
  await page.locator('.list-page-size').click()
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: new RegExp('^' + size + '\\s*/') })
    .click()
  await ready()
}
const metrics = async () =>
  page.evaluate(() => {
    const body = document.querySelector('.ant-table-body')
    const region = document.querySelector('.products-table-region').getBoundingClientRect()
    const footer = document.querySelector('.products-footer').getBoundingClientRect()
    const th = [...document.querySelectorAll('.ant-table-header th')].filter(
      (e) => !e.classList.contains('ant-table-cell-scrollbar'),
    )
    const td = [
      ...(document.querySelector('.ant-table-tbody tr.ant-table-row')?.querySelectorAll('td') ||
        []),
    ]
    const r = (el) => {
      const b = el.getBoundingClientRect()
      return { left: b.left, right: b.right, top: b.top, bottom: b.bottom }
    }
    return {
      viewport: [innerWidth, innerHeight],
      pixelRatio: devicePixelRatio,
      xScrollers: [
        ...document.querySelector('.products-table-region').querySelectorAll('*'),
      ].filter(
        (el) =>
          el.scrollWidth > el.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(el).overflowX),
      ).length,
      yScrollers: [
        ...document.querySelector('.products-table-region').querySelectorAll('*'),
      ].filter(
        (el) =>
          el.scrollHeight > el.clientHeight + 1 &&
          /auto|scroll/.test(getComputedStyle(el).overflowY),
      ).length,
      pageHeight: document.documentElement.scrollHeight,
      pageWidth: document.documentElement.scrollWidth,
      body: r(body),
      region: { top: region.top, bottom: region.bottom },
      footer: { top: footer.top, bottom: footer.bottom },
      scrollHeight: body.scrollHeight,
      clientHeight: body.clientHeight,
      scrollWidth: body.scrollWidth,
      clientWidth: body.clientWidth,
      overflowY: getComputedStyle(body).overflowY,
      scrollTop: body.scrollTop,
      header: th.map(r),
      cells: td.map(r),
      fixedBackground: td.length ? getComputedStyle(td.at(-1)).backgroundColor : null,
      headerBackground: th.length ? getComputedStyle(th.at(-1)).backgroundColor : null,
      rowCount: document.querySelectorAll('.ant-table-tbody tr.ant-table-row').length,
    }
  })
const assertGeometry = (m, desktop = true) => {
  assert.ok(m.pageWidth <= m.viewport[0] + 1, 'No page horizontal overflow')
  assert.ok(m.xScrollers <= 1 && m.yScrollers <= 1, 'Only one data scroller per axis')
  if (desktop)
    assert.ok(m.pageHeight <= m.viewport[1] + 2, 'No page vertical overflow: ' + JSON.stringify(m))
  assert.ok(m.body.bottom <= m.region.bottom + 1, 'Body scrollbar within assigned region')
  assert.ok(m.region.bottom <= m.footer.top + 1, 'Pagination outside scroll body')
  if (m.cells.length) {
    assert.equal(m.header.length, m.cells.length, 'All columns retained')
    for (let i = 0; i < m.cells.length; i++) {
      assert.ok(
        Math.abs(m.header[i].left - m.cells[i].left) < 2,
        'Header/body left aligned at column ' + i,
      )
      assert.ok(
        Math.abs(m.header[i].right - m.cells[i].right) < 2,
        'Header/body right aligned at column ' + i,
      )
    }
    assert.notEqual(m.fixedBackground, 'rgba(0, 0, 0, 0)')
    assert.notEqual(m.headerBackground, 'rgba(0, 0, 0, 0)')
  }
}
try {
  for (const [kind, path, route, unit, expectedColumns] of [
    ['products', '/products', '/catalog/products', 'sản phẩm', 7],
    ['product-groups', '/product-groups', '/catalog/product-groups', 'nhóm sản phẩm', 4],
    ['warehouses', '/warehouses', '/catalog/warehouses', 'kho', 6],
    ['customers', '/customers', '/sales/customers', 'khách hàng', 7],
  ]) {
    const customers = kind === 'customers'
    const checks = [],
      measurements = []
    const check = (name, condition = true) => {
      assert.ok(condition, kind + ': ' + name)
      checks.push(name)
    }
    await page.setViewportSize({ width: 1366, height: 768 })
    const initial = listCalls(path).length
    await page.goto(base + route)
    await ready()
    check('Default pageSize 10', /10/.test(await sizeValue()))
    check('One initial list request', listCalls(path).length === initial + 1)
    let m = await metrics()
    assertGeometry(m)
    check('Approved columns retained', m.header.length === expectedColumns)
    for (const size of [20, 50, 100, 10, 100]) {
      const before = listCalls(path).length
      await setSize(size)
      const last = listCalls(path).at(-1)
      check(
        'Size ' + size + ': one request, page 1, server rows',
        listCalls(path).length === before + 1 &&
          last.params.page === '1' &&
          last.params.pageSize === String(size),
      )
      m = await metrics()
      check('Size ' + size + ': exact server row count', m.rowCount === size)
      assertGeometry(m)
      measurements.push({ size, ...m })
    }
    await page.locator('.ant-pagination-next').click()
    await ready()
    check(
      'Last page range 101–137 / 137',
      (await page.locator('.list-range').innerText()).includes('101–137 / 137 ' + unit),
    )
    m = await metrics()
    check('Last page has 37 records', m.rowCount === 37)
    await search('few', customers)
    m = await metrics()
    check(
      'Few rows: no vertical scrollbar',
      m.rowCount === 1 && m.scrollHeight <= m.clientHeight && m.overflowY === 'auto',
    )
    assertGeometry(m)
    await search('empty', customers)
    check('Empty range is 0–0 / 0', /0–0 \/ 0/.test(await page.locator('.list-range').innerText()))
    check('Empty has no records', (await metrics()).rowCount === 0)
    await search('fresh', customers)
    await setSize(20)
    check('Page size preserves keyword filter', listCalls(path).at(-1).params.keyword === 'fresh')
    await page.locator('.ant-table-body').evaluate((el) => {
      el.scrollTop = 80
    })
    await page.locator('.ant-pagination-next').click()
    await ready()
    check('Page change resets body scroll', (await metrics()).scrollTop === 0)
    await page.locator('.ant-table-body').evaluate((el) => {
      el.scrollTop = 80
    })
    await setSize(50)
    check('Page size resets body scroll', (await metrics()).scrollTop === 0)
    await page.locator('.ant-table-body').evaluate((el) => {
      el.scrollTop = 80
    })
    await search('few', customers)
    check('Filter resets body scroll', (await metrics()).scrollTop === 0)
    await search('fresh', customers)
    // Resize and sidebar must preserve both the existing DOM and scroll position.
    await page.locator('.ant-table-body').evaluate((el) => {
      el.scrollTop = 80
      el.dataset.identity = 'same-body'
    })
    let before = listCalls(path).length
    await page.setViewportSize({ width: 1024, height: 768 })
    await page.waitForTimeout(500)
    check(
      'Resize: no request and pageSize remains 50',
      listCalls(path).length === before && /50/.test(await sizeValue()),
    )
    check(
      'Resize: same body and scroll position',
      await page
        .locator('.ant-table-body')
        .evaluate((el) => el.dataset.identity === 'same-body' && el.scrollTop === 80),
    )
    m = await metrics()
    assertGeometry(m)
    const headerTop = m.header.at(-1).top,
      fixedRight = m.cells.at(-1).right
    await page.locator('.ant-table-body').evaluate((el) => {
      el.scrollTop = 900
      el.scrollLeft = 360
    })
    await page.waitForTimeout(150)
    m = await metrics()
    assertGeometry(m)
    check('Header stays fixed vertically', m.header.at(-1).top === headerTop)
    check('Actions stay fixed horizontally', Math.abs(m.cells.at(-1).right - fixedRight) < 2)
    check(
      'Horizontal scrollbar reachable without scrolling all rows',
      m.body.bottom <= m.region.bottom + 1 && m.scrollTop < m.scrollHeight - m.clientHeight,
    )
    const toggle = page
      .locator('.app-header')
      .getByRole('button', { name: /Mở rộng thanh bên|Thu gọn thanh bên/ })
    await toggle.click()
    await page.waitForTimeout(500)
    check(
      'Sidebar: no request or pageSize change',
      listCalls(path).length === before && /50/.test(await sizeValue()),
    )
    assertGeometry(await metrics())
    await toggle.click()
    await page.waitForTimeout(400)
    // Filter status and reset: only one request each.
    const statusSelect = page
      .locator(customers ? '.customer-filter-status .ant-select' : '.catalog-filters > .ant-select')
      .last()
    await statusSelect.click()
    before = listCalls(path).length
    await page
      .locator('.ant-select-dropdown:visible .ant-select-item-option')
      .filter({ hasText: /^Ngừng hoạt động$/ })
      .click()
    await ready()
    check(
      'Status 0: one request and page 1',
      listCalls(path).length === before + 1 &&
        listCalls(path).at(-1).params.status === '0' &&
        listCalls(path).at(-1).params.page === '1',
    )
    before = listCalls(path).length
    await page.getByRole('button', { name: 'Đặt lại', exact: true }).click()
    await ready()
    check(
      'Reset: one request, filters cleared, size preserved',
      listCalls(path).length === before + 1 &&
        !listCalls(path).at(-1).params.keyword &&
        !listCalls(path).at(-1).params.status &&
        listCalls(path).at(-1).params.pageSize === '50',
    )
    before = listCalls(path).length
    await page
      .locator('.fitted-list-panel')
      .getByRole('button', { name: 'Tải lại', exact: true })
      .click()
    await ready()
    check('Reload: one request', listCalls(path).length === before + 1)
    // Late response must not overwrite the newer filtered page.
    await keyword().fill('slow')
    if (!customers) await keyword().press('Enter')
    await page.waitForTimeout(80)
    await search('fresh', customers)
    await page.waitForTimeout(700)
    check(
      'Stale response ignored',
      (await page.locator('.ant-table-tbody').innerText()).includes('KẾT QUẢ MỚI') &&
        !(await page.locator('.ant-table-tbody').innerText()).includes('KẾT QUẢ CŨ'),
    )
    before = listCalls(path).length
    for (const [width, height] of [
      [1920, 1080],
      [1366, 768],
      [1093, 614],
      [768, 900],
      [390, 844],
      [360, 740],
      [390, 400],
      [1366, 420],
    ]) {
      await page.setViewportSize({ width, height })
      if (width === 1093) {
        // Browser zoom 125% is emulated as the effective CSS viewport and DPR
        // of a physical 1366x768 viewport. This is not native browser UI zoom.
        await cdp.send('Emulation.setDeviceMetricsOverride', {
          width,
          height,
          deviceScaleFactor: 1.25,
          mobile: false,
        })
      }
      await page.waitForTimeout(300)
      // The table library updates its separate header colgroup after its own
      // ResizeObserver batch; wait for that batch, not a fixed animation delay.
      await page.waitForFunction(
        () => {
          const th = [...document.querySelectorAll('.ant-table-header th')].filter(
            (el) => !el.classList.contains('ant-table-cell-scrollbar'),
          )
          const td = [
            ...(document
              .querySelector('.ant-table-tbody tr.ant-table-row')
              ?.querySelectorAll('td') || []),
          ]
          return td.every((el, i) => {
            const a = el.getBoundingClientRect(),
              b = th[i]?.getBoundingClientRect()
            return b && Math.abs(a.left - b.left) < 2 && Math.abs(a.right - b.right) < 2
          })
        },
        null,
        { timeout: 5000 },
      )
      m = await metrics()
      assertGeometry(m, width >= 1024 && height >= 700)
      check(
        'Resize ' + width + 'x' + height + ': no request, same size, all columns',
        listCalls(path).length === before &&
          /50/.test(await sizeValue()) &&
          m.header.length === expectedColumns,
      )
      measurements.push({ label: width + 'x' + height, ...m })
      if (width === 1093) {
        check('125% zoom equivalent viewport and pixel ratio', m.pixelRatio === 1.25)
        await cdp.send('Emulation.setDeviceMetricsOverride', {
          width,
          height,
          deviceScaleFactor: 1,
          mobile: false,
        })
      }
      if (height === 400 || height === 420) {
        await page.locator('.products-footer').scrollIntoViewIfNeeded()
        check(
          'Short viewport keeps pagination accessible',
          await page.locator('.products-footer').evaluate((el) => {
            const rect = el.getBoundingClientRect()
            return rect.top >= 0 && rect.bottom <= innerHeight + 1
          }),
        )
        await page.evaluate(() => window.scrollTo(0, 0))
      }
      if (width === 390 && height === 844) {
        for (const mobileSize of [10, 20, 50, 100, 50]) {
          const mobileBefore = listCalls(path).length
          await setSize(mobileSize)
          check(
            'Mobile size ' + mobileSize + ': one request and correct rows',
            listCalls(path).length === mobileBefore + 1 &&
              (await metrics()).rowCount === mobileSize &&
              listCalls(path).at(-1).params.page === '1',
          )
          assertGeometry(await metrics(), false)
        }
        before = listCalls(path).length
        const filterToggle = page.locator('.products-filter-toggle:visible')
        if (await filterToggle.count()) {
          await filterToggle.click()
          await ready()
          assertGeometry(await metrics(), false)
          check('Wrapped mobile filters only resize table', listCalls(path).length === before)
          await filterToggle.click()
          await ready()
        }
        await page.locator('.ant-table-body').evaluate((el) => {
          el.scrollLeft = 0
          el.scrollTop = 0
        })
        await page
          .locator('.ant-table-tbody .ant-table-cell-fix-right')
          .first()
          .getByRole('button', { name: 'Thao tác', exact: true })
          .click()
        const menu = page.locator('.ant-dropdown:visible')
        await menu.waitFor()
        check(
          'Mobile action dropdown is portaled and visible',
          await menu.evaluate(
            (el) => !el.closest('.ant-table-body') && el.getBoundingClientRect().height > 0,
          ),
        )
        await page.keyboard.press('Escape')
        await page.mouse.click(5, 5)
      }
    }
    await page.setViewportSize({ width: 1366, height: 768 })
    await ready()
    await page.screenshot({ path: artifacts + '/' + kind + '.png' })
    results.push({ kind, checks, measurements })
  }
  // Other modules keep their existing layout and customer update permission stays enforced.
  restricted = true
  await page.goto(base + '/sales/customers')
  await ready()
  assert.equal(await page.getByRole('button', { name: 'Thêm khách hàng', exact: true }).count(), 0)
  assert.equal(await page.getByRole('button', { name: 'Sửa', exact: true }).count(), 0)
  await page.goto(base + '/sales/orders')
  await page.waitForTimeout(300)
  assert.equal(await page.locator('.admin-layout--products').count(), 0)
  assert.deepEqual(errors, [])
  await writeFile(
    artifacts + '/browser-results.json',
    JSON.stringify({ results, calls, errors }, null, 2),
  )
  console.log(
    JSON.stringify(
      { modules: results.map(({ kind, checks }) => ({ kind, passed: checks.length })), errors },
      null,
      2,
    ),
  )
} catch (error) {
  await page.screenshot({ path: artifacts + '/failure.png' })
  await writeFile(
    artifacts + '/failure.json',
    JSON.stringify(
      {
        message: error.message,
        results,
        calls,
        errors,
        metrics: await metrics().catch(() => null),
      },
      null,
      2,
    ),
  )
  throw error
} finally {
  await browser.close()
}
