// Browser-only API fixtures. No real backend reads or mutations.
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
  localStorage.setItem('frontend-base:access-token', 'sidebar-test'),
)
const base = process.env.SIDEBAR_TEST_URL || 'http://127.0.0.1:5173'
const artifacts = 'docs/sidebar-artifacts'
await mkdir(artifacts, { recursive: true })
const allPermissions = [
  ...(await readFile('src/constants/permissions.ts', 'utf8')).matchAll(/'([A-Z][A-Z_]+)'/g),
].map((match) => match[1])
let permissions = [...allPermissions],
  admin = false
const errors = [],
  checks = [],
  measurements = [],
  calls = []
await context.route('**/api/**', async (route) => {
  const url = new URL(route.request().url())
  if (!url.pathname.startsWith('/api/')) return route.continue()
  const path = url.pathname.replace(/^\/api/, '')
  assert.equal(route.request().method(), 'GET', 'Sidebar test never mutates backend')
  calls.push(path)
  const reply = (data) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
  if (path === '/auth/me')
    return reply({
      id: 'sidebar-user',
      username: 'sidebar-test',
      fullName: 'Kiểm tra Sidebar',
      permissions,
    })
  if (path === '/users/sidebar-user') return reply({ id: 'sidebar-user', status: 1 })
  if (path === '/users/sidebar-user/roles')
    return reply(admin ? [{ code: 'ADMIN', status: 1 }] : [])
  if (path === '/users/me/warehouses')
    return reply([{ id: 'w1', code: 'K1', name: 'Kho kiểm thử', status: 1 }])
  return reply({
    items: [],
    total: 0,
    page: Number(url.searchParams.get('page') || 1),
    pageSize: Number(url.searchParams.get('pageSize') || 10),
    summary: {},
  })
})
const page = await context.newPage()
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (/Failed to resolve component|Unhandled|does not provide an export/.test(message.text()))
    errors.push(message.text())
})
const sidebar = page.locator('#app-sidebar')
const nav = sidebar.locator('.sidebar-menu-scroll')
const root = sidebar.locator('.ant-menu-root')
const check = (name, value) => {
  assert.ok(value, name)
  checks.push(name)
}
const ready = async () => {
  await nav.waitFor()
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(450)
}
const openGroups = async () => {
  const titles = sidebar.locator('.ant-menu-submenu-title')
  for (let index = 0; index < (await titles.count()); index++) {
    if ((await titles.nth(index).getAttribute('aria-expanded')) !== 'true')
      await titles.nth(index).click()
  }
  await page.waitForTimeout(350)
}
const geometry = async (label) => {
  const value = await sidebar.evaluate((element) => {
    const scroll = element.querySelector('.sidebar-menu-scroll'),
      brand = element.querySelector('.sidebar-brand'),
      footer = element.querySelector('.sidebar-footer')
    const rect = (node) => {
      const value = node.getBoundingClientRect()
      return {
        x: value.x,
        y: value.y,
        width: value.width,
        height: value.height,
        bottom: value.bottom,
      }
    }
    const scrollables = [...element.querySelectorAll('*')].filter(
      (child) =>
        /auto|scroll/.test(getComputedStyle(child).overflowY) &&
        child.scrollHeight > child.clientHeight + 1,
    )
    const rows = [...element.querySelectorAll('.ant-menu-item, .ant-menu-submenu-title')].filter(
      (item) => item.getBoundingClientRect().height > 0,
    )
    return {
      sidebar: rect(element),
      nav: rect(scroll),
      brand: rect(brand),
      footer: rect(footer),
      scrollables: scrollables.map((child) => child.className),
      rows: rows.map((row) => row.getBoundingClientRect().height),
      bodyHeight: document.documentElement.scrollHeight,
      width: innerWidth,
      height: innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      content: rect(document.querySelector('.admin-layout__main')),
      header: rect(document.querySelector('.app-header')),
      thumbWidth: getComputedStyle(scroll, '::-webkit-scrollbar').width,
      buttonDisplay: getComputedStyle(scroll, '::-webkit-scrollbar-button').display,
    }
  })
  measurements.push({ label, ...value })
  check(
    `${label}: sidebar is 256px and viewport high`,
    Math.abs(value.sidebar.width - 256) < 1 && Math.abs(value.sidebar.height - value.height) < 1,
  )
  check(
    `${label}: brand/footer fixed outside one scroll region`,
    value.scrollables.length === 1 &&
      value.scrollables[0].includes('sidebar-menu-scroll') &&
      value.brand.bottom <= value.nav.y + 1 &&
      value.nav.bottom <= value.footer.y + 1,
  )
  check(
    `${label}: rows are 42px and content stays in bounds`,
    value.rows.every((height) => Math.abs(height - 42) < 1) &&
      value.scrollWidth <= value.width + 1 &&
      value.bodyHeight <= value.height + 1 &&
      Math.abs(value.content.x - 256) < 1,
  )
  check(
    `${label}: scrollbar is 6px with no arrows`,
    value.thumbWidth === '6px' && value.buttonDisplay === 'none',
  )
}
try {
  await page.goto(base + '/catalog/products')
  await ready()
  check(
    'Unrelated groups start closed to reduce menu length',
    (await sidebar.locator('.ant-menu-submenu-open').count()) === 0,
  )
  check(
    'Current selected product is revealed automatically',
    await sidebar.locator('.ant-menu-item-selected').evaluate((item) => {
      const row = item.getBoundingClientRect(),
        scroll = item.closest('nav').getBoundingClientRect()
      return row.top >= scroll.top && row.bottom <= scroll.bottom
    }),
  )
  await openGroups()
  await geometry('1366x768')
  const before = await sidebar.locator('.sidebar-brand').boundingBox()
  await nav.evaluate((element) => {
    element.scrollTop = 0
  })
  await page.mouse.move(180, 350)
  await page.mouse.wheel(0, 2500)
  await page.waitForTimeout(200)
  const last = sidebar.locator('.ant-menu-item').last()
  check(
    'Wheel reaches the final menu item without moving the document',
    await last.evaluate((item) => {
      const row = item.getBoundingClientRect(),
        scroll = item.closest('nav').getBoundingClientRect()
      return row.top >= scroll.top && row.bottom <= scroll.bottom && window.scrollY === 0
    }),
  )
  check(
    'Logo stays fixed while scrolling menus',
    Math.abs((await sidebar.locator('.sidebar-brand').boundingBox()).y - before.y) < 1,
  )
  const bright = await nav.evaluate(
    (element) => getComputedStyle(element, '::-webkit-scrollbar-thumb').backgroundColor,
  )
  await page.mouse.move(1000, 100)
  await page.evaluate(() => document.activeElement?.blur())
  const quiet = await nav.evaluate(
    (element) => getComputedStyle(element, '::-webkit-scrollbar-thumb').backgroundColor,
  )
  await nav.focus()
  check(
    'Thumb becomes clearer on hover/focus',
    bright !== quiet &&
      (await nav.evaluate(
        (element) => getComputedStyle(element, '::-webkit-scrollbar-thumb').backgroundColor,
      )) === bright,
  )
  await nav.evaluate((element) => {
    element.scrollTop = 0
  })
  await nav.press('PageDown')
  await page.waitForTimeout(150)
  check(
    'Keyboard scroll works in the menu region',
    await nav.evaluate((element) => element.scrollTop > 0),
  )
  await nav.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  const labels = await sidebar
    .locator('.sidebar-label')
    .evaluateAll((items) =>
      items
        .filter((item) => item.getBoundingClientRect().height > 0)
        .map((item) => ({ text: item.textContent.trim(), title: item.getAttribute('title') })),
    )
  check(
    'Every expanded label has its full text tooltip',
    labels.length > 20 && labels.every((item) => item.title === item.text),
  )
  await page.evaluate(() => document.activeElement?.blur())
  await page.screenshot({ path: artifacts + '/desktop-1366.png', fullPage: true })
  // The same menu stays accessible at low heights and at a CSS viewport equivalent to 125% zoom.
  for (const [width, height, label] of [
    [1366, 500, 'low-500'],
    [1093, 614, 'zoom-125'],
    [1920, 1080, 'desktop-1920'],
  ]) {
    await page.setViewportSize({ width, height })
    await ready()
    await openGroups()
    await geometry(label)
    await nav.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    check(
      `${label}: last item is reachable`,
      await last.evaluate(
        (item) =>
          item.getBoundingClientRect().bottom <=
          item.closest('nav').getBoundingClientRect().bottom + 1,
      ),
    )
    await page.screenshot({ path: artifacts + `/${label}.png`, fullPage: true })
  }
  await page.setViewportSize({ width: 1366, height: 768 })
  await ready()
  await sidebar.locator('.sidebar-footer button').click()
  await page.waitForTimeout(450)
  check(
    'Collapse keeps 80px rail and layout adjusts through Sider',
    await sidebar.evaluate(
      (element) =>
        Math.abs(element.getBoundingClientRect().width - 80) < 1 &&
        Math.abs(document.querySelector('.admin-layout__main').getBoundingClientRect().x - 80) <
          1 &&
        document.documentElement.scrollWidth <= innerWidth,
    ),
  )
  await page.screenshot({ path: artifacts + '/collapsed.png', fullPage: true })
  const collapsedGroup = sidebar.locator('.ant-menu-submenu-title').last()
  await collapsedGroup.hover()
  await page.waitForTimeout(400)
  check(
    'Collapsed group still opens its accessible popup',
    (await page.locator('.ant-menu-submenu-popup:visible').count()) > 0,
  )
  await page.mouse.move(1000, 100)
  await sidebar.locator('.sidebar-footer button').click()
  await page.waitForTimeout(450)
  await openGroups()
  const role = sidebar
    .locator('.ant-menu-item')
    .filter({ has: page.locator('.sidebar-label').getByText('Vai trò', { exact: true }) })
  await role.click()
  await page.waitForURL('**/system/role')
  await ready()
  check(
    'Navigation selects actual route and opens its parent group',
    (await sidebar.locator('.ant-menu-item-selected .sidebar-label').innerText()) === 'Vai trò' &&
      (await sidebar
        .locator('.ant-menu-submenu-selected')
        .getAttribute('class')
        .then((value) => value.includes('ant-menu-submenu-open'))),
  )
  const selectedGroup = sidebar.locator('.ant-menu-submenu-selected > .ant-menu-submenu-title')
  await selectedGroup.click()
  await page.waitForTimeout(350)
  check(
    'User can close a menu group',
    await sidebar
      .locator('.ant-menu-submenu-selected')
      .getAttribute('class')
      .then((value) => !value.includes('ant-menu-submenu-open')),
  )
  await selectedGroup.click()
  await page.waitForTimeout(350)
  check(
    'User can reopen a menu group',
    (await selectedGroup.getAttribute('aria-expanded')) === 'true',
  )
  await page.reload()
  await ready()
  check(
    'Direct route load opens its parent and reveals selected child',
    (await sidebar
      .locator('.ant-menu-submenu-selected > .ant-menu-submenu-title')
      .getAttribute('aria-expanded')) === 'true' &&
      (await sidebar.locator('.ant-menu-item-selected').evaluate((item) => {
        const row = item.getBoundingClientRect(),
          scroll = item.closest('nav').getBoundingClientRect()
        return row.top >= scroll.top && row.bottom <= scroll.bottom
      })),
  )
  // A tall content page may scroll itself, but the sidebar neither grows nor adds a second scrollbar.
  await page.evaluate(() => {
    const spacer = document.createElement('div')
    spacer.id = 'sidebar-test-spacer'
    spacer.style.height = '1800px'
    document.querySelector('.admin-layout__content').append(spacer)
    window.scrollTo(0, 700)
  })
  check(
    'On long content, sticky sidebar retains the viewport height',
    await sidebar.evaluate(
      (element) =>
        element.getBoundingClientRect().y === 0 &&
        element.getBoundingClientRect().height === innerHeight,
    ),
  )
  await page.evaluate(() => {
    document.getElementById('sidebar-test-spacer').remove()
    window.scrollTo(0, 0)
  })
  await page.goto(base + '/catalog/products')
  await ready()
  // Header markup remains untouched and its original toggle stays connected to the same store.
  await page
    .locator('.app-header')
    .getByRole('button', { name: 'Thu gọn thanh bên', exact: true })
    .click()
  await page.waitForTimeout(400)
  check(
    'Existing header toggle still controls the sidebar',
    await sidebar.evaluate((element) => element.getBoundingClientRect().width === 80),
  )
  await page
    .locator('.app-header')
    .getByRole('button', { name: 'Mở rộng thanh bên', exact: true })
    .click()
  await page.waitForTimeout(400)
  permissions = ['PRODUCT_VIEW']
  await page.reload()
  await ready()
  check(
    'Restricted user sees only the existing permitted menu',
    (await root.locator('.ant-menu-item').count()) === 1 &&
      (await root.locator('.sidebar-label').innerText()) === 'Sản phẩm' &&
      (await root.locator('.ant-menu-submenu').count()) === 0,
  )
  permissions = ['PRODUCT_CREATE']
  await page.reload()
  await ready()
  check(
    'Create-only catalog menu access is preserved',
    (await root.locator('.sidebar-label').innerText()) === 'Sản phẩm',
  )
  permissions = []
  admin = true
  await page.reload()
  await ready()
  check(
    'Verified ADMIN retains catalog menus without granting system permissions',
    (await root.locator('.ant-menu-item').count()) > 5 &&
      (await root.locator('.sidebar-label').getByText('Sản phẩm', { exact: true }).count()) === 1 &&
      (await root.locator('.sidebar-label').getByText('Vai trò', { exact: true }).count()) === 0,
  )
  permissions = [...allPermissions]
  admin = false
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await page.locator('.app-header').waitFor()
  await page.waitForTimeout(450)
  check('Mobile starts with sidebar closed', !(await sidebar.isVisible()))
  await page
    .locator('.app-header')
    .getByRole('button', { name: 'Mở rộng thanh bên', exact: true })
    .click()
  await ready()
  check(
    'Mobile opens an overlay without moving content',
    await sidebar.evaluate(
      (element) =>
        element.getBoundingClientRect().width === 256 &&
        document.querySelector('.admin-layout__main').getBoundingClientRect().x === 0 &&
        document.documentElement.scrollWidth <= innerWidth,
    ),
  )
  await page.screenshot({ path: artifacts + '/mobile.png', fullPage: true })
  await sidebar.locator('.sidebar-close').click()
  check('Mobile sidebar close remains usable', !(await sidebar.isVisible()))
  check('No application/component errors', errors.length === 0)
  await writeFile(
    artifacts + '/browser-results.json',
    JSON.stringify({ passed: checks.length, checks, measurements, errors }, null, 2),
  )
  console.log(JSON.stringify({ passed: checks.length, checks, errors }, null, 2))
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
