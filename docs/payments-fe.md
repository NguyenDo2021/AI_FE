# Thu tiền, phiếu thu và công nợ khách hàng

Đã triển khai trong frontend Vue/TypeScript hiện tại, tái sử dụng Axios client, BasicTable/BasicModal, RBAC và phạm vi kho. Không thêm dependency; không thay thế module đăng nhập, khách hàng hoặc đơn bán.

## Cách sử dụng

1. **Đơn bán hàng** (`/sales/orders`): xem Tổng tiền, Đã thu, Còn phải trả và trạng thái thanh toán. Chọn **Thu tiền** tại đơn CONFIRMED còn phải trả, hoặc mở chi tiết. Nhập số nguyên VND, ngày thu, tiền mặt/chuyển khoản, tham chiếu và ghi chú; có nút điền số tiền còn lại. Lịch sử chỉ xuất hiện khi có PAYMENT_VIEW.
2. **Phiếu thu** (`/sales/payments`): lọc kho, UUID đơn/khách, trạng thái, hình thức và ngày thu bao gồm hai đầu. Mở Chi tiết để xem toàn bộ thông tin và audit; chọn Hủy ghi nhận sai, nhập lý do và xác nhận. Phiếu không có sửa/xóa. Chỉ mở liên kết đơn khi có SALES_ORDER_VIEW; PAYMENT_VIEW vẫn xem được lịch sử theo UUID đơn.
3. **Công nợ khách hàng** (`/sales/receivables`): tìm mã/tên/điện thoại qua keyword backend, lọc kho/UUID khách. Mỗi dòng là một khách/kho, chỉ tổng hợp các đơn còn nợ. Mở Chi tiết công nợ để xem tổng backend cho toàn bộ khách và phân trang đơn. Có thể nhập UUID khách để xem cả khách đã hết nợ (tổng 0, bảng rỗng).
4. **Đơn khách lẻ chưa thanh toán**: tab riêng trong Công nợ, không tạo khách giả. Xem đơn từ dữ liệu API công nợ đã trả, thu tiền nếu có PAYMENT_CREATE; không cần SALES_ORDER_VIEW hoặc CUSTOMER_VIEW.
5. **Lần thu cần xác định kết quả**: xuất hiện tại đầu các màn hình khi có request chưa xác định. Nội dung/key được lưu trước POST bằng sessionStorage theo user và đơn, không chứa token. Thử lại dùng đúng payload/key, không cho sửa; có thể retry sau reload ngay cả khi đơn đã thanh toán đủ và biến mất khỏi công nợ. Request được xóa khi xác định kết quả hoặc đăng xuất. Conflict giữ nguyên request để kiểm tra và không có nút đổi key.

Thu/hủy phiếu là ghi nhận thanh toán, không tác động hoặc invalidate tồn kho. Chuyển khoản là ghi nhận thủ công, không phải xác minh ngân hàng. Hủy phiếu chỉ đảo ghi nhận sai, không phải hoàn tiền. Đơn đã có khoản thu hiệu lực bị chặn hủy; frontend cũng xử lý SALES_ORDER_HAS_PAYMENTS từ backend.

## Quyền cần gán

| Quyền            | Chức năng                                                       |
| ---------------- | --------------------------------------------------------------- |
| PAYMENT_VIEW     | Menu/danh sách/chi tiết/lịch sử phiếu thu                       |
| PAYMENT_CREATE   | Thu tiền và retry request cũ                                    |
| PAYMENT_CANCEL   | Hủy ghi nhận phiếu ACTIVE; mở phiếu qua UI cần PAYMENT_VIEW     |
| RECEIVABLE_VIEW  | Menu công nợ, chi tiết khách và đơn khách lẻ                    |
| SALES_ORDER_VIEW | Menu danh sách đơn, tải chi tiết đơn, liên kết đơn từ phiếu thu |

Nhân viên cần được gán kho liên quan. ADMIN sử dụng ngoại lệ đã xác minh của project. Không yêu cầu WAREHOUSE_VIEW cho `/users/me/warehouses`. Khách/kho ngừng hoạt động vẫn được thanh toán trong phạm vi được giao. Khi nhận 403, module gọi `/auth/me` hiện có và tải lại kho; đổi user/kho/quyền xóa dữ liệu hiển thị, vô hiệu response cũ.

## Chi tiết triển khai

