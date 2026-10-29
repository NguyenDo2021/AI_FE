# Báo cáo nhập–xuất–tồn — 28/10/2026

## Phạm vi và file

- `src/views/reports/InventoryReportPage.vue`: giao diện riêng cho `/reports/inventory`, theme tím, header xuất Excel, một form responsive, giải thích số liệu và bảng đủ 13 cột.
- `src/router/index.ts`: chỉ route nhập–xuất–tồn chuyển sang component mới; giữ nguyên metadata và permission.
- `src/layouts/BasicLayout.vue`: thêm route này vào layout danh sách có chiều cao giới hạn hiện có, không sửa header/sidebar.
- `src/locales/{vi-VN,en-US}.ts`: nhãn riêng trong namespace `inventoryReport`.
- `tests/reports.test.mjs`: thêm 4 kiểm thử cho màn mới, giữ các kiểm thử báo cáo hiện có.
- `tests/inventory-report.browser.mjs`: kiểm tra bằng Chrome với API giả lập.
- `docs/inventory-report-artifacts/{desktop,mobile-expanded}.png`: ảnh chụp từ lượt kiểm tra.

Tái sử dụng nguyên trạng `FittedListTable`, `ProductSelect`, `useSalesScope`, DTO/service báo cáo và Excel, `reportQuery`, `reportRange`, `reportValue`, parser số nguyên và helper tải Blob. Các báo cáo khác tiếp tục dùng `ReportsPage.vue`.

## Bộ lọc và dữ liệu

- Giá trị đang nhập nằm trong `filters`; query bảng nằm trong `appliedFilters`. Bỏ watcher tự tìm kiếm trên màn nhập–xuất–tồn. Submit form bằng nút hoặc Enter xác thực query rồi tải đúng một lần, về trang 1.
- Đặt lại về tất cả kho được phép, không chọn sản phẩm, đầu tháng đến hôm nay theo `Asia/Ho_Chi_Minh`, 10 dòng/trang; tải một lần. Preset giữ cách tính ngày và tự áp dụng một lần.
- Thu/mở chỉ đổi trạng thái hiển thị, không đổi bộ lọc, trang hay gọi API. Mobile mặc định đóng; tìm kiếm giữ form mở. `v-show` giữ control/state và ẩn khỏi Tab khi đóng.
- Phân trang/tải lại/Excel luôn lấy bộ lọc đã áp dụng, kể cả khi đang sửa form. Excel xuất toàn bộ kết quả, không gửi page/pageSize, có nhãn giải thích trên nút.
- Reload giữ trang hiện tại; thay pageSize về trang 1. Bảng dùng total BE, không tính lại tồn hoặc cộng tổng dữ liệu.
- Giữ kiểm tra quyền/phạm vi kho, số thứ tự chống response cũ và hủy export khi scope/user thay đổi. Không loại bỏ kho/sản phẩm ngừng hoạt động.
- Bảng tái sử dụng ResizeObserver/listener có cleanup của `FittedListTable`; tăng chiều cao tối thiểu riêng cho màn này để footer không chồng lên vùng cuộn ở mobile. Độ rộng cột số thích ứng độ dài chuỗi số chính xác; tên dài hiển thị tối đa hai dòng và có tooltip native đầy đủ.

## Đã chạy

- `npm.cmd run type-check`: qua.
- `npm.cmd run lint`: qua.
- `npm.cmd run build`: qua. Vite vẫn cảnh báo chunk `DashboardChart` lớn hơn 500 kB; không thuộc thay đổi này.
- `npm.cmd run test:reports`: 26/26 qua.
- `node tests/inventory-report.browser.mjs`: 153 kiểm tra qua, không có runtime error hoặc vòng lặp ResizeObserver.

Lượt lint/build chạy song song ban đầu thiếu bộ nhớ môi trường; chạy riêng lẻ sau đó đều thành công.

Kiểm tra trình duyệt bao gồm:

- Một request khi khởi tạo, submit/Enter, reset, preset, reload và đổi pageSize; không có request khi chỉnh draft, thu/mở hoặc resize.
- Kho ngừng hoạt động/tất cả kho, sản phẩm ngừng hoạt động, ngày không hợp lệ; giữ draft qua thu/mở và đổi breakpoint, giữ form mở sau tìm kiếm mobile, trường ẩn không nhận Tab.
- Export dùng bộ lọc đã áp dụng, Authorization và tên UTF-8 trong Content-Disposition; lỗi JSON Blob `EXPORT_TOO_LARGE`.
- Giữ nguyên số âm int64 `-9.223.372.036.854.775.808`, không chồng chữ số sang cột bên cạnh; tên dài có tooltip; đủ 13 cột.
- Server pagination 10/20/50/100; cuộn ngang/dọc, header cố định, footer ngoài vùng cuộn, loading/empty/error và route thiếu quyền.
- 320, 375, 390, 414, 768, 1024, 1440px; sidebar thu/mở, mở công thức, viewport thấp 1024×500 và mô phỏng zoom bằng CSS 125%. Không có cuộn ngang ngoài bảng, header/cell thẳng hàng.

Script dùng Vite tại `http://127.0.0.1:5178` (đổi bằng `INVENTORY_REPORT_TEST_URL`). Playwright lấy từ `PLAYWRIGHT_MODULE` hoặc môi trường test tạm đã có; Chrome lấy từ `CHROME_PATH` hoặc đường dẫn Windows mặc định. `results.json` đầy đủ được ghi vào `%TEMP%/codex-inventory-report-browser`.

## Chưa xác minh

Chưa gọi backend thật bằng tài khoản Admin/nhân viên, chưa mở workbook thật bằng Excel/LibreOffice, chưa kiểm tra CORS Content-Disposition thực tế hoặc lịch sử qua nhiều kỳ. Kiểm thử dùng fixture có kiểm soát để xác minh FE, không chứng minh dữ liệu nghiệp vụ BE. Chưa kiểm tra browser zoom gốc, trình duyệt khác hoặc trình đọc màn hình.

![Desktop](inventory-report-artifacts/desktop.png)

![Mobile mở bộ lọc](inventory-report-artifacts/mobile-expanded.png)
