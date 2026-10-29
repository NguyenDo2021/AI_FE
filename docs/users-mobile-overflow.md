# Sửa tràn ngang mobile — Quản lý người dùng

## Nguyên nhân thực tế

Đã đo bằng Chrome ở chế độ mobile/touch, deviceScaleFactor 2. Dùng đồng thời `scrollWidth/clientWidth` và `getBoundingClientRect()` cho html/body/app shell/main/card/table, portal modal, header/body/footer và popup.

Ở mức zoom bình thường, chưa tái hiện tràn ngang toàn trang tại 320/375/390/414/768/1440px: chỉ `.ant-table-body` cuộn ngang. Không thay cột hoặc tắt cuộn bảng để che vấn đề này.

Các điều kiện gây lỗi đã tái hiện:

1. `body { min-width: 320px }` trong stylesheet gốc: khi mô phỏng CSS zoom 125% tại viewport 320px, body/tài liệu giãn thành 400px trong khi `document.documentElement.clientWidth` và `visualViewport.width` vẫn là 320px. Trình duyệt mobile đồng thời tăng `innerWidth` lên 400px; vì vậy chỉ so sánh `scrollWidth <= innerWidth` sẽ bỏ sót lỗi. Khi mở modal, visual viewport còn có thể bị pan ngang 65px. Đổi trực tiếp duy nhất min-width sang `min(320px, 100%)` đưa tài liệu về 320px; đối chiếu ở `probe.json`.
2. Tooltip được portal trong body đang zoom: sau khi đóng modal, tooltip nút hoặc chuỗi dài có thể đặt sai tọa độ và kéo tài liệu rộng 464–531px; dropdown Trạng thái khi zoom còn kéo tài liệu rộng 604px. Bảng/main vẫn vừa viewport; phần vượt thực sự là popup. Chuyển riêng tooltip và dropdown của module sang container `document.documentElement` giữ đúng hệ tọa độ viewport, không thừa hưởng zoom từ body. Tooltip mobile nằm giữa theo chiều ngang viewport để vẫn đọc được khi ô neo đang bị cuộn khuất một phần. Đã đo lại cả trạng thái đóng modal và tooltip đang mở.
3. Form mobile dùng `max-height: calc(100dvh - 250px)` cho body bên trong nhưng chiều cao header/footer thay đổi theo wrap. Ở 320×320, content bottom khoảng 325px; modal wrap có scrollHeight 337px/clientHeight 320px, đồng thời body bên trong cũng cuộn. Đây là lỗi chiều cao và cuộn lồng nhau, không phải nguyên nhân tràn ngang ở mức zoom bình thường.

Không xác định được lỗi margin âm hoặc transform của app shell tại các kích thước kiểm tra. Portal modal vẫn nằm ngoài bảng, nên cuộn bảng không được dùng làm hệ tọa độ căn modal.

## File đã sửa trong lần này

- `src/styles/index.css`: sửa tối thiểu một dòng min-width của body thành `min(320px, 100%)`. Không thêm overflow-x hidden vào html/body/app root.
- `src/views/system/user/index.vue`: track grid của card bảng dùng `minmax(0, 1fr)`; pagination mobile có hàng tổng số và controls co/wrap đúng không gian. Tooltip dùng container theo viewport; tooltip nội dung dài có max-width phù hợp. Giữ đủ 10 cột, sticky header, quy tắc fixed actions, default pageSize và các lựa chọn 10/20/50/100.
- `src/components/catalog/UserFormModal.vue`: portal mobile có padding 12px, flex bị giới hạn theo viewport; header/footer không co, chỉ body modal cuộn. Bỏ cuộn lồng và overflow clipping ở form body mobile. Header text wrap, close có vùng chạm 44px, các wrapper input/select co được. Dùng `useWindowSize({ type: 'visual' })` hiện có để cập nhật chiều cao vùng nhìn thấy khi visualViewport thay đổi.
- `src/components/catalog/UserDetailDrawer.vue`: giới hạn chiều cao viewport động bằng cả `100%` của container, tránh footer bị đẩy ra ngoài khi kế thừa zoom. Giữ width/wrap mobile và layout desktop 520px đã có.
- `tests/users-overflow.browser.mjs`: kịch bản đo trước/sau và assertion kiểm tra tràn.

Ant Modal teleport root không mang Vue scope attribute của component. Các selector portal được giới hạn rõ bằng `.user-form-mobile-wrap .user-form-modal`; không áp dụng lên modal/drawer khác. Các CSS còn lại nằm trong scope module. Không sửa component BasicModal/BasicDrawer dùng chung.

Không thay API, DTO, payload, validation, permission, nghiệp vụ, submit hoặc dữ liệu. Native input được phép cuộn phần text bên trong khi chuỗi dài; đây không phải cuộn ngang của modal/trang.

## Kiểm tra trình duyệt

- 320, 375, 390, 414, 768, 1440px, cao 740px.
- Filter mobile mặc định thu gọn và trạng thái mở.
- Bảng ở trái/giữa/phải; vuốt thật bằng chuỗi touchStart/touchMove/touchEnd trong Chrome. Tọa độ ngang header/filter/pagination đứng yên; chỉ table body cuộn ngang.
- Mở thêm/sửa/chi tiết sau khi cuộn bảng. Chuỗi username, họ tên và email dài; validation; dropdown trạng thái; bounds header/footer; kiểm tra không có scrollbar ngang của overlay.
- Tổng 123456789; controls vẫn wrap trong card. Kiểm tra hồi quy cũ bao gồm pageSize 10/20/50/100.
- Viewport 320×320 với input Email được focus.
- Mô phỏng visualViewport height/resize từ layout cao 740px còn vùng nhìn thấy 340px; kiểm tra body và footer vẫn tiếp cận được.
- Mô phỏng CSS zoom 125% và 150%, gồm sau đóng modal và tooltip chuỗi dài đang mở.
- Đóng modal giải phóng khóa cuộn nền mặc định của Ant, trang giữ scrollX 0. Không dùng khóa cuộn nền làm cách sửa kích thước sai.

Giới hạn: keyboard/zoom được mô phỏng có kiểm soát trong Chrome, chưa kiểm tra bàn phím vật lý hoặc native pinch zoom Safari trên thiết bị thật. Toàn bộ API dùng fixture, không truy cập backend thật.

## Kết quả và artifacts

- `pnpm run build`: đạt; cảnh báo chunk chart >500kB có sẵn.
- `pnpm run lint`: đạt.
- `node tests/users.browser.mjs`: 153 kiểm tra hồi quy module đạt, không có lỗi ứng dụng chưa xử lý.
- `node tests/list-tables.browser.mjs`: products 50, product-groups 50, warehouses 49, customers 49 kiểm tra đạt; không có lỗi JavaScript chưa xử lý. Kiểm tra này xác minh thay đổi min-width dùng chung trên các màn khác. Artifacts mới được chép về thư mục của task; artifacts gốc module khác được giữ nguyên.
- `node tests/users-overflow.browser.mjs`: 703 assertion đạt, không có lỗi ứng dụng chưa xử lý; 97 trạng thái đo trong `users-overflow-artifacts/results.json`. Lượt riêng `--zoom-only` đạt 144 assertion, lưu ở `results-zoom.json`.

Thư mục `docs/users-overflow-artifacts`: baseline/probe/results JSON, ảnh thêm/sửa/chi tiết ở 320 và 390px, `shared-list-regression.json` và ảnh hồi quy các màn dùng chung.


