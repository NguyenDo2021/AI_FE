// All API requests are intercepted; stock mutations affect fixtures only.
import assert from 'node:assert/strict'
import process from 'node:process'
import { Buffer } from 'node:buffer'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
const { chromium } = await import(
  pathToFileURL(join(process.env.TEMP, 'codex-stocktake-browser/node_modules/playwright/index.mjs'))
    .href
)
const stockSource = ts.transpileModule(await readFile('src/utils/stock.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const { parseStockJson, stringifyStockJson } = await import(
  'data:text/javascript;base64,' + Buffer.from(stockSource).toString('base64')
)
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  ignoreDefaultArgs: ['--hide-scrollbars'],
})
const context = await browser.newContext({
  viewport: { width: 1366, height: 900 },
  reducedMotion: 'reduce',
})
const artifacts = join(process.env.TEMP, 'codex-stocktake-browser/artifacts')
await mkdir(artifacts, { recursive: true })
await context.addInitScript(() => {
  localStorage.setItem('frontend-base:access-token', 'stocktake-fixture')
  sessionStorage.setItem('working-warehouse:stocktake-user', 'w1')
})
const base = process.env.STOCKTAKES_TEST_URL || 'http://127.0.0.1:5173'
const allPermissions = [
  'STOCKTAKE_VIEW',
  'STOCKTAKE_CREATE',
  'STOCKTAKE_UPDATE',
  'STOCKTAKE_CONFIRM',
  'STOCKTAKE_CANCEL',
  'INVENTORY_VIEW',
]
let permissions = [...allPermissions],
  admin = false,
  scenario = 'normal',
  assigned = ['w1', 'w2']
const warehouses = [
  { id: 'w1', code: 'K1', name: 'Kho được giao', status: 1 },
  { id: 'w2', code: 'K2', name: 'Kho thứ hai', status: 1 },
]
const longId = 'c71a8901-8b9e-46d8-a2c9-9ffba72375ca'
const line = (i) => ({
  productId: 'p' + i,
  productCode: 'SP-' + i + '-LONG'.repeat(12),
  productName: 'Sản phẩm kiểm kê ' + i + ' có tên dài để kiểm tra bố cục',
  unit: 'cây',
  systemQuantity: i === 3 ? 9223372036854775807n : 100,
  inventoryRevision: 1,
  countedQuantity: i === 1 ? null : i === 2 ? 0 : i === 3 ? 9223372036854775807n : i % 2 ? 105 : 97,
  difference: i === 1 ? null : i === 2 ? -100 : i === 3 ? 0 : i % 2 ? 5 : -3,
  reason: i === 1 || i === 3 ? null : 'Lý do kiểm thử',
})
const receipt = (i = 0) => ({
  id: 's' + i,
  code: 'KK-' + i + '-LONG'.repeat(25),
  warehouseId: 'w1',
  status: i % 3 === 0 ? 'DRAFT' : i % 3 === 1 ? 'CONFIRMED' : 'CANCELLED',
  version: 7,
  createdBy: longId,
  updatedBy: i === 1 ? null : longId,
  createdAt: '2026-10-12T03:00:00Z',
  updatedAt: i === 1 ? null : '2026-10-12T04:00:00Z',
  note: 'Ghi chú kiểm thử\nGiữ nguyên dữ liệu.',
  lines: Array.from({ length: 24 }, (_, i) => line(i)),
})
let detail = receipt()
const calls = [],
  checks = [],
  measurements = [],
  errors = [],
  unexpected = []