- Base URL hiện tại đã chứa `/api`; client mới dùng đường dẫn tương đối `/payments`, `/receivables`, `/sales-orders/{id}/payments`, `/customers/{id}/receivables`.
- Response trực tiếp, page bắt đầu 1, pageSize tối đa 100; hỗ trợ pageSize=1 tại công nợ/lịch sử.
- Tái sử dụng parseStockJson/stringifyStockJson: tiền đến 9223372036854775807 được giữ chính xác, ghi amount thành token JSON integer, không làm tròn qua Number. Ngày gửi nguyên YYYY-MM-DD, không chuyển múi giờ và không chặn ngày tương lai; reference/note không trim.
- Cập nhật tổng theo order summary backend, giữ nguyên version đơn. Lần thu mới sinh UUID mới; timeout/500/mất mạng giữ nguyên request để người dùng retry. Retry phiếu CANCELLED chỉ thông báo lần thu cũ bị hủy và cập nhật tổng, không tạo khoản thu thay thế.
- Làm mới danh sách phiếu và công nợ qua revision sau mutation; mỗi màn hình tự kiểm tra quyền trước GET. Lỗi GET làm mới được hiển thị riêng, không coi POST thành thất bại hoặc tạo lại phiếu.
- Công nợ khách dùng remainingAmount cấp khách; phân trang dùng orders.items/orders.total. Không tính grand total từ trang danh sách; lọc ngày phiếu không được diễn giải thành công nợ lịch sử.
- Phiếu dùng ID khi API không có nhãn; không gọi hàng loạt API chi tiết để lấy tên. Chi tiết đơn trong công nợ lấy trực tiếp dữ liệu đã trả.

## Kiểm tra đã chạy

- `npm.cmd run type-check`: đạt.
- `npm.cmd run lint`: đạt.
- `npm.cmd run build`: đạt. Vite cảnh báo bundle chính trên 500 kB; build vẫn thành công.
- `node --test --test-reporter=dot tests/catalog.test.mjs tests/stock.test.mjs tests/sales.test.mjs tests/payments.test.mjs`: 101/101 test đạt (23 catalog, 21 stock, 33 sales, 24 payments).

Test payment kiểm tra trạng thái UNPAID/PARTIALLY_PAID/PAID, đơn nháp/hủy/giá trị 0, int64, DTO/header, ngày tương lai, untrimmed strings, vượt số còn lại, UUID mới sau thành công, retry nguyên request, CANCELLED khi retry, conflict, khóa bấm lặp, reload/user isolation/logout cleanup, phân quyền độc lập, tổng khách pageSize=1/hết nợ, tab khách lẻ, lỗi reload sau POST, scope revocation/response cũ, hủy phiếu với lý do và không invalidate stock. Test sales bổ sung chặn hủy đơn có paidAmount và thông báo hoàn tiền chưa hỗ trợ.

## File thêm

- `src/types/payments.ts`, `src/api/payments/payments.api.ts`
- `src/utils/payments.ts`, `src/stores/payments.ts`, `src/composables/usePaymentScope.ts`
- `src/components/sales/CollectPaymentDialog.vue`, `PaymentDetailDialog.vue`, `PaymentHistory.vue`, `OrderPaymentPanel.vue`, `PendingPaymentRetries.vue`, `ReceivableOrders.vue`, `CustomerReceivablesDialog.vue`
- `src/views/sales/PaymentsPage.vue`, `ReceivablesPage.vue`
- `tests/payments.test.mjs`, `docs/payments-fe.md`

## File cập nhật

- `src/types/sales.ts`, `src/utils/sales.ts`
- `src/views/sales/SalesOrdersPage.vue`, `src/components/sales/SalesOrderDialog.vue`
- `src/stores/auth.ts` (xóa retry khi logout)
- `src/constants/permissions.ts`, `src/constants/menu.ts`, `src/router/index.ts`, `src/utils/landing.ts`
- `src/locales/vi-VN.ts`, `src/locales/en-US.ts`
- `package.json`, `tests/sales.test.mjs`, `tests/catalog.test.mjs` (cập nhật test loader/logout mock)

## Phần chưa kiểm tra và giới hạn

Các test dùng API mock và Vue renderer của project. Chưa chạy API thật, trình duyệt end-to-end, kiểm tra CORS Idempotency-Key, hai request đồng thời tại database hoặc việc thu hồi quyền bằng JWT cũ trên backend. Cần kiểm tra các tình huống này với backend và tài khoản/kho được cấu hình theo tài liệu API.

Retry phục hồi trong cùng phiên/tab. Đóng phiên trình duyệt hoặc đăng xuất xóa dữ liệu retry; nếu trước đó kết quả còn chưa xác định, cần đối chiếu phiếu hiện có trước khi ghi nhận khoản thu mới. Trường hợp IDEMPOTENCY_CONFLICT giữ request để điều tra, frontend không tự giải phóng hay đổi key. Chưa triển khai hoàn tiền/trả hàng/in hóa đơn/hóa đơn điện tử theo phạm vi yêu cầu.
