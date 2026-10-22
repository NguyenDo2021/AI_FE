# Giao diện Sản phẩm — 22/10/2026

Áp dụng tại `/catalog/products`. Giữ header/sidebar/logo, route guard và cơ chế ADMIN đã xác minh. Không thêm dependency, API, chức năng xóa hoặc bộ lọc kho. Dữ liệu kiểm thử chỉ nằm trong `tests/products.browser.mjs`, không import vào ứng dụng.

## File thay đổi

- `src/views/catalog/CatalogPage.vue`: bố cục tím riêng cho Products, bộ lọc responsive, snapshot bộ lọc đã áp dụng, drawer đủ 13 trường chia ba nhóm. Giữ helper validation, giá nguyên an toàn, tải mọi trang nhóm, GET chi tiết trước PUT đầy đủ và quy tắc giữ nhóm ngừng hoạt động. Các danh mục khác tiếp tục dùng BasicTable/BasicModal.
- `src/components/catalog/ProductsTable.vue`: bảng responsive, tooltip tên đầy đủ, nhóm/quy cách gộp, tiền/số lượng căn phải, giá bán nổi bật, nhãn trạng thái rõ ràng, toolbar tổng API và phân trang server.
- `src/layouts/BasicLayout.vue`: chiều cao workspace chỉ giới hạn ở route Products; sidebar giữ khả năng cuộn menu riêng, header không co lại. Content và các cấp flex/grid có `min-height: 0`; các route khác giữ layout hiện có.
- `src/locales/vi-VN.ts`, `src/locales/en-US.ts`: nhãn mới theo cơ chế dịch hiện có.
- `tests/products.browser.mjs`: kiểm thử Chrome tương tác với API bị chặn và giả lập hoàn toàn, không ghi lên backend.
- `docs/products-artifacts/*`: ảnh và kết quả đo trình duyệt.

## Cách tính pageSize

Layout ngoài dùng `height: 100dvh` một lần cho toàn workspace; content flex nhận phần còn lại sau header. Trang Products gồm heading, filters và panel bảng flex còn lại. Panel grid có ba hàng: toolbar / vùng bảng `minmax(0, 1fr)` / footer phân trang.

ResizeObserver theo dõi panel, toolbar, thead và footer. Sau debounce 140 ms:

```text
available = panel.clientHeight
            - padding và border panel
            - toolbar.offsetHeight
            - thead.offsetHeight
            - footer.offsetHeight
            - 8 px dự phòng
pageSize = clamp(floor(available / rowHeight), 1, 100)
```

Chiều cao hàng là 84 CSS px; khi panel hẹp dưới 480 px, trạng thái chuyển vào ô tên và hàng là 104 CSS px. Header được đo thực tế, kể cả khi nhãn xuống dòng. Đợi callback observer đầu tiên sau khi layout ổn định rồi mới tải trang server. Chỉ emit khi số dòng vừa màn hình đổi; parent chỉ tải lại khi capacity mới khác giá trị hiện tại, reset page về 1 và bỏ các hàng cũ trong lúc tải. Không `scroll.y`, không giấu/bớt hàng bằng CSS, không lấy một trang lớn rồi cắt ở client.

Các request danh sách chụp bộ lọc đã áp dụng, dùng generation `listVersion` hiện có để bỏ response cũ. Resize không vô tình áp dụng keyword đang nhập dở. Tìm kiếm/đổi nhóm/đổi trạng thái lọc/đặt lại đưa về trang 1. Reset được gom thành một lần tìm kiếm. Lỗi danh sách nằm trong vùng bảng để không làm thay đổi capacity và gây vòng lặp request; lỗi chi tiết hiển thị riêng trong drawer. Tổng vẫn theo API, không tính từ items của trang.

## Kết quả kiểm tra

- `npm.cmd run type-check`: qua.
- `npm.cmd run lint`: qua, không lỗi/cảnh báo ESLint.
- `npm.cmd run build`: qua. Vite còn cảnh báo chunk DashboardChart lớn hơn 500 kB của dashboard hiện có.
- `node --test --test-reporter=spec tests/*.test.mjs`: 206/206 qua.
- `node tests/products.browser.mjs`: 59/59 qua trên cả Vite dev và bản build production, không lỗi component/runtime. Bao gồm Enter, phân trang server, resize không đổi capacity không gọi API, reset/lọc/tải lại, response cũ đến muộn, 205 nhóm/3 trang, nhóm ngừng hoạt động, tiền MAX_SAFE_INTEGER, drawer đủ trường, PUT đầy đủ, thêm chống gửi lặp, lỗi/rỗng và quyền VIEW/CREATE/ADMIN.
- Kiểm tra hình học: không tràn trang ngang/dọc, không cuộn dọc vùng bảng, số hàng DOM bằng số hàng API, mọi hàng nằm trước footer, chiều cao hàng ổn định. 1366×768: 4 dòng; 1920×1080: 7 dòng; 1366×500: 1 dòng; 960×768: 4 dòng; 390×844: 4 dòng; 320×640: 2 dòng.
- Zoom 125% được mô phỏng bằng viewport 1093×614 và DPR 1,25 (tương đương vùng hiển thị khoảng 1366×768), 3 dòng/trang. Chưa thao tác mức zoom trên thanh menu Chrome bằng tay.
- `git diff --check`: qua.

Ảnh: [Desktop 1366](products-artifacts/desktop-1366.png), [Desktop 1920](products-artifacts/desktop-1920.png), [Cửa sổ thấp](products-artifacts/low-500.png), [Mobile](products-artifacts/mobile-390.png), [Zoom mô phỏng](products-artifacts/zoom-125.png), [Drawer](products-artifacts/create-drawer.png). [Kết quả và phép đo](products-artifacts/browser-results.json).

## Giới hạn xác minh

Chrome headless dùng response API có kiểm soát. Chưa kiểm tra với dữ liệu/tài khoản/backend thật hoặc Safari/Firefox. Các thao tác thêm/sửa/đổi trạng thái trong kịch bản chỉ tác động fixture, không thay đổi dữ liệu nghiệp vụ. Không triển khai hosting/backend.

Chạy lại trong môi trường hiện tại:

```powershell
npm.cmd run dev -- --host 127.0.0.1
node tests/products.browser.mjs
```

Kịch bản dùng Playwright có sẵn tại `%TEMP%/codex-dashboard-browser/node_modules/playwright` và Chrome tại `C:/Program Files/Google/Chrome/Application/chrome.exe`. Không thêm Playwright vào dependency ứng dụng.
