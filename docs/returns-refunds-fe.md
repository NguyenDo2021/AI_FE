# Bàn giao Trả hàng và Hoàn tiền FE

Ngày kiểm tra: 16/10/2026. Theo contract BE V15/V16 đính kèm.

## Kết quả triển khai

- `/sales/returns`: danh sách phân trang chính xác, lọc kho/đơn/trạng thái/ngày trả, chi tiết và audit; tạo/sửa nháp, xác nhận nhận hàng, hủy nháp có lý do. Giá trị nháp hiển thị là dự kiến; phiếu đã xác nhận không sửa/hủy đảo.
- Chi tiết đơn bán: nút **Trả hàng** và **Hoàn tiền**, đầy đủ tám khoản quyết toán; nhãn **Cần hoàn tiền** độc lập với PAID. Lịch sử hoàn mở từ đơn nguồn với bộ lọc ID đơn.
- `/sales/refundables`: xem đầy đủ quyết toán, khách lẻ/khách có tên, kho và khoản cần hoàn bằng REFUND_VIEW; không gọi GET đơn bán hoặc inventory, không gửi bộ lọc ngày.
- `/sales/refunds`: bộ lọc kho/đơn/khách/trạng thái/hình thức/ngày hoàn, chi tiết và audit; hủy ghi nhận sai có lý do, không có sửa/xóa/in phiếu hoàn.
- Công nợ và thu tiền dùng remainingAmount của BE; totalAmount, paidAmount giữ nghĩa cũ. Summary thu/hoàn cập nhật mọi khoản quyết toán và giữ nguyên version của đơn.
- Movement SALE_RETURN dùng salesReturnId/salesReturnCode; link sang phiếu trả khi có SALES_RETURN_VIEW, không phụ thuộc salesOrderId.
- Báo cáo nhập–xuất–tồn thêm saleReturnQuantity, giữ closingQuantity của BE. Bán hàng thêm returnedSalesAmount. Thu/hoàn có đủ số phiếu tạo/hủy, ghi nhận/đảo và số ròng theo hình thức, netRefundedAmount và netCashFlowAmount; số ròng âm được giữ nguyên.
- Dashboard báo cáo `/reports/dashboard` hiển thị currentSections.refunds khi BE có section và người dùng có REFUND_VIEW. Không thay section thiếu bằng số 0. Thẻ trong kỳ bổ sung hàng trả, hoàn ròng và dòng tiền ròng.
- Xuất Excel vẫn dùng nguyên Blob và tên file từ BE qua luồng xuất hiện có; không dựng lại bảng hoặc làm tròn số ở FE.

## Quyền cần gán

Dùng quản trị quyền/role hiện có, không tự cấp quyền trong FE. Ngoại lệ ADMIN giữ nguyên cơ chế xác minh hiện có. Nhân viên cần được gán kho; đơn cũ ở kho ngừng hoạt động vẫn được xử lý nếu còn trong phạm vi.

| Quyền | Chức năng |
| --- | --- |
| SALES_RETURN_VIEW | Menu/danh sách/chi tiết trả hàng, returnable-orders và returnable-lines |
| SALES_RETURN_CREATE | Tạo phiếu trả nháp |
| SALES_RETURN_UPDATE | Sửa nháp, lưu lại báo giá sau thay đổi |
| SALES_RETURN_CONFIRM | Xác nhận nhận hàng còn bán được |
| SALES_RETURN_CANCEL | Hủy phiếu nháp |
| REFUND_VIEW | Menu/danh sách/chi tiết phiếu hoàn và đơn cần hoàn |
| REFUND_CREATE | Ghi nhận khoản đã thực tế chi, thử lại request cũ |
| REFUND_CANCEL | Hủy ghi nhận hoàn sai |

Xem đơn qua API sales-orders cần SALES_ORDER_VIEW riêng. Xem báo cáo/dashboard cần quyền REPORT_* tương ứng; section hoàn tiền trên dashboard cần thêm REFUND_VIEW. Không yêu cầu SALES_ORDER_VIEW hoặc INVENTORY_VIEW cho refundables/returnable-orders/returnable-lines.

## Hướng dẫn thao tác

