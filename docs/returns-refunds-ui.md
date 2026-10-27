# Refactor giao diện Trả hàng và Hoàn tiền

Ngày kiểm tra: 27/10/2026.

## Phạm vi hoàn thành

| Màn hình | Triển khai |
| --- | --- |
| Danh sách phiếu trả | Theme tím theo Phiếu thu; giữ bộ lọc, toàn bộ cột cũ và thêm cột khách từ customerId sẵn có; tag trạng thái; tooltip mã, UUID, lý do; phân trang server. |
| Tạo/sửa nháp trả | Tiêu đề theo chế độ; form hai cột trên desktop, một cột trên mobile; thông tin khách/kho từ đơn đã chọn; toàn bộ dòng sản phẩm; lượng dạng chuỗi số nguyên; hạn mức và bản nhập được giữ theo handler cũ. |
| Chi tiết/xác nhận trả | Khung tiền phân biệt dự kiến, đã xác nhận và phiếu đã hủy; grid thông tin; định danh/version/audit thu gọn; giữ checkbox nhận hàng và các nút theo quyền/trạng thái. |
| Đơn cần hoàn | Giữ đủ tám metric quyết toán từ BE, khách, kho, ngày bán; nhấn khoản còn cần hoàn; chỉ có bộ lọc kho như API hiện tại. |
| Ghi nhận hoàn | Khung khoản cần hoàn; đủ tám metric; form gọn; nút điền tiền; ngày, hình thức, tham chiếu, lý do, ghi chú và checkbox thực chi; giữ nguyên hành vi request chưa rõ kết quả. |
| Xem đơn bán | Tái sử dụng SalesOrderDialog và OrderPaymentPanel đã có, gồm quyết toán, lịch sử phiếu thu và liên kết lịch sử hoàn. Chỉ mở khi có SALES_ORDER_VIEW. Sửa CSS lịch sử phiếu thu nhúng theo lượt kiểm tra ảnh bên dưới. |
| Danh sách phiếu hoàn | Giữ đủ bộ lọc ID/ngày/hình thức/trạng thái và toàn bộ cột; cột thao tác cố định; tiền căn phải; tooltip dữ liệu dài. |
| Chi tiết phiếu hoàn | Khung tiền và trạng thái; grid nghiệp vụ; định danh thu gọn; thông tin hủy; nút hủy danger theo quyền. |
| Hủy ghi nhận hoàn sai | Component hộp thoại riêng; khung tiền, cảnh báo và lý do tối đa 2000 ký tự theo contract; giữ lý do khi API lỗi; Quay lại giữ DOM chi tiết, phần định danh đã mở và vị trí body. Hai hộp thoại chuyển trực tiếp để không chồng nhau trong chuyển cảnh. |

Ba danh sách dùng chung ReturnRefundList: bảng cuộn dọc trong vùng nội dung còn lại, header cố định, cuộn ngang, nền kín ở cột thao tác bên phải và footer ngoài vùng cuộn. Tổng Int64 giữ nguyên, không chuyển sang Number cho pagination. Các nút Trước/Sau đi cùng lựa chọn 10/20/50/100 dòng, mặc định 10. ResizeObserver chỉ cập nhật chiều cao hiển thị và khoảng bù thanh cuộn; không gọi API hoặc đổi pageSize. Bộ lọc ở màn hình nhỏ/thấp có vùng cuộn riêng. Modal cuộn body và giữ footer trong viewport.

## API và nghiệp vụ giữ nguyên

