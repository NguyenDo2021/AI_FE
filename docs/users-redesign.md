# Refactor giao diện Quản lý người dùng

Phạm vi: `/system/user`, form thêm/sửa, drawer Kho được giao và drawer Gán vai trò. Không đổi API, DTO, JWT, header, sidebar hoặc logo.

## File và component

- `src/views/system/user/index.vue`: header, bộ lọc submit, bản nháp/bộ lọc đã áp dụng, bảng đủ 10 cột, các nút icon có tooltip/aria-label, phân trang BE và chống response danh sách cũ ghi đè.
- `src/components/catalog/UserFormModal.vue`: form dùng chung thêm/sửa, bố cục hai cột desktop/một cột mobile, validation hiện có, loading, giữ dữ liệu khi API lỗi.
- `src/components/catalog/UserAssignmentDrawer.vue`: khung dùng chung cho hai drawer, header/icon, thông tin user, chú thích, footer và trả focus về nút mở.
- `src/components/catalog/UserRolesDrawer.vue`: tách assignment đã lưu khỏi lựa chọn nháp; giữ vai trò ngoài danh sách chọn; khóa PUT/DELETE chạy chồng; sau DELETE chỉ bỏ ID đã gỡ khỏi assignment và selection, giữ những thay đổi nháp khác.
- `src/components/catalog/UserWarehousesDrawer.vue`: dùng khung drawer chung, card kho và trạng thái, loading thao tác, giữ danh sách khi lỗi, chống response của user trước.
- `src/components/catalog/FittedListTable.vue`: thêm tùy chọn `preserveActionColumns`; mặc định giữ nguyên cách hoạt động cho module khác. Module người dùng tự đặt chiều rộng và bỏ fixed actions trên mobile để giữ đủ năm action.
- `src/layouts/BasicLayout.vue`: cho riêng route `system-user` dùng khung nội dung giới hạn chiều cao đã có, để body bảng cuộn và pagination ở ngoài. Không sửa giao diện header/sidebar.
- `src/locales/vi-VN.ts`, `src/locales/en-US.ts`: nhãn và mô tả của module.
- `tests/users.browser.mjs`: kiểm tra Chrome với API giả lập, không gọi backend thật.

Tái sử dụng: `FittedListTable`, `BasicModal`, `BasicDrawer` cho Chi tiết, Ant Design Vue Form/Drawer/Table/Tooltip/Checkbox/Tag, bộ icon hiện có, `validationRules`, `formatDateTime`, `formatOrdinal`, `useCatalogPermission`, auth/warehouse store và các service hiện có. Không thêm dependency.

## Giữ contract và nghiệp vụ

- Danh sách vẫn gửi `page`, `pageSize`, `keyword`, `status`, dùng `items` và `total` BE; mặc định 10, hỗ trợ 20/50/100. Nhập filter không gọi API. Enter/Tìm kiếm áp dụng filter và về trang 1. Reload/phân trang chỉ dùng filter đã áp dụng. Đóng/mở filter không gọi API, không mất state và không tự đóng sau tìm kiếm.
- Form vẫn chỉ gửi username/fullName/email/phone/status, không trim hay chuẩn hóa điện thoại. Ba field bắt buộc và validation email giữ từ code cũ. Code trước refactor không khóa username lúc sửa và không có quy tắc khóa status riêng; giữ nguyên hành vi này. Không thêm mật khẩu hoặc luồng email.
- Chi tiết tiếp tục GET user và dùng drawer hiện có. Xóa tiếp tục dialog xác nhận và DELETE hiện có.
- Quyền USER_CREATE/UPDATE/DELETE và điều kiện mở vai trò USER_VIEW + USER_UPDATE giữ nguyên. Kho dùng USER_WAREHOUSE_VIEW/ASSIGN và ngoại lệ `isCatalogAdmin` hiện có.
- Vai trò dùng nguồn `/roles` có phân trang như cũ, UUID làm key/payload. Checkbox chỉ thay đổi bản nháp. PUT gửi `{ roleIds }`; response BE là assignment chính thức. Gỡ trực tiếp dùng DELETE riêng. Hủy chỉ bỏ bản nháp, không rollback DELETE.
- Quy tắc ADMIN của màn hình hệ thống cũ là checkbox ADMIN bị khóa và không có action DELETE; giữ đúng quy tắc đó, checked lấy từ assignment thực tế. Không suy ra quyền mới từ role được gán và không sửa token/localStorage/permissions.
- Kho vẫn GET `/users/{id}/warehouses` + `/users/me/warehouses`; PUT không body và DELETE từng warehouse ID. Không gọi danh mục kho toàn hệ thống. Gán/gỡ có hiệu lực ngay sau API thành công; không thêm Lưu. Kho status 0 không được gán mới, liên kết đã có vẫn hiển thị và gỡ theo handler cũ. Gỡ kho vẫn có xác nhận. Badge đếm item hiển thị và có chú thích giới hạn phạm vi.
- API service, DTO, permission constants, request interceptor và error code không thay đổi. Message BE được giữ ở các error state; catalog tiếp tục dùng bộ ánh xạ lỗi hiện có. Không thêm `/api` vào đường dẫn service.

