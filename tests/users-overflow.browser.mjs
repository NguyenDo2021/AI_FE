// API fixtures only. Inspects layout ancestors and browser geometry before/after fixes.
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
  viewport: { width: 320, height: 740 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
  reducedMotion: 'reduce',
})
await context.addInitScript(() =>
  localStorage.setItem('frontend-base:access-token', 'users-overflow-fixture'),
)
const directory = 'docs/users-overflow-artifacts'
await mkdir(directory, { recursive: true })
const baseline = process.argv.includes('--baseline')
const calls = [],
  measurements = [],
  checks = [],
  errors = []
let listTotal = 237
const user = (i) => ({
  id: `user-${i}`,
  username: i === 0 ? 'username'.repeat(20) : `user_${i}`,
  fullName: i === 0 ? 'Họ tên dài cần xuống dòng '.repeat(15) : `Người dùng ${i}`,
  email: 'emailkhongdaucach'.repeat(30) + '@example.com',
  phone: null,
  status: i % 2 ? 0 : 1,
})
await context.route('**/api/**', async (route) => {
  const req = route.request(),
    url = new URL(req.url())
  if (!url.pathname.startsWith('/api/')) return route.continue()
  const path = url.pathname.slice(4),
    params = Object.fromEntries(url.searchParams)
  calls.push({ path, method: req.method(), params })
  const reply = (data) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
  if (path === '/auth/me')
    return reply({
      ...user(10),
      id: 'operator',
      fullName: 'Kiểm tra overflow',
      permissions: [
        'USER_VIEW',
        'USER_CREATE',
        'USER_UPDATE',
        'USER_DELETE',
        'USER_WAREHOUSE_VIEW',
        'USER_WAREHOUSE_ASSIGN',
      ],
    })
  if (path === '/users/operator') return reply({ status: 1 })
  if (path === '/users/operator/roles' || path === '/users/me/warehouses') return reply([])
  if (path === '/users')
    return reply({
      items: Array.from({ length: Number(params.pageSize) }, (_, i) => user(i)),
      total: listTotal,
      page: Number(params.page),
      pageSize: Number(params.pageSize),
    })
  if (/^\/users\/user-/.test(path)) return reply(user(0))
  return reply([])
})
const page = await context.newPage()
page.setDefaultTimeout(10000)
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (msg) => {
  if (/Unhandled|Failed to resolve component/.test(msg.text())) errors.push(msg.text())
})
const check = (name, value) => {
  assert.ok(value, name)
  checks.push(name)
}
const ready = async () => {
  await page.locator('.user-page').waitFor()
  await page.waitForFunction(
    () => document.querySelector('.products-table-region')?.getAttribute('aria-busy') === 'false',
  )
  await page.waitForTimeout(200)
}
const modal = () => page.locator('.ant-modal:visible')
const detail = () => page.locator('.ant-drawer-content:visible')
const action = (name) =>
  page.locator('.user-page__actions').first().getByRole('button', { name, exact: true })
