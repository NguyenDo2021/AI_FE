# Báo cáo thu / hoàn — bàn giao và kiểm tra

Ngày kiểm tra: 28/10/2026.

## File của thay đổi này

- `src/views/reports/PaymentsReportPage.vue`: màn thu/hoàn riêng theo demo mới; filter có nhãn phía trên, ba chỉ số chính, hai nhóm chi tiết, kỳ/phạm vi, chú thích nghiệp vụ và bảng theo kho.
- `src/router/index.ts`: route `/reports/payments` dùng component mới; giữ nguyên metadata permission `REPORT_PAYMENT_VIEW` và ngoại lệ ADMIN.
- `src/layouts/BasicLayout.vue`: thêm class content riêng cho route thu/hoàn, cho phép cuộn trang tự nhiên. Không sửa header/sidebar hay style của báo cáo khác.
- `src/locales/vi-VN.ts`, `src/locales/en-US.ts`: nhãn và chú thích riêng của màn thu/hoàn.
- `tests/reports.test.mjs`: thêm 7 test component cho báo cáo thu/hoàn.
- `tests/payments-report.browser.mjs`: kiểm thử Chrome bằng API giả lập, xuất ảnh chụp và kết quả chi tiết.

Giữ nguyên các thay đổi tồn thấp đã thực hiện ở lượt trước và các thay đổi có sẵn của người dùng.

## Tái sử dụng và dữ liệu

Tái sử dụng `FittedListTable`, `useSalesScope`, `getReport`, `getReportExport`, `reportQuery`, `reportRange`, `reportValue`, `reportExportError` và `downloadBlob`. Không sửa API, DTO, HTTP client, định dạng số nguyên lớn hoặc component bảng dùng chung.

| Vùng            | Field DTO                                                                                                                                                                                                                              |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ba chỉ số chính | `netRecordedAmount`, `netRefundedAmount`, `netCashFlowAmount`                                                                                                                                                                          |
| Chi tiết thu    | `createdPaymentCount`, `cancelledPaymentCount`, `recordedCashAmount`, `recordedBankTransferAmount`, `reversedCashAmount`, `reversedBankTransferAmount`, `netCashAmount`, `netBankTransferAmount`                                       |
| Chi tiết hoàn   | `createdRefundCount`, `cancelledRefundCount`, `recordedRefundCashAmount`, `recordedRefundBankTransferAmount`, `reversedRefundCashAmount`, `reversedRefundBankTransferAmount`, `netRefundedCashAmount`, `netRefundedBankTransferAmount` |

Đủ 19 metric summary và 20 cột bảng gồm Kho + 19 metric theo thứ tự `paymentMetrics` hiện có. Không tính summary từ các dòng bảng, không tự trừ thu/hoàn, không ép số âm về 0. Field thiếu hiển thị `—`. Kỳ lấy từ response `period`; phạm vi hiển thị theo bộ lọc đã áp dụng, bao gồm kho ngừng hoạt động được phép.

## Filter, request và export

- Form là bản nháp. Tìm kiếm/Enter áp dụng toàn bộ form và về trang 1. Không có watcher tự tìm khi sửa kho/ngày.
- Preset Hôm nay/Tháng này/Tháng trước nằm dưới hàng chính khi mở rộng; mỗi preset áp dụng một lần qua `reportRange` hiện có. Reset về đầu tháng–hôm nay, tất cả kho được phép, 10 dòng như mặc định hiện tại; báo cáo độc lập với kho làm việc ở header.
- Mobile chỉ có một toggle Bộ lọc, mặc định đóng. Giữ draft khi đóng/mở và qua breakpoint; field ẩn không nhận Tab. Tìm kiếm không tự đóng filter. Lỗi ngày từ BE mở filter để thấy validation.
- Summary, bảng, kỳ và total được gán cùng một response; xóa dữ liệu cũ khi tải và chặn response đến muộn bằng sequence. Lỗi không xóa draft. Reload/phân trang/export dùng snapshot đã áp dụng.
- Giữ phân trang server 10/20/50/100, total BE và thứ tự dòng. Bảng cuộn ngang/dọc bên trong, header cố định, phân trang bên ngoài vùng cuộn.
- `GET /api/reports/payments/export` vẫn qua client Authorization hiện có, query chỉ `warehouseId` nếu có và `from/to`, không phân trang. Giữ Blob, tên Content-Disposition/fallback, đọc JSON lỗi và cleanup object URL của helper dùng chung. Loading export riêng; chặn click lặp và hủy export khi áp dụng filter mới, đổi quyền/scope hoặc unmount.

