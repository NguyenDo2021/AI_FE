# Sửa responsive Chi tiết người dùng

## Nguyên nhân đã đo trước khi sửa

Màn Chi tiết sử dụng `BasicDrawer` → Ant Design Vue Drawer. `BasicDrawer` mặc định truyền `width: 520` cho `.ant-drawer-content-wrapper`; tại màn người dùng chưa có override breakpoint.

- Viewport 320px: wrapper rộng 520px, mép trái -200px, mép phải 320px.
- Viewport 390px: wrapper rộng 520px, mép trái -130px, mép phải 390px.
- Drawer root có `position: fixed`, inset 0, rộng đúng viewport. Wrapper dùng `right: 0`, không có margin/padding gây cộng thêm chiều rộng. Transform kết thúc ở gần 0; không phải nguồn gây lệch.
- Popup được mount qua container của Ant ngoài nội dung layout; không kế thừa margin/padding của danh sách. `box-sizing: border-box` đã đúng.
- Descriptions là bảng label/value trong wrapper 520px. Với dữ liệu thử nghiệm, body không bị tràn so với chính nó (`clientWidth = scrollWidth`), nhưng wrapper đã vượt viewport nên cả header/close/label phía trái đều bị cắt. Chỉ ẩn scrollbar hoặc sửa cell sẽ không giải quyết nguyên nhân này.
- Footer trước đây là slot rỗng, chưa có nút Đóng ở cuối màn Chi tiết.

Số đo gốc: `user-detail-artifacts/baseline.json`; ảnh lỗi tái hiện: `before-320.png`, `before-390.png`.

## Thay đổi

- `src/components/catalog/UserDetailDrawer.vue` (mới): component trình bày riêng cho Chi tiết. Dưới 768px, Drawer rộng 100% container viewport, wrapper có max-width 100%/min-width 0; desktop vẫn 520px và Descriptions bordered một cột.
- Mobile dùng `dl/dt/dd`: nhãn trên, giá trị dưới; đủ đúng năm field cũ. Email, username/UUID và tên dài wrap bằng `overflow-wrap:anywhere`; trạng thái có tag nhãn.
- Header có title đầy đủ và nút đóng aria-label; footer có nút Đóng cùng handler đóng, không thêm action nghiệp vụ. Mobile dùng vùng chạm 44px. Chỉ body drawer có overflow auto, min-height 0; header/footer không co. Root dùng 100dvh khi hỗ trợ, fallback 100vh. Không đặt chiều cao cố định cho body, không thêm CSS khóa/ẩn scrollbar trên body/html; giữ khóa cuộn nền mặc định của Ant.
- `src/views/system/user/index.vue`: thay phần render BasicDrawer cũ bằng UserDetailDrawer. Chỉ ghi nhận button mở để trả focus khi đóng; GET user, handler lỗi/loading, version chống response cũ và permission giữ nguyên. Không reload danh sách hoặc gọi thêm API.
- `tests/user-detail.browser.mjs`: fixture browser tái hiện lỗi trước sửa và kiểm tra sau sửa, không truy cập backend thật.

Không sửa BasicDrawer dùng chung, form thêm/sửa, drawer gán kho/vai trò, API, DTO hay permission trong lần sửa này.

## Kiểm tra thực tế

- `node tests/user-detail.browser.mjs --baseline`: đã chạy trước sửa, lưu số đo xác định nguyên nhân.
- `node tests/user-detail.browser.mjs`: 214 kiểm tra đạt, không có lỗi ứng dụng chưa xử lý.
- Các viewport: 320×740, 375×812, 390×844, 414×896, 768×1024, 1440×900; landscape 844×390, 667×375; màn hình thấp 320×320.
- Mỗi viewport thử dữ liệu thường và dữ liệu dài: username/UUID không có dấu cách, họ tên dài, email liền chuỗi rất dài, phone null. Không có cuộn ngang ở body hoặc phần tử con; duy nhất body drawer cuộn dọc khi cần; footer đứng yên khi cuộn đến cuối.
- Kiểm tra loading trên action mở, lỗi GET, mở lại sau lỗi, response chậm của user trước, trạng thái inactive, đóng bằng header/footer/Escape, trả focus, không thêm request, giữ filter và trang hiện tại.
- Ảnh sau sửa: `user-detail-artifacts/after-390.png`, `after-1440.png`; đầy đủ số đo và request ở `user-detail-artifacts/results.json`.
- `pnpm run type-check`: đạt theo script hiện có. Lưu ý tsconfig gốc chỉ có references nên lệnh này không kiểm tra project con; chạy thêm `vue-tsc --noEmit -p tsconfig.app.json` vẫn gặp lỗi có sẵn ở `WarehouseSelector.vue:78` và `AppSidebar.vue:202`, không thay các file đó.
- Typecheck riêng `UserDetailDrawer.vue` với cấu hình kế thừa `tsconfig.app.json`: đạt. Cấu hình tạm đã được xóa sau kiểm tra.
- `pnpm run lint`: đạt.
- `pnpm run build`: đạt; cảnh báo chunk lớn hơn 500 kB từ bundle project vẫn còn.
- Kiểm tra hồi quy `node tests/users.browser.mjs`: 153 kiểm tra đạt, không có lỗi ứng dụng chưa xử lý; bao gồm form thêm/sửa và drawer gán kho/vai trò ở 320–1440px.

Giới hạn: dùng Chrome headless với API giả lập; chưa kiểm tra thiết bị thật hoặc Safari/iOS. Cơ chế khóa cuộn/focus mặc định của Ant được giữ; không chỉnh global CSS hay cơ chế xác thực.


