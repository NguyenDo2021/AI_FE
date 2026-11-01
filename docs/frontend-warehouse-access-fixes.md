Đã sửa đồng bộ phạm vi kho khi bị thu hồi và dropdown thao tác rỗng của đơn bán. Không thay đổi API, dữ liệu nghiệp vụ hoặc phân quyền backend.

1. Nguyên nhân

- Request interceptor trước đây chỉ xử lý HTTP 403 chung và cập nhật xác minh Admin; chưa nối `WAREHOUSE_ACCESS_DENIED` với warehouse store. Vì vậy các màn xóa dữ liệu riêng nhưng header/sessionStorage còn giữ kho cũ. Các nhánh tự refresh scope ở từng màn cũng chưa phân biệt lỗi permission với lỗi phạm vi kho.
- Dropdown đơn bán luôn được render, còn từng menu item mới kiểm tra permission/trạng thái. Nhân viên chỉ có quyền xem không có item nào trên desktop. Mobile trước đây đưa cả nút Chi tiết vào menu này.

2. Cách sửa

- `request.ts` nhận diện mã `WAREHOUSE_ACCESS_DENIED`, kể cả lỗi JSON trả dưới dạng Blob khi in/xuất báo cáo. Handler chung gọi lại `GET /users/me/warehouses` qua API hiện có; baseURL của project đã chứa `/api`.
- Warehouse store gộp các lần tải đồng thời, phân biệt phạm vi đã xác minh với lỗi tải, đối chiếu kho đang chọn và xóa selection/sessionStorage khi kho không còn hợp lệ. Giữ quy tắc hiện có: không tự chọn kho thay thế.
- Mỗi thay đổi phạm vi có revision. Interceptor chặn request khi scope chưa xác minh hoặc warehouseId không còn hợp lệ, đồng thời loại bỏ response thuộc revision cũ. Request cũ được vô hiệu hóa ở FE; không khẳng định đã hủy thao tác đang xử lý tại server.
- Layout xóa toàn bộ cây giao diện nghiệp vụ phụ thuộc kho khi thu hồi được phát hiện, gồm bộ lọc, danh sách, chi tiết, modal/drawer và tổng hợp cục bộ. Cache tổng hợp thanh toán/hoàn tiền cũng theo revision. Khi scope được cập nhật, màn được dựng lại với phạm vi mới.
- Không còn kho: header hiện “Chưa được giao kho”, khóa bộ chọn và hướng dẫn liên hệ quản trị viên. Refresh thất bại: giữ danh sách cuối đã biết nhưng chặn dữ liệu nghiệp vụ, hiển thị trạng thái chưa xác minh và cho phép bấm tải lại. Nếu API vẫn trả phạm vi cũ sau denial, chờ thao tác tải lại rõ ràng của người dùng để tránh vòng lặp.
- Các nhánh xử lý lỗi ở màn/composable truyền nguyên nhân vào helper chung để tránh refresh lặp và tách `FORBIDDEN` khỏi thu hồi kho. Không thay đổi permission chức năng hay buộc đăng nhập lại vì lỗi kho.
- Sản phẩm/nhóm sản phẩm không nằm trong điều kiện chặn phạm vi kho; vẫn sử dụng permission riêng.
- Đơn bán tạo một danh sách action dựa trên `can()` hiện có (bao gồm Admin), trạng thái đơn, số tiền đã thu, điều kiện thu tiền và request thu cần thử lại. Chỉ render dropdown khi danh sách này có item; Chi tiết là nút riêng ở cả desktop/mobile. Giữ nguyên cấu hình cột và fixed column. Mở menu chỉ dựng giao diện, không ghi API.

3. Kiểm thử và kết quả

