# Báo cáo hoạt động bán hàng — 28/10/2026

## Thay đổi

- `src/views/reports/SalesReportPage.vue`: màn riêng cho `/reports/sales`, dùng Vue 3, TypeScript và Ant Design Vue. Header, xuất Excel, bộ lọc, kỳ/phạm vi, bốn chỉ số chính, sáu chỉ số bổ sung, chú thích nghiệp vụ và bảng chi tiết theo kho.
- `src/router/index.ts`: route bán hàng dùng component mới; giữ metadata, `REPORT_SALES_VIEW` và ngoại lệ ADMIN hiện có.
- `src/layouts/BasicLayout.vue`: thêm riêng route bán hàng vào layout danh sách hiện có để bảng nhận không gian còn lại.
- `src/locales/{vi-VN,en-US}.ts`: thêm namespace `salesReport`, giữ nhãn/các báo cáo khác.
- `tests/reports.test.mjs`: bổ sung kiểm thử state, metric, scope, export và lỗi ngày của màn mới.
- `tests/sales-report.browser.mjs`: kiểm tra Chrome với API giả lập; không đọc/ghi dữ liệu backend.

Tái sử dụng nguyên trạng `FittedListTable`, `useSalesScope`, `getReport`, `getReportExport`, DTO, `reportRange`, `reportQuery`, `reportValue`, parser số nguyên lớn và helper tải Blob. Các thay đổi nhập–xuất–tồn đã tồn tại trong workspace được giữ lại.

## Bộ lọc và tính nhất quán

- Bỏ auto-search trên màn bán hàng bằng cách tách component khỏi màn báo cáo chung. `filters` giữ form đang nhập; `appliedFilters` giữ query đã áp dụng. Nút Tìm kiếm/Enter xác thực rồi gọi API một lần, về trang 1.
- Preset giữ cách tính ngày theo `Asia/Ho_Chi_Minh`, áp dụng ngay một lần. Reset về tất cả kho được phép, đầu tháng đến hôm nay, trang 1 và 10 dòng/trang.
- Phân trang, reload và Excel dùng query đã áp dụng dù form đang sửa. Excel không gửi page/pageSize. Reload giữ trang hiện tại; đổi pageSize về trang 1.
- Mobile mặc định đóng form. Thu/mở và đổi breakpoint giữ form state, không gọi API. Tìm kiếm giữ form mở. Preset chỉ xuất hiện một nơi, không có cấp mở rộng thứ hai trên mobile. Trường ẩn không nhận Tab, toggle có `aria-expanded`/`aria-controls`.
- Kỳ hiển thị lấy từ `period` BE; phạm vi lấy từ query đã áp dụng. Khi tải, xóa summary/period/rows cũ. Summary và rows được nhận cùng response; sequence chống response cũ ghi đè. Giữ refresh phạm vi kho và hủy export khi user/scope thay đổi.
- Giữ đủ 10 metric summary và 11 cột bảng; không cộng các dòng trang, không tính lại công thức. Số nguyên lớn không chuyển sang Number, metric âm giữ nguyên, field thiếu hiển thị dấu gạch thay vì số 0.
- Bảng tái sử dụng ResizeObserver và cleanup của `FittedListTable`, cuộn ngang/dọc bên trong, header cố định, phân trang ở ngoài. Không đổi pageSize do resize. Các cột số mở rộng theo độ dài chuỗi chính xác; tên kho có tooltip đầy đủ.
- Giữ HTTP client có Authorization, response Blob, tên file từ Content-Disposition và fallback, đọc JSON lỗi trong Blob, hướng dẫn thu hẹp bộ lọc khi `EXPORT_TOO_LARGE`, chống export lặp và cleanup object URL hiện có.

## Đã kiểm tra

- `npm.cmd run type-check`: qua.
- `npm.cmd run lint`: qua.
- `npm.cmd run build`: qua, gồm vue-tsc. Vite còn cảnh báo chunk `DashboardChart` vượt 500 kB, ngoài phạm vi màn bán hàng.
- `npm.cmd run test:reports`: 33/33 qua.
- `node tests/sales-report.browser.mjs`: 192 kiểm tra qua, không có runtime error hoặc vòng lặp ResizeObserver.

Kiểm tra trình duyệt gồm khởi tạo, draft/submit/Enter, preset/reset/reload không gọi trùng; kho ngừng hoạt động/tất cả kho; validation ngày; export đúng query, Authorization, tên UTF-8 và JSON Blob `EXPORT_TOO_LARGE`; summary từ BE, số âm; đủ cột/mapping và phân trang server 10/20/50/100; empty/error/loading và route thiếu quyền.

Responsive đã kiểm tra 320, 375, 390, 414, 768, 1024, 1440px; bộ lọc đóng/mở, sidebar thu/mở, viewport thấp 1024×500, mô phỏng zoom CSS 125%. Kiểm tra thêm summary int64 âm `-9.223.372.036.854.775.808` ở tất cả bảy chiều rộng: không tràn card, không ẩn metric, không có cuộn ngang ngoài bảng. Header/cell thẳng hàng và footer không chồng vùng cuộn.

Script dùng Vite tại `http://127.0.0.1:5178`, có thể đổi bằng `SALES_REPORT_TEST_URL`. Playwright lấy từ `PLAYWRIGHT_MODULE` hoặc môi trường test tạm hiện có; Chrome lấy từ `CHROME_PATH` hoặc đường dẫn Windows mặc định. Kết quả chi tiết nằm tại `%TEMP%/codex-sales-report-browser/results.json`.

## Chưa xác minh

Chưa gọi backend thật bằng tài khoản Admin/nhân viên, mở workbook thực bằng Excel/LibreOffice, kiểm tra CORS Content-Disposition thực tế, browser zoom gốc, trình duyệt khác hoặc trình đọc màn hình. Fixture XLSX dùng chữ ký nhị phân để kiểm tra luồng tải file; không xác minh nội dung workbook thực.

![Desktop](sales-report-artifacts/desktop.png)

![Mobile mở bộ lọc](sales-report-artifacts/mobile-expanded.png)