1. Mở đơn bán CONFIRMED → **Trả hàng**. Hoặc vào menu **Trả hàng** → **Tạo phiếu trả nháp**, tại **Đơn bán hàng** nhập mã BH-… rồi chọn kết quả. Tìm kiếm trễ 300 ms, có tải thêm theo total và chỉ cần SALES_RETURN_VIEW. Mỗi kết quả có mã, khách, kho, ngày bán và **Tổng đơn gốc**; giá trị 0 không bị loại. Gõ tìm kiếm không đổi đơn đã chọn. Đổi đơn khi đã nhập dữ liệu cần xác nhận trước khi bỏ dòng cũ; ngày trả/lý do/ghi chú được giữ. Phiếu đã lưu giữ nguyên đơn nguồn, hiển thị mã đã có hoặc ID chỉ đọc, không tìm lại nhãn qua danh sách đơn còn được trả.
2. Nhập ngày trả, lý do, ghi chú và số cây muốn trả. Để trống lượng ở dòng không chọn; lượng phải nguyên dương và không vượt hạn mức tham khảo. Lưu nháp chưa làm thay đổi tồn.
3. Mở nháp, kiểm tra báo giá và tích **Tôi xác nhận đã nhận đủ số hàng còn bán được vào kho.** rồi xác nhận. Phiếu được xác nhận tăng tồn và giảm phải trả; không tự sinh hoàn tiền.
4. Nếu RETURN_QUOTE_CHANGED, xem giá trị cũ/mới và từng dòng, chọn **Xem xét và sửa / lưu lại nháp**, lưu PUT rồi tích xác nhận lại. FE không tự PUT/confirm nối tiếp. Nếu VERSION_CONFLICT, bản nhập và version cũ được giữ; nút tải lại có xác nhận bỏ bản nhập. Cập nhật hạn mức giữ nguyên lượng người dùng nhập.
5. Mở **Đơn cần hoàn tiền** hoặc nút **Hoàn tiền** trong đơn bán. Nhập tiền, ngày, hình thức, tham chiếu, lý do và ghi chú; tích xác nhận khoản tiền đã thực tế chi cho khách rồi ghi nhận. Đây là ghi nhận thủ công, không phải lệnh chuyển khoản ngân hàng.
6. Khi mất mạng/timeout, nội dung lần hoàn được khóa. Dùng **Thử lại đúng request cũ** trong form hoặc bảng **Lần hoàn cần xác định kết quả**. Không chi thêm tiền khi chưa xác định kết quả. Request giữ nguyên UUID key, đơn và payload; replay CANCELLED báo phiếu cũ đã hủy, không tự tạo lần chi mới. IDEMPOTENCY_CONFLICT giữ request và chặn việc vượt lỗi bằng khóa mới.
7. Chỉ hủy phiếu thu/hoàn để sửa ghi nhận sai. Không dùng hủy thu/hoàn để mô tả dòng tiền thực tế hoặc để vượt chặn nghiệp vụ. PAYMENT_BELOW_REFUNDED và SALES_ORDER_HAS_RETURNS có thông báo riêng, kể cả hàng trả giá trị 0.

## Tính chính xác và phạm vi

Tái sử dụng parseStockJson/stringifyStockJson, BigInt và StockInteger. DTO mới gửi số nguyên JSON exact, không gửi numeric string, float hoặc exponent. Ước tính từng lần trả dùng công thức chia nguyên trên netLineAmount, soldQuantity và returnedQuantity từ BE; không lấy giá danh mục. Version và tổng lớn không chuyển sang Number. Hai danh sách mới dùng tổng Int64 và nút Trước/Sau để tránh mất chính xác qua pagination của Ant Design; dữ liệu tổng chưa tải hiển thị “—”.

RETURN_QUOTE_CHANGED có type guard cho details có cấu trúc. Field validation cũ vẫn lọc field → string; ApiErrorPayload/NormalizedApiError đã dùng details: unknown nên không làm hỏng lỗi module cũ.

Request hoàn chờ được lưu trong sessionStorage theo user dưới namespace refund-retry:, tách khỏi payment-retry:. Logout xóa cả hai namespace. Khi đổi user/quyền/kho, dữ liệu hiển thị được xóa, response cũ không được ghi lại; retry kiểm tra lại quyền và phạm vi. Không gọi API bổ sung hàng loạt chỉ để lấy nhãn kho/khách/đơn.

