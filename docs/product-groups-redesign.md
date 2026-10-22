# Nhóm sản phẩm — 22/10/2026

Route `/catalog/product-groups`. Giữ header, sidebar, MENU_ITEMS, route guard, API client và nghiệp vụ. Nhóm dùng chung hệ thống; không thêm bộ lọc kho, dependency, thống kê giả, DELETE hoặc tác động các sản phẩm thuộc nhóm. Dữ liệu giả lập chỉ nằm trong tests, không import vào ứng dụng.

## File sửa và phần tái sử dụng

- `src/components/catalog/CatalogListTable.vue`: đổi tên từ `ProductsTable.vue`, tái sử dụng nguyên cơ chế ResizeObserver/debounce, chiều cao hàng, toolbar, pagination và style bảng. Bổ sung biến thể `product-groups` với tên/mã, mô tả, trạng thái, thao tác. Biến thể Products vẫn dùng cùng component và giữ giao diện/cách hoạt động hiện có; không sao chép phép đo hoặc tạo tầng table framework mới.
- `src/views/catalog/CatalogPage.vue`: bố cục và nhãn Nhóm sản phẩm; drawer đủ bốn trường, bộ đếm mô tả, thông tin chi tiết đầy đủ; baseline/xác nhận dữ liệu chưa lưu cho Groups; GET chi tiết trước PUT đầy đủ, chỉnh trang nếu total giảm về 0; khởi tạo lại bảng khi đổi kind qua sidebar để capacity không bị treo dù số dòng giống nhau.
- `src/layouts/BasicLayout.vue`: cho route Nhóm sản phẩm dùng đúng lớp workspace/content chiều cao hữu hạn hiện có của Products. Không sửa AppHeader/AppSidebar hay style của những trang nội dung khác.
- `src/locales/vi-VN.ts`, `src/locales/en-US.ts`: nhãn danh sách, keyword, nút thêm và xác nhận bỏ dữ liệu.
- `tests/product-groups.browser.mjs`: kiểm thử Chrome riêng cho Groups.
- `tests/products.browser.mjs`: hồi quy bảng dùng chung; cập nhật kỳ vọng 5 cột ở 1366px theo sidebar 256px đã triển khai lượt trước, và cho phép chọn thư mục artifact qua biến môi trường.
- `docs/product-groups-artifacts/*`: ảnh/đo đạc Groups và kết quả hồi quy Products trong thư mục con `products-regression`.

API, kiểu DTO, helper `catalogPayload`, `toCatalogForm`, `validateCatalog`, `catalogFieldErrors`, `catalogError`, `formatDateTime` và cơ chế `useCatalogPermission` hiện có được dùng lại, không sửa contract.

## Phân trang theo chiều cao

Workspace ngoài có chiều cao 100dvh một lần; header giữ chiều cao tự nhiên, content flex nhận phần còn lại. Table host flex có min-height 0. ResizeObserver theo dõi host/toolbar/thead/footer, debounce 140ms; số dòng = floor((chiều cao host - padding/border - toolbar - thead - footer - 8px dự phòng) / rowHeight), giới hạn số nguyên 1–100. Chiều cao hàng dùng chung Products là 84px, hoặc 104px ở panel dưới 480px để chứa nhãn trạng thái dưới tên.

Chỉ emit capacity khi đổi; chỉ tải lại sau phép đo đầu tiên hoặc khi capacity đổi, đưa về page 1. Không scroll.y, không cắt mảng dữ liệu hay ẩn hàng bằng CSS. Header bảng được đo thực tế khi wrap. Nhóm có ít bản ghi dùng card co theo số hàng, footer sát phần dữ liệu; host đo vẫn giữ chiều cao khả dụng và nền trong suốt nên không có khoảng trắng lớn trong card, cũng không phát sinh vòng lặp đo/tải lại khi total ít.

Tìm kiếm/đổi trạng thái lọc/đặt lại về page 1, trạng thái Tất cả bỏ query status, keyword trim, reset chỉ gọi một lần. Dữ liệu là items/total từ server, không tự sort/filter trên một trang. Generation listVersion loại bỏ response cũ. Trang không hợp lệ sau mutation được chỉnh và tải lại, kể cả khi total về 0.

## Form, dữ liệu và quyền

Bốn trường code/name/description/status. Giữ validation và chuẩn hóa code ASCII, trim/chữ hoa theo helper hiện có; giới hạn 80/160/2000; status dạng số 0/1. Textarea có bộ đếm và giới hạn 2000 ký tự của Ant Design. Label được nối với control qua html-for/id. Drawer cho cuộn nội dung và footer Hủy/Lưu riêng. Detail hiển thị toàn văn, wrap từ dài và chỉ hiển thị metadata thời gian có trong response.