- Không sửa API, method, query, payload, DTO, store, permission hoặc thư viện phụ thuộc. Ngoại lệ ADMIN và phạm vi kho tiếp tục dùng usePaymentScope hiện tại.
- Tìm mã đơn vẫn dùng returnable-orders, debounce/phân trang/AbortController hiện tại; lấy dòng và tạo nháp bằng UUID của đơn.
- Giữ validateReturn, validateRefund, validReason và toàn bộ giới hạn thật: lý do/ghi chú 2000, tham chiếu hoàn 200 ký tự. Không dùng giới hạn 500 trong ảnh minh họa.
- Tiền, số lượng, version và tổng dùng formatter/BigInt/StockInteger cũ. Không sửa công thức ước tính, phân bổ giảm giá, hạn mức hoặc metric BE.
- Giữ xử lý RETURN_QUOTE_CHANGED, VERSION_CONFLICT, hạn mức đổi, lỗi không rõ kết quả, idempotency key và payload retry bất biến.
- Không gọi thêm API để tra tên. Chỉ dùng đơn đã chọn, customerSnapshot, danh sách kho đã tải hoặc fallback ID/Khách lẻ hiện có. Nơi chưa có dữ liệu khách hiển thị dấu gạch.
- Xác nhận trả không tự hoàn tiền; hủy hoàn không tạo phiếu thu hoặc đảo tồn. Checkbox thực chi/nhận hàng không tự được chọn.
- CSS nằm trong component scoped, hoặc giới hạn bằng wrapper return-refund-dialog/rr-page. SettlementDetails chỉ dùng bố cục mới khi nhận prop compact; các màn đã refactor giữ nhánh hiển thị mặc định.

## File thay đổi

| File | Nội dung |
| --- | --- |
| src/views/sales/ReturnsPage.vue | Danh sách trả, bộ lọc và handler đổi trang/pageSize duy nhất. |
| src/views/sales/RefundsPage.vue | Hai danh sách hoàn, bộ lọc và tái sử dụng chi tiết đơn. |
| src/views/sales/returnRefundPage.css | Style scoped chung cho vùng làm việc của ba danh sách. |
| src/components/sales/ReturnDialog.vue | Tạo/sửa nháp, chi tiết, xác nhận và hủy nháp; reset state phụ khi đổi bản ghi. |
| src/components/sales/RefundDialog.vue | Form ghi nhận khoản đã chi. |
| src/components/sales/RefundDetailDialog.vue | Chi tiết hoàn và điều khiển hộp thoại hủy riêng. |
| src/components/sales/RefundCancelDialog.vue | Nội dung/form hủy ghi nhận sai. |
| src/components/sales/ReturnRefundDialog.vue | Theme, header có icon, body cuộn, footer và responsive modal. |
| src/components/sales/ReturnRefundList.vue | Vùng bảng có đo chiều cao, thao tác cố định và phân trang Int64. |
| src/components/sales/SettlementAmountSummary.vue | Khung mã, số tiền, khách và trạng thái tái sử dụng. |
| src/components/sales/SettlementDetails.vue | Thêm bố cục quyết toán compact tùy chọn cho form hoàn. |
| src/components/sales/SalesOrderDialog.vue | Gỡ các rule bố cục bảng cũ gây chồng bộ lọc lên lịch sử phiếu thu. |
| src/components/sales/PaymentHistory.vue | Lịch sử nhúng tự co theo nội dung, cuộn body khi vượt 300px; bỏ chiều cao cố định 400px. |
| src/components/catalog/FittedListTable.vue | Thêm bodyMaxHeight tùy chọn cho bảng nhúng; mặc định giữ bố cục danh sách độc lập. |
| tests/returns-refunds.test.mjs | Cập nhật mock ngày/icon; thêm hồi quy phân trang ba danh sách và chuyển chi tiết/hủy. |
| tests/returns-refunds.browser.mjs | Bộ kiểm tra trình duyệt với API giả lập. |
| docs/returns-refunds-ui.md | Tài liệu này. |

Thay đổi .env.development có sẵn trước tác vụ được giữ nguyên; không thuộc refactor này.

## Kiểm tra thực sự đã chạy

