# Báo cáo tối ưu bundle FE — 21/10/2026

Đã thực hiện thay đổi trong project. Tổng JavaScript nén thực nhận trên production preview giảm **59,0% ở login**, **31,0% khi mở trực tiếp dashboard**, và **26,7% cho toàn bộ phiên login → dashboard**. Không thay đổi template, CSS, API hoặc logic nghiệp vụ của ứng dụng.

## Phân tích trước khi sửa

Đã đọc `package.json`, lockfile, Vite config, `main.ts`, `App.vue`, router/guards, layout, login, dashboard, chart component, các barrel export và import thư viện trong toàn bộ `src`.

Build gốc bằng `pnpm build`: Vite 6.4.3, Ant Design Vue 4.2.6, ECharts 6.1.0. Phân tích thành phần bằng Rollup `chunk.modules`, ghi số byte **file đã phát ra sau toàn bộ hook của Vite** và gzip từng file. Xem [before.json](before.json), [after.json](after.json); mỗi chunk có `imports`, `dynamicImports`, `packages`, danh sách module và số byte đóng góp.

**Nguyên nhân của index:**

- `main.ts` import default `Antd` rồi `app.use(Antd)`. Plugin của Ant Design Vue duyệt và cài mọi component, nên tree-shaking không loại được các component không dùng. Entry chứa cả `es/qrcode/qrcodegen.js`, upload, image, calendar và các module UI khác không cần cho login.
- `router/index.ts` import đồng bộ `BasicLayout`. Chuỗi này kéo `AppHeader`, `WarehouseSelector`, menu, icon của khu vực sau đăng nhập vào entry.
- Module dùng chung bắt buộc vẫn gồm Vue runtime, router, Pinia, Axios, auth/request/storage, route guards, i18n với cả hai bộ thông điệp. Auth cũng dùng warehouse store và utility chính xác số tiền khi logout; giữ nguyên quan hệ này để không đổi hành vi phiên đăng nhập.
- Đóng góp trước minify trong index: Ant Design Vue **2.748.724 B**, Axios **161.588 B**, Vue runtime-core **151.441 B**, lodash-es **138.932 B**, mã ứng dụng **118.511 B**, icons-vue **95.967 B**. Đây là số byte Rollup trước minify, **không phải** kích thước gzip của package và không được cộng trực tiếp vào bảng file đã minify.

**Nguyên nhân của BusinessDashboard:**

- `views/dashboard/index.vue` đã dùng `defineAsyncComponent` cho BusinessDashboard; các route màn hình khác cũng đã lazy-load.
- BusinessDashboard import đồng bộ DashboardChart. Chunk chứa BusinessDashboard, `useBusinessDashboard`, `utils/dashboard`, dashboard API, DashboardChart, ECharts và zrender.
- Đóng góp trước minify: ECharts **1.121.306 B**, zrender **466.763 B**, mã ứng dụng **46.952 B**, tslib **1.514 B**. Các module lớn gồm ECharts core, LineView, TooltipView, AxisBuilder, BarView và zrender Element.
- ECharts **đã** dùng `echarts/core`, `echarts/charts`, `echarts/components`, `echarts/renderers`; không import toàn bộ `echarts`. Đã đối chiếu option thực tế: line, pie, bar; grid, tooltip, legend, markLine, aria; SVGRenderer đều đang được dùng. Giữ nguyên toàn bộ đăng ký này, formatter tiền, xử lý resize và dispose.

**Barrel, icon, locale, utility, Excel/PDF:**

- Các barrel `src/components/index.ts`, `src/api/index.ts`, `src/utils/index.ts` không kéo màn hình nặng hoặc ECharts vào entry trong báo cáo thực tế. Không sửa các barrel chỉ vì chúng tồn tại.
- Icon đang import tên cụ thể; package icons đánh dấu `sideEffects: false`. Không có import toàn bộ namespace icon để tra động. Sau lazy-load layout, icon menu chuyển theo layout; icon dùng chung vẫn do Rollup chia sẻ.
- Locale i18n vi-VN/en-US, fallback và compiler hiện tại được giữ nguyên. Day.js chỉ import locale `vi`, không có import tất cả locale. Utility lodash-es là dependency bắc cầu của UI và được tree-shake; không thay utility xử lý tiền bằng Number.
- Đã rà toàn bộ nơi dùng Excel/PDF: xuất báo cáo và biên lai nhận Blob từ BE, kiểm tra MIME/signature/tên file rồi tải hoặc preview bằng URL Blob. Project không có xlsx/exceljs/jsPDF/pdfmake hay thư viện tạo tài liệu tương tự để loại bỏ. Không xóa dependency nào.

## Thay đổi

