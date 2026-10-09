# Khách hàng và đơn bán hàng

## File triển khai

- `src/types/sales.ts`, `src/api/sales/sales.api.ts`: hợp đồng khách hàng, đơn bán, sản phẩm hỗ trợ chọn giá bán; endpoint tương đối với baseURL đã có `/api`.
- `src/utils/sales.ts`: validation, payload PUT đầy đủ, tính tiền bằng bigint, kiểm tra tràn int64, snapshot và lỗi HTTP/message/details.
- `src/composables/useSalesScope.ts`: dùng cơ chế Admin hiện có và kho từ `/users/me/warehouses`; nhận diện thay đổi user/quyền/phạm vi kho.
- `src/views/sales/CustomersPage.vue`, `src/components/sales/CustomerDialog.vue`: danh sách/tìm kiếm/lọc/phân trang server; thêm, sửa, xem và chuyển trạng thái bằng PUT. GET đầy đủ trước sửa/chuyển trạng thái để giữ dữ liệu liên hệ.
- `src/views/sales/SalesOrdersPage.vue`, `src/components/sales/SalesOrderDialog.vue`: danh sách/lọc, nháp, sửa, chi tiết, xác nhận xuất toàn bộ và hủy; khóa request lặp, version conflict giữ bản nhập, timeout xác nhận/hủy được GET đối soát.
- `src/components/sales/CustomerSelect.vue`: tìm kiếm/phân trang API, khách thuộc kho, chọn khách hoạt động, giữ khách cũ ngừng hoạt động.
- `src/components/stock/ProductSelect.vue`: tái sử dụng selector; bổ sung chế độ giá bán mặc định đọc JSON int64 chính xác qua endpoint sản phẩm hiện có. Giá thực tế chỉ nằm trong request đơn.
- `src/types/stock.ts`, `src/views/stock/InventoryPage.vue`: SALE_CONFIRM/SALE_CANCEL, cột Chứng từ nguồn, mở đúng đơn bán hoặc phiếu nhập theo quyền; giữ endpoint/query/phân trang của lịch sử.
- `src/constants/permissions.ts`, `src/constants/menu.ts`, `src/router/index.ts`, `src/utils/landing.ts`: quyền, menu, route và landing cho user chỉ có quyền mới.
- `src/locales/vi-VN.ts`, `src/locales/en-US.ts`: tiêu đề/trạng thái bán hàng và nhãn biến động.
- `src/utils/request.ts`: tùy chọn preventAutomaticRetry. POST tạo đơn không được gửi lại tự động, kể cả sau refresh token thành công; người dùng chủ động gửi lại sau lỗi xác thực.
- `tests/sales.test.mjs`, `tests/stock.test.mjs`, `package.json`: test mới và cập nhật harness cho component chi tiết đơn trong lịch sử.

## Thử từng màn hình với backend thật

Chạy `npm.cmd run dev`, đăng nhập tài khoản thử nghiệm. Các bước dưới đây tạo/sửa dữ liệu thật, **chưa được chạy trong lần triển khai này**.

