# Kiểm kê kho

Mở **Kiểm kê kho** tại `/stock/stocktakes`. Chọn kho hoạt động và 1–1000 sản phẩm, tạo nháp, nhập số đếm, lưu, rồi xác nhận. Tạm ngừng nhập/xuất thực tế các sản phẩm đang đếm; giao diện không khẳng định hệ thống đã khóa kho. Nháp không đổi tồn. Xác nhận điều chỉnh tồn về số thực tế. Phiếu cuối không sửa/hủy đảo; sai thì lập kiểm kê mới.

## Quyền

- STOCKTAKE_VIEW: danh sách, chi tiết và liên kết từ lịch sử biến động.
- STOCKTAKE_CREATE: tạo nháp; không cần VIEW để POST. Sau tạo dùng response, mở nhập số đếm nếu có UPDATE; không gọi GET/PUT thiếu quyền.
- STOCKTAKE_UPDATE: lưu toàn bộ ghi chú/dòng và lấy lại snapshot.
- STOCKTAKE_CONFIRM: xác nhận số đếm đã lưu.
- STOCKTAKE_CANCEL: hủy nháp với lý do.
- INVENTORY_VIEW: nguồn sản phẩm hợp lệ theo kho, có phân trang; không dùng danh mục để đoán eligibility.
- INVENTORY_MOVEMENT_VIEW: xem biến động tồn.

Nhân viên phải được gán kho. Admin theo cơ chế hiện có. Đổi quyền cần refresh token hoặc đăng nhập lại; phạm vi kho vẫn do backend kiểm tra mỗi request.

## Bảo toàn dữ liệu

Số lượng/revision/version dùng parser/serializer exact và BigInt hiện có, gửi JSON integer. Trống là chưa đếm, 0 hợp lệ. Dòng chênh lệch bắt buộc lý do khi lưu. Dòng mới phải lưu lấy snapshot từ backend trước khi nhập đếm. PUT thay toàn bộ note/lines.

VERSION_CONFLICT giữ bản nhập và chặn ghi lại cho tới khi tải lại chủ động. STOCKTAKE_STALE đánh dấu từng productId, kể cả tồn giống nhau nhưng revision khác; không tự đổi baseline, refresh hay confirm. Refresh yêu cầu xác nhận, bỏ thay đổi chưa lưu và xóa mọi số đếm/lý do theo response. Confirm yêu cầu lưu trước và xác nhận. Timeout confirm/cancel đọc lại chi tiết khi có VIEW; nếu chưa xác định được thì chặn thao tác và yêu cầu tải lại. Timeout tạo không tự retry; kiểm tra danh sách trước khi tạo lại.

Lịch sử STOCKTAKE_ADJUSTMENT có dấu âm/dương và nguồn stocktakeId/stocktakeCode; giữ nguồn nhập và bán cũ. Sau xác nhận invalidation tải lại tồn/lịch sử trên các màn hình có quyền.

## Kiểm thử

Chạy `npm run type-check`, `npm run lint`, `npm run build`, `npm run test:stocktake` và các suite catalog/stock/sales/payments. Kiểm thử FE dùng API mock, không chứng minh transaction hoặc biến động tồn ở backend. Cần nghiệm thu API thật: 100→97 (-3), 100→105 (+5), 0, không lệch không sinh movement, stale khi tồn tăng rồi giảm, version conflict, phạm vi kho bị thu hồi, phân quyền JWT và retry cuối.
