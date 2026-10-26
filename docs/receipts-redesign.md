# Refactor giao diện Phiếu nhập kho

Hoàn tất ngày 23/10/2026. Chỉ thay đổi module Phiếu nhập kho và các tệp kiểm thử/bàn giao liên quan; không thêm dependency.

## Tệp thay đổi

| Tệp                                      | Nội dung                                                                                                                                                                     |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/views/stock/ReceiptsPage.vue`       | Bố cục, bộ lọc có nhãn, nút tạo tím, tái sử dụng FittedListTable, tám cột đúng thứ tự, thao tác theo quyền/trạng thái, ellipsis/tooltip, tiền VND và formatter ngày hiện có. |
| `src/components/stock/ReceiptDialog.vue` | Chia phần thông tin/sản phẩm, bảng nhập dòng giữ nguyên state, chi tiết snapshot và audit, nội dung cảnh báo xác nhận/hủy, vùng cuộn form và footer riêng.                   |
| `tests/stock.test.mjs`                   | Bổ sung mock formatDate cho component dùng formatter ngày chung.                                                                                                             |
| `tests/receipts.browser.mjs`             | Bộ kiểm thử Chrome headless với toàn bộ API được chặn bằng fixtures.                                                                                                         |
| `docs/receipts-redesign.md`              | Báo cáo này.                                                                                                                                                                 |

Không sửa API client, tiện ích tính/serialize số lớn, permission/store, component dùng chung hoặc layout chung. CSS giới hạn workspace dùng `:has(.receipts-page)`, chỉ áp dụng khi route phiếu nhập hiện diện.

## Hành vi

- Mặc định 10 dòng; chọn 10/20/50/100 gọi API server, về trang 1 và giữ bộ lọc; total lấy từ API.
- Resize và sidebar chỉ cập nhật kích thước bảng. Header cố định, Thao tác cố định bên phải theo cả hai chiều. Pagination/pageSize ở ngoài vùng dữ liệu cuộn.
- Desktop đủ cao không cuộn toàn trang; mobile và viewport quá thấp cho phép cuộn cần thiết. Bảng form không dùng phân trang danh sách phiếu.
- Mã phiếu giữ nguyên, rút gọn bằng ellipsis và tooltip đầy đủ. Tiền dùng formatStockInteger với ký hiệu ₫; không chuyển số tiền/version sang Number.
- Ngày nghiệp vụ dùng formatDate, timestamp dùng formatDateTime hiện có. Từ ngày/đến ngày vẫn gửi chuỗi YYYY-MM-DD, bao gồm cả hai đầu.
- Giữ nguồn dữ liệu và tìm kiếm/phân trang của ProductSelect; giữ kho không thể đổi khi sửa.
- Giữ nguyên handler CRUD/xác nhận/hủy, validation, payload/version, chống gửi lặp, xử lý lỗi/conflict và tải lại danh sách sau thao tác. Giữ ngoại lệ ADMIN và nguồn kho được giao.
- Phiếu đã xác nhận/hủy hiển thị chỉ đọc, kể cả khi trạng thái thay đổi trước lúc mở form sửa. Chi tiết sản phẩm dùng snapshot của phiếu.
- Hủy CONFIRMED giữ reason bắt buộc; DRAFT cho phép bỏ trống. Cảnh báo nói rõ đảo lượng nhập và có thể bị từ chối khi không đủ tồn.

## Kết quả thực tế

- `npm.cmd run type-check`: đạt; build cuối cũng chạy lại vue-tsc.
- `npm.cmd run build`: đạt. Vite còn cảnh báo chunk trên 500 kB của bundle ứng dụng; không sửa module ngoài phạm vi.
- `npm.cmd run test:stock`: 21/21 đạt.
- ESLint trên hai component và hai tệp kiểm thử: đạt.
- `git diff --check`: đạt.
- `node tests/receipts.browser.mjs`: **179 kiểm tra đạt**, không có lỗi runtime/ResizeObserver được ghi nhận.

Kiểm thử trình duyệt gồm:

- 360×800, 390×844, 768×1024, 1024×768, 1366×768, 1920×1080.
- Mô phỏng zoom 125% từ 1366×768 bằng CSS viewport 1093×614 và DPR 1.25; viewport 390×400 mô phỏng vùng nhìn còn lại khi mở bàn phím.
- API total 237, danh sách rỗng, nhiều trang, chọn tất cả pageSize, mã dài 123 ký tự, tooltip, supplier null, số tiền int64 tối đa 9223372036854775807.
- Cuộn hai chiều, vị trí header/cột Thao tác, căn khớp header/body, pagination ngoài vùng cuộn, không có scroller dữ liệu lồng cùng chiều.
- Resize/sidebar không gọi lại API; đổi trang về đầu bảng; bộ lọc giữ pageSize, size giữ bộ lọc; kiểm tra khoảng ngày đảo và hai đầu bao gồm; response cũ không ghi đè response mới.
- Tạo nháp, sửa nháp giữ số lớn/version và bỏ warehouseId khỏi PUT, xác nhận chống gửi lặp, hủy nháp không có reason, hủy CONFIRMED có reason được trim, lỗi INSUFFICIENT_STOCK và conflict giữ dữ liệu/chặn retry.
- Chi tiết snapshot/chỉ đọc, quyền UPDATE/CONFIRM/CANCEL riêng lẻ, chỉ VIEW, ngoại lệ ADMIN, lọc kho w2 không thay kho làm việc w1, WAREHOUSE_ACCESS_DENIED và FORBIDDEN.
- Form một cột trên mobile, footer trong viewport, cuộn form ở màn hình thấp, dữ liệu/dòng còn nguyên khi resize, dropdown mobile không bị cắt.

Ảnh và JSON chi tiết được tạo tại:

`C:\Users\dont\AppData\Local\Temp\codex-receipts-artifacts`

Trong đó `browser-results.json` chứa 179 kiểm tra, phép đo và request fixtures; `list-*.png`, `form-*.png`, `zoom-125.png` là ảnh các kích thước. Nếu từng chạy kiểm thử thất bại trước đó, các tệp `failure.*` cũ có thể vẫn còn trong thư mục tạm; kết quả cuối là `browser-results.json`.

Harness tái sử dụng Playwright đã có trong `%TEMP%/codex-dashboard-browser/node_modules/playwright` và Chrome đã cài, cùng cách với các kiểm thử trình duyệt hiện có; không cập nhật package.json/lockfile.

## Chưa kiểm tra được

Không gọi backend thật và không xác nhận/hủy dữ liệu production. Cần kiểm tra tích hợp với backend ở môi trường thử nghiệm để xác nhận thay đổi tồn kho, phạm vi kho thực tế và các tình huống cạnh tranh đồng thời. Zoom là mô phỏng viewport/DPR, chưa thao tác native browser zoom; bàn phím ảo cũng được mô phỏng bằng viewport thấp. Chưa chạy thiết bị di động thật hoặc trình duyệt khác Chrome.
