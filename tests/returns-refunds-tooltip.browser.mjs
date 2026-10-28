// All API requests use fixtures; this check never sends a real transaction.
import assert from 'node:assert/strict'
import process from 'node:process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const { chromium } = await import(
  pathToFileURL(
    process.env.PLAYWRIGHT_MODULE ||
      join(process.env.TEMP, 'codex-dashboard-browser/node_modules/playwright/index.mjs'),
  ).href
)
const diagnostic = process.env.RELOAD_TOOLTIP_DIAGNOSTIC === '1'
const artifacts =
  process.env.RELOAD_TOOLTIP_ARTIFACTS || join(process.env.TEMP, 'codex-reload-tooltip-artifacts')
await mkdir(artifacts, { recursive: true })
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  ignoreDefaultArgs: ['--hide-scrollbars'],
})
const context = await browser.newContext({
  viewport: { width: 1665, height: 894 },
  reducedMotion: 'reduce',
})
await context.addInitScript(() =>
  localStorage.setItem('frontend-base:access-token', 'reload-tooltip-test'),
)
const calls = [],
  errors = [],
  unexpected = [],
  results = [],
  checks = []
let many = false
const permissions = [
  'SALES_RETURN_VIEW',
  'SALES_RETURN_CREATE',
  'REFUND_VIEW',
  'REFUND_CREATE',
  'SALES_ORDER_VIEW',
]
await context.route('**/*', async (route) => {
  const request = route.request()
  if (!['fetch', 'xhr'].includes(request.resourceType())) return route.continue()
  const url = new URL(request.url()),
    path = url.pathname.replace(/^\/api/, '')
  calls.push({ path, method: request.method(), params: Object.fromEntries(url.searchParams) })
  const reply = (value, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) })
  if (path === '/auth/me')
    return reply({
      id: 'reload-ui',
      username: 'reload-test',
      fullName: 'Kiểm tra tooltip',
      permissions,
    })
  if (path === '/users/reload-ui') return reply({ id: 'reload-ui', status: 1 })
  if (path === '/users/reload-ui/roles') return reply([])
  if (path === '/users/me/warehouses')
    return reply([{ id: 'w1', code: 'KHO_01', name: 'Kho Thanh Chương', status: 1 }])
  if (['/sales-returns', '/refundables', '/refunds'].includes(path) && request.method() === 'GET') {
    const page = Number(url.searchParams.get('page') || 1),
      pageSize = Number(url.searchParams.get('pageSize') || 10)
    return reply({
      items: Array.from({ length: many ? pageSize : 1 }, (_, index) => ({
        id: 'record-' + index,
        code: 'PHIEU-' + index,
        warehouseId: 'w1',
        salesOrderId: '11111111-1111-4111-8111-111111111111',
        customerId: 'customer-id',
        customerSnapshot: { name: 'Khách kiểm thử' },
        returnDate: '2026-10-28',
        refundDate: '2026-10-28',
        saleDate: '2026-10-28',
        status: path === '/refunds' ? 'ACTIVE' : 'CONFIRMED',
        method: 'CASH',
        reason: 'Kiểm tra tooltip và cuộn bảng',
        amount: 100000,
        totalAmount: 200000,
        returnedAmount: 100000,
        adjustedTotalAmount: 100000,
        paidAmount: 200000,
        refundedAmount: 0,
        netPaidAmount: 200000,
        remainingAmount: 0,
        refundableAmount: 100000,
        createdBy: 'creator',
        createdAt: '2026-10-28T02:00:00Z',
      })),
      total: many ? 137 : 1,
      page,
      pageSize,
    })
  }
  unexpected.push({ path, method: request.method() })
  return reply({ message: 'Unexpected fixture request' }, 403)
})
const page = await context.newPage()
page.on('pageerror', (error) => errors.push(error.message))
page.setDefaultTimeout(12000)
const base = process.env.RETURNS_TEST_URL || 'http://127.0.0.1:5173'
const reload = () => page.locator('.rr-toolbar button[aria-label="Tải lại danh sách"]')
const check = (label, condition) => {
  if (!diagnostic) assert.ok(condition, label)
  checks.push({ label, passed: !!condition })
}
const snapshot = () => {
  const root = document.documentElement,
    body = document.body
  const rect = (element) => {
    const box = element.getBoundingClientRect()
    return {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      right: box.right,
      bottom: box.bottom,
    }
  }
  const dimensions = (element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  })
  const anchor = document.querySelector('.rr-toolbar button[aria-label="Tải lại danh sách"]')
  const buttonStyle = getComputedStyle(anchor)
  const content = Array.from(document.querySelectorAll('[role="tooltip"]')).find(
    (element) =>
      element.textContent.trim() === 'Tải lại danh sách' && element.getClientRects().length,
  )
  const popup = content?.closest('.ant-tooltip')
  const chain = []
  for (let parent = popup?.parentElement; parent && chain.length < 4; parent = parent.parentElement)
    chain.push({
      tag: parent.tagName,
      class: parent.className,
      position: getComputedStyle(parent).position,
      ...rect(parent),
    })
  const table = document.querySelector('.rr-table-region .ant-table-body')
  return {
    root: dimensions(root),
    body: dimensions(body),
    viewport: {
      width: innerWidth,
      height: innerHeight,
      dpr: devicePixelRatio,
      visualWidth: visualViewport.width,
      visualHeight: visualViewport.height,
      visualScale: visualViewport.scale,
    },
    anchor: rect(anchor),
    focused: document.activeElement === anchor,
    focusVisible: anchor.matches(':focus-visible'),
    focus: {
      outline: buttonStyle.outline,
      outlineWidth: buttonStyle.outlineWidth,
      outlineStyle: buttonStyle.outlineStyle,
      outlineOffset: buttonStyle.outlineOffset,
      boxShadow: buttonStyle.boxShadow,
    },
    list: rect(document.querySelector('.rr-list')),
    table: { ...rect(table), ...dimensions(table) },
    footer: rect(document.querySelector('.rr-pagination')),
    popup: popup
      ? {
          ...rect(popup),
          class: popup.className,
          position: getComputedStyle(popup).position,
          parents: chain,
          inner: { ...rect(content), ...dimensions(content) },
        }
      : null,
    rootOverflow: { x: getComputedStyle(root).overflowX, y: getComputedStyle(root).overflowY },
    bodyOverflow: { x: getComputedStyle(body).overflowX, y: getComputedStyle(body).overflowY },
  }
}
const sampleFrames = () =>
  page.evaluate(async () => {
    const samples = [],
      start = performance.now()
    while (performance.now() - start < 650) {
      await new Promise(requestAnimationFrame)
      const root = document.documentElement
      samples.push({
        time: Math.round(performance.now() - start),
        scrollWidth: root.scrollWidth,
        clientWidth: root.clientWidth,
        scrollHeight: root.scrollHeight,
        clientHeight: root.clientHeight,
      })
    }
    return samples
  })
