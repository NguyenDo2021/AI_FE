# Sidebar — 22/10/2026

Chỉ chỉnh sidebar; giữ markup/style AppHeader, các màn hình nội dung, danh sách route, thứ tự menu và điều kiện phân quyền hiện có. Không thêm dependency.

## File trong thay đổi này

- `src/components/layout/AppSidebar.vue` (mới): chuyển phần sider, lọc quyền và icon từ BasicLayout sang; bổ sung bố cục, scrollbar và trạng thái nhóm menu.
- `src/layouts/BasicLayout.vue`: sử dụng AppSidebar và bỏ CSS/sidebar cũ, kể cả vùng cuộn menu áp dụng riêng cho Products. Giữ nguyên các quy tắc content hiện có.
- `tests/sidebar.browser.mjs` (mới): kiểm tra Chrome với API giả lập chỉ GET, không ghi backend.
- `docs/sidebar-artifacts/*`: ảnh và số đo kiểm chứng.
- `docs/sidebar-redesign.md`: tài liệu này.

Các file Sản phẩm/bản dịch đang thay đổi từ yêu cầu trước không được sửa thêm trong yêu cầu sidebar này.

## Bố cục và thanh cuộn

Nguồn scrollbar cũ là overflow native trên Ant Design Vue Menu tại route Products; không có thư viện custom scrollbar. Những route khác trước đó chưa có chiều cao và vùng cuộn sidebar riêng.

Sidebar mới dùng Ant Layout Sider `width=256`, `collapsedWidth=80`; flex sizing của Sider tự cập nhật chiều rộng main, không thêm margin/offset thủ công cho content. Mobile giữ cơ chế overlay và collapsedWidth=0.

Sider `position: sticky; top: 0; height: 100dvh; min-height: 0` độc lập với độ dài content. Sider children là flex column cao 100%, min-height 0. Brand và footer không co; nav menu là phần flex còn lại, min-height 0, overflow-y auto. Chỉ nav được cuộn; logo/tên hệ thống và nút thu gọn đứng yên. Không dùng overflow hidden để cắt bỏ menu, không scrollIntoView gây kéo trang chính.

Scrollbar chỉ áp dụng cho `.sidebar-menu-scroll`: WebKit/Chromium rộng 6px, thumb bo tròn, nền trắng trong suốt 22%, tăng lên 46% khi hover/focus-within; track trong suốt, nút mũi tên display none/0px. Firefox dùng native thin. scrollbar-gutter stable both-edges giữ vị trí chữ và icon khi có/không có thanh cuộn. Giữ cuộn native bằng chuột/trackpad/cảm ứng; nav có tabindex và focus outline để cuộn bằng bàn phím, không chặn wheel/touch/key.

## Menu

Mục cao 42px, margin 2px, icon 16px, inlineIndent 16px/cấp. Nền mục chọn tím nhẹ, chữ theo purple token hiện có; popup khi thu gọn cũng có style riêng chỉ cho popup sidebar. Tên dài rút gọn bằng ellipsis và có native title đầy đủ, đồng thời giữ tooltip Ant Menu ở chế độ thu gọn.

Thay open-keys cố định bằng trạng thái điều khiển thực tế: nhóm không liên quan mặc định đóng; người dùng đóng/mở được. Khi đổi route, tải thẳng route hoặc mở lại sidebar, tự mở tổ tiên chứa route hiện tại và cuộn riêng nav vừa đủ để thấy mục được chọn. Nhóm popup ở trạng thái thu gọn có openKeys riêng, không làm mất trạng thái mở rộng. Giữ logic lọc visibleMenus và menuIcon, dữ liệu MENU_ITEMS và các guard hiện có.

## Kiểm tra

- `npm.cmd run type-check`: qua.
- `npm.cmd run lint`: qua, không lỗi/cảnh báo ESLint.
- `npm.cmd run build`: qua; còn cảnh báo DashboardChart trên 500 kB hiện có.
- `npm.cmd run test:catalog`: 23/23 qua, gồm cơ chế quyền và xác minh ADMIN.
- `node tests/sidebar.browser.mjs`: 41/41 qua trên Vite dev và bundle production. Kiểm tra hình học 1366×768, 1366×500, 1920×1080 và viewport CSS 1093×614 với DPR 1,25 để mô phỏng zoom 125%; mobile 390×844.
- Chỉ một phần tử cuộn trong sidebar; brand/footer ngoài nav, hàng cao 42px, scrollbar 6px, không mũi tên; cuộn tới mục cuối, giữ vị trí logo và document không cuộn theo wheel; PageDown và focus/hover hoạt động.
- Mở rộng 256px/thu gọn 80px không tràn ngang content; popup thu gọn mở được; điều hướng thực, đóng/mở nhóm, tải thẳng route, sidebar trên trang nội dung dài, nút header hiện có và mobile close đều hoạt động.
- Kiểm tra user chỉ có PRODUCT_VIEW, chỉ có PRODUCT_CREATE và ADMIN đã xác minh; menu bị giới hạn đúng như cơ chế cũ. Không lỗi component/runtime.
- `git diff --check`: qua.

[Ảnh desktop](sidebar-artifacts/desktop-1366.png), [cửa sổ thấp](sidebar-artifacts/low-500.png), [zoom mô phỏng](sidebar-artifacts/zoom-125.png), [thu gọn](sidebar-artifacts/collapsed.png), [mobile](sidebar-artifacts/mobile.png), [log và phép đo](sidebar-artifacts/browser-results.json).

Kiểm thử dùng Chrome headless và response có kiểm soát, không xác minh backend/tài khoản thật hoặc Firefox/Safari. Zoom 125% là mô phỏng viewport/DPR, chưa thao tác trực tiếp menu zoom Chrome. Touch/trackpad giữ hành vi native, chưa kiểm tra bằng phần cứng thật.

Chạy lại với Vite dev tại localhost:5173 hoặc đặt `SIDEBAR_TEST_URL=http://127.0.0.1:4173` cho preview production:

```powershell
node tests/sidebar.browser.mjs
```

Playwright được tái sử dụng từ `%TEMP%/codex-dashboard-browser/node_modules/playwright`, Chrome từ Program Files; không thêm dependency cho ứng dụng.
