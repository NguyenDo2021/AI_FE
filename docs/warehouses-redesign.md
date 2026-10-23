# Quản lý kho — 22/10/2026

Đã refactor trực tiếp route `/catalog/warehouses`, dùng lại theme tím, bố cục, toolbar, footer, drawer và cơ chế ResizeObserver/pageSize của Sản phẩm/Nhóm sản phẩm. Giữ AppHeader, AppSidebar, API client, DTO, validation và cơ chế phân quyền hiện tại.

## File thay đổi

- `src/components/catalog/CatalogListTable.vue`: thêm biến thể kho dùng Ant Design Table; giữ sáu cột Mã/Tên/Địa chỉ/Số điện thoại/Trạng thái/Thao tác; width lần lượt 148/220/300/156/164/144px, Thao tác còn 84px khi vùng bảng dưới 600px. Chỉ Thao tác fixed bên phải. Tổng `scroll.x` tính từ cấu hình width. Toolbar/total/footer và cơ chế đo chiều cao dùng chung với hai danh mục đã hoàn thiện.
- `src/views/catalog/CatalogPage.vue`: bố cục, bộ lọc responsive luôn hiện, nhãn Thêm kho, dropdown thao tác khi hẹp; drawer đủ code/name/address/phone/note/status, giới hạn ký tự, label liên kết control, nội dung chi tiết đầy đủ. Bỏ nhánh BasicTable/BasicModal cũ. Áp dụng bộ lọc đã tìm kiếm khi reload/sau lưu. Xử lý trang không hợp lệ khi total về 0; kiểm tra quyền sau GET trước PUT trạng thái. Khi kho bị từ chối phạm vi/403, xóa danh sách, detail và dữ liệu form, bỏ qua các response đang chờ.
- `src/layouts/BasicLayout.vue`: cho route kho dùng workspace chiều cao khả dụng hiện có. Không thay component header/sidebar.
- `src/locales/vi-VN.ts`, `src/locales/en-US.ts`: nhãn mô tả, thêm kho, danh sách, total, keyword và khoảng hiển thị.
- `tests/warehouses.browser.mjs`: kiểm tra Chrome headless với API giả lập có kiểm soát; bật hiển thị scrollbar thật để kiểm tra chiều cao thanh cuộn.
- `tests/product-groups.browser.mjs`: bổ sung biến môi trường `GROUPS_TEST_ARTIFACTS` để lưu kết quả hồi quy riêng; không thay kỳ vọng kiểm tra.
- `docs/warehouses-redesign.md`, `docs/warehouses-artifacts/*`: báo cáo, ảnh chụp, kết quả đo kho và hồi quy.

## Bảng, chiều cao và responsive

Bảng cuộn ngang bằng `.ant-table-content` của thư viện, không có wrapper cuộn ngang thứ hai và không dùng `scroll.y`. Header và các ô Thao tác đều `fixed: 'right'`, nền đục cho thường/hover/selected, z-index tương ứng 3/2; shadow mép trái theo trạng thái ping của Ant Design. Tooltip/dropdown dùng portal mặc định. Địa chỉ/mã/tên giới hạn hai dòng trong ô và có tooltip; chi tiết hiển thị toàn văn. Điện thoại giữ chuỗi và số 0 đầu; giá trị tùy chọn trống hiển thị `—`.

Bộ lọc cùng hàng khi đủ chỗ, xuống hai hàng rồi bố trí input và select riêng hàng trên mobile. Không ẩn hoặc gộp cột kho. Hành động mobile vào một dropdown. Phân trang xuống hàng khi cần. Card danh sách ôm dữ liệu như Nhóm sản phẩm, trong khi host đo vẫn nhận toàn bộ chiều cao còn lại.

Chiều cao hàng kho cố định 76px. Capacity là floor của chiều cao host còn lại sau khi trừ toolbar, header bảng, footer, padding/border, **scrollbar đo thực tế** và 8px dự phòng; giới hạn số nguyên 1–100. ResizeObserver theo dõi host/toolbar/header/footer, debounce 140ms; cập nhật DOM sau đổi chiều rộng trước khi đo. Chỉ đổi capacity mới tải lại và về page 1. Không cắt mảng items hoặc ẩn hàng/phân trang. Chiều cao tối thiểu của host tính từ các vùng điều khiển cộng một hàng, cho phép trang cuộn tự nhiên khi cửa sổ quá thấp/bàn phím mở.

## API, form và quyền

Tiếp tục dùng GET danh sách/chi tiết, POST và PUT trong `catalog.api.ts`; không đổi đường dẫn hay thêm endpoint. Query chỉ gồm page/pageSize/keyword/status; bỏ status khi Tất cả, trim keyword, giữ thứ tự BE và lấy total từ response. `listVersion` loại response cũ. Sau lưu tải lại theo bộ lọc đang áp dụng.

Validation/payload dùng lại `validateCatalog`, `toCatalogForm`, `catalogPayload`, `catalogFieldErrors`: code ASCII tối đa 80, trim và uppercase; name 160; address 500; phone 20; note 2000; status số 0/1. Không thêm regex điện thoại. Form loading/khóa trong khi lưu, chống submit lặp và hiển thị lỗi tại trường. Drawer đủ rộng có hai cột, mobile một cột; body cuộn và footer Hủy/Lưu riêng.

Đổi trạng thái GET bản mới nhất rồi PUT đầy đủ code/name/address/phone/note/status; không gửi id/createdAt/updatedAt. VIEW/CREATE/UPDATE và ngoại lệ ADMIN dùng cơ chế đã có. 401/403 qua client chung; WAREHOUSE_ACCESS_DENIED refresh phạm vi hiện có. Không thêm DELETE hoặc gán nhân viên.

