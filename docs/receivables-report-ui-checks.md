# Báo cáo công nợ hiện tại — 28/10/2026

## File thay đổi

- `src/views/reports/ReceivablesReportPage.vue`: màn riêng cho `/reports/receivables-summary`, theme tím, bộ lọc kho, khung tổng tiền, hai chỉ số tiền và ba chỉ số số lượng, timestamp và chú thích nghiệp vụ.
- `src/router/index.ts`: route báo cáo dùng component mới, giữ metadata/quyền hiện có. Route `/sales/receivables` nhận tùy chọn `initialWarehouseId` từ query để giữ phạm vi khi mở chi tiết.
- `src/views/sales/ReceivablesPage.vue`: nhận kho ban đầu cho cả tab khách hàng và khách lẻ. Chỉ áp dụng khi khởi tạo; thay đổi context, reset, phân quyền và kiểm tra phạm vi của màn đích giữ hành vi hiện có.
- `src/layouts/BasicLayout.vue`: modifier padding riêng cho nội dung route báo cáo này, có padding mobile. Không sửa header/sidebar/logo/navigation hoặc cố định chiều cao màn báo cáo.
- `src/locales/{vi-VN,en-US}.ts`: thêm namespace `receivablesReport`.
- `tests/reports.test.mjs`: thêm bảy kiểm thử state/query, metric, timestamp, request cũ, lỗi, permission và scope của màn mới.
- `tests/receivables-report.browser.mjs`: kiểm tra bằng Chrome với API giả lập, không đọc/ghi dữ liệu backend thật.

Tái sử dụng `useSalesScope`, client `getReport`, DTO `ReceivablesSummary`, `reportError`, `reportValue`, parser số nguyên lớn và component Ant Design Vue. Form/toggle và styling theo pattern các báo cáo đã refactor. Không có component filter/card dùng chung riêng trong các màn đó; không sửa hoặc tách các màn khác để tạo thêm abstraction.

## Bộ lọc, dữ liệu và điều hướng

- `filters` giữ kho đang nhập; `appliedFilters` giữ kho đã áp dụng. Bỏ auto-search riêng màn này; Tìm kiếm/Enter áp dụng một lần. Reload dùng kho đã áp dụng. Reset về mặc định hiện có: tất cả kho được phép.
- Giữ option kho ngừng hoạt động. Select có title tên đầy đủ, phạm vi đang hiển thị nằm trong hero và không đổi theo draft.
- GET `/api/reports/receivables-summary` vẫn chỉ gửi `warehouseId` nếu chọn kho. Không gửi from/to, page/pageSize hay productId. Shared client hiện yêu cầu các key ngày/phân trang trong kiểu input; các giá trị nội bộ rỗng không được đưa vào query endpoint này.
- Cả sáu giá trị đều lấy trực tiếp từ BE, không cộng hai thành phần để dựng tổng, không chuyển số nguyên lớn qua Number. Số 0 giữ nguyên, field thiếu hiển thị `—`.
- Timestamp lấy từ `asOf`, format như báo cáo cũ bằng `toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })`, thiếu thì `—`. Không dùng thời gian hiện tại thay response.
- Response, scope và timestamp được commit cùng nhau. Loading xóa dữ liệu cũ và dùng skeleton; error có thử lại/làm mới phạm vi. Sequence chặn response cũ, quyền/phạm vi bị thu hồi và response sau unmount.
- Link chi tiết chỉ có khi được `RECEIVABLE_VIEW` hoặc ADMIN, vẫn dùng `/sales/receivables` và màn đã refactor. Query `warehouseId` lấy từ scope của response đang hiển thị. Giá trị rỗng biểu thị tất cả kho, tránh màn đích tự thu hẹp theo kho làm việc ở header. Kho ngừng hoạt động truyền trực tiếp qua route, không thay đổi kho làm việc toàn ứng dụng. Màn đích tiếp tục kiểm tra quyền và `inScope` trước khi gọi API.
- Một nút chi tiết duy nhất: trong hero trên desktop đủ rộng, sau nhóm chỉ số khi thiếu chỗ/mobile.
- Mobile mặc định đóng form, dùng `aria-expanded`/`aria-controls`; v-show giữ state và bỏ trường ẩn khỏi Tab. Không tự đóng sau tìm kiếm. Thu/mở/resize không gọi API.

## Đã chạy

- `npm.cmd run type-check`: qua.
- `npm.cmd run lint`: qua.
- `npm.cmd run build`: qua, gồm vue-tsc. Vite còn cảnh báo chunk `DashboardChart` lớn hơn 500 kB; không thuộc thay đổi này.
- `npm.cmd run test:reports`: 40/40 qua.
- `npm.cmd run test:payments`: 44/44 qua, gồm các kiểm thử công nợ hiện có.
- `node tests/receivables-report.browser.mjs`: 168 kiểm tra qua, không có runtime error.

Kiểm tra trình duyệt gồm:

- Endpoint/method/query/Authorization hiện có; khởi tạo, submit, Enter, reset và reload không gọi lặp.
- Kho cụ thể, tất cả kho, kho ngừng hoạt động, tên kho rất dài, tách draft/applied/scope/timestamp.
- Đủ sáu metric với số lượng khác nhau để phát hiện nhầm mapping; tổng BE khác tổng hai thành phần; 0, thiếu field và int64 chính xác `9.223.372.036.854.775.807`.
- Timestamp BE hiển thị giờ Việt Nam khi timezone trình duyệt là America/New_York.
- Link chi tiết nhận kho ngừng hoạt động đã áp dụng dù draft đã chọn kho khác. Tất cả kho được giữ khi header đang chọn một kho làm việc. Không đổi kho làm việc khi điều hướng. Quyền báo cáo và quyền chi tiết tách biệt, ngoại lệ ADMIN còn hiệu lực.
- Bộ lọc đóng/mở, trường ẩn bỏ qua Tab, giữ form state qua breakpoint, không có toggle cấp hai, mobile tìm kiếm giữ form mở, nút khoảng 44px.
- 320, 375, 390, 414, 768, 1024, 1440px cho dữ liệu thường và toàn bộ sáu metric int64 dài. Sidebar thu/mở, viewport thấp 1024×500 và mô phỏng zoom CSS 125%. Không có overflow ngang toàn trang, số liệu không tràn card, một link chi tiết, hover/focus reload không tăng kích thước trang.
- Loading skeleton, error giữ message BE và xóa số liệu/link cũ, route thiếu quyền.

Script dùng Vite tại `http://127.0.0.1:5178`, đổi bằng `RECEIVABLES_REPORT_TEST_URL`. Playwright lấy từ `PLAYWRIGHT_MODULE` hoặc môi trường test tạm hiện có; Chrome lấy từ `CHROME_PATH` hoặc đường dẫn Windows mặc định. Kết quả chi tiết nằm tại `%TEMP%/codex-receivables-report-browser/results.json`.

## Chưa xác minh

Chưa kiểm tra backend thật bằng tài khoản Admin/nhân viên, dữ liệu công nợ thực, browser zoom gốc, trình duyệt khác Chrome hoặc trình đọc màn hình. Kiểm thử fixture xác minh hành vi FE, không xác nhận cách BE tính công nợ.

![Desktop](receivables-report-artifacts/desktop.png)

![Mobile mở bộ lọc](receivables-report-artifacts/mobile-expanded.png)