const clearTooltip = async () => {
  await page.mouse.move(0, 0)
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  })
  await page.waitForTimeout(350)
}
const tabToReload = async () => {
  await page.evaluate(() => {
    const anchor = document.querySelector('.rr-toolbar button[aria-label="Tải lại danh sách"]')
    const controls = Array.from(
      document.querySelectorAll('button, input, select, a[href], [tabindex]'),
    ).filter(
      (element) =>
        element.tabIndex >= 0 &&
        element.getClientRects().length &&
        getComputedStyle(element).visibility !== 'hidden',
    )
    controls[controls.indexOf(anchor) - 1].focus()
  })
  await page.keyboard.press('Tab')
}
const assertStable = (label, before, after, frames) => {
  for (const key of ['scrollWidth', 'clientWidth', 'scrollHeight', 'clientHeight'])
    check(
      label + ': document ' + key + ' unchanged',
      Math.abs(before.root[key] - after.root[key]) <= 1,
    )
  check(
    label + ': no external horizontal scrollbar',
    after.root.scrollWidth <= after.root.clientWidth + 1,
  )
  check(
    label + ': no external vertical scrollbar',
    after.root.scrollHeight <= after.root.clientHeight + 1,
  )
  check(
    label + ': no transient external scrollbar',
    frames.every(
      (frame) =>
        frame.scrollWidth <= frame.clientWidth + 1 && frame.scrollHeight <= frame.clientHeight + 1,
    ),
  )
  check(
    label + ': reload position unchanged',
    Math.abs(before.anchor.x - after.anchor.x) <= 1 &&
      Math.abs(before.anchor.y - after.anchor.y) <= 1,
  )
  check(
    label + ': table layout unchanged',
    Math.abs(before.table.width - after.table.width) <= 1 &&
      Math.abs(before.footer.y - after.footer.y) <= 1,
  )
  if (after.popup) {
    check(
      label + ': tooltip fits within viewport',
      after.popup.x >= 0 &&
        after.popup.y >= 0 &&
        after.popup.right <= after.root.clientWidth + 1 &&
        after.popup.bottom <= after.root.clientHeight + 1,
    )
    check(
      label + ': tooltip text is not clipped',
      after.popup.inner.scrollWidth <= after.popup.inner.clientWidth + 1 &&
        after.popup.inner.scrollHeight <= after.popup.inner.clientHeight + 1,
    )
    check(
      label + ': tooltip is outside scrolling layout',
      after.popup.parents.some((parent) => parent.tag === 'BODY') &&
        !after.popup.parents.some((parent) => /rr-list|rr-table|rr-filters/.test(parent.class)),
    )
  }
  check(
    label + ': html/body overflow is not hidden',
    ![
      after.rootOverflow.x,
      after.rootOverflow.y,
      after.bodyOverflow.x,
      after.bodyOverflow.y,
    ].includes('hidden'),
  )
}
const scenarios = diagnostic
  ? [{ label: 'desktop', width: 1665, height: 894, zoom: 1 }]
  : [
      { label: 'desktop', width: 1665, height: 894, zoom: 1 },
      { label: 'desktop-small', width: 1366, height: 768, zoom: 1 },
      { label: 'mobile', width: 390, height: 844, zoom: 1 },
      { label: 'mobile-short', width: 390, height: 600, zoom: 1 },
      { label: 'zoom-125', width: 1332, height: 715, zoom: 1.25 },
      { label: 'zoom-150', width: 1110, height: 596, zoom: 1.5 },
      { label: 'zoom-200', width: 833, height: 447, zoom: 2 },
    ]