## Kết quả kiểm tra thực tế

- `npm.cmd run type-check`: qua.
- `npm.cmd run lint`: qua.
- `npm.cmd run build`: qua. Còn cảnh báo chunk DashboardChart khoảng 584.54kB >500kB đã tồn tại trước thay đổi này.
- `node --test --test-reporter=spec tests/*.test.mjs`: **206/206 qua**.
- Chrome kho trên Vite dev: **124/124 qua** ở lượt đầy đủ đầu; sau đó bổ sung kiểm tra thứ tự BE, loading và phần chiều cao scrollbar.
- Chrome kho trên bundle production: **137/137 qua**.
- Chrome hồi quy Sản phẩm trên bundle production: **59/59 qua**.
- Chrome hồi quy Nhóm sản phẩm trên bundle production: **59/59 qua**.
- `git diff --check`: qua.

Các kiểm tra kho gồm cuộn đầu/giữa/cuối, header/cell fixed thẳng hàng, nền đục cả khi hover, một scrollbar khi cần và không có scrollbar thừa khi đủ rộng; sidebar đóng/mở; render đủ trang API với hàng 76px; địa chỉ 500 ký tự, code/name 80/160, note 2000 và dữ liệu trống; tooltip, loading, nhiều trang, Enter/reset/status 0, response cũ, resize không đổi capacity; thêm/sửa/đổi trạng thái và payload đầy đủ; lỗi field/trùng code; VIEW-only/CREATE-only/VIEW+UPDATE/ADMIN; 401/403 và từ chối phạm vi, không tạo vòng lặp request.

| Viewport CSS / tình huống | pageSize API | Scrollbar ngang | Kết quả                                                                 |
| ------------------------- | ------------ | --------------- | ----------------------------------------------------------------------- |
| 1366×768                  | 3            | 10px            | Không cuộn dọc trang/bảng, đủ hàng và phân trang                        |
| 1920×1080                 | 8            | Không           | Như trên; bảng đủ rộng                                                  |
| 360×800                   | 1            | 10px            | Đủ sáu cột, dropdown, phân trang xuống hàng                             |
| 390×844                   | 2            | 10px            | Đủ sáu cột, không tràn ngang toàn trang                                 |
| 768×1024                  | 6            | 10px            | Bộ lọc wrap, đủ hàng và phân trang                                      |
| 1024×768                  | 3            | 10px            | Như trên                                                                |
| 1093×614, DPR 1.25        | 2            | 10px            | Mô phỏng zoom 125%, không tràn                                          |
| 1366×500                  | 1            | 10px            | Một hàng, mọi điều khiển tiếp cận được                                  |
| 390×400                   | 1            | 10px            | Cho phép cuộn dọc trang; form có body cuộn và footer vẫn trong viewport |
| 1366×768, sidebar thu gọn | 3            | Không           | Tự cập nhật chiều rộng, không cuộn ngang thừa                           |
| 1366×768, sidebar mở lại  | 3            | 10px            | Fixed/header/scrollbar cập nhật đúng                                    |

Các số đo có cảnh báo phạm vi kho trống theo fixture; tài khoản thực có thể có capacity khác tùy chiều cao các thông báo hiện hữu.

[Desktop 1366](warehouses-artifacts/desktop-1366.png), [Desktop 1920](warehouses-artifacts/desktop-1920.png), [Mobile 360](warehouses-artifacts/mobile-360.png), [Mobile 390](warehouses-artifacts/mobile-390.png), [Tablet 768](warehouses-artifacts/tablet-768.png), [Tablet 1024](warehouses-artifacts/tablet-1024.png), [Chi tiết](warehouses-artifacts/detail.png).

[Kết quả và số đo kho](warehouses-artifacts/browser-results.json), [Hồi quy Sản phẩm](warehouses-artifacts/products-regression/browser-results.json), [Hồi quy Nhóm sản phẩm](warehouses-artifacts/groups-regression/browser-results.json).

## Phạm vi xác minh và chạy lại

Chrome headless dùng API/tài khoản giả lập, không ghi backend thật. Chưa xác minh với tài khoản BE thật hoặc Safari/Firefox. Zoom 125% mô phỏng bằng viewport CSS/DPR, chưa thay mức zoom từ menu Chrome. Không deploy.

Các server dev/preview có sẵn được dùng để kiểm tra; không thay cấu hình hosting hoặc thêm dependency. Bộ kiểm tra dùng Playwright có sẵn tại `%TEMP%/codex-dashboard-browser/node_modules/playwright` và Chrome Program Files.

```powershell
npm.cmd run type-check
npm.cmd run lint
npm.cmd run build
node --test --test-reporter=spec tests/*.test.mjs
# Vite preview phục vụ dist tại 4173
$env:WAREHOUSES_TEST_URL = 'http://127.0.0.1:4173'
node tests/warehouses.browser.mjs
$env:PRODUCTS_TEST_URL = 'http://127.0.0.1:4173'
$env:PRODUCTS_TEST_ARTIFACTS = 'docs/warehouses-artifacts/products-regression'
node tests/products.browser.mjs
$env:GROUPS_TEST_URL = 'http://127.0.0.1:4173'
$env:GROUPS_TEST_ARTIFACTS = 'docs/warehouses-artifacts/groups-regression'
node tests/product-groups.browser.mjs
```