## Kiểm tra

Lệnh dùng trực tiếp dependencies đã cài vì executable pnpm gặp EPERM khi truy cập thư mục người dùng trong sandbox:

- `node node_modules/vue-tsc/bin/vue-tsc.js --noEmit`: đạt theo script type-check hiện có của project. Lưu ý tsconfig gốc chỉ có references nên lệnh này không thực sự kiểm tra project con.
- `node node_modules/vue-tsc/bin/vue-tsc.js --noEmit -p tsconfig.app.json`: không đạt do lỗi template TypeScript có sẵn ở `WarehouseSelector.vue:78` và `AppSidebar.vue:202`.
- Chạy cấu hình kiểm tra tạm chỉ bao gồm module người dùng và dependencies: không có diagnostic tại file module vừa sửa; còn lỗi có sẵn ở import `Rule` trong BasicForm và kiểu Axios trả về trong `utils/request.ts`. Không mở rộng sửa các file đó.
- `node node_modules/eslint/bin/eslint.js .`: đạt, không có lỗi/cảnh báo.
- `node node_modules/vite/bin/vite.js build`: đạt; có cảnh báo chunk lớn hơn 500 kB từ bundle project.
- `node --test tests/catalog.test.mjs`: 23/23 đạt, gồm bodyless PUT kho, DELETE, scope và xác minh ADMIN.
- `node tests/users.browser.mjs`: 153 kiểm tra đạt, không có lỗi JavaScript chưa xử lý; kiểm tra thực tế và số đo tại `docs/users-artifacts/results.json`. Dùng Playwright trong TEMP theo convention kiểm tra browser hiện có và Chrome đã cài.

Browser coverage: search/reset/Enter, filter chưa áp dụng, pageSize 10/20/50/100, server total, form validation/lỗi/submit lặp, selection nháp và assignment thật, bảo vệ ADMIN, role ngoài options, DELETE rồi PUT không gán lại, gán/gỡ từng kho, lỗi không giả thành công, focus khi đóng drawer, response user cũ, empty/error/retry, chế độ chỉ xem, ngoại lệ ADMIN. Đo responsive 320/375/390/414/768/1024/1440px, tên dài, form màn hình thấp, sidebar thu gọn, header bảng cố định và action có nền kín.

Chưa xác minh: backend thật, dữ liệu production, bàn phím ảo trên thiết bị thật và phản hồi 401/403 của backend thật. Cơ chế refresh/401/403 vẫn dùng interceptor hiện có. Kiểm tra trình duyệt dùng API giả lập, không khẳng định BE thực thi quyền dựa trên kết quả UI.


## Điều chỉnh select và kích thước nút

- Select Trạng thái trong form hiển thị dạng block, cùng chiều cao 36px với input; label và chấm trạng thái được căn giữa theo chiều dọc. Bộ lọc trạng thái cũng dùng chiều cao nhất quán.
- Nút desktop: 32px cho Thêm, action icon, Hủy/Lưu, Tải lại và gán/gỡ trong drawer; 36px cho Tìm kiếm/Đặt lại để khớp control bộ lọc. Giảm chiều rộng cột action theo kích thước icon mới.
- Mobile giữ vùng chạm 44px.
- Bổ sung phép đo vị trí select/input, tâm label/chấm và kích thước nút ở 320/375/390/414/768/1024/1440px; ảnh form tại `users-artifacts/form-1440.png` và `users-artifacts/form-390.png`.
- Chạy lại ESLint các file liên quan, Prettier check và Vite build: đạt.
