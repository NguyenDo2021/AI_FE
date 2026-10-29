# Kiểm tra màn Báo cáo hàng tồn thấp

Ngày kiểm tra: 28/10/2026.

## Phạm vi triển khai

- `src/views/reports/LowStockReportPage.vue`: màn riêng cho báo cáo tồn thấp, giao diện tím theo demo, form submit, dải total/chú thích, bảng 6 cột và phân trang server.
- `src/router/index.ts`: route tồn thấp dùng component mới; giữ permission `REPORT_LOW_STOCK_VIEW` và ngoại lệ ADMIN.
- `src/layouts/BasicLayout.vue`: chỉ bổ sung route tồn thấp vào workspace có giới hạn chiều cao đang dùng cho các bảng báo cáo. Không sửa header/sidebar hoặc giao diện route khác.
- `src/locales/vi-VN.ts`, `src/locales/en-US.ts`: nhãn màn tồn thấp.
- `tests/reports.test.mjs`, `tests/low-stock-report.browser.mjs`: kiểm thử hành vi và responsive.

Tái sử dụng `ProductSelect`, `FittedListTable`, `useSalesScope`, `getReport`, `getReportExport`, `reportValue` và `downloadBlob`. Không thay service, DTO, quy tắc BE, cơ chế parse int64, hay component dùng chung.

Form kho/sản phẩm là bản nháp; chỉ submit bằng Tìm kiếm/Enter mới áp dụng và về trang đầu. Đặt lại khôi phục mặc định hiện có (tất cả kho được phép, không chọn sản phẩm, 10 dòng). Phân trang, reload và export dùng snapshot đã áp dụng. Thay breakpoint, mở/đóng filter và đổi sidebar không gọi API báo cáo. Submit/reset/scope change hủy export cũ; sequence chặn response cũ ghi đè dữ liệu mới.

## Kiểm tra tự động đã chạy

- `pnpm type-check`: đạt.
- `pnpm lint`: đạt.
- `pnpm build`: đạt. Vite vẫn cảnh báo chunk lớn hơn 500 kB ở bundle dashboard hiện có.
- `pnpm test:reports`: 45/45 test đạt, gồm 5 test mới cho màn tồn thấp.
- `node tests/low-stock-report.browser.mjs`: 220 kiểm tra đạt bằng Chrome headless với API giả lập, không truy cập dữ liệu BE thật.

Kiểm thử trình duyệt bao gồm:

- Submit/reset/Enter/reload không tạo request trùng; draft chưa submit không đổi query của reload/export; bỏ chọn sản phẩm và reset về mặc định.
- Query báo cáo chỉ có `warehouseId`, `productId` nếu có và phân trang; export không chứa ngày/phân trang, dùng Authorization hiện có.
- Total BE là 137 dù trang chỉ có 10 dòng; cùng sản phẩm ở nhiều kho giữ thành các dòng riêng; giữ đơn vị response và shortage do BE cung cấp, kể cả fixture cố ý khác phép trừ tại FE.
- Tồn 0, int64 `9223372036854775807`, tên kho/sản phẩm dài; số không tràn ô.
- 10/20/50/100 dòng, chuyển trang, reload giữ trang, header cố định, cuộn ngang trong bảng, phân trang ngoài vùng cuộn và nằm trọn trong panel.
- Rỗng/loading/lỗi API, message BE trong JSON blob, `EXPORT_TOO_LARGE`, tên file UTF-8 từ Content-Disposition và route thiếu quyền.
- 320, 375, 390, 414, 768, 1024, 1440px; mobile filter đóng/mở, aria, Tab bỏ qua field ẩn, giữ draft qua breakpoint, tìm kiếm không tự đóng filter.
- Sidebar mở/đóng, viewport thấp 1024×500 và CSS zoom 125%; không có scrollbar ngang ngoài bảng, không có lỗi runtime/ResizeObserver.

Test component bổ sung kiểm tra response cũ đến muộn, lỗi không mất draft, scope kho thay đổi, ngoại lệ ADMIN, hủy export khi submit/thu hồi quyền, chặn click export lặp. Các test export dùng chung tiếp tục kiểm tra filename fallback, blob JSON, cleanup object URL và số nguyên chính xác.

Ảnh chụp và kết quả chi tiết được ghi vào `%TEMP%/codex-low-stock-report-browser/`: `desktop.png`, `mobile-open.png`, `mobile-closed.png`, `results.json`.

## Chưa xác minh với môi trường thật

- Chưa gọi BE thật hoặc mở workbook XLSX thật. Fixture XLSX chỉ kiểm tra luồng download, không kiểm tra nội dung workbook.
- Cần môi trường tích hợp để xác nhận CORS expose `Content-Disposition`, dữ liệu/quy tắc tồn thấp của BE và vòng đời đăng nhập/refresh token 401 thực tế. Cơ chế HTTP và permission hiện có được giữ nguyên.
- Chưa kiểm tra trên thiết bị cảm ứng thật; responsive dùng Chrome headless, zoom dùng CSS 125%.