const inspect = async (label) => {
  const result = await page.evaluate(() => {
    const rect = (el) => el.getBoundingClientRect().toJSON()
    const visible = (el) =>
      el.getClientRects().length > 0 &&
      rect(el).width > 0 &&
      rect(el).height > 0 &&
      getComputedStyle(el).visibility !== 'hidden'
    const info = (el) => {
      const s = getComputedStyle(el)
      return {
        cls: el.className,
        tag: el.tagName,
        rect: rect(el),
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
        clientHeight: el.clientHeight,
        scrollHeight: el.scrollHeight,
        style: {
          width: s.width,
          minWidth: s.minWidth,
          maxWidth: s.maxWidth,
          margin: s.margin,
          padding: s.padding,
          boxSizing: s.boxSizing,
          display: s.display,
          gridTemplateColumns: s.gridTemplateColumns,
          overflowX: s.overflowX,
          overflowY: s.overflowY,
          transform: s.transform,
          left: s.left,
          right: s.right,
        },
      }
    }
    const selectors = [
      'html',
      'body',
      '#app',
      '#app > .ant-spin-nested-loading',
      '#app > .ant-spin-nested-loading > .ant-spin-container',
      '.admin-layout',
      '.admin-layout__main',
      '.admin-layout__content',
      '.user-page',
      '.user-page__heading',
      '.user-page__filter-panel',
      '.user-page__filters',
      '.user-list',
      '.products-table-region',
      '.ant-table-wrapper',
      '.ant-table-container',
      '.ant-table-header',
      '.ant-table-body',
      '.products-footer',
      '.list-pagination-controls',
      '.ant-modal-root',
      '.ant-modal-wrap',
      '.ant-modal',
      '.ant-modal-content',
      '.ant-modal-header',
      '.ant-modal-body',
      '.ant-modal-footer',
      '.form-heading',
      '.user-form-body',
      '.user-form',
      '.form-footer',
      '.ant-drawer-content-wrapper',
      '.ant-drawer-content',
      '.ant-drawer-body',
      '.ant-drawer-header',
      '.ant-drawer-footer',
    ]
    const chain = selectors.flatMap((selector) =>
      [...document.querySelectorAll(selector)]
        .filter(visible)
        .map((el) => ({ selector, ...info(el) })),
    )
    const outside = [...document.querySelectorAll('body *')]
      .filter(
        (el) =>
          visible(el) &&
          !el.closest(
            '.ant-table-header,.ant-table-body,.ant-tooltip,.ant-select-dropdown,.ant-layout-sider-collapsed',
          ) &&
          (rect(el).left < -1 || rect(el).right > innerWidth + 1),
      )
      .map(info)
    const scrollers = [...document.querySelectorAll('.user-page *')]
      .filter(
        (el) =>
          visible(el) &&
          el.scrollWidth > el.clientWidth + 1 &&
          /auto|scroll/.test(getComputedStyle(el).overflowX),
      )
      .map(info)
    const overlay = document.querySelector('.ant-modal-wrap .ant-modal')?.getClientRects().length
      ? document.querySelector('.ant-modal')
      : document.querySelector('.ant-drawer-open .ant-drawer-content')
    const overlayOverflow = overlay
      ? [overlay, ...overlay.querySelectorAll('*')]
          .filter(
            (el) =>
              visible(el) &&
              !el.matches('input,textarea') &&
              el.clientWidth > 0 &&
              el.scrollWidth > el.clientWidth + 1,
          )
          .map(info)
      : []
    const overlayScrollers = overlay
      ? [...overlay.querySelectorAll('*')]
          .filter(
            (el) =>
              visible(el) &&
              !el.matches('input,textarea') &&
              /auto|scroll/.test(getComputedStyle(el).overflowY) &&
              el.scrollHeight > el.clientHeight + 1,
          )
          .map((el) => el.className)
      : []
    const anchors = ['.user-page__heading', '.user-page__filter-panel', '.products-footer'].map(
      (selector) => ({ selector, rect: rect(document.querySelector(selector)) }),
    )
    const popups = [...document.querySelectorAll('.ant-tooltip,.ant-select-dropdown')]
      .filter(visible)
      .map(info)
    return {
      width: innerWidth,
      height: innerHeight,
      visualViewport: {
        width: visualViewport.width,
        height: visualViewport.height,
        scale: visualViewport.scale,
        offsetLeft: visualViewport.offsetLeft,
        offsetTop: visualViewport.offsetTop,
      },
      scrollX,
      scrollY,
      html: info(document.documentElement),
      body: info(document.body),
      chain,
      outside,
      scrollers,
      overlayOverflow,
      overlayScrollers,
      anchors,
      popups,
    }
  })
  measurements.push({ label, ...result })
  console.log(
    JSON.stringify({
      label,
      width: result.width,
      docWidth: result.html.scrollWidth,
      scrollX: result.scrollX,
      outside: result.outside.slice(0, 5).map((x) => ({ cls: x.cls, rect: x.rect })),
      overlayOverflow: result.overlayOverflow.map((x) => ({
        cls: x.cls,
        client: x.clientWidth,
        scroll: x.scrollWidth,
      })),
      scrollers: result.scrollers.map((x) => x.cls),
    }),
  )
  if (!baseline && !process.argv.includes('--probe')) {
    check(
      `${label}: document has no horizontal overflow or offset`,
      result.html.scrollWidth <= result.html.clientWidth + 1 && Math.abs(result.scrollX) < 1,
    )
    check(`${label}: chrome and overlays stay within viewport`, result.outside.length === 0)
    check(
      `${label}: only table body scrolls horizontally`,
      result.scrollers.length === 1 && result.scrollers[0].cls.includes('ant-table-body'),
    )
    check(`${label}: overlay has no horizontal overflow`, result.overlayOverflow.length === 0)
    check(
      `${label}: tooltips and dropdowns fit horizontally`,
      result.popups.every(
        (popup) => popup.rect.left >= -1 && popup.rect.right <= result.html.clientWidth + 1,
      ),
    )
    check(
      `${label}: at most one overlay body scrolls vertically`,
      result.overlayScrollers.length <= 1,
    )
    const footer = result.chain.find((el) =>
      ['.ant-modal-footer', '.ant-drawer-footer'].includes(el.selector),
    )
    if (footer)
      check(
        `${label}: overlay footer stays accessible`,
        footer.rect.bottom <= result.visualViewport.height + result.visualViewport.offsetTop + 1,
      )
    const wrap = result.chain.find((el) => el.selector === '.ant-modal-wrap')
    if (wrap)
      check(
        `${label}: modal wrapper does not add nested scrolling`,
        wrap.scrollHeight <= wrap.clientHeight + 1,
      )
    if (label.startsWith('after '))
      check(
        `${label}: background scroll lock released`,
        result.body.style.overflowY !== 'hidden' && result.visualViewport.offsetLeft === 0,
      )
  }
  return result
}
try {
  await page.goto('http://127.0.0.1:5173/system/user')
  await ready()
  if (process.argv.includes('--probe')) {
    await page.evaluate(() => {
      document.body.style.zoom = '1.25'
    })
    for (const rule of ['320px', 'min(320px, 100%)', '0px']) {
      await page.evaluate((rule) => {
        document.body.style.minWidth = rule
      }, rule)
      await page.waitForTimeout(200)
      await inspect(`zoom minimum ${rule}`)
    }
    await writeFile(`${directory}/probe.json`, JSON.stringify({ measurements }, null, 2))
    await page.getByRole('button', { name: 'Thêm người dùng', exact: true }).click()
    await page.waitForTimeout(500)
    console.log(
      await modal().evaluate((el) => ({
        attributes: el.getAttributeNames(),
        html: el.outerHTML.slice(0, 500),
      })),
    )
  } else {
    for (const width of process.argv.includes('--zoom-only')
      ? []
      : [320, 375, 390, 414, 768, 1440]) {
      await page.setViewportSize({ width, height: 740 })
      await page.waitForFunction(() => {
        const sidebarWidth = document.querySelector('.app-sidebar').getBoundingClientRect().width
        return matchMedia('(max-width: 767px)').matches ? sidebarWidth < 1 : sidebarWidth >= 80
      })
      await page.waitForTimeout(400)
      const initial = await inspect(`list ${width}`)
      if (!baseline)
        check(
          `${width}: mobile filter collapsed by default`,
          width >= 768 || !(await page.locator('#user-keyword').isVisible()),
        )
      if (width < 768) {
        await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click()
        await inspect(`filters expanded ${width}`)
      }
      for (const fraction of [0, 0.5, 1]) {
        await page.locator('.ant-table-body').evaluate((el, fraction) => {
          el.scrollLeft = el.scrollWidth * fraction
        }, fraction)
        await page.waitForTimeout(100)
        const moved = await inspect(`table ${fraction} ${width}`)
        if (!baseline)
          check(
            `${width} scroll ${fraction}: heading filters pagination do not move horizontally`,
            moved.anchors.every(
              (anchor, index) => Math.abs(anchor.rect.left - initial.anchors[index].rect.left) < 1,
            ),
          )
      }
      if (!baseline && width === 320) {
        await page.locator('.ant-table-body').evaluate((el) => {
          el.scrollLeft = 0
        })
        const bodyRect = await page.locator('.ant-table-body').boundingBox()
        const session = await context.newCDPSession(page)
        const startX = bodyRect.x + bodyRect.width * 0.75,
          touchY = Math.min(bodyRect.y + 30, 700)
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x: startX, y: touchY }],
        })
        for (let step = 1; step <= 6; step++) {
          await session.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ x: startX - step * 24, y: touchY }],
          })
          await page.waitForTimeout(25)
        }
        await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
        await page.waitForTimeout(300)
        await session.detach()
        const swiped = await inspect('touch swipe table 320')
        check(
          'real touch swipe scrolls table without moving heading/filter/pagination',
          (await page.locator('.ant-table-body').evaluate((el) => el.scrollLeft > 0)) &&
            swiped.anchors.every(
              (anchor, index) => Math.abs(anchor.rect.left - initial.anchors[index].rect.left) < 1,
            ),
        )
      }
      for (const type of ['create', 'edit', 'detail']) {
        if (type === 'create')
          await page.getByRole('button', { name: 'Thêm người dùng', exact: true }).click()
        else await action(type === 'edit' ? 'Chỉnh sửa' : 'Chi tiết').click()
        await page.waitForTimeout(500)
        await inspect(`${type} ${width}`)
        if (!baseline && [320, 390].includes(width))
          await page.screenshot({
            path: `${directory}/${type}-${width}.png`,
            animations: 'disabled',
          })
        if (type === 'create') {
          await modal().getByRole('button', { name: 'Lưu', exact: true }).click()
          await page.waitForTimeout(100)
          await inspect(`validation ${width}`)
          await modal().locator('.ant-select').click()
          await page.waitForTimeout(300)
          await inspect(`dropdown ${width}`)
          await page
            .locator('.ant-select-dropdown:visible')
            .getByText('Ngừng hoạt động', { exact: true })
            .click()
          await page.waitForTimeout(400)
        }
        if (type === 'detail') await detail().locator('.ant-drawer-footer button').click()
        else await modal().getByRole('button', { name: 'Hủy', exact: true }).click()
        await page.waitForTimeout(450)
        await inspect(`after ${type} ${width}`)
      }
      if (width < 768) await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click()
    }
    await page.setViewportSize({ width: 320, height: 740 })
    listTotal = 123456789
    await page.locator('.user-list .products-toolbar button').evaluate((el) => el.click())
    await ready()
    await inspect('huge total 320')
    await page.setViewportSize({ width: 320, height: 320 })
    await page.getByRole('button', { name: 'Thêm người dùng', exact: true }).click()
    await page.waitForTimeout(500)
    await inspect('short create 320')
    await modal().getByLabel('Email', { exact: true }).focus()
    await inspect('short focused input 320')
    await modal().getByRole('button', { name: 'Hủy', exact: true }).click()
    await page.waitForTimeout(450)
    if (!baseline) {
      await page.setViewportSize({ width: 390, height: 740 })
      await page.getByRole('button', { name: 'Thêm người dùng', exact: true }).click()
      await page.waitForTimeout(500)
      await modal().getByLabel('Email', { exact: true }).focus()
      await page.evaluate(() => {
        Object.defineProperty(window.visualViewport, 'height', {
          configurable: true,
          get: () => 340,
        })
        window.visualViewport.dispatchEvent(new Event('resize'))
      })
      await page.waitForTimeout(250)
      await inspect('visual viewport keyboard simulation 390x340')
      await page.evaluate(() => {
        delete window.visualViewport.height
        window.visualViewport.dispatchEvent(new Event('resize'))
      })
      await page.waitForTimeout(250)
      await modal().getByRole('button', { name: 'Hủy', exact: true }).click()
      await page.waitForTimeout(450)
    }
    await page.setViewportSize({ width: 320, height: 740 })
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '24px'
      document.body.style.zoom = '1.25'
    })
    await inspect('zoom 125 percent 320')
    await page.getByRole('button', { name: 'Thêm người dùng', exact: true }).click()
    await page.waitForTimeout(500)
    await inspect('zoom create 125 percent 320')
    if (!baseline) {
      await modal().getByRole('button', { name: 'Hủy', exact: true }).click()
      await page.waitForTimeout(450)
      for (const zoom of [1.25, 1.5]) {
        await page.evaluate((zoom) => {
          document.body.style.zoom = String(zoom)
        }, zoom)
        await page.waitForTimeout(300)
        await inspect(`zoom ${zoom} list 320`)
        for (const type of ['edit', 'detail']) {
          await action(type === 'edit' ? 'Chỉnh sửa' : 'Chi tiết').click()
          await page.waitForTimeout(500)
          await inspect(`zoom ${zoom} ${type} 320`)
          if (type === 'edit') {
            await modal().locator('.ant-select').click()
            await page.waitForTimeout(350)
            await inspect(`zoom ${zoom} status dropdown`)
            await page
              .locator('.ant-select-dropdown:visible')
              .getByText('Ngừng hoạt động', { exact: true })
              .click()
            await page.waitForTimeout(350)
          }
          if (type === 'edit')
            await modal().getByRole('button', { name: 'Hủy', exact: true }).click()
          else await detail().locator('.ant-drawer-footer button').click()
          await page.waitForTimeout(750)
          await inspect(`after zoom ${zoom} ${type}`)
        }
        await page.locator('.ant-table-body').evaluate((el) => {
          el.scrollLeft = 0
        })
        await page.locator('.user-cell').first().hover()
        await page.waitForTimeout(400)
        await inspect(`zoom ${zoom} long tooltip`)
      }
      check(
        'fixture never submits or changes backend data',
        calls.every((call) => call.method === 'GET'),
      )
      check('no uncaught browser errors', errors.length === 0)
      console.log(JSON.stringify({ passed: checks.length, errors }))
    }
    await writeFile(
      `${directory}/${baseline ? 'baseline' : process.argv.includes('--zoom-only') ? 'results-zoom' : 'results'}.json`,
      JSON.stringify({ measurements, checks, errors, calls }, null, 2),
    )
  }
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png`, fullPage: true })
  await writeFile(
    `${directory}/${baseline ? 'baseline' : process.argv.includes('--zoom-only') ? 'results-zoom' : 'results'}.json`,
    JSON.stringify({ measurements, checks, errors, calls, failure: error.stack }, null, 2),
  )
  throw error
} finally {
  await browser.close()
}