1. **Khách hàng — /sales/customers:** tạo khách trong kho hoạt động, nhập điện thoại có số 0 đầu. Backend sinh mã. Tìm theo mã/tên/điện thoại; thử status 0 và tất cả trạng thái. Đổi bộ lọc/pageSize phải về trang 1. Sửa đầy đủ; ngừng hoạt động/kích hoạt phải giữ điện thoại, địa chỉ, ghi chú. Kho ngừng hoạt động vẫn sửa khách được nếu còn trong phạm vi.
2. **Tạo/sửa đơn — /sales/orders:** chuẩn bị sản phẩm hoạt động và tồn 100 cây ở kho được giao. Tạo khách đúng kho hoặc chọn khách lẻ. Chọn 10 cây, giá 2.000, giảm 1.000: dự kiến và response chính thức 19.000, DRAFT version 0, tồn vẫn 100. Sửa giá 3.000: 29.000, version tăng, tồn không đổi. Giá mặc định từ defaultSalePrice và có thể sửa; sản phẩm trong danh mục không đổi.
3. **Validation:** giá 0 hợp lệ; quantity 0, âm, 1.0, 1e3, trùng sản phẩm, quá 1000 dòng, giảm giá vượt subtotal và tràn từng dòng/tổng phải bị chặn. Ngày bán giữ YYYY-MM-DD. Khách kho khác không chọn/gửi được. Đổi kho lúc tạo bỏ khách, báo người dùng, giữ các dòng và ghi chú; tồn tham khảo tải lại. Khách cũ ngừng hoạt động vẫn hiện và phải chọn lại/khách lẻ khi có dữ liệu xác minh.
4. **Xác nhận:** mở hộp xác nhận đơn DRAFT; thấy cảnh báo xuất toàn bộ/trừ tồn. Bấm hai lần nhanh chỉ gửi một request. Backend trả CONFIRMED, tồn 90, một SALE_CONFIRM -10. Tải lại/confirm lặp qua API hợp lệ không trừ thêm. Thử thiếu tồn: giữ đơn và đọc lỗi backend. Không cần quyền nhập kho hoặc INVENTORY_VIEW.
5. **Hủy:** lý do trống chặn cả DRAFT/CONFIRMED. Hủy nháp không đổi tồn. Hủy đơn xác nhận phải tích checkbox thu hồi hàng, ban đầu không tích; chỉ khi tích mới gửi goodsReturned true. Hủy hợp lệ cộng toàn bộ hàng, tồn về 100, một SALE_CANCEL +10. Hủy lặp không cộng thêm. Không dùng hủy cho trả một phần; không khôi phục CANCELLED.
6. **Chi tiết:** đơn xác nhận và đơn đã hủy giữ customerSnapshot; thay đổi tên/địa chỉ khách không đổi lịch sử. Hiển thị dòng/số tiền backend, người và thời gian tạo/xác nhận/hủy, lý do, goodsReturned. UUID người thực hiện được giữ vì chưa có hợp đồng API tra tên user phù hợp.
7. **Lịch sử — /stock/movements:** giữ biến động phiếu nhập cũ, số lượng âm/dương và phân trang server. SALE_CONFIRM âm, SALE_CANCEL dương; mở đúng nguồn đơn bán khi có SALES_ORDER_VIEW, đúng phiếu nhập khi có STOCK_RECEIPT_VIEW. Thiếu quyền xem chứng từ chỉ hiện mã/ID.
8. **Quyền/phạm vi/concurrency:** thử user chỉ tạo, chỉ xem, từng quyền xác nhận/hủy, Admin theo cơ chế hiện có, không có kho, thu hồi kho và bấm tải lại kho. Dữ liệu không còn trong phạm vi bị xóa; response đang chạy không phục hồi dữ liệu cũ. Thử GET chậm rồi đổi kho/user/quyền. Backend 403 tải lại phạm vi. Thử sửa cùng đơn ở hai tab: 409 giữ bản nhập và khóa gửi lại; tải lại chi tiết phải xác nhận bỏ bản nhập trước khi lấy version mới.
9. **Timeout:** ngắt mạng sau khi gửi xác nhận/hủy. FE tự GET chi tiết để đối soát, cập nhật trạng thái nếu GET thành công; vẫn khóa thao tác cho đến khi người dùng tải lại/xem xét. Nếu GET cũng lỗi, không gửi lại tự động. POST tạo đơn không tự retry; cần kiểm tra danh sách trước khi tạo lại sau kết quả không rõ.

## Quyền nhân viên

