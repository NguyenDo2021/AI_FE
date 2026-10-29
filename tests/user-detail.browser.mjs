// Controlled API fixtures; no real backend reads or writes.
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
  viewport: { width: 390, height: 844 },
  reducedMotion: 'reduce',
})
await context.addInitScript(() =>
  localStorage.setItem('frontend-base:access-token', 'user-detail-fixture'),
)
const directory = 'docs/user-detail-artifacts'
await mkdir(directory, { recursive: true })
let scenario = 'normal'
const calls = [],
  checks = [],
  measurements = [],
  errors = []
const permissions = [
  'USER_VIEW',
  'USER_CREATE',
  'USER_UPDATE',
  'USER_DELETE',
  'USER_WAREHOUSE_VIEW',
  'USER_WAREHOUSE_ASSIGN',
]
const user = (index) => ({
  id: `user-${index}`,
  username: `user_${index}`,
  fullName: `Người dùng ${index}`,
  email: `user${index}@example.com`,
  phone: index === 1 ? null : '0901234567',
  status: index % 2 ? 0 : 1,
})
const longUser = {
  ...user(0),
  username: '12345678-1234-1234-1234-123456789abc'.repeat(8),
  fullName: 'Họ tên dài cần xuống dòng '.repeat(40),
  email: 'emailkhongcodaucach'.repeat(80) + '@example.com',
  phone: null,
}
await context.route('**/api/**', async (route) => {
  const req = route.request(),
    url = new URL(req.url())
  if (!url.pathname.startsWith('/api/')) return route.continue()
  const path = url.pathname.slice(4),
    params = Object.fromEntries(url.searchParams)
  calls.push({ path, method: req.method(), params })
  const reply = (data, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
  if (path === '/auth/me') return reply({ ...user(99), id: 'operator', permissions })
  if (path === '/users/operator') return reply({ ...user(99), status: 1 })
  if (path === '/users/operator/roles') return reply([])
  if (path === '/users/me/warehouses') return reply([])
  if (path === '/users')
    return reply({
      items: [user(0), user(1)],
      total: 32,
      page: Number(params.page),
      pageSize: Number(params.pageSize),
    })
  if (/^\/users\/user-\d+$/.test(path)) {
    const index = Number(path.split('-').at(-1)),
      current = scenario
    if (current === 'slow' && index === 0) await new Promise((resolve) => setTimeout(resolve, 900))
    if (current === 'error') return reply({ message: 'Không tải được chi tiết người dùng' }, 500)
    return reply(current === 'long' || (current === 'slow' && index === 0) ? longUser : user(index))
  }
  return reply([])
})
const page = await context.newPage()
page.setDefaultTimeout(10000)
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (msg) => {
  if (/Unhandled|Failed to resolve component/.test(msg.text())) errors.push(msg.text())
})
const check = (label, result) => {
  assert.ok(result, label)
  checks.push(label)
  console.log(label)
}
const detail = () => page.locator('.ant-drawer-content:visible')
const action = (index) =>
  page
    .locator('.user-page__actions')
    .nth(index)
    .getByRole('button', { name: 'Chi tiết', exact: true })
