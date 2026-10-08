# Phiếu nhập kho, tồn kho và lịch sử biến động

- `/stock/receipts`: phân trang server, lọc kho/trạng thái/ngày nhập; tạo nháp, xem, sửa nháp, xác nhận và hủy. Mỗi thao tác trên phiếu tải GET chi tiết; version lấy từ dữ liệu chi tiết. 409 chặn gửi lại cho tới khi người dùng tải lại và kiểm tra dữ liệu.
- `/stock/inventory`, `/stock/movements`: sử dụng kho làm việc trong store hiện có. Không gọi API khi chưa chọn kho. Bộ lọc sản phẩm phân trang, tìm kiếm danh mục qua API danh mục; không gửi keyword/sort tới API kho.
- Lịch sử dùng snapshot backend và ID người thực hiện. `from` bao gồm, `to` không bao gồm; date-time picker gửi ISO có timezone. Phiếu nhập dùng YYYY-MM-DD với hai đầu bao gồm.
- API client chung giữ baseURL `/api`, authentication/refresh và lỗi chuẩn. Riêng API kho đọc JSON trước khi số nguyên lớn bị làm tròn, dùng bigint và serialize thành integer JSON token. Form nhập chuỗi số, kiểm tra giới hạn int64 rồi chuyển bigint. Không tính lại số tồn ở FE. Transformer giữ nguyên body đã serialize khi Axios gửi lại sau refresh token.
- `stock.revision` làm mới màn hình tồn/lịch sử khi xác nhận hoặc hủy thành công; mỗi lần vào màn hình đều tải mới. Dữ liệu phản hồi cũ sau đổi kho/bộ lọc bị bỏ qua.
- Quyền tích hợp theo quy ước hiện có: `STOCK_RECEIPT_VIEW`, `STOCK_RECEIPT_CREATE`, `STOCK_RECEIPT_UPDATE`, `STOCK_RECEIPT_CONFIRM`, `STOCK_RECEIPT_CANCEL`, `INVENTORY_VIEW`, `INVENTORY_MOVEMENT_VIEW`. **Tài liệu API không nêu mã quyền; cần đối chiếu backend trước khi triển khai môi trường thật.** Admin được xác minh theo cơ chế module danh mục hiện có. Quyền tra cứu sản phẩm là `PRODUCT_VIEW`; nếu không có, form cho nhập UUID, backend kiểm tra quyền nghiệp vụ.
- Không có xuất kho, bán hàng, công nợ, kiểm kê hay chuyển kho. Không sửa trực tiếp tồn kho.

## Kiểm tra

- `npm run test:stock`: kiểm thử JSON int64, payload, luồng component với API giả lập, version conflict, hủy thiếu tồn, thu hồi quyền và đổi kho.
- `npm run test:catalog`: hồi quy module danh mục hiện có.
- `npm run lint`, `npm run build`: ESLint, TypeScript và production bundle.
- Chưa kiểm thử E2E với backend thật; cần đối chiếu mã quyền nêu trên và kiểm tra các tài khoản/kho trên môi trường tích hợp.
