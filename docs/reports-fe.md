# Báo cáo và Dashboard FE

Module triển khai theo hai tài liệu API đính kèm ngày 13/10/2026. Base URL hiện tại đã có /api; các request mới dùng /reports/... để không lặp prefix.

## Sử dụng và permission

Vào nhóm **Báo cáo**. Menu, route và API đều kiểm tra quyền riêng của báo cáo; Admin dùng cơ chế isCatalogAdmin hiện có.

| Màn hình              | Route                        | Permission             | Cách dùng                                                                   |
| --------------------- | ---------------------------- | ---------------------- | --------------------------------------------------------------------------- |
| Tổng quan             | /reports/dashboard           | REPORT_DASHBOARD_VIEW  | Chọn kho và kỳ; đọc riêng hoạt động trong kỳ và số liệu hiện tại.           |
| Nhập–xuất–tồn         | /reports/inventory           | REPORT_INVENTORY_VIEW  | Chọn kỳ/kho, tùy chọn sản phẩm; cuộn ngang để xem đủ biến động và tồn cuối. |
| Hoạt động bán hàng    | /reports/sales               | REPORT_SALES_VIEW      | Chọn kỳ/kho; thẻ tổng lấy summary toàn phạm vi, bảng phân trang theo kho.   |
| Thu tiền              | /reports/payments            | REPORT_PAYMENT_VIEW    | Chọn kỳ/kho; xem ghi nhận, đảo ghi nhận và net theo thời gian hệ thống.     |
| Tổng công nợ hiện tại | /reports/receivables-summary | REPORT_RECEIVABLE_VIEW | Chọn kho; xem công nợ khách và đơn khách lẻ, thời điểm asOf.                |
| Hàng tồn thấp         | /reports/low-stock           | REPORT_LOW_STOCK_VIEW  | Chọn kho, tùy chọn sản phẩm; tổng cảnh báo là số cặp kho/sản phẩm từ total. |

Dashboard cần thêm REPORT_SALES_VIEW, REPORT_PAYMENT_VIEW, REPORT_RECEIVABLE_VIEW hoặc REPORT_LOW_STOCK_VIEW để backend trả section tương ứng. Section vắng không biến thành 0, không gọi thêm API chi tiết. REPORT_INVENTORY_VIEW không cần cho Dashboard.

PRODUCT_VIEW chỉ cần để dùng bộ chọn sản phẩm tái sử dụng. Không có quyền này vẫn đọc báo cáo nhập–xuất–tồn và tồn thấp bình thường; bộ lọc sản phẩm bị ẩn và không gọi danh mục. Không cần WAREHOUSE_VIEW để xem báo cáo. Liên kết công nợ chi tiết chỉ xuất hiện khi có RECEIVABLE_VIEW.

Kho lấy từ store dùng GET /api/users/me/warehouses. “Tất cả kho” luôn là toàn phạm vi được phép. Bộ lọc báo cáo giữ kho ngừng hoạt động, độc lập với kho làm việc ở header. Thiếu phạm vi kho thì hiển thị lỗi và nút làm mới.

## Quy tắc dữ liệu

- Mặc định đầu tháng đến hôm nay theo Asia/Ho_Chi_Minh. Lựa chọn nhanh: hôm nay, tháng này, tháng trước.
- from/to là ngày YYYY-MM-DD, không chuyển sang ISO UTC. Chặn ngày không hợp lệ và from > to.
- Công nợ hiện tại không gửi ngày hoặc phân trang. Tồn thấp không gửi ngày. API wrapper chỉ gửi trường được từng endpoint hỗ trợ.
- Phân trang server, page từ 1, pageSize 1–100; đổi bộ lọc hoặc pageSize quay về trang 1. Không lọc lại items tại FE.
- Tổng bán/thu dùng summary, không cộng trang hiện tại. Nhập–xuất–tồn không có summary.
- Tồn cuối dùng số backend trả; giữ dòng 0 và lịch sử kho/sản phẩm ngừng hoạt động.
- Tái sử dụng parseStockJson và formatStockInteger để giữ số nguyên lớn, số âm và 0. Tiền hiển thị VND (₫); cay hiển thị Cây.
- Mỗi lần tải xóa kết quả cũ; số thứ tự request chặn phản hồi đến muộn. Thay đổi quyền/phạm vi kho cũng xóa dữ liệu.
- WAREHOUSE_ACCESS_DENIED xóa lựa chọn kho, làm mới phạm vi và yêu cầu thử lại. INVENTORY_HISTORY_INCONSISTENT hiển thị thông báo đối soát, không tự sửa tồn. NUMERIC_OVERFLOW hiển thị tổng vượt giới hạn.
- 401 sử dụng refresh/logout của API client chung; lỗi chưa xác nhận dùng message/status hiện có.
- Bán ròng không phải lợi nhuận. Hủy phiếu thu là đảo ghi nhận sai, không phải hoàn tiền. Công nợ/tồn thấp luôn là số liệu hiện tại.

## File thay đổi

- src/types/reports.ts: schema response, section optional và kiểu filter.
- src/api/reports/reports.api.ts: API GET có kiểm tra quyền và parser exact.
- src/utils/reports.ts: query whitelist, ngày theo giờ Việt Nam, định dạng và thông báo lỗi.
- src/views/reports/ReportsPage.vue: sáu màn hình dùng chung bộ lọc, thẻ tổng và BasicTable.
- src/constants/permissions.ts, src/constants/menu.ts, src/router/index.ts: sáu quyền, nhóm menu và route.
- src/layouts/BasicLayout.vue: mở nhóm Báo cáo và ẩn nhóm không còn menu con được phép.
- src/utils/landing.ts: người dùng chỉ có quyền báo cáo có thể vào màn hình phù hợp khi đăng nhập; giữ trang mặc định cũ của Admin.
- src/locales/vi-VN.ts, src/locales/en-US.ts: nhãn tiếng Việt/Anh.
- tests/reports.test.mjs, package.json: kiểm thử và lệnh test:reports.
- docs/reports-fe.md: tài liệu bàn giao.

## Kiểm tra thực tế

Đã chạy:

- npm.cmd run type-check: qua.
- npm.cmd run lint: qua.
- npm.cmd run build: qua; Vite có cảnh báo bundle chính lớn hơn 500 kB.
- node --test --test-reporter=dot tests/*.test.mjs: 150/150 qua, gồm 10 kiểm thử mới.
- Kiểm thử mới dùng API giả lập và Vue renderer, kiểm tra quyền/Admin, whitelist query, ngày Việt Nam, số âm int64, summary độc lập phân trang, response cũ, section Dashboard thiếu quyền, tồn 87/dòng 0, lỗi 409, quyền thu hồi và làm mới phạm vi kho.

Chưa gọi API backend thật, chưa kiểm tra trực tiếp bằng trình duyệt. Các quy tắc xác nhận/hủy ở kỳ sau không làm đổi kỳ trước và snapshot nhất quán thuộc backend; FE hiển thị nguyên kết quả API. Cần kiểm thử tích hợp bằng tài khoản Admin và nhân viên có phạm vi kho khác nhau khi backend sẵn sàng.

Không thiếu endpoint cho phạm vi đã triển khai theo tài liệu. Xuất Excel/PDF, lợi nhuận, giá vốn và biểu đồ chuỗi thời gian chưa nằm trong phạm vi này; API hiện chưa cung cấp chuỗi thời gian.
