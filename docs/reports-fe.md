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

Xuất Excel đã được bổ sung cho nhập–xuất–tồn, bán hàng, thu tiền và tồn thấp theo mô tả bên dưới. PDF báo cáo, lợi nhuận, giá vốn và biểu đồ chuỗi thời gian chưa nằm trong phạm vi này.

## Xuất Excel (14/10/2026)

- Nút **Xuất Excel** xuất hiện ở bốn báo cáo, theo REPORT_INVENTORY_VIEW / REPORT_SALES_VIEW / REPORT_PAYMENT_VIEW / REPORT_LOW_STOCK_VIEW và ngoại lệ Admin đã xác minh.
- GET /reports/{inventory|sales|payments|low-stock}/export qua client chung; baseURL đã có /api. Không body; JWT trong Authorization, không đưa token vào URL.
- Query lấy snapshot lần tải bảng thành công, whitelist theo endpoint. Không page/pageSize, keyword, sort; productId chỉ nhập–xuất–tồn và tồn thấp; tồn thấp không có from/to. Bỏ warehouseId khi chọn tất cả kho. Ngày giữ YYYY-MM-DD; kiểm tra thiếu/ngày sai/thứ tự ngày.
- Bộ lọc hiện có tự tải bảng khi đổi. Khi đang tải hoặc không khớp snapshot bảng, yêu cầu áp dụng bằng Tải lại và chờ tải thành công. Bảng rỗng vẫn xuất được. File do BE dựng cho toàn bộ dữ liệu khớp query; FE không đọc tableData hoặc lặp trang.
- Tái sử dụng request.getBlob, preserveResponse, quietErrors và refresh/logout 401; không sửa interceptor toàn cục. Loading riêng, chặn click lặp; đổi user/quyền/phạm vi/kind hoặc unmount thì abort và bỏ kết quả đến muộn.
- Content-Type bắt buộc application/vnd.openxmlformats-officedocument.spreadsheetml.sheet; Blob không rỗng và có chữ ký ZIP. Kiểm tra chữ ký chỉ phát hiện phản hồi sai rõ ràng, không chứng minh cấu trúc workbook đầy đủ. Header thiếu hoặc khác bị chặn với thông báo cần BE xác nhận, không tự chấp nhận octet-stream.
- Parser tên file được tái sử dụng từ biên lai PDF: ưu tiên filename* UTF-8, fallback filename, lọc đường dẫn/ký tự điều khiển. Không có header thì nhap-xuat-ton_<from>_<to>.xlsx, ban-hang_<from>_<to>.xlsx, thu-tien_<from>_<to>.xlsx, ton-thap_<ngày-giờ-Việt-Nam>.xlsx.
- Tái sử dụng helper downloadBlob đã tách từ tải PDF: object URL, anchor click, remove anchor; giữ URL 60 giây trước revoke theo cơ chế hiện có. Browser không cung cấp sự kiện xác nhận đã lưu xong; lease có thời hạn là cách dọn tài nguyên hiện tại. Thông báo chỉ “Đã bắt đầu tải file”. Không localStorage.
- JSON lỗi được đọc an toàn, kể cả header MIME sai; giữ timestamp/status/code/message/details, không tải thành XLSX. WAREHOUSE_ACCESS_DENIED làm mới phạm vi kho. INVENTORY_HISTORY_INCONSISTENT yêu cầu Admin đối soát; NUMERIC_OVERFLOW báo vượt giới hạn. EXPORT_TOO_LARGE, lỗi validation/dựng file được xử lý nếu BE trả; không khẳng định những mã tùy chọn đã được endpoint cam kết. Không chia request hoặc tự sửa tồn. Lỗi cho phép bấm xuất lại thủ công.

### File bổ sung/chỉnh sửa cho xuất Excel

- src/api/reports/reportExport.api.ts, src/utils/reportExport.ts: API Blob, whitelist query, kiểm tra XLSX, tên mặc định và lỗi.
- src/views/reports/ReportsPage.vue, src/types/reports.ts: snapshot bộ lọc áp dụng, nút xuất và vòng đời request.
- src/utils/paymentReceipt.ts, src/composables/usePaymentReceipt.ts, src/types/api.ts: tái sử dụng parser tên/tải Blob, bổ sung đọc timestamp/status và nhận diện JSON sai MIME.
- src/locales/{vi-VN,en-US}.ts: nhãn nút và thông báo.
- tests/reports.test.mjs, tests/payment-receipt-request.test.mjs: kiểm thử Vue/API và Axios interceptor thật với adapter giả.
- docs/reports-fe.md: bàn giao.

### Kiểm tra và phần BE cần xác nhận

Typecheck, lint, build và toàn bộ bộ kiểm thử Node được chạy sau thay đổi (162 kiểm thử). Test giả lập chỉ kiểm tra luồng FE; không xác nhận workbook thực tế mở được.

BE tại http://localhost:8080 có phản hồi; GET inventory/export không kèm token trả HTTP 401, Content-Type application/json. Chưa có phiên BE đăng nhập được cấp cho kiểm tra tích hợp, nên chưa xác minh phản hồi thành công hoặc mở file XLSX thật.

Cần kiểm tra bằng tài khoản đã đăng nhập:

1. Content-Type thành công chính xác như trên, dữ liệu XLSX hợp lệ và mở được bằng Excel/LibreOffice.
2. Content-Disposition thực tế, đặc biệt filename* UTF-8. Nếu cross-origin, Access-Control-Expose-Headers phải cho JavaScript đọc Content-Disposition (Content-Type vốn là CORS safelisted response header). Nếu không đọc được tên, FE dùng tên mặc định.
3. File chứa toàn bộ dữ liệu đúng bộ lọc; tài khoản Admin/nhân viên đúng phạm vi kho; quy tắc giới hạn export và các mã lỗi tùy chọn thực tế.
