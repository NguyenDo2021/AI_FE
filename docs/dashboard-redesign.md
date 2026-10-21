# Tổng quan kinh doanh — 21/10/2026

Trang: `/dashboard` (menu riêng đầu sidebar). Đường dẫn cũ `/reports/dashboard` chuyển hướng sang `/dashboard`. Giữ BasicLayout, sidebar, Pinia scope/RBAC, API client Axios, Ant Design Vue và parser `parseStockJson` hiện có. Các báo cáo dạng bảng và luồng Excel vẫn dùng ReportsPage, API và helper xuất Excel cũ.

## Thay đổi

- KPI đúng các field `periodSections.sales.netSalesAmount`, `payments.netRecordedAmount`, `payments.netRefundedAmount`. Không số minh họa, tăng trưởng giả hoặc sparkline.
- API dashboard, trends và sales có trạng thái tải/lỗi/thử lại riêng. Hai vùng dùng cùng response dashboard (KPI/cơ cấu thu/việc hiện tại) chia sẻ trạng thái của nguồn này.
- Trends dùng from/to nguyên YYYY-MM-DD theo giờ Việt Nam, net âm, mốc 0, chú giải bật/tắt. Ngày/section thiếu giữ khoảng trống `null`, không suy diễn số 0. Chỉ trends giới hạn 366 ngày; kỳ dài hơn vẫn tải được các nguồn báo cáo khác và báo lỗi riêng trên trends.
- Sales lấy hết trang, 100 dòng/request; kiểm tra total, trang rỗng sớm và ID kho lặp. Không hiển thị kết quả một phần nếu lỗi. Sắp xếp chính xác bằng BigInt theo trị tuyệt đối, hiển thị tối đa 10 kho và nhãn bắt buộc khi có hơn 10 kho. Bảng mở rộng đối chiếu được toàn bộ kho đã tải; link báo cáo đủ kiểm tra REPORT_SALES_VIEW.
- Donut dùng recordedCashAmount/recordedBankTransferAmount. Tổng bằng 0 không tạo chart. Tỷ lệ tính bằng số nguyên chính xác, làm tròn đến 2 chữ số thập phân; tổng tỷ lệ có thể lệch 0,01% do làm tròn riêng từng mục. Giữ nguyên nhãn và chú thích về thời điểm tạo/đảo ghi nhận.
- Công nợ, cần hoàn và cặp kho/sản phẩm tồn thấp là currentSections, có asOf riêng. Link cần RECEIVABLE_VIEW / REFUND_VIEW / REPORT_LOW_STOCK_VIEW của màn hình đích.
- Bộ lọc kho dùng store `/users/me/warehouses`, kể cả kho ngừng hoạt động; tất cả kho là phạm vi được cấp. Mặc định đầu tháng đến hôm nay, thêm Hôm nay/7 ngày/Tháng này/Tháng trước. Bộ lọc ngày không ảnh hưởng ý nghĩa currentSections; không gọi API công nợ/tồn thấp bổ sung.
- Mỗi lần tải chụp bộ lọc, xóa số cũ ngay, AbortController hủy request cũ và generation từ chối response đến muộn. Không cache giữa user/phạm vi. 403 xóa toàn bộ dữ liệu nhạy cảm, làm mới scope hoặc danh tính một lần, chờ người dùng thử lại. Không tự lặp request dashboard.
- Định dạng tiền chính xác bằng parser/BigInt hiện có. Chia exact trong miền số nguyên trước khi chuyển thập phân đã scale sang Number cho tọa độ. Trục ghi triệu/tỷ VND và rút gọn số tọa độ cực lớn; tooltip/bảng luôn đọc số gốc, không cộng số đã scale.
- ECharts import core + Line/Pie/Bar + Grid/Tooltip/Legend/MarkLine/Aria + SVGRenderer; theo [hướng dẫn import module](https://echarts.apache.org/handbook/en/basics/import/) và [vòng đời/resize](https://echarts.apache.org/handbook/en/concepts/chart-size/). Không thêm thư viện chart khác. ResizeObserver và frame được dọn, chart dispose trước unmount. Không animation chart; skeleton không chạy animation.
- Người có REPORT_DASHBOARD_VIEW và Admin đã xác minh live vào tổng quan. Người khác giữ landing hợp lệ hiện có. `/` và `/dashboard` dùng guard để đến landing tương ứng. Không đổi route permission của báo cáo/Excel.

## File thay đổi

| File                                      | Nội dung                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------ |
| src/views/reports/BusinessDashboard.vue   | Trang mới theo bố cục demo, responsive, trạng thái panel, bảng đối chiếu exact |
| src/composables/useBusinessDashboard.ts   | Bộ lọc, snapshot, tải nguồn độc lập, abort, RBAC, scope/403                    |
| src/api/reports/dashboard.api.ts          | Ba API dùng client/parser hiện có, permission, phân trang đủ kho               |
| src/utils/dashboard.ts                    | Scale exact, top 10, cơ cấu thu, option chart và tooltip exact                 |
| src/components/reports/DashboardChart.vue | ECharts module, SVG, resize và dispose                                         |
| src/types/reports.ts                      | Kiểu response trends và section optional                                       |
| src/utils/reports.ts                      | Preset 7 ngày và thông báo lỗi contract trends                                 |
| src/router/index.ts                       | Route dashboard dùng trang mới                                                 |
| src/router/guards.ts                      | Route mặc định chuyển landing hợp lệ                                           |
| src/utils/landing.ts                      | Ưu tiên tổng quan cho người có quyền/Admin live                                |
| src/layouts/BasicLayout.vue               | Nền tổng quan và điều chỉnh sidebar/header mobile trên layout sẵn có           |
| package.json, pnpm-lock.yaml              | ECharts và lệnh test:dashboard                                                 |
| tests/dashboard.test.mjs                  | 14 kiểm thử API/số học/vòng đời request/quyền                                  |
| tests/dashboard.browser.mjs               | Kiểm tra tương tác Chrome với response API kiểm soát                           |
| tests/catalog.test.mjs                    | Cập nhật kỳ vọng landing của Admin theo yêu cầu mới                            |
| docs/dashboard-redesign.md                | Tài liệu bàn giao này                                                          |
| docs/dashboard-artifacts/*                | Ảnh desktop/mobile/số lớn và kết quả Chrome                                    |

## Kết quả kiểm tra

- `npm.cmd run type-check`: qua.
- `npm.cmd run lint`: qua, không lỗi/cảnh báo ESLint.
- `npm.cmd run build`: qua. Vite còn cảnh báo chunk lớn hơn 500 kB: main ứng dụng và trang tổng quan có ECharts; chart chỉ tải cùng route tổng quan.
- `node --test --test-reporter=spec tests/*.test.mjs`: **206/206 qua**, gồm **14 kiểm thử dashboard mới**, cùng hồi quy báo cáo/Excel/returns/refunds và các module hiện có.
- Chrome headless, reduced-motion: **26/26 qua**. Bao gồm tooltip raw VND qua di chuột thật, legend click thật, 205 kho/3 trang, KPI số lớn âm, tỷ lệ thu thật, bộ lọc kho/ngày, lỗi trends độc lập/thử lại, donut tổng 0, thu hồi kho 403 không lặp API, dashboard-only và landing không quyền báo cáo.
- Không tràn ngang và chart resize ở **768/390/320px**; đã xem ảnh desktop 1440px và mobile 390px. Nhãn trục số lớn được rút gọn để tránh chồng chữ; tooltip vẫn exact.
- `git diff --check`: qua.

Ảnh và log kiểm thử dùng fixture API có kiểm soát, không phải dữ liệu nghiệp vụ thật. Fixture chỉ ở tests, không được import vào mã ứng dụng.

- [Desktop](dashboard-artifacts/desktop.png)
- [Mobile](dashboard-artifacts/mobile.png)
- [Số âm vượt MAX_SAFE_INTEGER và tooltip](dashboard-artifacts/desktop-large.png)
- [Chi tiết 26 kiểm tra trình duyệt](dashboard-artifacts/browser-results.json)

### Chạy lại kiểm tra giao diện trong môi trường Windows hiện tại

```powershell
npm.cmd run dev -- --host 127.0.0.1
# terminal khác; Playwright nằm trong thư mục tạm, không là dependency của ứng dụng
npm.cmd install --prefix "$env:TEMP/codex-dashboard-browser" playwright --no-package-lock --no-audit --no-fund
node tests/dashboard.browser.mjs
```

Kịch bản dùng Chrome ở đường dẫn Program Files mặc định và Vite cổng 5173, API localhost:8080; cần chỉnh đường dẫn/cổng trong script nếu môi trường khác. Mọi request API của browser context kiểm thử được intercept, không ghi lên backend.

## Chưa xác minh được

Backend cục bộ `GET http://localhost:8080/api/reports/dashboard` trả **401** khi không có tài khoản/token. Chưa đối chiếu dữ liệu thật giữa ba API hoặc chạy với tài khoản Admin/nhân viên thật; chưa xác minh việc thu hồi quyền/kho trực tiếp trên backend. Các trường hợp đó đã kiểm tra bằng response kiểm soát và unit/integration test FE.

Chưa mở file Excel thực tế sau xuất và chưa đối soát dữ liệu Excel với backend. Luồng Excel không thay đổi, các kiểm thử hồi quy về permission/filter/blob/XLSX/snapshot/abort vẫn qua. Chưa kiểm tra trực tiếp Safari/Firefox. Không thay đổi hoặc triển khai backend/hosting.

## Đường dẫn tổng quan

Menu riêng và landing sau đăng nhập dùng `/dashboard`. `src/views/dashboard/index.vue` tải Tổng quan kinh doanh khi có REPORT_DASHBOARD_VIEW hoặc Admin đã xác minh; người chỉ có DASHBOARD_VIEW tiếp tục thấy trang mặc định hiện có tại cùng đường dẫn. Route `/reports/dashboard` chuyển hướng đến `/dashboard`, giữ query/hash. Hai kiểm tra Chrome bổ sung xác nhận menu đứng đầu được chọn đúng và liên kết cũ chuyển hướng đúng.