Chỉnh sửa nạp GET chi tiết. Đổi trạng thái xác nhận rồi GET bản mới nhất trước PUT đầy đủ; giữ code/name/description, không gửi id/thời gian/unit hay payload chỉ có status. Lưu/đổi trạng thái thành công tải lại với bộ lọc đã áp dụng. Loading/saving/statusBusy ngăn gửi lặp. Backend lỗi trùng mã/validation gắn vào trường theo helper; lỗi danh sách, chi tiết và form có vùng hiển thị tương ứng. 401/403 tiếp tục qua client chung; 403 đã kiểm tra không tạo vòng lặp tải danh sách.

PRODUCT_GROUP_VIEW/CREATE/UPDATE và ADMIN đã xác minh được kiểm tra theo cơ chế hiện có ở UI và handler. Không yêu cầu gán kho. Create-only có thể thêm nhưng không GET danh sách/chi tiết. Không thêm DELETE.

Bảo vệ dữ liệu chưa lưu dựa trên mẫu baseline + Modal.confirm của StocktakeDialog: Hủy, dấu đóng, Escape/mask cần xác nhận khi có thay đổi; hủy xác nhận giữ nguyên form. Guard cho cả leave và route update vì CatalogPage được dùng lại giữa các danh mục. beforeunload bảo vệ reload/đóng tab. Đang lưu thì chặn đóng/điều hướng. Bảo vệ mới chỉ bật cho Nhóm sản phẩm; luồng Products giữ nguyên.

## Kết quả kiểm tra

- `npm.cmd run type-check`: qua.
- `npm.cmd run lint`: qua.
- `npm.cmd run build`: qua. Cảnh báo DashboardChart lớn hơn 500kB hiện có vẫn còn.
- `node --test --test-reporter=spec tests/*.test.mjs`: 206/206 qua.
- `node tests/product-groups.browser.mjs`: 59/59 qua trên cả Vite dev và bundle production.
- Hồi quy `node tests/products.browser.mjs`: 59/59 qua sau khi dùng chung bảng.
- `git diff --check`: qua.

Các ca Groups gồm tên 160 ký tự, mã 80 ký tự, mô tả 2000 ký tự và null; rỗng/ít bản ghi/nhiều trang; Enter, status 0 và Tất cả, reset/reload, resize không đổi capacity không gọi API, request chậm cũ; POST chống lặp, PUT đủ trường, kích hoạt/ngừng hoạt động, lỗi trường/trùng mã, lỗi API, trang bị thu hẹp và total về 0; bảo vệ chưa lưu/điều hướng; VIEW-only/CREATE-only/ADMIN không gán kho, 403 không lặp. Không lỗi component/runtime.

| Viewport CSS       | Số dòng / trang | Kết quả                                      |
| ------------------ | --------------- | -------------------------------------------- |
| 1366×768           | 4               | Không cuộn trang/bảng, đủ hàng và footer     |
| 1920×1080          | 7               | Như trên                                     |
| 1366×500           | 1               | Như trên                                     |
| 1093×614, DPR 1,25 | 3               | Mô phỏng zoom 125%, không tràn               |
| 390×844            | 3               | Mô tả chuyển sang detail, thao tác trực tiếp |
| 320×640            | 2               | Tiêu đề/nút thêm xếp gọn, không tràn         |

[Desktop 1366](product-groups-artifacts/desktop-1366.png), [Desktop 1920](product-groups-artifacts/desktop-1920.png), [Cửa sổ thấp](product-groups-artifacts/low-500.png), [Zoom mô phỏng](product-groups-artifacts/zoom-125.png), [Mobile](product-groups-artifacts/mobile-320.png), [Ít bản ghi](product-groups-artifacts/few-records.png), [Chi tiết](product-groups-artifacts/detail.png), [Kết quả và phép đo](product-groups-artifacts/browser-results.json).

## Giới hạn và chạy lại

Chrome headless dùng API giả lập có kiểm soát, không ghi backend; chưa đối chiếu tài khoản/backend thật hoặc Safari/Firefox. Zoom 125% mô phỏng viewport/DPR, chưa đổi mức zoom bằng menu Chrome thực. Không deploy hosting/backend.

```powershell
# Vite dev đang chạy tại 127.0.0.1:5173
node tests/product-groups.browser.mjs
# Kiểm tra bundle đã build qua preview 4173
$env:GROUPS_TEST_URL = 'http://127.0.0.1:4173'
node tests/product-groups.browser.mjs
# Hồi quy Products, tránh ghi đè artifact bàn giao trước
$env:PRODUCTS_TEST_ARTIFACTS = 'docs/product-groups-artifacts/products-regression'
node tests/products.browser.mjs
```

Dùng Playwright có sẵn trong `%TEMP%/codex-dashboard-browser/node_modules/playwright` và Chrome Program Files; không thêm dependency ứng dụng.
