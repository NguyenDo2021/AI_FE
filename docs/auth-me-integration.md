# Tích hợp GET /auth/me cho xác minh Admin

## Nguyên nhân và thay đổi

Auth store cũ lấy hồ sơ bằng `/auth/me`, sau đó gọi `/users/{currentUserId}` và `/users/{currentUserId}/roles` để suy ra Admin. Nhân viên không có USER_VIEW nhận hai 403; catalog hiển thị cảnh báo cả khi chưa tải xong.

Luồng phiên hiện chỉ dùng `GET /auth/me` với bearer token qua interceptor hiện có. Base URL có `/api`, đường dẫn gọi là `/auth/me`. HTTP wrapper đã trả body trực tiếp; validator không đọc thêm `data` và từ chối envelope, field thiếu/null/sai kiểu. Hai API quản trị vẫn giữ nguyên cho màn người dùng/vai trò có quyền tương ứng; không thêm USER_VIEW.

## Nguồn dữ liệu và vòng đời

- `auth.currentUser`: hồ sơ CurrentUser từ DB; `permissions` ở đây là ảnh chụp DB, không cấp quyền cho UI.
- `auth.user.permissions`: claim `permissions` trong access JWT. Đã đối chiếu source BE cục bộ: `JwtService.createAccessToken/parseAccessToken` và `JwtAuthenticationFilter`. FE cũ lấy quyền từ DB qua `/me`, có thể lệch JWT; bản sửa giữ giao diện store cho can/menu/guard/directive nhưng sửa nguồn quyền về token.
- `auth.isCatalogAdmin`: chỉ true khi trạng thái verified và `currentUser.isAdmin === true`. Không đọc Admin từ username, roles, JWT, permission hay kho.
- `adminVerificationStatus`: idle/loading/verified/failed. False hợp lệ là verified; lỗi mạng hoặc contract là failed, xóa hồ sơ Admin cũ, giữ quyền hiệu lực đã biết của JWT.
- Banner chung trong BasicLayout hiển thị thông tin khi loading, cảnh báo và nút thử lại khi failed. Cả desktop/mobile dùng cùng state, không gọi riêng từ component.
- Login và F5 xác minh qua getUserInfo dùng chung promise. Logout/đăng nhập tài khoản khác xóa profile, quyền và kho, tăng session revision. Interceptor chụp revision ngay lúc gọi để chặn cả request còn xếp hàng, response cũ và 401/403 cũ.
- Refresh token vẫn dùng endpoint và cơ chế chia sẻ promise hiện có, cập nhật quyền JWT ngay khi nhận token. Nếu /me đang chờ thì dùng lần retry của interceptor; nếu không, xác minh được trì hoãn tới sau khi promise refresh kết thúc. /me chỉ được retry 401 một lần; 401 tiếp theo đăng xuất.
- Mỗi token có tối đa một lần xác minh tự động do 403; /me dùng skipAccessRefresh để tránh gọi đệ quy. Người dùng có thể thử lại thủ công.
- Không lưu isAdmin vào storage. Không thêm endpoint hoặc luồng refresh mới. Khi khởi tạo phiên không lấy được hồ sơ, cơ chế lỗi login/guard và đăng xuất hiện có được giữ; trong phiên đã khởi tạo, lỗi xác minh giữ quyền JWT và cho thử lại.

## Phạm vi kho và giới hạn Admin

`GET /users/me/warehouses`, handler WAREHOUSE_ACCESS_DENIED dùng chung, revision, selection/persistence cleanup và quy tắc không replay thao tác ghi được giữ. FORBIDDEN không xóa scope kho. Sản phẩm/nhóm dùng chung không bị chặn bởi danh sách kho rỗng. Không sửa cơ chế ẩn dropdown Thao tác khi đơn bán không có action.

Ngoại lệ Admin vẫn áp dụng đúng phạm vi can/route/menu hiện có; không mở rộng bỏ qua quyền màn hình hệ thống. isAdmin phản ánh thời điểm gọi /me; backend vẫn quyết định Admin/quyền/phạm vi ở mỗi API nghiệp vụ.

## File thay đổi