let failure, failureSnapshot
try {
  const cdp = await context.newCDPSession(page)
  const selectedScenarios = scenarios.filter(
    (scenario) =>
      !process.env.RELOAD_TOOLTIP_SCENARIOS ||
      process.env.RELOAD_TOOLTIP_SCENARIOS.split(',').includes(scenario.label),
  )
  assert.ok(selectedScenarios.length, 'At least one tooltip scenario must be selected')
  const pages = [
    ['/sales/returns', '/sales-returns'],
    ['/sales/refundables', '/refundables'],
    ['/sales/refunds', '/refunds'],
  ].filter(([path]) => !process.env.RELOAD_TOOLTIP_PATH || path === process.env.RELOAD_TOOLTIP_PATH)
  assert.ok(pages.length, 'At least one returns/refunds page must be selected')
  for (const [path, endpoint] of pages) {
    for (const scenario of selectedScenarios) {
      await page.setViewportSize({ width: scenario.width, height: scenario.height })
      for (const rows of diagnostic ? [false] : [false, true]) {
        // Keep Playwright's viewport and Chrome's zoom-equivalent CSS viewport in sync.
        await cdp.send('Emulation.setDeviceMetricsOverride', {
          width: scenario.width,
          height: scenario.height,
          deviceScaleFactor: scenario.zoom,
          mobile: false,
        })
        many = rows
        await page.goto(base + path)
        await page.locator('.rr-list tbody tr.ant-table-row').first().waitFor()
        await clearTooltip()
        await page.waitForTimeout(200)
        const label = endpoint + ' ' + scenario.label + (many ? ' many' : ' one')
        const before = await page.evaluate(snapshot)
        const result = { label, before }
        results.push(result)
        check(
          label + ': zoom device pixel ratio is applied',
          Math.abs(before.viewport.dpr - scenario.zoom) < 0.01,
        )
        await reload().hover()
        const hoverFrames = await sampleFrames()
        const hover = await page.evaluate(snapshot)
        Object.assign(result, { hover, hoverFrames })
        check(label + ': hover opens tooltip', !!hover.popup)
        assertStable(label + ' hover', before, hover, hoverFrames)
        let withoutPopup
        if (diagnostic && hover.popup) {
          await page.evaluate(() => {
            document.querySelector('.ant-tooltip:not(.ant-tooltip-hidden)').style.display = 'none'
          })
          withoutPopup = await page.evaluate(snapshot)
        }
        await clearTooltip()
        const hidden = await page.evaluate(snapshot)
        Object.assign(result, { hidden })
        assertStable(label + ' hidden', before, hidden, [])
        await tabToReload()
        const focusFrames = await sampleFrames()
        const focus = await page.evaluate(snapshot)
        Object.assign(result, { focus, focusFrames })
        check(label + ': Tab focuses reload', focus.focused && focus.focusVisible)
        check(
          label + ': keyboard focus indicator remains visible',
          (parseFloat(focus.focus.outlineWidth) > 0 && focus.focus.outlineStyle !== 'none') ||
            (focus.focus.boxShadow !== 'none' && focus.focus.boxShadow !== before.focus.boxShadow),
        )
        check(label + ': focus opens tooltip', !!focus.popup)
        assertStable(label + ' focus', before, focus, focusFrames)
        const count = calls.filter((call) => call.path === endpoint).length
        await reload().click()
        const clickFrames = await sampleFrames()
        const click = await page.evaluate(snapshot)
        Object.assign(result, { click, clickFrames })
        check(
          label + ': click preserves reload handler',
          calls.filter((call) => call.path === endpoint).length === count + 1,
        )
        assertStable(label + ' click', before, click, clickFrames)
        await clearTooltip()
        const after = await page.evaluate(snapshot)
        assertStable(label + ' closed', before, after, [])
        check(
          label + ': horizontal table scrolling remains enabled',
          after.table.scrollWidth > after.table.clientWidth,
        )
        if (many)
          check(
            label + ': vertical table scrolling remains enabled',
            after.table.scrollHeight > after.table.clientHeight,
          )
        Object.assign(result, {
          hover,
          withoutPopup,
          hidden,
          focus,
          click,
          after,
          hoverFrames,
          focusFrames,
          clickFrames,
        })
        const scrolled = await page.evaluate(() => {
          const body = document.querySelector('.rr-table-region .ant-table-body')
          const action = body.querySelector('.ant-table-cell-fix-right')
          const header = document.querySelector('.rr-table-region .ant-table-header')
          const actionX = action.getBoundingClientRect().x,
            headerY = header.getBoundingClientRect().y
          body.scrollLeft = body.scrollWidth
          body.scrollTop = body.scrollHeight
          return {
            left: body.scrollLeft,
            top: body.scrollTop,
            actionX,
            afterActionX: action.getBoundingClientRect().x,
            headerY,
            afterHeaderY: header.getBoundingClientRect().y,
          }
        })
        check(label + ': table actually scrolls horizontally', scrolled.left > 0)
        check(
          label + ': action column stays fixed',
          Math.abs(scrolled.actionX - scrolled.afterActionX) <= 1,
        )
        check(
          label + ': table header stays fixed',
          Math.abs(scrolled.headerY - scrolled.afterHeaderY) <= 1,
        )
        if (many) check(label + ': table actually scrolls vertically', scrolled.top > 0)
        result.scrolled = scrolled
        if (scenario.label === 'desktop' && !many && !diagnostic) {
          const previousStyle = await reload().evaluate((element) => {
            const old = element.style.cssText
            Object.assign(element.style, {
              position: 'fixed',
              right: '2px',
              top: '2px',
              zIndex: '1100',
            })
            return old
          })
          await page.waitForTimeout(350)
          const edgeBefore = await page.evaluate(snapshot)
          await reload().hover()
          const edgeFrames = await sampleFrames()
          const edge = await page.evaluate(snapshot)
          Object.assign(result, { edgeBefore, edge, edgeFrames })
          check(
            label + ': tooltip flips below the top-right corner',
            !!edge.popup && edge.popup.class.includes('bottom'),
          )
          assertStable(label + ' viewport corner', edgeBefore, edge, edgeFrames)
          await clearTooltip()
          await reload().evaluate((element, style) => {
            element.style.cssText = style
          }, previousStyle)
        }
        await clearTooltip()
        await reload().hover()
        await page.waitForTimeout(350)
        // Screenshot can restore CDP metrics; take it after all measurements for this case.
        await page.screenshot({
          path: join(
            artifacts,
            endpoint.slice(1) + '-' + scenario.label + (many ? '-many' : '') + '.png',
          ),
        })
      }
    }
  }
  check('no runtime errors', errors.length === 0)
  check('no unexpected API requests', unexpected.length === 0)
} catch (error) {
  failure = error
  failureSnapshot = await page.evaluate(snapshot)
  await page.screenshot({ path: join(artifacts, 'failure.png') })
} finally {
  await writeFile(
    join(artifacts, 'results.json'),
    JSON.stringify(
      {
        diagnostic,
        results,
        checks,
        errors,
        unexpected,
        calls,
        failure: failure?.message,
        failureSnapshot,
      },
      null,
      2,
    ),
  )
  await browser.close()
}
if (failure) throw failure
console.log(
  JSON.stringify(
    {
      cases: results.length,
      passed: checks.filter((check) => check.passed).length,
      failed: checks.filter((check) => !check.passed).length,
      artifacts,
    },
    null,
    2,
  ),
)