const settled = async () => {
  await detail().waitFor()
  await page.waitForTimeout(450)
}
const measure = async (label) => {
  const value = await detail().evaluate((el) => {
    const rect = (node) => (node ? node.getBoundingClientRect().toJSON() : null)
    const style = (node) => {
      if (!node) return null
      const s = getComputedStyle(node)
      return {
        width: s.width,
        minWidth: s.minWidth,
        maxWidth: s.maxWidth,
        padding: s.padding,
        margin: s.margin,
        left: s.left,
        right: s.right,
        transform: s.transform,
        overflowX: s.overflowX,
        overflowY: s.overflowY,
        position: s.position,
        boxSizing: s.boxSizing,
      }
    }
    const wrapper = el.closest('.ant-drawer-content-wrapper'),
      root = el.closest('.ant-drawer'),
      body = el.querySelector('.ant-drawer-body')
    return {
      width: innerWidth,
      height: innerHeight,
      wrapper: { rect: rect(wrapper), style: style(wrapper) },
      root: { rect: rect(root), style: style(root), parent: root.parentElement.tagName },
      content: { rect: rect(el), style: style(el) },
      body: {
        rect: rect(body),
        clientWidth: body.clientWidth,
        scrollWidth: body.scrollWidth,
        clientHeight: body.clientHeight,
        scrollHeight: body.scrollHeight,
        style: style(body),
      },
      header: rect(el.querySelector('.ant-drawer-header')),
      footer: rect(el.querySelector('.ant-drawer-footer')),
      title: rect(el.querySelector('.ant-drawer-title')),
      descriptions: rect(el.querySelector('.ant-descriptions-view')),
      label: rect(el.querySelector('.ant-descriptions-item-label')),
      table: rect(el.querySelector('table')),
      overflow: [...el.querySelectorAll('*')]
        .filter((n) => n.clientWidth > 0 && n.scrollWidth > n.clientWidth + 1)
        .map((n) => ({
          tag: n.tagName,
          cls: n.className,
          client: n.clientWidth,
          scroll: n.scrollWidth,
        })),
      scrollers: [...el.querySelectorAll('*')]
        .filter(
          (n) =>
            /auto|scroll/.test(getComputedStyle(n).overflowY) &&
            n.scrollHeight > n.clientHeight + 1,
        )
        .map((n) => n.className),
    }
  })
  measurements.push({ label, ...value })
  console.log(
    JSON.stringify({
      label,
      wrapper: value.wrapper,
      body: value.body,
      root: value.root,
      overflow: value.overflow.slice(0, 5),
    }),
  )
  return value
}
try {
  await page.goto('http://127.0.0.1:5173/system/user')
  await page.locator('.user-page').waitFor()
  await page.waitForFunction(
    () => document.querySelector('.products-table-region')?.getAttribute('aria-busy') === 'false',
  )
  if (process.argv.includes('--baseline')) {
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 })
      scenario = 'normal'
      await action(0).click()
      await settled()
      await measure(`before ${width} normal`)
      await page.screenshot({ path: `${directory}/before-${width}.png` })
      await page.keyboard.press('Escape')
      await page.waitForTimeout(400)
      scenario = 'long'
      await action(0).click()
      await settled()
      await measure(`before ${width} long`)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(400)
    }
    await writeFile(
      `${directory}/baseline.json`,
      JSON.stringify({ measurements, errors, calls }, null, 2),
    )
  } else {
    const close = async () => {
      await detail()
        .locator('.ant-drawer-footer')
        .getByRole('button', { name: 'Đóng', exact: true })
        .click()
      await page.waitForTimeout(450)
    }
    const detailCalls = () => calls.filter((call) => /^\/users\/user-\d+$/.test(call.path))
    const listCalls = () => calls.filter((call) => call.path === '/users')
    for (const [width, height] of [
      [320, 740],
      [375, 812],
      [390, 844],
      [414, 896],
      [768, 1024],
      [1440, 900],
      [844, 390],
      [667, 375],
      [320, 320],
    ]) {
      await page.setViewportSize({ width, height })
      for (const data of ['normal', 'long']) {
        scenario = data
        const before = detailCalls().length,
          beforeList = listCalls().length
        await action(0).click()
        await settled()
        const value = await measure(`${width}x${height} ${data}`)
        check(
          `${width}x${height} ${data}: drawer inside viewport`,
          value.wrapper.rect.left >= -1 &&
            value.wrapper.rect.right <= width + 1 &&
            value.wrapper.rect.width <= width + 1,
        )
        check(
          `${width}x${height} ${data}: header/footer fully accessible`,
          value.header.top >= 0 &&
            value.footer.bottom <= height + 1 &&
            value.header.bottom <= value.body.rect.top + 1 &&
            value.footer.top >= value.body.rect.bottom - 1,
        )
        check(
          `${width}x${height} ${data}: no horizontal content overflow`,
          value.body.scrollWidth <= value.body.clientWidth + 1 && value.overflow.length === 0,
        )
        check(
          `${width}x${height} ${data}: only drawer body can scroll vertically`,
          value.scrollers.every((cls) => cls.includes('ant-drawer-body')) &&
            value.scrollers.length <= 1,
        )
        check(
          `${width}x${height} ${data}: title fully readable`,
          await detail()
            .getByRole('heading', { name: 'Thông tin người dùng', exact: true })
            .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        )
        check(
          `${width}x${height} ${data}: all five fields and status label retained`,
          (await detail()
            .locator(width < 768 ? '.detail-field' : '.ant-descriptions-item-label')
            .count()) === 5 && (await detail().locator('.ant-tag').innerText()) === 'Hoạt động',
        )
        if (width < 768) {
          check(
            `${width}x${height} ${data}: no mobile label/value table`,
            (await detail().locator('table').count()) === 0,
          )
          const rows = await detail()
            .locator('.detail-field')
            .evaluateAll((elements) =>
              elements.map((el) => ({
                label: el.querySelector('dt').getBoundingClientRect().toJSON(),
                value: el.querySelector('dd').getBoundingClientRect().toJSON(),
              })),
            )
          check(
            `${width}x${height} ${data}: labels above values`,
            rows.every(
              (row) =>
                row.label.bottom <= row.value.top + 1 &&
                Math.abs(row.label.left - row.value.left) < 1,
            ),
          )
          check(
            `${width}x${height} ${data}: header close has touch target`,
            await detail()
              .locator('.detail-close')
              .evaluate(
                (el) =>
                  el.getBoundingClientRect().width >= 44 && el.getBoundingClientRect().height >= 44,
              ),
          )
        } else {
          check(
            `${width}x${height} ${data}: desktop keeps 520px bordered Descriptions`,
            Math.abs(value.wrapper.rect.width - 520) < 1 &&
              (await detail().locator('.ant-descriptions-bordered').count()) === 1,
          )
        }
        if (data === 'long') {
          check(
            `${width}x${height}: full email and null fallback`,
            (await detail().innerText()).includes(longUser.email) &&
              (await detail().innerText()).includes('—'),
          )
          if (value.body.scrollHeight > value.body.clientHeight) {
            await detail()
              .locator('.ant-drawer-body')
              .evaluate((el) => {
                el.scrollTop = el.scrollHeight
              })
            check(
              `${width}x${height}: long content scrolls without moving footer`,
              Math.abs(
                (await detail().locator('.ant-drawer-footer').boundingBox()).y - value.footer.top,
              ) < 1,
            )
          }
        }
        check(
          `${width}x${height} ${data}: exactly one detail GET and no list reload`,
          detailCalls().length === before + 1 && listCalls().length === beforeList,
        )
        if ([390, 1440].includes(width) && data === 'normal')
          await page.screenshot({ path: `${directory}/after-${width}.png`, animations: 'disabled' })
        await close()
        check(
          `${width}x${height} ${data}: close restores opening action focus`,
          await action(0).evaluate((el) => el === document.activeElement),
        )
      }
    }
    await page.setViewportSize({ width: 390, height: 844 })
    scenario = 'slow'
    const beforeSlow = detailCalls().length
    await action(0).click()
    await page.waitForTimeout(100)
    check(
      'loading stays on opening action and shows no previous user detail',
      (await action(0).evaluate((el) => el.classList.contains('ant-btn-loading'))) &&
        (await detail().count()) === 0,
    )
    await action(1).click()
    await settled()
    await page.waitForTimeout(800)
    check(
      'latest user wins over previous slow response',
      (await detail().innerText()).includes('user_1') &&
        !(await detail().innerText()).includes(longUser.email) &&
        detailCalls().length === beforeSlow + 2,
    )
    check(
      'inactive user has labelled status tag and null fallback',
      (await detail().locator('.ant-tag').innerText()) === 'Ngừng hoạt động' &&
        (await detail().innerText()).includes('—'),
    )
    await detail().locator('.detail-close').click()
    await page.waitForTimeout(450)
    check(
      'header close returns focus to latest opening action',
      await action(1).evaluate((el) => el === document.activeElement),
    )
    scenario = 'error'
    await action(0).click()
    await page.waitForTimeout(450)
    check(
      'API error preserves existing handler and does not open stale detail',
      (await detail().count()) === 0 &&
        (await page
          .locator('.user-page > .ant-alert')
          .getByText('Không tải được chi tiết người dùng', { exact: true })
          .count()) === 1,
    )
    scenario = 'normal'
    await action(0).click()
    await settled()
    check(
      'detail can be opened again after API error',
      (await detail().innerText()).includes('user_0'),
    )
    await page.keyboard.press('Escape')
    await page.waitForTimeout(450)
    check('Escape keeps default drawer close behavior', (await detail().count()) === 0)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.locator('#user-keyword').fill('applied')
    await page.locator('#user-keyword').press('Enter')
    await page.waitForTimeout(400)
    await page.locator('.ant-pagination-item-2').click()
    await page.waitForTimeout(400)
    const beforeClose = listCalls().length
    await action(0).click()
    await settled()
    await close()
    check(
      'closing detail preserves filter and pagination without extra request',
      listCalls().length === beforeClose &&
        listCalls().at(-1).params.page === '2' &&
        listCalls().at(-1).params.keyword === 'applied' &&
        (await page.locator('#user-keyword').inputValue()) === 'applied',
    )
    check(
      'read-only detail never issues mutation requests',
      calls.every((call) => call.method === 'GET'),
    )
    check('no uncaught application errors', errors.length === 0)
    await writeFile(
      `${directory}/results.json`,
      JSON.stringify({ checks, measurements, errors, calls }, null, 2),
    )
    console.log(JSON.stringify({ passed: checks.length, errors }, null, 2))
  }
} catch (error) {
  await page.screenshot({ path: `${directory}/failure.png` })
  await writeFile(
    `${directory}/results.json`,
    JSON.stringify({ checks, measurements, errors, calls, failure: error.stack }, null, 2),
  )
  throw error
} finally {
  await browser.close()
}