| Kiểm tra | Kết quả |
| --- | --- |
| npm.cmd run type-check | Đạt. Build cuối cũng chạy lại vue-tsc --noEmit. |
| npm.cmd run lint | Đạt, không có lỗi/cảnh báo. |
| npm.cmd run build | Đạt; Vite vẫn cảnh báo chunk dùng chung lớn hơn 500 kB. |
| Toàn bộ tests/*.test.mjs | Đạt 224 test, gồm 30 test trả/hoàn. Trên PowerShell dùng danh sách file từ rg thay cho wildcard trực tiếp với Node 20. |
| node tests/returns-refunds.browser.mjs | Đạt 142 kiểm tra sau lượt sửa lịch sử phiếu thu nhúng; không có pageerror hoặc API ngoài fixture. |
| tests/sales-orders.browser.mjs | Đạt 73 kiểm tra, 18 phép đo; không có lỗi trình duyệt/API ngoài fixture. |
| tests/payments.browser.mjs | Đạt 72 kiểm tra; không có lỗi trình duyệt/API ngoài fixture. |
| git diff --check | Đạt. |

Kiểm thử trình duyệt mới kiểm tra ba danh sách ở 1366×900, 768×1024, 390×844 và 1366×500; phân trang và resize không phát sinh request thừa; tạo nháp bằng UUID, sửa lượng, tải lại hạn mức giữ lượng, checkbox nhận hàng và xác nhận; form hoàn không tự điền tiền/tick checkbox; ghi nhận hoàn ở mobile với footer tiếp cận được; chi tiết/hủy/Quay lại; lỗi hủy giữ lý do; trạng thái sau hủy; mở component đơn hiện tại; quyền chỉ xem; empty/error state.

Lượt kiểm tra bổ sung từ ảnh chi tiết đơn: đã tái hiện lỗi bằng fixture hai phiếu thu. Assertion bộ lọc phải nằm trên toolbar đã thất bại trước khi sửa. Nguyên nhân là selector `.order-payment-panel > section` áp grid cũ lên PaymentHistory đang dùng flex, cùng rule `.ant-table-wrapper` dành cho BasicTable cũ; thêm chiều cao cố định 400px tạo khoảng trống khi ít dòng. Sau khi gỡ các rule cũ, bảng nhúng dùng bodyMaxHeight=300px và chiều cao tự nhiên: hai dòng hiển thị đủ, footer không chồng bảng; nhiều dòng cuộn trong body; dữ liệu rỗng vẫn có phân trang. Đã đo ở 1883×844 (tương ứng ảnh người dùng), 1366×900, 768×1024, 390×844 và 1366×500. Ảnh kết quả: `%TEMP%/codex-returns-refunds-artifacts/order-payments-1883x844.png` và các kích thước tương ứng. API, metric, phân trang server, quyền và các action phiếu thu giữ nguyên.

Các kiểm thử browser dùng Chrome headless và Playwright đã có ở thư mục tạm, không thêm dependency vào project. Hai bộ hồi quy cũ chạy từ bản sao tạm để trỏ tới Playwright hiện có; bộ Đơn bán dùng SALES_ORDERS_TEST_URL=http://127.0.0.1:5173. Bộ Phiếu thu chọn ô ngày trong lịch và chờ cập nhật bộ lọc thay cho selector Today không ổn định; toàn bộ assertion được giữ nguyên, không sửa mã Phiếu thu.

Ảnh và JSON kết quả của lượt chạy nằm ở:

- `%TEMP%/codex-returns-refunds-artifacts/`
- `%TEMP%/codex-sales-orders-regression/`
- `%TEMP%/codex-payments-artifacts/`

Có thể chạy lại bộ mới khi Vite đang chạy cổng 5173:

```powershell
node tests/returns-refunds.browser.mjs
```

Nếu Playwright ở nơi khác, đặt PLAYWRIGHT_MODULE tới file index.mjs của bản đã cài; RETURNS_TEST_URL cho phép đổi URL Vite.

## Chưa xác minh

Chưa đăng nhập hoặc gửi giao dịch tới BE thật. Các tình huống cạnh tranh, lỗi/version, phân quyền và retry đã được kiểm tra bằng API mock và test hiện có; chưa đối chiếu database, tồn kho và dòng tiền của môi trường thực tế. Không thể kết luận tính đúng đắn của response/triển khai BE chỉ từ các kiểm tra FE này.
