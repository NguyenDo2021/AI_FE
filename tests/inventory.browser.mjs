// Controlled API fixtures only; no real backend reads or mutations.
import assert from 'node:assert/strict'
import process from 'node:process'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Buffer } from 'node:buffer'
import ts from 'typescript'

const { chromium } = await import(
  pathToFileURL(
    process.env.PLAYWRIGHT_MODULE ||
      join(process.env.TEMP, 'codex-dashboard-browser/node_modules/playwright/index.mjs'),
  ).href
)
const stockSource = ts.transpileModule(await readFile('src/utils/stock.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const { stringifyStockJson } = await import(
  'data:text/javascript;base64,' + Buffer.from(stockSource).toString('base64')
)
const artifacts = join(process.env.TEMP, 'codex-inventory-browser')
await mkdir(artifacts, { recursive: true })
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  ignoreDefaultArgs: ['--hide-scrollbars'],
})
const context = await browser.newContext({
  viewport: { width: 1366, height: 768 },
  timezoneId: 'Asia/Bangkok',
  reducedMotion: 'reduce',
})
await context.addInitScript(() => {
  localStorage.setItem('frontend-base:access-token', 'inventory-test')
  if (!sessionStorage.getItem('inventory-test-initialized')) {
    sessionStorage.setItem('working-warehouse:inventory-user', 'w1')
    sessionStorage.setItem('inventory-test-initialized', '1')
  }
})
const base = process.env.INVENTORY_TEST_URL || 'http://127.0.0.1:5178'
const calls = [],
  checks = [],
  errors = [],
  measurements = []
let permissions = [
  'INVENTORY_VIEW',
  'INVENTORY_MOVEMENT_VIEW',
  'PRODUCT_VIEW',
  'STOCK_RECEIPT_VIEW',
  'SALES_ORDER_VIEW',
  'STOCKTAKE_VIEW',
  'SALES_RETURN_VIEW',
]
let status = 200,
  empty = false,
  delayWarehouse = '',
  admin = false
