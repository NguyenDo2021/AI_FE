// Run against the local Vite server. API replies are intercepted in the browser.
// Reuses the browser tooling from tests/dashboard.browser.mjs; no app dependency is added.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const { chromium } = await import(
  pathToFileURL(
    process.env.PLAYWRIGHT_MODULE ||
      join(process.env.TEMP, 'codex-dashboard-browser/node_modules/playwright/index.mjs'),
  ).href
)
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
})
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const base = process.env.LOGIN_TEST_URL || 'http://127.0.0.1:5173'
const artifacts = process.env.LOGIN_TEST_ARTIFACTS || 'docs/login-artifacts'
await mkdir(artifacts, { recursive: true })
const checks = []
const errors = []
const loginPayloads = []
const authCalls = []
let mode = 'failure'
let permissions = ['DASHBOARD_VIEW']
let refreshCount = 0
let expireIdentity = false
let releaseLogin
const check = (name, condition) => {
  assert.ok(condition, name)
  checks.push(name)
}
const identity = () => ({
  id: 'login-test',
  username: 'browser-check',
  fullName: 'Browser Check',
  email: '',
  permissions,
})
await context.route('**/api/**', async (route) => {
  const request = route.request()
  if (!new URL(request.url()).pathname.startsWith('/api/')) return route.continue()
  const path = new URL(request.url()).pathname.replace(/^\/api/, '')
  const reply = (data, status = 200) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(data),
    })
  if (request.method() === 'OPTIONS') return reply({})
  authCalls.push(path)
  if (path === '/auth/login') {
    loginPayloads.push(request.postDataJSON())
    if (mode === 'pending')
      await new Promise((resolve) => {
        releaseLogin = resolve
      })
    if (mode === 'failure' || mode === 'pending')
      return reply({ message: 'Invalid credentials' }, 401)
    return reply({ accessToken: 'controlled-access', refreshToken: 'controlled-refresh' })
  }
  if (path === '/auth/refresh') {
    refreshCount++
    return reply({
      accessToken: 'controlled-access-refreshed',
      refreshToken: 'controlled-refresh-refreshed',
    })
  }
  if (path === '/auth/me') {
    if (expireIdentity) {
      expireIdentity = false
      return reply({ message: 'Expired' }, 401)
    }
    return reply(identity())
  }
  if (path === '/users/login-test') return reply({ ...identity(), status: 1 })
  if (path === '/users/login-test/roles') return reply([])
  if (path === '/users/me/warehouses') return reply([])
  return reply({ items: [], total: 0, page: 1, pageSize: 20 })
})
const page = await context.newPage()
page.on('pageerror', (error) => errors.push(error.message))
const username = () => page.getByLabel('Tên đăng nhập', { exact: true })
const password = () => page.getByLabel('Mật khẩu', { exact: true })
const submit = () => page.getByRole('button', { name: 'Đăng nhập', exact: true })
const visible = async (selector) => page.locator(selector).isVisible()
const overflow = async () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
const login = async () => {
  await username().fill('browser-check')
  await password().fill('  browser-password  ')
  await password().press('Enter')
}
const logout = async () => {
  await page.locator('.app-header__account').click()
  await page.getByRole('menuitem', { name: 'Đăng xuất' }).click()
  await page.waitForURL('**/login')
}
try {
  await page.goto(base + '/login')
  await page.locator('#login-title').waitFor()
  check(
    'Vietnamese copy renders with accents',
    (await page.locator('#login-title').innerText()) === 'Chào mừng trở lại',
  )
  check('No login request on initial render', loginPayloads.length === 0)
  check(
    'Both inputs have associated labels',
    (await username().count()) === 1 && (await password().count()) === 1,
  )
  check(
    'Autocomplete uses username/current-password',
    (await username().getAttribute('autocomplete')) === 'username' &&
      (await password().getAttribute('autocomplete')) === 'current-password',
  )
  for (const [width, height] of [
    [1440, 900],
    [1024, 768],
    [768, 1024],
    [320, 740],
    [1440, 500],
    [320, 360],
  ]) {
    await page.setViewportSize({ width, height })
    await page.evaluate(() => scrollTo(0, 0))
    check('No horizontal overflow at ' + width + 'x' + height, !(await overflow()))
    check(
      'Responsive illustration at ' + width + 'x' + height,
      (await visible('.login-brand')) === width >= 768,
    )
    check(
      'Mobile branding at ' + width + 'x' + height,
      (await visible('.login-mobile-brand')) === width < 768,
    )
    if (width >= 768) {
      const geometry = await page.evaluate(() => {
        const brand = document.querySelector('.login-brand').getBoundingClientRect()
        const shell = document.querySelector('.login-shell').getBoundingClientRect()
        const spans = [...document.querySelectorAll('.login-brand__headline > span')]
        return {
          ratio: brand.width / shell.width,
          linesFit: spans.every(
            (span) =>
              span.scrollWidth <= span.clientWidth &&
              span.offsetHeight < parseFloat(getComputedStyle(span).lineHeight) * 1.5,
          ),
        }
      })
      check('Brand column is 52-55% at ' + width, geometry.ratio >= 0.52 && geometry.ratio <= 0.55)
      check('Four headline lines fit at ' + width, geometry.linesFit)
    }
    if (height <= 500) {
      await page.locator('.login-form__support').scrollIntoViewIfNeeded()
      check(
        'Support reachable on short screen ' + width,
        await page
          .locator('.login-form__support')
          .evaluate((el) => el.getBoundingClientRect().bottom <= innerHeight),
      )
      await submit().scrollIntoViewIfNeeded()
    }
    if ([1440, 768, 320].includes(width) && height > 500) {
      await page.screenshot({ path: join(artifacts, 'login-' + width + '.png'), fullPage: true })
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await submit().click()
  await page.locator('.ant-form-item-explain-error').first().waitFor()
  check(
    'Required validation blocks requests',
    loginPayloads.length === 0 &&
      (await page.locator('.ant-form-item-explain-error').count()) === 2,
  )
  await username().fill('browser-check')
  await password().fill('  browser-password  ')
  const toggle = page.getByRole('button', { name: 'Hiện mật khẩu' })
  await password().focus()
  await page.keyboard.press('Tab')
  check(
    'Password toggle has a visible keyboard focus ring',
    await toggle.evaluate((el) => getComputedStyle(el).outlineStyle !== 'none'),
  )
  await toggle.press('Enter')
  check(
    'Keyboard reveals exact password',
    (await password().getAttribute('type')) === 'text' &&
      (await password().inputValue()) === '  browser-password  ',
  )
  await page.getByRole('button', { name: 'Ẩn mật khẩu' }).press('Space')
  check('Keyboard hides password again', (await password().getAttribute('type')) === 'password')

  const session = await context.newCDPSession(page)
  const { root } = await session.send('DOM.getDocument')
  for (const selector of ['#login_username', '#login_password']) {
    const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector })
    await session.send('CSS.enable')
    await session.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['autofill'] })
    check(
      'Autofill text remains readable for ' + selector,
      await page
        .locator(selector)
        .evaluate((el) => getComputedStyle(el).webkitTextFillColor === 'rgb(36, 29, 64)'),
    )
    await session.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] })
  }
  await session.detach()

  mode = 'pending'
  const before = await submit().boundingBox()
  await password().press('Enter')
  await page.waitForFunction(
    () => document.querySelector('.login-form button[type=submit]').disabled,
  )
  const pending = await submit().boundingBox()
  check(
    'Loading preserves button geometry',
    Math.abs(before.y - pending.y) < 1 && before.height === pending.height,
  )
  check(
    'Loading exposes busy state',
    (await page.locator('.login-form form').getAttribute('aria-busy')) === 'true',
  )
  const requestCount = loginPayloads.length
  await password().press('Enter')
  await password().press('Enter')
  await page.waitForTimeout(150)
  check('Repeated Enter cannot duplicate login', loginPayloads.length === requestCount)
  check(
    'Payload preserves password and keys',
    JSON.stringify(loginPayloads.at(-1)) ===
      JSON.stringify({ username: 'browser-check', password: '  browser-password  ' }),
  )
  releaseLogin()
  await page.locator('.login-form__error').waitFor()
  check(
    'Login failure is visible inline',
    (await page.locator('.login-form__error').innerText()) ===
      'Không thể đăng nhập. Vui lòng kiểm tra thông tin.',
  )
  check(
    'Failure keeps password unchanged',
    (await password().inputValue()) === '  browser-password  ',
  )
  check('Failure re-enables submit', !(await submit().isDisabled()))
  check('Failure does not shift submit', Math.abs((await submit().boundingBox()).y - before.y) < 1)

  mode = 'success'
  await password().press('Enter')
  await page.waitForURL((url) => url.pathname === '/dashboard')
  check(
    'Successful login reaches permission landing',
    new URL(page.url()).pathname === '/dashboard',
  )
  check(
    'Identity and permissions are loaded',
    authCalls.includes('/auth/me') && authCalls.includes('/users/login-test/roles'),
  )
  check(
    'Tokens are saved',
    await page.evaluate(
      () =>
        localStorage.getItem('frontend-base:access-token') === 'controlled-access' &&
        localStorage.getItem('frontend-base:refresh-token') === 'controlled-refresh',
    ),
  )
  const logoShapes = await page
    .locator('.app-header .brand-logo img, .admin-layout__brand .brand-logo img')
    .evaluateAll(async (images) =>
      Promise.all(
        images.map(async (img) => {
          const svg = new DOMParser().parseFromString(
            await (await fetch(img.src)).text(),
            'image/svg+xml',
          )
          return {
            loaded: img.complete && img.naturalWidth > 0,
            paths: [...svg.querySelectorAll('path')].map((path) => path.getAttribute('d')),
            mint: !!svg.querySelector('[fill="#C4F2DF"]'),
          }
        }),
      ),
    )
  check(
    'Header and sidebar share three-bar logo geometry',
    logoShapes.length === 2 &&
      logoShapes.every((logo) => logo.loaded && logo.mint && logo.paths.length === 6) &&
      JSON.stringify(logoShapes[0].paths) === JSON.stringify(logoShapes[1].paths),
  )
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    check(
      'Header with logo fits at ' + width,
      await page.locator('.app-header').evaluate((el) => el.scrollWidth <= el.clientWidth),
    )
  }
  const workspaceTheme = await page
    .locator('.app-header')
    .evaluate((el) => getComputedStyle(el).getPropertyValue('--header-focus'))
  await page.reload()
  await page.locator('.app-header').waitFor()
  check(
    'Login theme stays scoped after navigation',
    workspaceTheme ===
      (await page
        .locator('.app-header')
        .evaluate((el) => getComputedStyle(el).getPropertyValue('--header-focus'))),
  )
  await page.getByRole('button', { name: 'Thu gọn thanh bên' }).click()
  check(
    'Collapsed sidebar logo is labeled',
    (await page.locator('.admin-layout__brand .brand-logo').getAttribute('aria-label')) ===
      'Hệ thống bán hàng',
  )
  check(
    'Collapsed logo is readable size',
    (await page.locator('.admin-layout__brand .brand-logo').boundingBox()).width >= 32,
  )
  await page.waitForFunction(
    () => Math.abs(document.querySelector('#app-sidebar').getBoundingClientRect().width - 80) < 1,
  )
  await page.waitForFunction(() => !document.querySelector('.ant-message-notice'))
  await page.screenshot({ path: join(artifacts, 'sidebar-collapsed.png'), fullPage: true })
  await page.goto(base + '/system/user')
  await page.waitForURL('**/403')
  check('Route guard denies missing permission', new URL(page.url()).pathname === '/403')

  expireIdentity = true
  await page.goto(base + '/dashboard')
  await page.locator('.app-header').waitFor()
  await page.waitForFunction(
    () => localStorage.getItem('frontend-base:access-token') === 'controlled-access-refreshed',
  )
  check('401 refresh preserves authenticated session', refreshCount === 1)
  await logout()
  check(
    'Logout clears both tokens',
    await page.evaluate(
      () =>
        !localStorage.getItem('frontend-base:access-token') &&
        !localStorage.getItem('frontend-base:refresh-token'),
    ),
  )
  await page.goto(base + '/dashboard')
  await page.waitForURL('**/login?redirect=/dashboard')
  check(
    'Unauthenticated route preserves redirect',
    new URL(page.url()).searchParams.get('redirect') === '/dashboard',
  )
  await login()
  await page.waitForURL((url) => url.pathname === '/dashboard')
  check('Login follows preserved redirect', new URL(page.url()).pathname === '/dashboard')
  await logout()

  permissions = ['USER_VIEW']
  await page.goto(base + '/login')
  await login()
  await page.waitForURL('**/system/user')
  check(
    'Different permissions choose different landing',
    new URL(page.url()).pathname === '/system/user',
  )
  await logout()

  for (const width of [1440, 768, 320]) {
    await page.setViewportSize({ width, height: 800 })
    await page.locator('.login-brand__name, .login-mobile-brand > span').evaluateAll((elements) => {
      for (const el of elements)
        el.textContent =
          'Hệ thống quản lý chuỗi cửa hàng vật liệu và trang trí nội thất với tên cấu hình rất dài'
    })
    check('Long system name fits at ' + width, !(await overflow()))
  }
  await page.evaluate(() => localStorage.setItem('frontend-base:locale', 'en-US'))
  await page.reload()
  await page.getByRole('heading', { name: 'Welcome back' }).waitFor()
  check(
    'English locale is complete',
    (await page.getByRole('button', { name: 'Show password' }).count()) === 1,
  )
  await page.setViewportSize({ width: 768, height: 1024 })
  check(
    'English headline fits tablet',
    await page
      .locator('.login-brand__headline > span')
      .evaluateAll((els) =>
        els.every((el) => el.offsetHeight < parseFloat(getComputedStyle(el).lineHeight) * 1.5),
      ),
  )
  check('No runtime errors', errors.length === 0)
  await writeFile(
    join(artifacts, 'checks.json'),
    JSON.stringify(
      { checks, errors, api: 'Controlled browser responses; no real credentials or backend used.' },
      null,
      2,
    ),
  )
  console.log('PASS: ' + checks.length + ' browser checks; screenshots and report in ' + artifacts)
} catch (error) {
  console.error({ lastChecks: checks.slice(-5), errors, url: page.url() })
  throw error
} finally {
  await browser.close()
}
