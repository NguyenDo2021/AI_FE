# Refactor Quản lý vai trò

Đã triển khai danh sách, form thêm/chỉnh sửa, drawer chi tiết và modal phân quyền theo ảnh tham chiếu, đồng bộ màu sắc/bố cục với module Người dùng trong repository.

## File thay đổi

| File | Nội dung |
| --- | --- |
| `src/views/system/role/index.vue` | Danh sách tám cột, thao tác icon, bộ lọc nháp/đã áp dụng, responsive, phân trang và tooltip. |
| `src/components/system/role/RoleDialog.vue` | Khung modal riêng cho module, giới hạn theo visual viewport, body cuộn và footer luôn truy cập được. |
| `src/components/system/role/RoleFormModal.vue` | Một form thêm/sửa, label phía trên, textarea mô tả, validation và chuyển đổi payload hiện có. |
| `src/components/system/role/RoleDetailDrawer.vue` | Drawer có khối nhận diện, đầy đủ sáu trường, giá trị xuống dòng và bố cục mobile một cột. |
| `src/components/system/role/RoleIdentity.vue` | Khối nhận diện dùng chung trong drawer và modal phân quyền. |
| `src/components/system/role/RolePermissionsModal.vue` | Tải toàn bộ danh mục, bản nháp lựa chọn, lọc cục bộ, bảo vệ ADMIN, chặn lưu khi tải lỗi và loại bỏ phản hồi cũ. |
| `src/layouts/BasicLayout.vue` | Thêm riêng route `system-role` vào bố cục bảng dùng chiều cao còn lại, giống `system-user`; thay đổi hai điều kiện route. |
| `src/locales/vi-VN.ts`, `src/locales/en-US.ts` | Nhãn và mô tả của module. |
| `tests/roles.browser.mjs` | Kiểm tra Chromium với API fixtures, lưu ảnh và kết quả đo layout. |
| `docs/roles-artifacts/*` | Ảnh chụp và kết quả kiểm tra cuối. |

## Phần dùng chung đã tái sử dụng

- `FittedListTable`: đo chiều cao còn lại, header riêng, cuộn dữ liệu, pagination bên ngoài, pageSize 10/20/50/100 và reload có loading/tooltip. Không sửa component này.
- `BasicModal`: sự kiện đóng/lưu, loading, focus management và hành vi chặn đóng khi đang lưu.
- Ant Design Vue, bộ icon hiện có, VueUse và bộ màu theme của module Người dùng (`#7357cf`, nền tím nhạt, border `#eeeaf6`).
- `formatDateTime`, `formatOrdinal`, `validationRules`, `hasPermission` và API/DTO hiện có.

Form giữ giới hạn tên 100, mã 50, mô tả 500; giữ regex chấp nhận chữ hoa/chữ thường, dấu gạch dưới và số, bắt đầu bằng chữ. Giữ trim payload và trạng thái mặc định 1. Mã vẫn chỉnh được khi sửa như code gốc.

Checkbox chỉ thay đổi bản nháp. Lọc không loại bỏ các ID đang ẩn; quyền từ endpoint assignment nhưng thiếu trong danh mục vẫn được giữ. ADMIN giữ checkbox disabled và gửi assignment đã lưu nếu bấm Lưu, đúng cơ chế cũ. Quyền sửa/xóa ADMIN vẫn do backend bảo vệ như trước. Không sửa API, DTO, xác thực, JWT, authorities hoặc phạm vi kho.

## Kết quả kiểm tra thực tế

- `pnpm run type-check`: thành công.
- `pnpm run lint`: thành công, không lỗi/cảnh báo.
- `pnpm run build`: thành công; script bao gồm `vue-tsc --noEmit` và Vite production build.
- `node tests/roles.browser.mjs`: thành công **11 nhóm kiểm tra, 50 lần đo layout, 0 lỗi runtime ghi nhận**.
- `git diff --check`: thành công.

Chromium đã kiểm tra các chiều rộng **320, 375, 390, 414, 768, 1024, 1440px** ở chiều cao 900px; thêm màn cao **360px** tại 390/1024px, sidebar mở/thu gọn và chuỗi dài không có khoảng trắng.

Các luồng đã chạy:

- Bộ lọc nháp không ảnh hưởng reload/phân trang; Enter/Search áp dụng một lần và về trang 1. Reset, lọc trạng thái, các pageSize 10/20/50/100 và phản hồi danh sách đến muộn.
- Thêm/sửa với validation, payload trim, API báo lỗi vẫn giữ dữ liệu, chặn lưu trùng; xem chi tiết và xác nhận/hủy xóa; tài khoản chỉ có ROLE_VIEW chỉ thấy nút xem.
- Tải danh mục quyền qua hai trang, chọn/bỏ/chọn lại, đổi từ khóa, bỏ lọc, đếm toàn bộ bản nháp và lưu đúng toàn bộ payload, kể cả quyền ngoài danh mục.
- Hủy/mở lại bỏ bản nháp; lỗi lưu giữ bản nháp; ADMIN khóa checkbox; lỗi tải assignment hoặc danh mục khóa Lưu và cho thử lại.
- Đóng vai trò A khi đang tải rồi mở B: phản hồi A đến muộn không ghi đè B.
- Trang/modal/drawer không tràn ngang; thông tin mobile xếp label trên giá trị; header/footer modal nằm trong viewport trên màn thấp; tooltip không che thao tác; đóng modal không để lại khóa cuộn body.

Kết quả chi tiết: [results.json](roles-artifacts/results.json).

Ảnh: [Danh sách desktop](roles-artifacts/list-1440.png), [Danh sách mobile](roles-artifacts/list-390.png), [Form mobile](roles-artifacts/mobile-form.png), [Chi tiết mobile](roles-artifacts/mobile-detail.png), [Phân quyền desktop](roles-artifacts/desktop-permissions.png).

## Giới hạn kiểm chứng

Browser suite chặn mọi request fetch/XHR bằng dữ liệu giả lập, không ghi vào backend thật. Chưa kiểm chứng endpoint thực tế, ngoại lệ bảo vệ ADMIN phía server, thay đổi quyền qua JWT sau đăng nhập lại/refresh, Safari/Firefox hoặc bàn phím ảo trên điện thoại thật. Trường hợp bàn phím được mô phỏng bằng viewport thấp.

Để chạy lại: khởi động Vite ở `http://127.0.0.1:5173`, chạy `node tests/roles.browser.mjs`. Có thể chỉ định `ROLES_TEST_URL`, `PLAYWRIGHT_MODULE` (đường dẫn module Playwright có sẵn) và `CHROME_PATH`; không thêm dependency vào project.

Thay đổi `.env.development` đã có sẵn trước tác vụ được giữ nguyên.