const warehouses = [
  { id: 'w1', code: 'K1', name: 'Kho trung tâm', status: 1 },
  { id: 'w2', code: 'K2', name: 'Kho phía Đông', status: 1 },
  { id: 'w3', code: 'K3', name: 'Kho ngừng hoạt động', status: 0 },
]
const uuid = 'a12b34cd-5678-49ab-9012-cdef34567890'
const types = [
  'RECEIPT_CONFIRM',
  'RECEIPT_CANCEL',
  'SALE_CONFIRM',
  'SALE_CANCEL',
  'STOCKTAKE_ADJUSTMENT',
  'SALE_RETURN',
  'FUTURE_TYPE',
]
const movement = (n) => ({
  id: 'movement-' + n,
  warehouseId: 'w1',
  productId: 'p' + n,
  productCode: 'SNAP-' + n,
  productName: 'Tên snapshot ' + n,
  unit: 'cay',
  performedBy: uuid,
  performedAt: new Date(Date.UTC(2026, 9, 7, 17) + n * 3600000).toISOString(),
  quantityChange:
    n === 0
      ? 9223372036854775807n
      : n === 1
        ? -9223372036854775808n
        : n === 2
          ? 0
          : n % 2
            ? -12
            : 12,
  type: types[n % types.length],
  ...(n % 7 < 2
    ? { receiptId: uuid, ...(n % 7 === 0 ? { receiptCode: 'PN-' + 'CODE'.repeat(30) } : {}) }
    : {}),
  ...(n % 7 === 2 || n % 7 === 3 ? { salesOrderId: uuid, salesOrderCode: 'DH-' + n } : {}),
  ...(n % 7 === 4 ? { stocktakeId: uuid, stocktakeCode: 'KK-' + n } : {}),
  ...(n % 7 === 5 ? { salesReturnId: uuid, salesReturnCode: 'TH-' + n } : {}),
})
await context.route('**/api/**', async (route) => {
  const request = route.request(),
    url = new URL(request.url())
  if (!url.pathname.startsWith('/api/')) return route.continue()
  const path = url.pathname.replace(/^\/api/, ''),
    params = Object.fromEntries(url.searchParams)
  calls.push({ path, params, method: request.method() })
  const reply = (data, code = 200) =>
    route.fulfill({ status: code, contentType: 'application/json', body: stringifyStockJson(data) })
  if (path === '/auth/me')
    return reply({
      id: 'inventory-user',
      username: 'inventory',
      fullName: 'Kiểm tra tồn kho',
      permissions,
    })
  if (path === '/users/inventory-user') return reply({ id: 'inventory-user', status: 1 })
  if (path === '/users/inventory-user/roles')
    return reply(admin ? [{ code: 'ADMIN', status: 1 }] : [])
  if (path === '/users/me/warehouses') return reply(warehouses)
  if (path === '/products') {
    const page = Number(params.page || 1),
      pageSize = Number(params.pageSize || 100)
    let items = Array.from({ length: 137 }, (_, n) => ({
      id: 'p' + n,
      code: 'P-' + n,
      name: 'Sản phẩm ' + n,
      unit: 'cay',
      status: n === 105 ? 0 : 1,
    }))
    if (params.keyword) items = items.filter((item) => item.name.includes(params.keyword))
    return reply({
      items: items.slice((page - 1) * pageSize, page * pageSize),
      page,
      pageSize,
      total: items.length,
    })
  }
  if (/^\/warehouses\/[^/]+\/inventory(?:-movements)?$/.test(path)) {
    const warehouseId = path.split('/')[2],
      isMovements = path.endsWith('-movements')
    const page = Number(params.page || 1),
      pageSize = Number(params.pageSize || 10)
    const capturedStatus = status,
      capturedEmpty = empty
    if (warehouseId === delayWarehouse) await new Promise((resolve) => setTimeout(resolve, 700))
    if (capturedStatus !== 200) return reply({ message: 'Fixture API error' }, capturedStatus)
    let items = capturedEmpty
      ? []
      : Array.from({ length: 137 }, (_, n) =>
          isMovements
            ? movement(n)
            : {
                warehouseId,
                productId: 'p' + n,
                productCode: 'P-' + n,
                productName: warehouseId + ' Sản phẩm ' + n,
                unit: 'cay',
                productStatus: n === 0 || n === 105 ? 0 : 1,
                quantity: n === 0 ? 0 : n === 1 ? 9223372036854775807n : n,
              },
        )
    if (params.productId) items = items.filter((item) => item.productId === params.productId)
    if (params.from) items = items.filter((item) => item.performedAt >= params.from)
    if (params.to) items = items.filter((item) => item.performedAt < params.to)
    return reply({
      items: items.slice((page - 1) * pageSize, page * pageSize),
      total: items.length,
      page,
      pageSize,
    })
  }
  if (/^\/(stock-receipts|sales-orders)\//.test(path))
    return reply({ message: 'Fixture detail not found' }, 404)
  return reply({})
})
const page = await context.newPage()
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (/ResizeObserver loop|Unhandled|Failed to resolve component/.test(message.text()))
    errors.push(message.text())
})
const listCalls = () => calls.filter((call) => /^\/warehouses\/[^/]+\/inventory/.test(call.path))
const ready = async () => {
  await page.locator('.inventory-table').waitFor()
  await page.waitForFunction(
    () => document.querySelector('.products-table-region')?.getAttribute('aria-busy') === 'false',
  )
  await page.waitForTimeout(150)
}
const check = (name, condition = true) => {
  assert.ok(condition, name)
  checks.push(name)
  if (checks.length % 20 === 0) console.log('Passed ' + checks.length + ': ' + name)
}
const open = async (path) => {
  await page.goto(base + path)
  await ready()
}
const setSize = async (size) => {
  await page.locator('.list-page-size').click()
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: new RegExp('^' + size + '\\s*/') })
    .click()
  await ready()
}
const geometry = async () => {
  await page.waitForFunction(
    () => {
      const header = [...document.querySelectorAll('.ant-table-header th')].filter(
        (el) => !el.classList.contains('ant-table-cell-scrollbar'),
      )
      const cells = [...(document.querySelector('.ant-table-row')?.querySelectorAll('td') || [])]
      return (
        cells.length > 0 &&
        header.length === cells.length &&
        cells.every(
          (cell, i) =>
            Math.abs(cell.getBoundingClientRect().right - header[i].getBoundingClientRect().right) <
            2,
        )
      )
    },
    null,
    { timeout: 5000 },
  )
  return page.evaluate(() => {
    const body = document.querySelector('.ant-table-body'),
      region = document.querySelector('.products-table-region'),
      footer = document.querySelector('.products-footer')
    const rect = (el) => {
      const r = el.getBoundingClientRect()
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
    }
    return {
      viewport: [innerWidth, innerHeight],
      pageWidth: document.documentElement.scrollWidth,
      pageHeight: document.documentElement.scrollHeight,
      body: rect(body),
      region: rect(region),
      footer: rect(footer),
      clientHeight: body.clientHeight,
      scrollHeight: body.scrollHeight,
      scrollTop: body.scrollTop,
      clientWidth: body.clientWidth,
      scrollWidth: body.scrollWidth,
      header: [...document.querySelectorAll('.ant-table-header th')]
        .filter((el) => !el.classList.contains('ant-table-cell-scrollbar'))
        .map(rect),
      cells: [
        ...(document.querySelector('.ant-table-tbody tr.ant-table-row')?.querySelectorAll('td') ||
          []),
      ].map(rect),
      yScrollers: [...region.querySelectorAll('*')].filter(
        (el) =>
          el.scrollHeight > el.clientHeight + 1 &&
          /auto|scroll/.test(getComputedStyle(el).overflowY),
      ).length,
      xScrollers: [...region.querySelectorAll('*')].filter(
        (el) =>
          el.scrollWidth > el.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(el).overflowX),
      ).length,
      rowCount: document.querySelectorAll('.ant-table-row').length,
    }
  })
}
const assertGeometry = (m, columns, desktop) => {
  assert.ok(m.pageWidth <= m.viewport[0] + 1, 'No page horizontal overflow: ' + JSON.stringify(m))
  if (desktop)
    assert.ok(m.pageHeight <= m.viewport[1] + 2, 'Desktop content fits: ' + JSON.stringify(m))
  assert.ok(m.body.bottom <= m.region.bottom + 1, 'Scrollbar fits assigned table region')
  assert.ok(m.region.bottom <= m.footer.top + 1, 'Pagination outside data scroll')
  assert.ok(m.yScrollers <= 1 && m.xScrollers <= 1, 'One data scroller per axis')
  assert.equal(m.header.length, columns)
  assert.equal(m.cells.length, columns)
  for (let i = 0; i < columns; i++) {
    assert.ok(Math.abs(m.header[i].left - m.cells[i].left) < 2, 'Header/body left alignment ' + i)
    assert.ok(
      Math.abs(m.header[i].right - m.cells[i].right) < 2,
      'Header/body right alignment ' + i,
    )
  }
}
const warehouseSelect = async (id) => {
  await page.locator('.warehouse-selector .ant-select').click()
  await page.locator('.warehouse-selector input').fill(warehouses.find((w) => w.id === id).name)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
}
try {
  for (const [route, columns, title] of [
    ['/stock/inventory', 5, 'Tồn kho'],
    ['/stock/movements', 8, 'Lịch sử biến động'],
  ]) {
    await open(route)
    check(title + ': exact heading', (await page.locator('h1').innerText()) === title)
    check(
      title + ': API total',
      (await page.locator('.products-total').innerText()).includes('137'),
    )
    check(
      title + ': working warehouse',
      (await page.locator('.inventory-warehouse').innerText()).includes('Kho trung tâm'),
    )
    for (const size of [20, 50, 100, 10]) {
      await setSize(size)
      check(
        title + ': server page size ' + size,
        listCalls().at(-1).params.pageSize === String(size) &&
          listCalls().at(-1).params.page === '1',
      )
      check(
        title + ': rendered size ' + size,
        (await page.locator('.ant-table-row').count()) === size,
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
      const before = listCalls().length
      await page.setViewportSize({ width, height })
      await page.waitForTimeout(600)
      const m = await geometry()
      measurements.push({ route, width, height, ...m })
      assertGeometry(m, columns, width >= 1024)
      check(title + ': resize ' + width + ' does not reload API', listCalls().length === before)
      check(
        title + ': resize preserves page size',
        (await page.locator('.list-page-size').innerText()).includes('100'),
      )
      await page.screenshot({
        path: join(
          artifacts,
          title === 'Tồn kho' ? 'inventory-' + width + '.png' : 'movements-' + width + '.png',
        ),
        fullPage: true,
      })
    }
    await page.setViewportSize({ width: 1366, height: 768 })
    const beforeCollapse = listCalls().length
    await page.locator('.app-header__icon-button').click()
    await page.waitForTimeout(500)
    assertGeometry(await geometry(), columns, true)
    check(title + ': sidebar resize does not reload', listCalls().length === beforeCollapse)
    await page.locator('.app-header__icon-button').click()
    await page.waitForTimeout(500)
    const beforeScroll = await geometry()
    await page.locator('.ant-table-body').evaluate((el) => {
      el.scrollTop = 900
      el.scrollLeft = 100
    })
    await page.waitForTimeout(120)
    const afterScroll = await geometry()
    check(
      title + ': sticky header',
      Math.abs(beforeScroll.header[0].top - afterScroll.header[0].top) < 1,
    )
    check(title + ': vertical scroll', afterScroll.scrollTop > 0)
    await page.locator('.ant-pagination-next').click()
    await ready()
    check(title + ': server page 2', listCalls().at(-1).params.page === '2')
    check(title + ': scroll resets after page change', (await geometry()).scrollTop === 0)
    await setSize(10)
    await page.evaluate(() => {
      document.body.style.zoom = '1.25'
    })
    await page.waitForTimeout(250)
    assertGeometry(await geometry(), columns, false)
    await page.screenshot({
      path: join(artifacts, (columns === 5 ? 'inventory' : 'movements') + '-zoom125.png'),
      fullPage: true,
    })
    check(title + ': 125% zoom keeps controls usable')
    await page.evaluate(() => {
      document.body.style.zoom = ''
    })
    await page.setViewportSize({ width: 390, height: 420 })
    await page.waitForTimeout(150)
    await page.locator('.list-page-size').scrollIntoViewIfNeeded()
    check(
      title + ': short viewport reaches pagination',
      await page.locator('.list-page-size').isVisible(),
    )
    await page.setViewportSize({ width: 1366, height: 768 })
  }

  await open('/stock/inventory')
  const rows = page.locator('.ant-table-row')
  check(
    'Zero inventory remains visible',
    (await rows.nth(0).innerText()).includes('0') &&
      (await rows.nth(0).innerText()).includes('Ngừng hoạt động'),
  )
  check(
    'Int64 max quantity exact',
    (await rows.nth(1).innerText()).includes('9.223.372.036.854.775.807'),
  )
  await page.locator('.inventory-filter--product .ant-select').click()
  await page.locator('.ant-select-dropdown:visible .rc-virtual-list-holder').evaluate((el) => {
    el.scrollTop = el.scrollHeight
  })
  await page.waitForTimeout(400)
  check(
    'Product selector loads second server page',
    calls.some((call) => call.path === '/products' && call.params.page === '2'),
  )
  const search = page.locator('.inventory-filter--product input')
  await search.fill('105')
  await page.waitForTimeout(450)
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: 'Sản phẩm 105' })
    .click()
  await ready()
  check('Inactive product can be selected', listCalls().at(-1).params.productId === 'p105')
  await page.locator('.inventory-filter--product .ant-select').click()
  await search.fill('136')
  await page.waitForTimeout(450)
  await page.keyboard.press('Escape')
  check(
    'Selected inactive product remains labelled after search',
    (
      await page.locator('.inventory-filter--product .ant-select-selection-item').innerText()
    ).includes('105'),
  )
  await page.locator('.inventory-reset').click()
  await ready()
  check('Reset clears product filter', !('productId' in listCalls().at(-1).params))

  delayWarehouse = 'w1'
  await page.locator('.products-toolbar button').click()
  await warehouseSelect('w2')
  await ready()
  await page.waitForTimeout(850)
  check(
    'Late previous warehouse response discarded',
    (await rows.first().innerText()).includes('w2') &&
      !(await rows.first().innerText()).includes('w1'),
  )
  check(
    'Warehouse name follows header selection',
    (await page.locator('.inventory-warehouse').innerText()).includes('Kho phía Đông'),
  )
  delayWarehouse = ''
  await warehouseSelect('w1')
  await ready()

  empty = true
  await page.locator('.products-toolbar button').click()
  await ready()
  check(
    'Empty state and zero range',
    (await rows.count()) === 0 && /0–0 \/ 0/.test(await page.locator('.list-range').innerText()),
  )
  empty = false
  for (const code of [403, 404]) {
    status = code
    await page.locator('.products-toolbar button').click()
    await ready()
    check(
      'API ' + code + ' clears rows and shows error',
      (await rows.count()) === 0 &&
        (await page.locator('.inventory-page > .ant-alert-error').count()) === 1,
    )
  }
  status = 200

  await open('/stock/movements')
  check(
    'Positive int64 sign exact',
    (await rows.nth(0).innerText()).includes('+9.223.372.036.854.775.807'),
  )
  check(
    'Negative int64 min exact',
    (await rows.nth(1).innerText()).includes('-9.223.372.036.854.775.808'),
  )
  check('Unknown movement fallback', (await rows.nth(6).innerText()).includes('FUTURE_TYPE'))
  check(
    'History snapshot preserved',
    (await rows.first().innerText()).includes('SNAP-0') &&
      (await rows.first().innerText()).includes('Tên snapshot 0'),
  )
  check(
    'Stocktake route preserved',
    (await rows.nth(4).locator('a').getAttribute('href')).includes(
      '/stock/stocktakes?stocktakeId=' + uuid,
    ),
  )
  check(
    'Return route preserved',
    (await rows.nth(5).locator('a').getAttribute('href')).includes(
      '/sales/returns?returnId=' + uuid,
    ),
  )
  await rows.first().locator('.inventory-source').hover()
  await page.locator('.ant-tooltip:visible').waitFor()
  check(
    'Full long source in tooltip',
    (await page.locator('.ant-tooltip:visible').innerText()).includes('PN-' + 'CODE'.repeat(30)),
  )
  const truncation = await rows
    .nth(1)
    .locator('.inventory-ellipsis')
    .last()
    .evaluate((el) => ({
      height: el.clientHeight,
      overflow: getComputedStyle(el).textOverflow,
      whitespace: getComputedStyle(el).whiteSpace,
    }))
  check(
    'UUID truncates on one line',
    truncation.height <= 20 &&
      truncation.overflow === 'ellipsis' &&
      truncation.whitespace === 'nowrap',
  )
  await rows.nth(2).locator('button').click()
  await page.waitForTimeout(250)
  check(
    'Sales source opens existing detail',
    calls.some((call) => call.path === '/sales-orders/' + uuid),
  )
  await page.keyboard.press('Escape')
  if (await page.locator('.ant-modal-close:visible').count())
    await page.locator('.ant-modal-close:visible').click()
  await page.waitForTimeout(200)
  await rows.first().locator('button').click()
  await page.waitForTimeout(250)
  check(
    'Receipt source opens existing detail',
    calls.some((call) => call.path === '/stock-receipts/' + uuid),
  )
  await page.keyboard.press('Escape')
  if (await page.locator('.ant-modal-close:visible').count())
    await page.locator('.ant-modal-close:visible').click()
  await page.waitForTimeout(200)

  const dates = page.locator('.inventory-filter .ant-picker input')
  await dates.nth(0).click()
  await dates.nth(0).fill('2026-10-08 00:00:00')
  await dates.nth(0).press('Enter')
  await page.keyboard.press('Escape')
  await dates.nth(1).click()
  await dates.nth(1).fill('2026-10-08 02:00:00')
  await dates.nth(1).press('Enter')
  await page.keyboard.press('Escape')
  await ready()
  check(
    'Picker sends exact timezone instants',
    listCalls().at(-1).params.from === '2026-10-07T17:00:00.000Z' &&
      listCalls().at(-1).params.to === '2026-10-07T19:00:00.000Z',
  )
  check(
    'Inclusive from / exclusive to boundary fixture',
    (await rows.count()) === 2 &&
      (await rows.first().innerText()).includes('SNAP-0') &&
      (await rows.last().innerText()).includes('SNAP-1'),
  )
  await page.locator('.inventory-reset').click()
  await ready()

  permissions = ['INVENTORY_MOVEMENT_VIEW']
  await open('/stock/movements')
  check('History readable without source document permissions', (await rows.count()) === 10)
  check(
    'Source actions hidden without permissions',
    (await page.locator('.inventory-source a, .inventory-source button').count()) === 0,
  )
  check(
    'No per-row user requests',
    !calls.some(
      (call) =>
        call.path.startsWith('/users/') &&
        !['/users/inventory-user', '/users/inventory-user/roles', '/users/me/warehouses'].includes(
          call.path,
        ),
    ),
  )
  permissions = []
  admin = true
  await open('/stock/inventory')
  check('ADMIN exception retained', (await rows.count()) === 10)
  admin = false
  permissions = ['INVENTORY_VIEW']
  await page.evaluate(() => sessionStorage.removeItem('working-warehouse:inventory-user'))
  const beforeNoWarehouse = listCalls().length
  await page.reload()
  await page.locator('.inventory-page .ant-alert-info').waitFor()
  check('No selected warehouse sends no inventory API', listCalls().length === beforeNoWarehouse)
  check(
    'No all warehouses option introduced',
    !(await page.locator('.inventory-page').innerText()).includes('Tất cả kho'),
  )
  await page.locator('.warehouse-selector .ant-select').click()
  await page.locator('.ant-select-dropdown:visible .ant-select-item-option-disabled').waitFor()
  check(
    'Inactive warehouse remains visible but follows existing selection rules',
    (await page
      .locator('.ant-select-dropdown:visible .ant-select-item-option-disabled')
      .count()) === 1,
  )
  await page.keyboard.press('Escape')
  status = 401
  await warehouseSelect('w1')
  await page.waitForURL('**/login**')
  check('401 retains session-expiry navigation', page.url().includes('/login'))
  check('No runtime errors', errors.length === 0)
  await writeFile(
    join(artifacts, 'results.json'),
    JSON.stringify({ checks, measurements, errors }, null, 2),
  )
  console.log(JSON.stringify({ passed: checks.length, artifacts, errors }, null, 2))
} catch (error) {
  await page.screenshot({ path: join(artifacts, 'failure.png'), fullPage: true }).catch(() => {})
  await writeFile(
    join(artifacts, 'failure.json'),
    JSON.stringify(
      { error: error.stack, checks, measurements, errors, lastCalls: calls.slice(-20) },
      null,
      2,
    ),
  )
  throw error
} finally {
  await browser.close()
}