| Chức năng                       | Quyền                                              |
| ------------------------------- | -------------------------------------------------- |
| Xem / chọn khách                | CUSTOMER_VIEW                                      |
| Thêm khách                      | CUSTOMER_CREATE                                    |
| Sửa / chuyển trạng thái khách   | CUSTOMER_UPDATE và CUSTOMER_VIEW để tải đủ dữ liệu |
| Xem đơn / chứng từ bán          | SALES_ORDER_VIEW                                   |
| Tạo nháp                        | SALES_ORDER_CREATE                                 |
| Sửa nháp                        | SALES_ORDER_UPDATE và SALES_ORDER_VIEW             |
| Xác nhận xuất toàn bộ           | SALES_ORDER_CONFIRM và SALES_ORDER_VIEW            |
| Hủy đơn                         | SALES_ORDER_CANCEL và SALES_ORDER_VIEW             |
| Tìm sản phẩm / đọc giá mặc định | PRODUCT_VIEW                                       |
| Tồn tham khảo (tùy chọn)        | INVENTORY_VIEW                                     |
| Lịch sử biến động               | INVENTORY_MOVEMENT_VIEW                            |

Nhân viên cần được gán kho tương ứng. Admin dùng xác minh account/role hiện có; backend 403 quyết định cuối cùng. Thiếu CUSTOMER_VIEW: vẫn bán khách lẻ, khách cũ được giữ bằng ID; backend kiểm tra hợp lệ. Thiếu PRODUCT_VIEW: selector hiện giải thích và cho nhập ID đã biết theo cách module nhập kho hiện có; backend phải kiểm tra quyền/sản phẩm hoạt động. Không có INVENTORY_VIEW vẫn bán được.

## Kiểm tra tự động

```text
npm.cmd run type-check
npm.cmd run lint
npm.cmd run test:sales
npm.cmd run test:stock
npm.cmd run test:catalog
npm.cmd run build
```

Bộ test bán hàng gồm 32 case: domain, JSON/API, component Vue thực với renderer giả, mock quyền/kho, response đến muộn, snapshot, nguồn chứng từ, interceptor chống replay POST. Mock không xác minh transaction/idempotency, số lượng movement hoặc tồn thật của backend.

## Giới hạn và API còn thiếu

- Chỉ có hợp đồng API trong file yêu cầu; chưa có bảng mã lỗi đầy đủ. Module mới không đặt tên mã lỗi; xử lý status/message/details. Mọi 409 được giữ bản nhập và yêu cầu xem lại điều kiện/chi tiết; không phân loại riêng version conflict với lỗi nghiệp vụ nếu backend chưa cung cấp hợp đồng.
- Không có tài khoản/backend thử nghiệm được cung cấp: chưa chạy end-to-end trên trình duyệt/API thật, chưa xác minh tồn 100 → 90 → 100 và idempotency của backend.
- Chưa có hợp đồng tra tên user phù hợp quyền nên hiển thị UUID.
- Chưa có idempotency key cho POST tạo đơn. Sau timeout tạo, kiểm tra danh sách trước khi chủ động tạo lại.
- Tồn tham khảo dùng API hiện có, tối đa 8 request đồng thời và bỏ response khi đổi phạm vi; backend kiểm tra tồn tại thời điểm xác nhận.
- Các nhãn nghiệp vụ/form mới dùng tiếng Việt; tiêu đề menu/trạng thái/lịch sử có locale Việt/Anh.
- Không triển khai thanh toán, công nợ, in/hóa đơn điện tử hoặc trả hàng một phần; trạng thái xác nhận chỉ mô tả xuất hàng.

## Kết quả kiểm tra đã chạy (09/10/2026)

- `npm.cmd run type-check`: đạt.
- `npm.cmd run lint`: đạt, không lỗi/cảnh báo ESLint.
- `node --test --test-reporter=spec tests/sales.test.mjs tests/stock.test.mjs tests/catalog.test.mjs`: **76/76 đạt** (32 bán hàng, 21 nhập kho, 23 danh mục).
- `npm.cmd run build`: đạt; Vite biên dịch 3347 module và sinh output trong dist.
- `git diff --check`: không lỗi whitespace; Git chỉ thông báo chuyển LF/CRLF trên Windows.
- Build có cảnh báo kích thước chunk chính khoảng 1,69 MB sau minify; không chặn build.
- Không chạy kiểm tra đăng nhập/giao diện bằng trình duyệt hoặc giao dịch trên API thật. Các bước thử tồn, movement, idempotency và transaction thật ở mục hướng dẫn vẫn cần được thực hiện với backend/tài khoản thử nghiệm.