- Thêm `tests/warehouse-access.test.mjs` và script `pnpm run test:warehouse-access`. Test sử dụng Axios interceptor và Pinia store thực với adapter giả lập, cùng Vue renderer cho layout/header selector thực.
- Bao phủ denial đồng thời, scope rỗng/còn kho khác, persistence, lỗi refresh và thử lại, response nghiệp vụ/scope cũ về chậm, chống vòng lặp, lỗi Blob, phân biệt FORBIDDEN, danh mục dùng chung, không replay thao tác ghi và không đăng xuất khi denial xảy ra sau token refresh.
- Bổ sung test menu với nhân viên chỉ xem, từng permission thao tác, Admin, trạng thái đơn và điều kiện thanh toán ở cả hai chế độ desktop/mobile; kiểm tra nút Chi tiết, sự hiện diện của dropdown và không phát sinh request ghi.
- `pnpm run lint`: đạt, không có error/warning.
- Lượt cuối `node --test tests/warehouse-access.test.mjs tests/sales.test.mjs`: 52/52 đạt.
- `pnpm run build`: đạt (TypeScript + Vite). Vite cảnh báo chunk DashboardChart lớn hơn 500 kB sau minify.
- Toàn bộ `tests/*.test.mjs`: 290 test, 288 đạt, 2 thất bại trong `reports.test.mjs`.
- Đã chạy riêng `reports.test.mjs` trên source/test nguyên bản `HEAD` trong thư mục tạm: 52 test, 50 đạt và cùng 2 thất bại. Hai lỗi có sẵn được giữ nguyên:
  - `sales screen commits period, summary and rows together, discards stale responses and revokes access`
  - `sales screen handles empty/error states and refreshes revoked warehouse scope`

4. Phần chưa xác minh

- Chưa chạy E2E với backend thật bằng tài khoản `test_nv_1101` và một phiên Admin gỡ kho. Các test mới dùng dữ liệu giả lập, không ghi dữ liệu nghiệp vụ.
- Chưa kiểm tra trực quan trên trình duyệt/thiết bị thật. Desktop/mobile được kiểm tra ở cấp component; cơ chế responsive/fixed column hiện có được giữ nguyên.

5. File thay đổi

Các file bên dưới gồm tầng xử lý chung, store/cache, giao diện và các nhánh xử lý lỗi chuyển tiếp nguyên nhân vào helper chung.

- `docs/frontend-warehouse-access-fixes.md`
- `package.json`
- `src/components/catalog/WarehouseSelector.vue`
- `src/components/sales/CollectPaymentDialog.vue`
- `src/components/sales/CustomerDialog.vue`
- `src/components/sales/CustomerReceivablesDialog.vue`
- `src/components/sales/CustomerSelect.vue`
- `src/components/sales/PaymentDetailDialog.vue`
- `src/components/sales/PaymentHistory.vue`
- `src/components/sales/PendingPaymentRetries.vue`
- `src/components/sales/PendingRefundRetries.vue`
- `src/components/sales/RefundDetailDialog.vue`
- `src/components/sales/RefundDialog.vue`
- `src/components/sales/ReturnDialog.vue`
- `src/components/sales/SalesOrderDialog.vue`
- `src/components/stock/ProductSelect.vue`
- `src/components/stock/StocktakeDialog.vue`
- `src/components/stock/StocktakeProducts.vue`
- `src/composables/useBusinessDashboard.ts`
- `src/composables/usePaymentReceipt.ts`
- `src/composables/usePaymentScope.ts`
- `src/composables/useSalesScope.ts`
- `src/layouts/BasicLayout.vue`
- `src/locales/en-US.ts`
- `src/locales/vi-VN.ts`
- `src/main.ts`
- `src/stores/payments.ts`
- `src/stores/refunds.ts`
- `src/stores/warehouse.ts`
- `src/utils/request.ts`
- `src/utils/warehouseAccess.ts`
- `src/views/reports/InventoryReportPage.vue`
- `src/views/reports/LowStockReportPage.vue`
- `src/views/reports/PaymentsReportPage.vue`
- `src/views/reports/ReceivablesReportPage.vue`
- `src/views/reports/ReportsPage.vue`
- `src/views/reports/SalesReportPage.vue`
- `src/views/sales/CustomersPage.vue`
- `src/views/sales/ReceivablesPage.vue`
- `src/views/sales/RefundsPage.vue`
- `src/views/sales/ReturnsPage.vue`
- `src/views/sales/SalesOrdersPage.vue`
- `src/views/stock/StocktakesPage.vue`
- `tests/catalog.test.mjs`
- `tests/payments.test.mjs`
- `tests/sales.test.mjs`
- `tests/warehouse-access.test.mjs`