## Kiểm tra đã chạy

| Lệnh | Kết quả cuối |
| --- | --- |
| `npm.cmd run type-check` | Đạt; build cuối cũng chạy lại `vue-tsc --noEmit` |
| `npm.cmd run lint` | Đạt, 0 lỗi và 0 cảnh báo |
| `npm.cmd run build` | Đạt, 3413 module; Vite có cảnh báo chunk dùng chung lớn hơn 500 kB |
| `node --test --test-reporter=dot tests/*.test.mjs` | Đạt toàn bộ 192 test: 162 test sẵn có, 28 test trả/hoàn (gồm 12 test tìm mã/chọn đơn) và 2 test báo cáo mới |
| `npm.cmd run test:returns` | Đạt riêng 28 test trong tests/returns-refunds.test.mjs |

Các test dùng component Vue thật, renderer kiểm thử và API mock. Đã kiểm tra: giá trị trả 0; chuỗi chia nguyên 0/1/1; Int64 lớn; DTO đúng field; báo giá đổi cần review/save/xác nhận lại; xung đột version giữ bản nhập; cập nhật hạn mức không cắt lượng; timeout confirm đọc lại trạng thái; hủy nháp không thay đổi tồn; refundables chỉ REFUND_VIEW; PAID vẫn có khoản cần hoàn; xác nhận đã thực tế chi; replay giữ key/payload; CANCELLED replay; IDEMPOTENCY_CONFLICT; dữ liệu cũ sau đổi user/kho; hủy hoàn cập nhật summary; logout xóa retry; báo cáo tiền ròng âm, hàng trả và section dashboard tùy chọn. Các test cũ về bán/thu/PDF biên lai/Excel vẫn đạt.

## Chưa kiểm chứng với API thật

Chưa đăng nhập tài khoản BE V15/V16, chưa gửi nghiệp vụ thật, chưa kiểm tra trình duyệt kết nối BE và chưa tải file Excel/PDF thật của BE trong lượt này. Build và renderer test không thay thế kiểm tra giao dịch/database thực tế.

Cần smoke test trên môi trường BE:

| Tình huống | Kết quả cần đối chiếu |
| --- | --- |
| Đơn 1.000.000, thu 600.000, trả 200.000 | Tổng sau trả 800.000, còn thu 200.000, cần hoàn 0 |
| Tổng hàng trả 700.000 | Tổng sau trả 300.000, còn thu 0, cần hoàn 300.000 |
| Hoàn 300.000 | Cần hoàn 0, thu ròng 300.000, tồn không đổi |
| Chưa thu mà trả | Giảm nợ, không sinh phiếu hoàn |
| Trả hàng có giá trị 0 | Tồn tăng; đơn vẫn bị chặn hủy nếu đã có trả CONFIRMED |
| Hai nháp trả cùng dòng net=2/sold=3 | Nháp sau nhận RETURN_QUOTE_CHANGED; xem xét, lưu rồi xác nhận lại |
| Hai người trả/hoàn đồng thời vượt hạn mức | BE chặn, FE giữ dữ liệu để sửa và tải số liệu theo quyền |
| Mất phản hồi POST hoàn rồi retry | Cùng phiếu, key và payload; không sinh trùng; replay CANCELLED không báo hoàn mới |
| Hủy thu khiến paid thấp hơn refunded | Thông báo PAYMENT_BELOW_REFUNDED, không hủy hoàn tự động |
| User chỉ có REFUND_VIEW và kho được giao | Xem refundables không cần SALES_ORDER_VIEW |
| Xác nhận trả, tạo/hủy hoàn ở ngày nghiệp vụ khác ngày hệ thống | Movement và report theo performedAt/confirmedAt/createdAt/cancelledAt đúng contract; Excel thêm cột đúng và giữ số trên 15 chữ số |
| Đổi kho/user hoặc thu hồi quyền khi request đang chờ | Không khôi phục dữ liệu ngoài phạm vi |

## Danh sách file thay đổi

