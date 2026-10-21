# Login redesign verification

Implemented on 2026-10-21 (Asia/Bangkok).

## Existing project

- Vue 3 SFCs, TypeScript, Pinia, Vue Router.
- Ant Design Vue 4 and @ant-design/icons-vue; no new UI or illustration dependency.
- vue-i18n with `vi-VN` and `en-US`.
- Existing global theme uses Ant Design defaults. The purple login styling uses scoped CSS. A browser regression check confirms the existing workspace theme is preserved after navigation and reload.
- System name comes from `import.meta.env.VITE_APP_TITLE`, also used by the existing document title.
- Existing uncommitted header/layout/locale changes were preserved. WarehouseSelector.vue was already modified and was not edited for this task.

## Files changed for this task

- `src/views/login/index.vue`: responsive 54% / 46% layout, purple branding, four-line headline, CSS warehouse illustration, accessible form, fixed-size loading indicator and inline error.
- `src/assets/logo.svg`, `src/assets/logo-inverse.svg`: original three-bar mark for light and dark surfaces.
- `src/components/layout/BrandLogo.vue`: reusable logo component; decorative and labeled variants.
- `src/components/layout/AppHeader.vue`: shared logo and narrow-screen breadcrumb adjustment.
- `src/layouts/BasicLayout.vue`: shared logo and configured system name in expanded/collapsed sidebar.
- `src/locales/vi-VN.ts`, `src/locales/en-US.ts`: new login copy and accessible labels.
- `tests/login.browser.mjs`: repeatable Chrome integration checks with intercepted API responses.
- `docs/login-artifacts/`: screenshots, machine-readable checks, and this report.

Auth API/store, request interceptors, storage, permission helpers, route guards, session handling and logout implementation were not edited. Passwords are submitted unchanged, including leading/trailing spaces.

## Verification

- `pnpm run type-check`
- `pnpm run lint`
- `pnpm run build` (passes; Vite reports the existing large-chunk warning)
- `node tests/login.browser.mjs`

Chrome checks cover:

- 1440x900, 1024x768, 768x1024, 320x740, 1440x500 and 320x360; no horizontal overflow.
- Four headline lines, 54% brand column, hidden illustration below 768px, reachable support and submit on short screens.
- Associated labels, autocomplete attributes, keyboard password toggle and visible focus.
- Chrome autofill pseudo-state styling via CDP, readable text for both inputs.
- Required validation, failed login, stable loading/error layout and prevention of duplicate Enter submissions.
- Exact login payload and preservation of password whitespace.
- Token saving, identity/permission loading, successful login, permission-dependent landing, redirect query handling, forbidden routes, 401 token refresh and logout cleanup.
- Both SVG variants, sidebar collapse, header at 320/768/1440, long system-name text and English locale.

See `checks.json` for the completed check list.

## Reproduction

Use the local Vite server at http://127.0.0.1:5173, then run the browser command above. The script reuses the local Playwright installation already referenced by `tests/dashboard.browser.mjs`; it adds no project dependency. Override `PLAYWRIGHT_MODULE`, `CHROME_PATH` or `LOGIN_TEST_URL` if needed.

## Limits

Authentication was exercised through controlled API responses in Chrome, not a live backend account. Autofill appearance and a reduced viewport were simulated; no physical mobile keyboard or password-manager credential fill was tested.