## Responsive và tài nguyên

CSS của component scoped. Chỉ route thu/hoàn có class content mới. Màn cho phép cuộn trang vì có nhiều metric; cap phần thân bảng dựa trên không gian thực tế, không đổi pageSize theo chiều cao.

Observer chỉ phản ứng với kích thước nội dung phía trên bảng và chiều rộng parent; thay đổi chiều cao do bảng không tự kích hoạt vòng lặp. Dọn observer, animation frame, window/visualViewport listener khi unmount. Chiều rộng màn được giới hạn cục bộ theo viewport thực tế để tránh body min-width 320px cộng scrollbar che mép panel. Token DatePicker riêng giữ panel lịch gọn trong khi control vẫn cao 44px.

## Kết quả đã chạy

- `pnpm type-check`: đạt.
- `pnpm lint`: đạt.
- `pnpm build`: đạt; Vite có cảnh báo chunk dashboard trên 500 kB hiện có.
- `pnpm test:reports`: **52/52 test đạt**.
- `node tests/payments-report.browser.mjs`: **287 kiểm tra đạt**, Chrome headless với toàn bộ API được giả lập.

Kiểm thử bao gồm:

- Đủ 19 metric, đúng mapping và 20 cột; total/summary toàn bộ bộ lọc, không phải trang đang xem; giữ net BE ngay cả khi fixture cố ý không bằng phép trừ thu–hoàn.
- Metric âm/0/thiếu field; `-9223372036854775808` hiển thị chính xác trong summary và bảng, không tràn ô/card.
- Fixture tạo phiếu trong tháng trước, đảo ghi nhận/hủy trong tháng sau; FE giữ metric âm và kỳ do BE trả. Đây là kiểm tra mapping FE, không xác minh cách BE phân bổ thời gian.
- Kho cụ thể/tất cả kho, kho ngừng hoạt động trong scope; draft không đổi nhãn phạm vi hay query reload/export; preset/reset/Enter/submit không gọi lặp.
- Validation FE và BE, tự mở filter mobile đang ẩn, response cũ, permission/ADMIN, scope bị thu hồi, hủy export cũ.
- Rỗng/loading/lỗi API; JSON blob message, `EXPORT_TOO_LARGE`, `NUMERIC_OVERFLOW`, tên file UTF-8 và Authorization. Các test helper hiện có tiếp tục kiểm tra filename fallback và object URL cleanup.
- 320, 375, 390, 414, 768, 1024, 1440px; filter/panel mở đóng, nhóm thu/hoàn độc lập, Tab/aria, sidebar mở đóng, màn thấp 1024×500 và CSS zoom 125%.
- Popup lịch 320px; field/nút/panel nằm trong viewport thực tế kể cả scrollbar; số lớn không bị cắt; cuộn ngang/dọc, header cố định, phân trang ngoài vùng cuộn và nằm trong panel; không có lỗi runtime/ResizeObserver.

Ảnh chụp và `results.json` nằm ở `%TEMP%/codex-payments-report-browser/`: `desktop.png`, `mobile-collapsed.png`, `mobile-expanded.png`.

## Chưa xác minh

- Chưa gọi BE thật hoặc mở workbook XLSX thật. Fixture download chỉ kiểm tra luồng FE, không chứng minh nội dung file Excel.
- Quy tắc tạo/hủy phiếu qua kỳ, CORS expose Content-Disposition, snapshot nhất quán và refresh/logout 401 thực tế cần kiểm thử tích hợp với BE và tài khoản có phạm vi kho thật. FE giữ nguyên contract và HTTP client hiện có.
- Chưa kiểm tra thiết bị cảm ứng thật; responsive bằng Chrome headless, zoom bằng CSS 125%.
