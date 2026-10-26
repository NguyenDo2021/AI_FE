# Tồn kho và Lịch sử biến động — kiểm tra giao diện

Ngày kiểm tra: 26/10/2026.

## Thay đổi

- Giữ hai route `/stock/inventory` và `/stock/movements`, cùng dùng `InventoryPage.vue`.
- Tiêu đề, mô tả, thẻ kho nền tím, bộ lọc có nhãn và nút Đặt lại đồng bộ giao diện danh mục.
- Tái sử dụng `FittedListTable`: header cố định, một vùng cuộn dữ liệu theo mỗi chiều, thanh phân trang và lựa chọn 10/20/50/100 ngoài vùng cuộn; mặc định 10.
- Thêm row key tùy chọn cho bảng dùng chung để dùng khóa warehouseId/productId của tồn kho; các nơi khác tiếp tục mặc định id.
- Hai route dùng khung content co giãn hiện có. Resize/sidebar chỉ đo lại chiều cao, không thay pageSize hoặc tải lại dữ liệu.
- Giữ cột và thứ tự BE; số lượng căn phải, dùng formatter BigInt hiện có, giữ tồn 0 và sản phẩm ngừng hoạt động.
- Biến động có dấu +/− và màu theo token theme; loại lạ hiển thị mã gốc. Chứng từ, mã sản phẩm và UUID hiển thị một dòng với ellipsis/tooltip.
- Giữ quyền, nguồn kho trên header, API client, snapshot lịch sử, chuyển timezone, kiểm tra khoảng thời gian và cách mở chứng từ hiện có.
- Khi tổng giảm về 0 trên trang sau, đưa phân trang về trang 1. Tiếp tục bỏ qua response cũ khi đổi kho/quyền/bộ lọc.

## Tệp sửa/thêm

| Tệp                                        | Nội dung                                                                    |
| ------------------------------------------ | --------------------------------------------------------------------------- |
| src/views/stock/InventoryPage.vue          | Hai giao diện và tích hợp bảng co giãn                                      |
| src/components/catalog/FittedListTable.vue | Row key tùy chọn, mặc định id                                               |
| src/layouts/BasicLayout.vue                | Áp dụng khung content có sẵn cho hai route                                  |
| src/locales/vi-VN.ts, src/locales/en-US.ts | Mô tả, nhãn danh sách, tổng và thời gian                                    |
| tests/stock.test.mjs                       | Kiểm thử phân trang, dữ liệu biên, timezone, quyền và response cũ           |
| tests/sales.test.mjs                       | Cập nhật test doubles cho component được tái sử dụng; giữ kiểm tra chứng từ |
| tests/inventory.browser.mjs                | Kiểm tra Chrome với API giả lập                                             |
| docs/inventory-ui-checks.md                | Báo cáo này                                                                 |

## Kết quả thực tế

- `npm.cmd run type-check`: đạt.
- `npm.cmd run build`: đạt. Vite có cảnh báo chunk lớn hơn 500 kB ở DashboardChart, ngoài phạm vi thay đổi này.
- ESLint các tệp sửa/thêm: đạt.
- `node --test tests/stock.test.mjs tests/sales.test.mjs`: 59/59 đạt.
- `node --test tests/catalog.test.mjs tests/stocktake.test.mjs`: 47/47 đạt.
- `node tests/inventory.browser.mjs`: 92 kiểm tra đạt, không có lỗi runtime.

Các ca trình duyệt gồm:

- 360/390/768/1024/1366/1920px cho cả hai màn hình; mô phỏng zoom 125% bằng CSS zoom; viewport thấp 390×420.
- Căn header/body, cuộn dọc/ngang, scrollbar trong vùng bảng, footer ngoài vùng cuộn, không tràn ngang trang; desktop vừa viewport.
- PageSize 10/20/50/100, trang 2, reset cuộn khi chuyển trang; resize/sidebar không phát sinh API và giữ pageSize.
- Selector tải trang sản phẩm thứ hai, tìm kiếm server, chọn sản phẩm ngừng hoạt động và giữ nhãn sau tìm kiếm khác, reset.
- Tồn 0, trạng thái ngừng hoạt động, số nguyên 9223372036854775807; biến động dương và -9223372036854775808 không mất chính xác.
- Snapshot mã/tên/đơn vị, fallback loại biến động lạ, chứng từ dài, tooltip và UUID một dòng.
- Đổi kho khi request trước còn chậm; dữ liệu và tên kho mới không bị response cũ ghi đè.
- Empty state, lỗi 403/404, chưa chọn kho không gọi API, kho ngừng hoạt động vẫn có trong selector theo cơ chế sẵn có, 401 chuyển về đăng nhập.
- Quyền chỉ xem lịch sử vẫn đọc được dữ liệu; không có quyền chứng từ thì giữ nhãn nhưng ẩn link/nút; ngoại lệ ADMIN vẫn hoạt động; không gọi API người dùng theo từng dòng.
- Giữ route trả hàng/kiểm kê, nút mở chi tiết phiếu nhập/đơn bán sẵn có.
- Nhập từ 08/10/2026 00:00 đến 02:00 ở Asia/Bangkok gửi chính xác 07/10/2026 17:00Z đến 19:00Z; fixture giữ bản ghi đúng tại from và loại bản ghi đúng tại to.

Ảnh và JSON số đo lưu tại `%TEMP%/codex-inventory-browser`; `results.json` chứa 92 kiểm tra và số đo của từng viewport. Fixture chỉ nằm trong tests, không đưa vào ứng dụng.

## Giới hạn kiểm chứng

- Chưa kiểm tra backend thật, tài khoản thật hoặc dữ liệu nghiệp vụ thật. Phép lọc biên thời gian và phản hồi quyền trong trình duyệt dùng fixture; API client hiện có không đổi.
- Zoom được mô phỏng bằng CSS zoom; chưa thao tác zoom trong giao diện Chrome.
- Viewport thấp được mô phỏng; chưa thử bàn phím ảo trên thiết bị vật lý, Safari hoặc Firefox.
- Kiểm tra mở chứng từ xác nhận route/quyền và GET đúng ID; response chi tiết giả lập 404, không kiểm tra lại toàn bộ nội dung các modal chứng từ.

Để chạy lại browser test: khởi động Vite ở 127.0.0.1:5178, rồi chạy `node tests/inventory.browser.mjs`. Bộ kiểm thử tận dụng Playwright đã có trong thư mục tạm, không thêm dependency; có thể cấu hình `PLAYWRIGHT_MODULE`, `CHROME_PATH` và `INVENTORY_TEST_URL`.