- `package.json`
- `src/api/sales/returns.api.ts`
- `src/components/sales/OrderPaymentPanel.vue`
- `src/components/sales/PendingRefundRetries.vue`
- `src/components/sales/ReceivableOrders.vue`
- `src/components/sales/RefundDetailDialog.vue`
- `src/components/sales/RefundDialog.vue`
- `src/components/sales/ReturnDialog.vue`
- `src/components/sales/ReturnableOrderSelect.vue`
- `src/components/sales/SalesOrderDialog.vue`
- `src/components/sales/SettlementDetails.vue`
- `src/constants/menu.ts`
- `src/constants/permissions.ts`
- `src/locales/en-US.ts`
- `src/locales/vi-VN.ts`
- `src/router/index.ts`
- `src/stores/payments.ts`
- `src/stores/refunds.ts`
- `src/types/payments.ts`
- `src/types/reports.ts`
- `src/types/returns.ts`
- `src/types/sales.ts`
- `src/types/stock.ts`
- `src/utils/landing.ts`
- `src/utils/payments.ts`
- `src/utils/reports.ts`
- `src/utils/returns.ts`
- `src/utils/sales.ts`
- `src/views/reports/ReportsPage.vue`
- `src/views/sales/RefundsPage.vue`
- `src/views/sales/ReturnsPage.vue`
- `src/views/sales/SalesOrdersPage.vue`
- `src/views/stock/InventoryPage.vue`
- `tests/reports.test.mjs`
- `tests/returns-refunds.test.mjs`
- `docs/returns-refunds-fe.md`


## Tìm đơn bán còn được trả theo mã

FE gọi `GET /sales-orders/returnable-orders` qua HTTP client với params `{code: code.trim(), page, pageSize}`. Không thêm warehouseId, không dùng GET /sales-orders cũ, không đổi `%`, `_`, `!` thành wildcard và không đổi chữ hoa/thường ở FE. Response được parse bằng cơ chế JSON Int64 hiện có. Backend quyết định điều kiện còn hàng được trả và phạm vi, FE không loại thêm theo trạng thái kho/khách/sản phẩm hoặc totalAmount.

Bộ chọn giữ từ khóa độc lập với `{id,code}` đã chọn. Các bước đổi đơn gồm xác nhận nếu có dữ liệu, xóa dòng cũ, gán UUID mới rồi tải returnable-lines. Một dấu nhận diện đơn đã tải dòng ngăn gửi các dòng của đơn cũ với UUID mới. Tìm kiếm và tải dòng dùng AbortController cùng sequence để bỏ qua response/error cũ; đóng form/unmount/đổi phạm vi hủy request và dọn debounce. Lỗi API có thông báo và nút thử lại riêng với kết quả rỗng; 403 xóa dữ liệu, đóng form và gọi luồng làm mới quyền hiện có. RETURN_EXCEEDS_QUANTITY và RETURN_QUOTE_CHANGED giữ nguyên quy trình trước đó.

File bổ sung: `src/components/sales/ReturnableOrderSelect.vue`. Các file cập nhật ở lượt tìm mã: `src/components/sales/ReturnDialog.vue`, `src/components/sales/OrderPaymentPanel.vue`, `src/api/sales/returns.api.ts`, `src/types/returns.ts`, `tests/returns-refunds.test.mjs` và tài liệu này.

12 kiểm thử bổ sung dùng API mock: query trim và giữ nguyên case/ký tự `%_!`, không request khi trắng, debounce 300 ms, tải 21 kết quả qua ba trang và reset trang, dữ liệu zero/Int64 lớn, quyền chỉ SALES_RETURN_VIEW, tìm kiếm độc lập đơn đã chọn, lỗi khác rỗng, hủy request, chống response cũ, gửi đúng UUID, xác nhận/hủy đổi đơn, không trộn dòng cũ và giữ nguồn phiếu sửa. Chưa kiểm chứng API thật về tìm đầy đủ/một phần không phân biệt hoa thường và việc BE loại đơn đã trả hết; cần smoke test BE với các tình huống này.

Kiểm tra sau lượt thay tìm mã: `npm.cmd run type-check`, `npm.cmd run lint`, `npm.cmd run build`, `npm.cmd run test:returns` và `node --test --test-reporter=dot tests/*.test.mjs` đều thành công; `git diff --check` sạch. Build vẫn có cảnh báo chunk dùng chung lớn hơn 500 kB. Chưa thử API thật.