| File                                                | Nội dung                                                                                            |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| src/types/auth.ts                                   | CurrentUser, kiểu trạng thái xác minh                                                               |
| src/utils/auth.ts                                   | Validator response, đọc permission JWT                                                              |
| src/api/auth/auth.api.ts                            | /me trực tiếp, quietErrors và skipAccessRefresh                                                     |
| src/stores/auth.ts                                  | Tách hồ sơ/quyền, xác minh chung, vòng đời phiên, giới hạn denial                                   |
| src/utils/request.ts                                | Chặn request/response phiên cũ, tách promise refresh theo phiên                                     |
| src/main.ts                                         | Nối revision và handler denial có giới hạn                                                          |
| src/layouts/BasicLayout.vue                         | Trạng thái tải/lỗi và thử lại dùng chung                                                            |
| src/views/catalog/CatalogPage.vue                   | Bỏ cảnh báo dựa trên !adminVerified                                                                 |
| src/locales/vi-VN.ts, src/locales/en-US.ts          | Thông báo đang xác minh                                                                             |
| tests/catalog.test.mjs                              | Thay kiểm thử cơ chế role cũ bằng contract mới, thêm trường hợp đồng thời/đổi tài khoản/quyền token |
| tests/auth-session.test.mjs                         | Auth API/store/interceptor thật với Axios adapter mock                                              |
| tests/auth-session.browser.mjs                      | Kiểm thử UI 1440/390 px, mock toàn bộ API                                                           |
| tests/reports.test.mjs                              | Khai báo đầy đủ khoảng ngày fixture để không phụ thuộc tháng chạy                                   |
| README.md, docs/catalog-management.md, tài liệu này | Cập nhật contract và bàn giao                                                                       |

## Kiểm tra

Hai lỗi reports được tái hiện trước sửa:

1. Test “sales screen commits period, summary and rows together, discards stale responses and revokes access” đặt ngày kết thúc 2026-10-20 nhưng dùng ngày bắt đầu của tháng hiện tại. Khi tháng hiện tại sau tháng 10/2026, submit bị validator từ chối, nên dữ liệu cũ còn nguyên. Test nay đặt cả ngày bắt đầu fixture 2026-10-01; giữ toàn bộ assertion.
2. Test “sales screen handles empty/error states and refreshes revoked warehouse scope” chạy riêng đã đạt. Khi test đầu lỗi trước unmount, component còn sống đăng ký watcher và làm tăng refresh scope trong test sau. Sửa dữ liệu ngày của test đầu giải quyết cả hai; không thay code sản phẩm reports, không bỏ test hay nới assertion.

Các lệnh trực tiếp tương đương script package được dùng vì launcher pnpm trong sandbox gặp EPERM khi đọc thư mục hồ sơ Windows:

- `node node_modules/eslint/bin/eslint.js .`: đạt.
- `node --test tests/*.test.mjs`: 306/306 đạt, không skip.
- Riêng reports: 52/52 đạt, gồm hai test nêu trên.
- `node node_modules/vue-tsc/bin/vue-tsc.js --noEmit`: đạt.
- `node node_modules/vite/bin/vite.js build`: đạt; cảnh báo chunk DashboardChart lớn hơn 500 kB.
- `node tests/auth-session.browser.mjs` với Vite localhost: 26 assertion đạt ở 1440 px và 390 px. Kiểm tra nhân viên false, F5 không lặp /me, tách DB/JWT, Admin, loading không cảnh báo, lỗi bỏ Admin và thử lại, catalog không cần kho, dropdown rỗng đơn bán và không có pageerror.

## Chưa xác minh với backend thật

Chưa dùng tài khoản hoặc gọi server BE thật để kiểm tra login/refresh, thay đổi permission DB, ngừng user, thu hồi Admin/kho và Cache-Control: no-store trên đường truyền thực tế. Những trường hợp auth/401/403, response đến muộn và thu hồi kho đã được kiểm thử bằng mock. Các browser fixture cũ của module khác chưa được chạy toàn bộ; fixture đó cần cung cấp JWT có permissions và CurrentUser đầy đủ theo contract mới khi dùng lại.

Không deploy. Không thay đổi cấu hình .env.development có sẵn của người dùng.