| File | Thay đổi |
| --- | --- |
| `src/main.ts` | Bỏ default Antd và `app.use(Antd)`; giữ reset.css, auth handlers và thứ tự khởi động. |
| `vite.config.ts` | Thêm resolver Ant Design Vue để compiler import đúng component tại nơi dùng; `importStyle: false` phù hợp CSS-in-JS của v4; `dirs: []`, `dts: false` tránh tự quét component ứng dụng và sinh file ngoài ý muốn. |
| `src/router/index.ts` | Lazy-load BasicLayout; giữ nguyên routes, metadata, guards và phân quyền. |
| `src/views/reports/BusinessDashboard.vue` | DashboardChart thành async component, chỉ tải khi một biểu đồ thực sự được render. Dashboard không có section được cấp quyền sẽ không tải ECharts. |
| `package.json`, `pnpm-lock.yaml` | Thêm duy nhất devDependency `unplugin-vue-components` phiên bản cố định 28.4.1 và lệnh analyze/measure. Các phiên bản dependency hiện có không đổi. |
| `scripts/analyze-bundle.mjs` | Build phân tích và báo cáo module/chunk/import/gzip, không thêm code phân tích vào runtime. |
| `scripts/measure-bundle.browser.mjs` | Đo toàn bộ JavaScript bằng Chrome CDP/Resource Timing, gồm chunk phụ thuộc và preload; kiểm tra byte giải nén khớp file build, cache tắt. |
| `tests/dashboard.browser.mjs` | Cho phép chọn URL/artifact directory; mock API dùng được với production; thay truy cập nội bộ Vue development bằng kiểm tra SVG/legend/tooltip trực tiếp. |
| `tests/login.browser.mjs` | Thêm lựa chọn artifact directory qua biến môi trường; giữ các kiểm tra có sẵn. File này đã tồn tại ở trạng thái untracked trước tác vụ. |
| `tests/ui-imports.browser.mjs` | Kiểm tra render 22 route và mở 11 form tạo mới trên production, bắt lỗi component/import/runtime. |
| `docs/bundle/*` | Báo cáo và số liệu kiểm tra trước/sau. |