await context.route('**/*', async (route) => {
  const req = route.request()
  if (!['xhr', 'fetch'].includes(req.resourceType())) return route.continue()
  const url = new URL(req.url()),
    method = req.method()
  const path = url.pathname.replace(/^.*?(?=\/(?:auth|users|stocktakes|warehouses)(?:\/|$))/, '')
  const params = Object.fromEntries(url.searchParams),
    raw = req.postData()
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
      id: 'stocktake-user',
      username: 'stocktake-test',
      fullName: 'Kiểm thử Kiểm kê',
      permissions,
    })
  if (path === '/users/stocktake-user') return reply({ id: 'stocktake-user', status: 1 })
  if (path === '/users/stocktake-user/roles')
    return reply(admin ? [{ code: 'ADMIN', status: 1 }] : [])
  if (path === '/users/me/warehouses')
    return reply(warehouses.filter((w) => assigned.includes(w.id)))
  if (path === '/stocktakes' && method === 'GET') {
    if (scenario === 'forbidden') return reply({ code: 'FORBIDDEN' }, 403)
    if (scenario === 'unauthorized') return reply({ message: 'Phiên hết hạn' }, 401)
    const total = scenario === 'empty' ? 0 : scenario === 'few' ? 2 : 237
    const page = Number(params.page),
      size = Number(params.pageSize)
    const items = Array.from(
      { length: Math.max(0, Math.min(size, total - (page - 1) * size)) },
      (_, i) => ({ ...receipt((page - 1) * size + i), warehouseId: params.warehouseId || 'w1' }),
    )
    if (scenario === 'race' && params.status === 'DRAFT') {
      items.forEach((r) => (r.code = 'KẾT QUẢ CŨ'))
      await new Promise((resolve) => setTimeout(resolve, 700))
    }
    if (scenario === 'race' && params.status === 'CONFIRMED')
      items.forEach((r) => (r.code = 'KẾT QUẢ MỚI'))
    return reply({ items, total, page, pageSize: size })
  }
  if (/^\/warehouses\/[^/]+\/inventory$/.test(path))
    return reply({
      items: [0, 1, 2].map((i) => ({
        productId: 'pick' + i,
        productCode: 'CHON-' + i,
        productName: 'Sản phẩm chọn ' + i,
        unit: 'cây',
        quantity: 999,
      })),
      total: 3,
      page: 1,
      pageSize: 10,
    })
  if (path === '/stocktakes' && method === 'POST') {
    const body = parseStockJson(raw)
    detail = {
      ...receipt(),
      id: 'created',
      code: 'KK-MỚI',
      warehouseId: body.warehouseId,
      note: body.note,
      version: 0,
      lines: body.lines.map((l) => ({
        ...line(0),
        ...l,
        countedQuantity: null,
        difference: null,
        reason: null,
      })),
    }
    return reply(detail)
  }
  if (/^\/stocktakes\/[^/]+$/.test(path) && method === 'GET') {
    if (scenario === 'access-denied') {
      assigned = []
      return reply({ code: 'WAREHOUSE_ACCESS_DENIED' }, 403)
    }
    return reply(detail)
  }
  if (/^\/stocktakes\/[^/]+$/.test(path) && method === 'PUT') {
    if (scenario === 'conflict')
      return reply({ code: 'VERSION_CONFLICT', details: { currentVersion: 8 } }, 409)
    const body = parseStockJson(raw)
    detail = {
      ...detail,
      version: BigInt(detail.version) + 1n,
      note: body.note,
      lines: body.lines.map((l) => ({
        ...detail.lines.find((x) => x.productId === l.productId),
        ...l,
        countedQuantity: l.countedQuantity ?? null,
        reason: l.reason ?? null,
      })),
    }
    return reply(detail)
  }
  if (/^\/stocktakes\/[^/]+\/(confirm|cancel|refresh-snapshot)$/.test(path) && method === 'POST') {
    if (path.endsWith('/confirm'))
      detail = {
        ...detail,
        status: 'CONFIRMED',
        confirmedBy: longId,
        confirmedAt: '2026-10-24T03:00:00Z',
      }
    if (path.endsWith('/cancel'))
      detail = {
        ...detail,
        status: 'CANCELLED',
        cancellationReason: parseStockJson(raw).reason,
        cancelledBy: longId,
        cancelledAt: '2026-10-24T03:00:00Z',
      }
    if (path.endsWith('/refresh-snapshot'))
      detail = {
        ...detail,
        lines: detail.lines.map((l) => ({
          ...l,
          systemQuantity: 101,
          countedQuantity: null,
          difference: null,
          reason: null,
        })),
      }
    detail.version = BigInt(detail.version) + 1n
    return reply(detail)
  }
  unexpected.push({ path, method })
  return reply({ message: 'Unexpected fixture API request' }, 500)
})
const page = await context.newPage()
page.setDefaultTimeout(10000)
await page.clock.setFixedTime(new Date('2026-10-24T05:00:00Z'))
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => {
  if (
    /Unhandled application error|Failed to resolve component|does not provide an export|intlify.*Not found/.test(
      m.text(),
    )
  )
    errors.push(m.text())
})
const check = (name, value) => {
  assert.ok(value, name)
  checks.push(name)
}
const listCalls = () => calls.filter((c) => c.path === '/stocktakes' && c.method === 'GET')
const writes = () => calls.filter((c) => ['POST', 'PUT'].includes(c.method))
const panel = () => page.locator('.stocktakes-page > .stocktake-table')
const content = () => panel().locator('.ant-table-content')
const modal = () => page.locator('.stocktake-dialog .ant-modal:visible')
const ready = async () => {
  await panel().waitFor()
  await page.waitForFunction(
    () =>
      document.querySelector('.stocktakes-page > .stocktake-table')?.getAttribute('aria-busy') ===
      'false',
  )
  await page.waitForTimeout(180)
}
const navigate = async () => {
  await page.goto(base + '/stock/stocktakes')
  await ready()
}
const resize = async (width, height = 900) => {
  const before = listCalls().length
  await page.setViewportSize({ width, height })
  await ready()
  check('resize ' + width + ': no API reload', listCalls().length === before)
}
const setSize = async (size) => {
  await panel().getByRole('combobox', { name: 'Số dòng mỗi trang', exact: true }).press('ArrowDown')
  await page
    .locator('.ant-select-dropdown:visible')
    .getByText(String(size), { exact: true })
    .last()
    .click()
  await page.locator('.ant-select-dropdown:visible').waitFor({ state: 'hidden' })
  await ready()
}
const selectFilter = async (name, value, wait = true) => {
  await page
    .locator('.stocktake-filters')
    .getByRole('combobox', { name, exact: true })
    .press('ArrowDown')
  await page
    .locator('.ant-select-dropdown:visible')
    .getByText(value, { exact: true })
    .last()
    .click()
  await page.locator('.ant-select-dropdown:visible').waitFor({ state: 'hidden' })
  if (wait) await ready()
}
const openEdit = async () => {
  await panel()
    .locator('.stocktake-actions')
    .first()
    .getByRole('button', { name: 'Thao tác', exact: true })
    .click()
  await page.getByRole('menuitem', { name: 'Nhập số đếm', exact: true }).click()
  await modal().waitFor()
  await page.waitForTimeout(180)
}
const closeModal = async () => {
  await modal()
    .locator('.stocktake-dialog__footer')
    .getByRole('button', { name: 'Hủy', exact: true })
    .click()
  await page.waitForTimeout(240)
}
const confirmBox = () => page.locator('.ant-modal-confirm:visible')
const confirmYes = async () => {
  await confirmBox().getByRole('button').last().click()
  await page.waitForTimeout(240)
}
const geometry = async (label, fit = true) => {
  const g = await page.evaluate(() => {
    const panel = document.querySelector('.stocktakes-page > .stocktake-table'),
      el = panel.querySelector('.ant-table-content')
    const rect = (x) => {
      const r = x.getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }
    }
    return {
      width: innerWidth,
      height: innerHeight,
      pageWidth: document.documentElement.scrollWidth,
      pageHeight: document.documentElement.scrollHeight,
      content: rect(el),
      footer: rect(panel.querySelector('.stocktake-table__footer')),
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      headers: [...panel.querySelectorAll('thead th')].map((x) => x.textContent.trim()),
      rows: [...panel.querySelectorAll('tbody tr[data-row-key]')].map(rect),
      scrollbars: [...panel.querySelectorAll('*')].filter(
        (x) =>
          x.scrollHeight > x.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(x).overflowY),
      ).length,
    }
  })
  measurements.push({ label, ...g })
  check(
    label + ': eight columns in order',
    g.headers.join('|') ===
      'Mã phiếu|Kho|ID người tạo|Người cập nhật|Thời gian cập nhật|Trạng thái|Thời gian tạo|Thao tác',
  )
  check(label + ': no page horizontal overflow', g.pageWidth <= g.width + 1)
  if (fit)
    check(
      label + ': page and footer fit',
      g.pageHeight <= g.height + 1 && g.footer.bottom <= g.height + 1,
    )
  check(label + ': one vertical table scroller', g.scrollbars <= 1)
  check(label + ': horizontal scrollbar directly above footer', g.content.bottom <= g.footer.y + 1)
  check(label + ': API rows retained', g.rows.length === Number(listCalls().at(-1).params.pageSize))
  check(
    label + ': UUID never increases row height',
    g.rows.every((r) => Math.abs(r.height - 64) < 1),
  )
  const fixed = await page.evaluate(() => {
    const el = document.querySelector('.stocktakes-page > .stocktake-table .ant-table-content')
    el.scrollTop = 180
    el.scrollLeft = 350
    return true
  })
  await page.waitForTimeout(80)
  const sticky = await page.evaluate(() => {
    const p = document.querySelector('.stocktakes-page > .stocktake-table'),
      el = p.querySelector('.ant-table-content')
    const th = p.querySelector('thead th:last-child').getBoundingClientRect(),
      td = p.querySelector('tbody tr[data-row-key] td:last-child').getBoundingClientRect(),
      r = el.getBoundingClientRect()
    return {
      top: th.top,
      contentTop: r.top,
      right: th.right,
      tdRight: td.right,
      contentRight: r.right - (el.offsetWidth - el.clientWidth),
      bg: getComputedStyle(p.querySelector('thead th:last-child')).backgroundColor,
    }
  })
  check(label + ': header fixed vertically', fixed && Math.abs(sticky.top - sticky.contentTop) <= 1)
  check(
    label + ': actions fixed on both axes',
    Math.abs(sticky.right - sticky.contentRight) <= 2 &&
      Math.abs(sticky.tdRight - sticky.contentRight) <= 2 &&
      sticky.bg !== 'rgba(0, 0, 0, 0)',
  )
  await content().evaluate((el) => {
    el.scrollTop = 0
    el.scrollLeft = 0
  })
}
try {
  await navigate()
  for (const width of [360, 390, 768, 1024, 1366, 1920]) {
    await resize(width)
    await geometry(String(width), width >= 768)
    await page.screenshot({ path: join(artifacts, 'list-' + width + '.png'), fullPage: true })
  }
  await resize(1366, 768)
  await geometry('1366x768')
  await resize(1920, 1080)
  await geometry('1920x1080')
  await resize(1093, 614)
  await geometry('125%-equivalent-CSS-viewport', false)
  await resize(1366)
  for (const size of [20, 50, 100, 10]) {
    await setSize(size)
    check(
      'page size ' + size,
      listCalls().at(-1).params.pageSize === String(size) && listCalls().at(-1).params.page === '1',
    )
    await geometry('size-' + size)
  }
  await panel().locator('.stocktake-code').first().hover()
  await page.getByRole('tooltip').filter({ hasText: receipt().code }).waitFor()
  check(
    'long code tooltip remains outside scroll clipping',
    (await page.getByRole('tooltip').filter({ hasText: receipt().code }).innerText()) ===
      receipt().code,
  )
  await page.mouse.move(10, 10)
  const userReads = calls.filter(
    (c) => c.path.startsWith('/users/') && c.path !== '/users/me/warehouses',
  )
  check('no per-row user lookups', userReads.length === 2)
  await panel().getByTitle('2', { exact: true }).click()
  await ready()
  check('server page two', listCalls().at(-1).params.page === '2')
  await content().evaluate((el) => (el.scrollTop = 220))
  await selectFilter('Trạng thái', 'Nháp')
  check(
    'status filter resets server page',
    listCalls().at(-1).params.page === '1' && listCalls().at(-1).params.status === 'DRAFT',
  )
  check('filter resets vertical scroll', await content().evaluate((el) => el.scrollTop === 0))
  await setSize(20)
  check('size retains status', listCalls().at(-1).params.status === 'DRAFT')
  const from = page.getByRole('textbox', { name: 'Từ ngày', exact: true })
  const to = page.getByRole('textbox', { name: 'Đến ngày (bao gồm)', exact: true })
  await from.click()
  await page.locator('.ant-picker-dropdown:visible').locator('[title="2026-10-12"]').click()
  await ready()
  await to.click()
  await page.locator('.ant-picker-dropdown:visible').locator('[title="2026-10-15"]').click()
  await ready()
  check(
    'calendar dates sent unchanged with existing status',
    listCalls().at(-1).params.from === '2026-10-12' &&
      listCalls().at(-1).params.to === '2026-10-15' &&
      listCalls().at(-1).params.status === 'DRAFT',
  )
  const beforeInvalidRange = listCalls().length
  await to.click()
  await page.locator('.ant-picker-dropdown:visible').locator('[title="2026-10-11"]').click()
  await ready()
  check(
    'invalid date range blocks API',
    listCalls().length === beforeInvalidRange &&
      (await page.locator('.stocktakes-page').innerText()).includes(
        'Khoảng thời gian không hợp lệ',
      ),
  )
  await page
    .locator('.stocktake-filters')
    .getByRole('button', { name: 'Đặt lại', exact: true })
    .click()
  await ready()
  check(
    'reset removes all filters',
    !listCalls().at(-1).params.status && !listCalls().at(-1).params.warehouseId,
  )
  scenario = 'race'
  await selectFilter('Trạng thái', 'Nháp', false)
  await selectFilter('Trạng thái', 'Đã xác nhận')
  await page.waitForTimeout(800)
  check(
    'late response cannot overwrite',
    (await panel().getByText('KẾT QUẢ MỚI', { exact: true }).count()) > 0,
  )
  scenario = 'normal'
  await page
    .locator('.stocktake-filters')
    .getByRole('button', { name: 'Đặt lại', exact: true })
    .click()
  await ready()
  detail = receipt()
  await openEdit()
  check(
    'all snapshot lines rendered without pagination',
    (await modal().locator('.stocktake-lines-form tbody tr[data-row-key]').count()) === 24,
  )
  const counts = () => modal().getByRole('textbox', { name: 'Thực tế', exact: true })
  check(
    'blank and zero remain distinct',
    (await counts().nth(1).inputValue()) === '' && (await counts().nth(2).inputValue()) === '0',
  )
  check(
    'large snapshot integer exact',
    (await modal().locator('.stocktake-lines-form').innerText()).includes(
      '9.223.372.036.854.775.807',
    ),
  )
  check(
    'differences have explicit signs',
    (await modal().locator('.stocktake-lines-form').innerText()).includes('+5') &&
      (await modal().locator('.stocktake-lines-form').innerText()).includes('-3'),
  )
  await counts().first().fill('99')
  for (const width of [360, 390, 768, 1024, 1366, 1920]) {
    await page.setViewportSize({ width, height: 900 })
    await page.waitForTimeout(100)
    check(
      'modal ' + width + ': input survives resize',
      (await counts().first().inputValue()) === '99',
    )
    const m = await modal().evaluate((el) => {
      const r = el.getBoundingClientRect(),
        f = el.querySelector('.stocktake-dialog__footer').getBoundingClientRect()
      return {
        left: r.left,
        right: r.right,
        bottom: f.bottom,
        width: innerWidth,
        height: innerHeight,
      }
    })
    check(
      'modal ' + width + ': fits and footer visible',
      m.left >= 0 && m.right <= m.width + 1 && m.bottom <= m.height + 1,
    )
    await page.screenshot({ path: join(artifacts, 'edit-' + width + '.png'), fullPage: true })
  }
  await page.setViewportSize({ width: 390, height: 400 })
  await modal()
    .locator('.stocktake-dialog__footer')
    .getByRole('button', { name: 'Hủy nháp', exact: true })
    .scrollIntoViewIfNeeded()
  const shortFooter = await modal()
    .locator('.stocktake-dialog__footer')
    .evaluate((el) => ({ bottom: el.getBoundingClientRect().bottom }))
  check(
    'short modal allows reaching footer without losing input',
    shortFooter.bottom <= 401 && (await counts().first().inputValue()) === '99',
  )
  await page.setViewportSize({ width: 1366, height: 900 })
  await counts().first().fill('9223372036854775807')
  await modal().getByRole('button', { name: 'Lưu', exact: true }).click()
  await page.waitForTimeout(250)
  check(
    'int64 save keeps raw JSON integer and version',
    /"countedQuantity":9223372036854775807/.test(writes().at(-1).raw) &&
      /"version":7/.test(writes().at(-1).raw),
  )
  await counts().first().fill('98')
  scenario = 'conflict'
  await modal().getByRole('button', { name: 'Lưu', exact: true }).click()
  await page.waitForTimeout(250)
  check(
    'conflict preserves input and blocks save',
    (await counts().first().inputValue()) === '98' &&
      (await modal().getByRole('button', { name: 'Lưu', exact: true }).isDisabled()),
  )
  await closeModal()
  await confirmYes()
  scenario = 'normal'
  await page.getByRole('button', { name: 'Tạo phiếu kiểm kê', exact: true }).click()
  await modal().waitFor()
  await modal().getByRole('button', { name: 'Chọn sản phẩm', exact: true }).first().click()
  await modal()
    .getByRole('textbox', { name: 'Ghi chú', exact: true })
    .fill('Tạo từ dữ liệu giả lập')
  await modal().getByRole('button', { name: 'Lưu', exact: true }).click()
  await page.waitForTimeout(250)
  check(
    'create payload retains only product IDs and note',
    writes().at(-1).path === '/stocktakes' &&
      writes().at(-1).raw ===
        '{"warehouseId":"w1","note":"Tạo từ dữ liệu giả lập","lines":[{"productId":"pick0"}]}',
  )
  check(
    'new stocktake uses response snapshot and blank count',
    (await counts().first().inputValue()) === '',
  )
  await counts().first().fill('0')
  await modal().getByRole('textbox', { name: 'Lý do', exact: true }).fill('Kiểm thử số không')
  await modal().getByRole('button', { name: 'Lưu', exact: true }).click()
  await page.waitForTimeout(250)
  const beforeConfirm = writes().length
  await modal().getByRole('button', { name: 'Xác nhận kiểm kê', exact: true }).click()
  await confirmBox().waitFor()
  check('confirm waits for explicit confirmation', writes().length === beforeConfirm)
  await confirmYes()
  check(
    'confirmed stocktake locks editing',
    (await counts().count()) === 0 && (await modal().innerText()).includes('Đã xác nhận'),
  )
  await closeModal()
  detail = receipt()
  await openEdit()
  await modal().getByRole('button', { name: 'Lấy lại tồn hệ thống', exact: true }).click()
  await confirmBox().waitFor()
  const refreshWrites = writes().length
  await confirmBox().getByRole('button').first().click()
  await page.waitForTimeout(150)
  check(
    'refresh cancel keeps snapshot without API',
    writes().length === refreshWrites && (await counts().first().inputValue()) === '97',
  )
  await modal().getByRole('button', { name: 'Lấy lại tồn hệ thống', exact: true }).click()
  await confirmYes()
  check(
    'refresh adopts server snapshot and clears counts',
    (await counts().first().inputValue()) === '' &&
      (await modal().locator('.stocktake-lines-form').innerText()).includes('101'),
  )
  await modal()
    .getByRole('textbox', {
      name: 'Lý do hủy bắt buộc, không để trắng, tối đa 2000 ký tự.',
      exact: true,
    })
    .fill('Hủy dữ liệu giả lập')
  await modal().getByRole('button', { name: 'Hủy nháp', exact: true }).click()
  await confirmYes()
  check(
    'draft cancelled with reason',
    detail.status === 'CANCELLED' && detail.cancellationReason === 'Hủy dữ liệu giả lập',
  )
  await closeModal()
  for (const value of ['empty', 'few']) {
    scenario = value
    await panel().getByRole('button', { name: 'Tải lại', exact: true }).click()
    await ready()
    check(
      value + ': API total displayed',
      (await panel().innerText()).includes(value === 'empty' ? '0 phiếu' : '2 phiếu'),
    )
    if (value === 'few')
      check(
        'missing optional fields use dash',
        (await panel().locator('tbody tr[data-row-key]').nth(1).innerText()).includes('—'),
      )
  }
  scenario = 'normal'
  permissions = ['STOCKTAKE_VIEW']
  await navigate()
  check(
    'view only hides create and secondary actions',
    (await page.getByRole('button', { name: 'Tạo phiếu kiểm kê', exact: true }).count()) === 0 &&
      (await panel().getByRole('button', { name: 'Thao tác', exact: true }).count()) === 0,
  )
  permissions = ['STOCKTAKE_CREATE', 'INVENTORY_VIEW']
  await page.reload()
  await page.locator('.stocktakes-page').waitFor()
  check(
    'create only has no list API',
    (await page.getByRole('button', { name: 'Tạo phiếu kiểm kê', exact: true }).count()) === 1 &&
      (await panel().count()) === 0,
  )
  permissions = []
  admin = true
  await navigate()
  check(
    'existing admin exception retained',
    (await page.getByRole('button', { name: 'Tạo phiếu kiểm kê', exact: true }).count()) === 1,
  )
  admin = false
  permissions = [...allPermissions]
  assigned = ['w2']
  await navigate()
  check('warehouse scope stays assigned', listCalls().at(-1).params.warehouseId === undefined)
  await selectFilter('Kho', 'K2 - Kho thứ hai')
  check(
    'assigned warehouse filter uses existing ID',
    listCalls().at(-1).params.warehouseId === 'w2',
  )
  detail = receipt()
  scenario = 'access-denied'
  await panel().getByRole('button', { name: 'Chi tiết kiểm kê', exact: true }).first().click()
  await modal().waitFor()
  await page.waitForTimeout(300)
  check(
    'warehouse revocation clears detail and editable data',
    (await modal().locator('.stocktake-lines-form').count()) === 0 && assigned.length === 0,
  )
  await closeModal()
  assigned = ['w2']
  scenario = 'forbidden'
  await navigate()
  check(
    '403 clears list and shows error',
    (await panel().locator('tbody tr[data-row-key]').count()) === 0 &&
      (await page.locator('.stocktakes-page > .ant-alert-error').count()) > 0,
  )
  scenario = 'normal'
  await navigate()
  scenario = 'unauthorized'
  await panel().getByRole('button', { name: 'Tải lại', exact: true }).click()
  await page.waitForURL(/\/login/)
  check('401 follows existing session-expiry flow', new URL(page.url()).pathname === '/login')
  check('no unexpected API calls', unexpected.length === 0)
  check('no browser errors', errors.length === 0)
  console.log(
    JSON.stringify({ checks: checks.length, artifacts, measurements: measurements.length }),
  )
} catch (error) {
  await page.screenshot({ path: join(artifacts, 'failure.png'), fullPage: true })
  console.error(error)
  console.error(
    JSON.stringify({
      recentCalls: calls
        .slice(-5)
        .map((c) => ({ path: c.path, method: c.method, params: c.params })),
      errors,
      unexpected,
    }),
  )
  process.exitCode = 1
} finally {
  await writeFile(
    join(artifacts, 'results.json'),
    JSON.stringify({ checks, measurements, errors, unexpected }, null, 2),
  )
  await browser.close()
}
