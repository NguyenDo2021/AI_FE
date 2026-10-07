# Quản lý kho và danh mục sản phẩm

## Chức năng và mã nguồn

- `src/views/catalog/CatalogPage.vue`: ba màn hình dùng chung bảng, bộ lọc, phân trang server, form thêm/sửa, chi tiết và chuyển trạng thái. GET chi tiết trước mọi PUT; không gửi metadata và không DELETE danh mục.
- `src/types/catalog.ts`, `src/api/catalog/catalog.api.ts`, `src/utils/catalog.ts`: hợp đồng API, payload đầy đủ, validation và lỗi theo trường. Đường dẫn tương đối với baseURL đã có `/api`.
- `src/components/catalog/UserWarehousesDrawer.vue`, `src/views/system/user/index.vue`: xem/gán/gỡ từng kho. Không thay toàn bộ danh sách, PUT không có body, DELETE 204 không parse JSON.
- `src/stores/warehouse.ts`, `src/components/catalog/WarehouseSelector.vue`, `src/layouts/BasicLayout.vue`: phạm vi kho và kho đang làm việc, lưu sessionStorage theo user, kiểm tra lựa chọn sau mỗi tải lại và xóa khi logout.
- `src/stores/auth.ts`, `src/composables/useCatalogPermission.ts`, router/menu/constants: Admin từ user đang hoạt động và role ADMIN đang hoạt động trong database. Chỉ bỏ qua permission cho chức năng mới; quyền màn hình hệ thống cũ vẫn giữ nguyên.
- `src/utils/request.ts`, `src/main.ts`: cơ chế lỗi do màn hình mới xử lý và làm mới xác nhận Admin khi gặp 403. Giữ refresh/đăng xuất hiện tại.
- BasicTable hỗ trợ scroll; BasicModal/BasicDrawer ngăn đóng khi mutation đang chạy. Locale Việt/Anh được bổ sung, không thêm dependency.
- `tests/catalog.test.mjs`: kiểm thử validation, payload, API client, Admin, phạm vi kho và response đến muộn.

## Kiểm tra trực tiếp

Chạy `npm.cmd run dev` trên Windows, backend tại baseURL cấu hình hiện tại. Dùng tài khoản thử nghiệm phù hợp; các thao tác dưới đây tạo/sửa dữ liệu backend.

1. **Kho — `/catalog/warehouses`:** thêm kho đủ địa chỉ/điện thoại/ghi chú; xem chi tiết; sửa; ngừng hoạt động rồi kích hoạt. Xác nhận ghi chú và số điện thoại được giữ. Lọc trạng thái ngừng hoạt động và kiểm tra request gửi `status=0`; đổi pageSize về trang 1. User chỉ có WAREHOUSE_CREATE vẫn vào được màn hình để tạo, không gọi API danh sách khi thiếu WAREHOUSE_VIEW. Khi không có kho trong phạm vi, hiện thông báo và vẫn cho tạo nếu có quyền.
2. **Nhóm — `/catalog/product-groups`:** tạo nhiều nhóm, sửa mô tả và chuyển trạng thái. Tìm kiếm/lọc/phân trang. Nhóm không phụ thuộc kho đang chọn.
3. **Sản phẩm — `/catalog/products`:** tạo với nhóm hoạt động, giá 0, chiều dài 2.4 và đơn vị Cây. Thử giá âm/lẻ/vượt 9.007.199.254.740.991, ngưỡng vượt 2147483647 và chiều dài sai. Ngừng hoạt động nhóm cũ rồi sửa sản phẩm: tên nhóm vẫn xuất hiện với nhãn ngừng hoạt động, groupId được giữ. Chuyển sang nhóm mới chỉ chọn nhóm hoạt động. Kiểm tra nhóm ngoài 100 bản ghi đầu vẫn có thể tìm/chọn; bộ lọc có nhóm ngừng hoạt động. Khi backend trả giá ngoài phạm vi an toàn, form và chuyển trạng thái bị chặn.
4. **Gán kho — `/system/user`:** với quyền USER_VIEW của màn hình cũ và USER_WAREHOUSE_VIEW, bấm Kho được giao. USER_WAREHOUSE_ASSIGN bật gán/gỡ từng kho, gỡ có xác nhận. Kiểm tra thao tác một kho không đổi kho khác. Non-Admin thấy chú thích phạm vi; danh sách rỗng không khẳng định user không có kho ở nơi khác. Kho ngừng hoạt động đã giao vẫn hiện và được gỡ; không gán mới.
5. **Kho đang làm việc — header:** chọn kho, tải lại trang vẫn giữ theo user. Ngừng hoạt động hoặc thu hồi kho đó rồi bấm Tải lại: lựa chọn cũ bị xóa, kho ngừng hoạt động vẫn hiện nhưng không chọn được. Logout xóa lựa chọn; đăng nhập user khác không dùng kho của user trước.
6. **Quyền và lỗi:** thử Admin đang hoạt động không có kho/permission, user có quyền nhưng không có kho, user chỉ được xem, và Admin bị ngừng role khi đang sử dụng. Backend 403 làm mới xác nhận Admin; WAREHOUSE_ACCESS_DENIED làm mới phạm vi. Thử 404/409, trùng mã, validation theo trường và lỗi mạng: dữ liệu đang nhập được giữ, có thể tải lại dữ liệu gốc với xác nhận. Tìm liên tiếp với mạng chậm để kiểm tra kết quả cũ không ghi đè kết quả mới.

## Chạy kiểm tra tự động

```text
npm.cmd run type-check
npm.cmd run lint
npm.cmd run test:catalog
npm.cmd run build
```

Các test dùng mock API và state thực của Pinia; không phải kiểm thử end-to-end trên backend/trình duyệt.

## Giới hạn và hợp đồng backend

- Theo xác nhận của người dùng: GET `/users/{id}` và `/users/{id}/roles` cho phép đọc chính mình không cần USER_VIEW, trả trạng thái hiện tại. Nếu xác nhận thất bại, FE dùng permissions và cảnh báo, không suy ra Admin từ JWT.
- Axios dùng JSON number thông thường. FE chặn giá vượt Number.MAX_SAFE_INTEGER, dù backend hỗ trợ 19 chữ số. Giá ngoài phạm vi an toàn nhận từ backend được cảnh báo và chặn PUT; không gửi chuỗi số hoặc âm thầm lưu giá đã làm tròn.
- Khi không có PRODUCT_GROUP_VIEW, nhóm hiện tại hiển thị bằng ID và không mất groupId; không chọn nhóm mới. Backend giữ quyết định quyền/phạm vi cuối cùng.
- Không có dữ liệu tồn kho trong module này. Không triển khai nhập xuất, bán hàng, công nợ, hóa đơn; hiện chưa có dữ liệu phụ thuộc kho cần tải lại khi đổi lựa chọn. Module tương lai cần theo dõi selectedId trong warehouse store.
- Thời gian dùng formatter dayjs hiện tại của dự án (múi giờ trình duyệt).
