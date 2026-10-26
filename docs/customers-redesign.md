Hoàn thiện và kiểm tra chức năng Khách hàng — 23/10/2026

Đã đối chiếu file yêu cầu Khách hàng và giữ yêu cầu phân trang mới 10/20/50/100. Lượt này chỉ cập nhật giao diện Khách hàng và kiểm tra liên quan.

File thay đổi trong lượt này:
- src/views/sales/CustomersPage.vue: thêm mô tả, nhãn bộ lọc, theme tím và icon; thao tác gọn; giữ đủ 7 cột, tooltip mã đầy đủ, giới hạn nội dung dài và badge đồng bộ Quản lý kho. Giữ tìm kiếm tự tải hiện tại, quan hệ một chiều từ kho làm việc sang bộ lọc, reset và phân trang server.
- src/components/sales/CustomerDialog.vue: dùng BasicDrawer như Quản lý kho; form desktop hai cột/mobile một cột; footer cố định, validation tại trường; chi tiết đọc đầy đủ mã, kho, liên hệ, địa chỉ, ghi chú và thời gian; xác nhận trạng thái ghi rõ hành động. Khóa input trong lúc tải dữ liệu gốc.
- tests/sales.test.mjs: cập nhật test double cho drawer và icon.
- tests/list-tables.browser.mjs: cập nhật selector trạng thái theo bộ lọc có nhãn.
- tests/customers.browser.mjs: thêm kiểm tra chức năng bằng trình duyệt.
- docs/customers-artifacts/: ảnh danh sách, chi tiết desktop, form mobile và browser-results.json chứa request/checks.

Tái sử dụng BasicDrawer, khung FittedListTable, Ant Design Vue, icon và token tím hiện có của Quản lý kho. Không sửa component BasicDrawer/BasicTable chung hoặc giao diện module khác.

Kết quả:
| Kiểm tra | Kết quả |
| --- | --- |
| Chức năng Khách hàng trên Chrome headless | 62 mục đạt, không lỗi runtime |
| Phân trang/cuộn cả 4 module | 198 mục đạt |
| Tests catalog/sales hiện có | 56/56 đạt |
| ESLint các file cập nhật | Đạt |
| Typecheck qua vue-tsc và production build | Đạt |

Đã kiểm tra tạo khách với validation tên bắt buộc, giới hạn 160/20/500/2000, điện thoại dạng chuỗi giữ số 0 đầu và mã do server sinh. Lỗi validation API gắn đúng trường; bản nhập giữ lại khi lưu thất bại. Nhấp đúp Lưu chỉ phát sinh một POST và một lần tải danh sách.

Đã kiểm tra sửa tải GET đầy đủ trước PUT, kho không được thay đổi, mã hiển thị đầy đủ; tải lại dữ liệu gốc có xác nhận và hủy xác nhận giữ bản nhập. Lỗi 409 giữ dữ liệu nhập. Payload sửa và đổi trạng thái giữ đủ name/phone/address/note/status; không gửi warehouseId hoặc code vào PUT.

Đã kiểm tra hủy đổi trạng thái không gửi PUT; xác nhận ngừng hoạt động/kích hoạt giữ đủ liên hệ và chỉ gửi một request dù nhấp đúp. Lỗi tải chi tiết, chi tiết thuộc kho ngoài phạm vi và lỗi lưu 403 chặn lưu phù hợp.

Đã kiểm tra nhân viên chỉ xem không có thao tác thêm/sửa; dữ liệu ngoài kho được giao bị loại; ADMIN đã xác minh theo role hiện có vẫn có ngoại lệ quyền. Không có kho thì không tải danh sách. Thu hồi kho trong lúc GET chi tiết đang chờ đóng drawer và bỏ response cũ. Quan hệ kho làm việc và bộ lọc giữ nguyên: đổi header cập nhật bộ lọc, đổi bộ lọc không thay kho làm việc. Danh sách không gọi API chi tiết từng dòng.

Đã kiểm tra 360/390/768/1024/1366/1920px, drawer một cột mobile và hai cột desktop, footer tiếp cận được; viewport cao 400px cho nội dung drawer cuộn bên trong. Menu mobile đủ Chi tiết/Sửa/đổi trạng thái và chi tiết vẫn giữ mã/ghi chú đầy đủ. Bộ phân trang chung kiểm tra thêm mô phỏng zoom 125%, dữ liệu rỗng, trang cuối, resize/sidebar, cuộn hai chiều và fixed header/Thao tác.

Không đổi endpoint, payload, validation nghiệp vụ, handler lưu/tải, phân quyền hoặc phạm vi kho. Không thêm dependency, chức năng xóa, công nợ hoặc lịch sử giao dịch. Không commit, push hoặc deploy.

Giới hạn: kiểm tra với API giả lập, chưa kiểm tra backend thật; mobile/bàn phím ảo/zoom được mô phỏng bằng viewport và DPR, chưa kiểm tra thiết bị thật. Build có cảnh báo chunk vượt 500 kB.