Không dùng `manualChunks`, không đổi `chunkSizeWarningLimit`, không tắt cảnh báo, không nâng hoặc thay thư viện runtime. Resolver chỉ là công cụ build; component và CSS vẫn là Ant Design Vue hiện có. Cách import theo component được mô tả trong [tài liệu chính thức của Ant Design Vue](https://www.antdv.com/docs/vue/introduce) và [unplugin-vue-components](https://github.com/unplugin/unplugin-vue-components).

Các thay đổi logo, layout/header/warehouse selector, locale và thiết kế login đã có sẵn trong working tree được giữ nguyên; chúng không phải phần chỉnh sửa UI của tác vụ này.

## Kích thước file build

Đơn vị kB = 1.000 byte. Gzip là ước tính nén **từng file** của build.

| Thành phần | Minify trước | Minify sau | Gzip trước | Gzip sau |
| --- | ---: | ---: | ---: | ---: |
| Entry index | 1.754,61 | 428,36 | 547,06 | 147,21 |
| BusinessDashboard | 607,57 | 23,47 | 209,48 | 8,71 |
| DashboardChart tách riêng | Đã nằm trong BusinessDashboard | 584,54 | Đã nằm trong BusinessDashboard | 201,27 |
| BusinessDashboard + DashboardChart | 607,57 | **608,01** | 209,48 | **209,98** |
| BasicLayout tách riêng | Đã nằm trong index | 57,38 | Đã nằm trong index | 17,64 |

**Không dùng mức giảm riêng file BusinessDashboard làm mức giảm dashboard.** Khi có đủ ba biểu đồ, phần logic + chart gần như giữ nguyên và tăng nhẹ do ranh giới import. Lợi ích chính cho dashboard có dữ liệu đến từ việc không tải UI không liên quan; tách chart có lợi cho dashboard không cần render biểu đồ.

## Tổng JavaScript thực nhận trong trình duyệt

Đo trên Chrome **155.0.8059.85**, Windows, production build phục vụ bằng `vite preview` tại `127.0.0.1:4173`, viewport 1440×1100. Mỗi kịch bản có browser context mới, HTTP cache tắt bằng CDP, service worker bị chặn. Hai lần đo dùng cùng cấu hình, không throttle CPU hoặc network, cùng API giả lập và cùng quyền/dữ liệu cho các kịch bản so sánh.

Chờ đăng nhập render hoặc cả ba biểu đồ SVG render xong và network idle rồi lấy số liệu. Các chunk được request đã được đối chiếu với đồ thị import của báo cáo; không bỏ qua dependency dùng chung hoặc preload. Không đo với backend thật hoặc qua CDN đang triển khai.

| Kịch bản | JS giải nén trước → sau (kB) | Body JS thực nhận trước → sau (kB) | Giảm body | Số request trước → sau |
| --- | ---: | ---: | ---: | ---: |
| Mở mới login | 1.760,95 → 660,65 | **549,991 → 225,698** | **59,0%** | 3 → 12 |
| Mở trực tiếp `/dashboard`, đủ ba biểu đồ | 2.367,79 → 1.548,23 | **759,679 → 524,059** | **31,0%** | 6 → 24 |
| Cả phiên mở login rồi đăng nhập vào dashboard | 2.374,13 → 1.650,00 | **762,608 → 558,979** | **26,7%** | 8 → 27 |
| Dashboard chỉ có quyền xem tổng quan, không có chart | Không có baseline tương ứng → 963,69 | Không có baseline tương ứng → **322,788** | Không so sánh | Sau: 23 |

Dòng login → dashboard là tổng cộng từ lúc mở login, không chỉ lượt điều hướng cuối. Phần JavaScript tải thêm sau login tăng từ khoảng **212,617 lên 333,281 kB** vì UI dashboard được dời ra khỏi login; tổng cả phiên vẫn giảm. Đây là đánh đổi có chủ đích, không đồng nghĩa lượt chuyển trang tải ít byte hơn riêng lẻ.

Phân biệt các phép đo:

| Kịch bản | Tổng gzip ước tính từ file build trước → sau (kB) | Body thực nhận trước → sau (kB) | Tổng CDP network bytes JS, gồm header, trước → sau (kB) |
| --- | ---: | ---: | ---: |
| Login | 549,789 → 225,496 | 549,991 → 225,698 | 551,488 → 230,229 |
| Dashboard trực tiếp | 759,508 → 523,906 | 759,679 → 524,059 | 762,399 → 533,136 |
| Cả phiên login → dashboard | 762,235 → 558,624 | 762,608 → 558,979 | 766,019 → 569,130 |

`encodedBodySize` là body thực nhận do Resource Timing ghi nhận; đa số file dùng gzip, một số file nhỏ gửi identity. Vì vậy khác tổng `gzipSync` từ build. `decodedBodySize` là số byte JavaScript sau giải nén, không phải kích thước truyền. `transferSize` của Resource Timing cũng được lưu nhưng không dùng làm byte header thực tế; cột network dùng `Network.loadingFinished.encodedDataLength` từ CDP. Các số liệu chỉ tính JavaScript, không gồm HTML/CSS/ảnh/API.

Dữ liệu thô: [browser-before.json](browser-before.json), [browser-after.json](browser-after.json), có danh sách từng file, content encoding, cache state, decoded/encoded/transfer/CDP bytes.

## Dependency dùng chung và đánh đổi chia chunk

Trước tối ưu, BusinessDashboard import index cùng `useSalesScope`, `useCatalogPermission`, utility reports. Vì vậy 607,57 kB riêng BusinessDashboard không đại diện toàn trang; trình duyệt phải lấy cả index 1.754,61 kB.

Sau tối ưu, login và dashboard cùng dùng entry 428,36 kB chứa Vue/router/Pinia/Axios/auth/i18n và UI nền của App/request. Chúng còn dùng chung BrandLogo, các phần UI input/button/status/motion và helper lodash-es. Các chunk như `collapseMotion` còn chứa dom-align và resize-observer-polyfill dùng bởi nhiều component. Tên file `index-*`, `dayjs-*`, `ReloadOutlined-*` do Rollup đặt theo một module; tên không có nghĩa file chỉ chứa module đó. Xem trường `modules`/`packages` trong after.json để biết nội dung thật.

BasicLayout và UI menu/select/dropdown tải sau khi guard cho phép vào khu vực đăng nhập. Dashboard thêm DatePicker/Day.js, bộ lọc, skeleton/alert và chart khi cần. Table, drawer và UI của các trang nghiệp vụ nằm ở các chunk route/shared tương ứng, không bị gom hết vào entry. Báo cáo trình duyệt cộng toàn bộ những file này một lần theo request thực tế.

Không đặt manualChunks vì việc gom vendor/UI/chart thành các chunk lớn có thể kéo lại code không cần vào trang hoặc làm thay đổi dependency dùng chung. Rollup tự chia được các nhóm dùng chung; phép đo tổng trang chứng minh lợi ích mà không cần quy tắc chia chunk thủ công. Số request tăng được công khai ở bảng trên. Chưa đo latency, thời gian tương tác hoặc parse/execute trên mạng thiết bị thực; không suy ra mức cải thiện tốc độ từ phần trăm giảm byte.

## Kiểm tra và giới hạn

- `pnpm build`: **pass**, gồm `vue-tsc --noEmit` và Vite production build.
- `pnpm lint`: **pass**.
- Toàn bộ 9 file `*.test.mjs`, chạy tuần tự: **206/206 pass**. Có kiểm tra precision int64/số tiền, retry/refresh, PDF Blob, Excel Blob và nghiệp vụ bán hàng, tồn kho, thu/hoàn tiền, kiểm kê, báo cáo.
- Login production: **68 kiểm tra pass**, gồm đăng nhập sai/đúng, chống submit trùng, password, refresh token 401, logout, redirect, guard, phân quyền, responsive, i18n. [login-checks.json](login-checks.json).
- Dashboard production: **26 kiểm tra pass**, gồm đủ ba chart SVG, legend, tooltip số tiền chính xác vượt Number safe integer, resize 768/390/320px, bộ lọc ngày/kho, phân trang 205 kho, lỗi từng section, zero donut, thu hồi quyền, legacy redirect và người dùng thiếu quyền. [dashboard-checks.json](dashboard-checks.json). Các response 500/403 trong log là fixture lỗi có chủ đích.
- Import UI production: **22 route, 11 form tạo mới pass**, không thiếu component/export hoặc lỗi runtime. Chỉ kiểm tra render/mở form với fixture, không gửi mutation thật và không thay thế kiểm thử backend E2E. [ui-checks.json](ui-checks.json).
- Đo dashboard-empty xác nhận browser **không request DashboardChart/ECharts** khi không có biểu đồ cần hiển thị.
- Không có thay đổi CSS/template và không thực hiện pixel diff trước/sau; kiểm tra responsive/hiển thị theo các assertion có sẵn.

Lần build đầu tiên sau chỉnh sửa gặp lỗi bộ nhớ native tạm thời của Node. Chạy lại thành công; các build phân tích và build cuối cùng đều hoàn tất, không thêm cấu hình tăng bộ nhớ hay che lỗi vào project.

**Cảnh báo còn lại:** DashboardChart **584,54 kB minify / 201,27 kB gzip**, vượt ngưỡng mặc định 500 kB. Nó phục vụ line/pie/bar, tooltip, legend, markLine, accessibility và SVG cần cho giao diện hiện có. Tách tiếp chỉ để giảm kích thước từng file không chứng minh giảm tổng tải khi dashboard hiển thị đủ biểu đồ, nên giữ cảnh báo. Không có cảnh báo kích thước entry index nữa.

## Chạy lại

Môi trường này có pnpm mặc định v8 nhưng node_modules/lockfile được tạo bằng pnpm v10. Thêm plugin bằng `corepack pnpm@10.20.0 add -D unplugin-vue-components@28.4.1 --save-exact` để giữ đúng định dạng lockfile; không chỉnh cấu hình pnpm toàn máy hoặc nâng dependency cũ. Ở checkout mới nên dùng pnpm tương thích lockfile v9, ví dụ `corepack pnpm@10.20.0 install --frozen-lockfile`.

```powershell
pnpm build
pnpm analyze:bundle after
pnpm preview --host 127.0.0.1 --port 4173 --strictPort
```

Ở terminal khác, dùng Chrome và Playwright đã cài ngoài project (không thêm Playwright vào dependency runtime):

```powershell
$env:PLAYWRIGHT_MODULE='C:/path/to/playwright/index.mjs'
$env:CHROME_PATH='C:/Program Files/Google/Chrome/Application/chrome.exe'
$env:BUNDLE_TEST_URL='http://127.0.0.1:4173'
pnpm measure:bundle after
node tests/ui-imports.browser.mjs

$env:LOGIN_TEST_URL=$env:BUNDLE_TEST_URL
$env:LOGIN_TEST_ARTIFACTS='dist/browser-checks/login'
node tests/login.browser.mjs

$env:DASHBOARD_TEST_URL=$env:BUNDLE_TEST_URL
$env:DASHBOARD_TEST_ARTIFACTS='dist/browser-checks/dashboard'
node tests/dashboard.browser.mjs

$testFiles=(Get-ChildItem tests -Filter '*.test.mjs').FullName
node --test --test-concurrency=1 $testFiles
pnpm lint
```

Dashboard browser test dùng Chrome và Playwright tại đường dẫn đã có sẵn trong test; login/measure/UI smoke cho phép override qua biến môi trường ở trên. Các báo cáo JSON trước tối ưu là snapshot của working tree ban đầu, không dùng `git reset` hoặc sửa các thay đổi đang có của người dùng để dựng baseline.
