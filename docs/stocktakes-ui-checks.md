# Refactor giao diện Kiểm kê kho

Ngày kiểm tra: 24/10/2026. Phạm vi: module Kiểm kê kho trong FE.

## Tệp thay đổi

| Tệp                                             | Nội dung                                                                                                                                                                                         |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/views/stock/StocktakesPage.vue`            | Tiêu đề/mô tả, bộ lọc có label, 8 cột giữ nguyên thứ tự, UUID/mã ellipsis và tooltip, thao tác phụ trong dropdown, nút chi tiết dạng icon trên mobile, bố cục vừa content.                       |
| `src/components/stock/StocktakeTable.vue` (mới) | Bọc BasicTable cho riêng module; vùng cuộn hai chiều, header và cột phải sticky, nền đục/z-index, toolbar và total từ API, footer/pageSize bên ngoài dữ liệu cuộn.                               |
| `src/components/stock/StocktakeDialog.vue`      | Chia thông tin phiếu, sản phẩm và ghi chú; audit có trường riêng; số lượng căn phải, chênh lệch có dấu +/−/0, form dài cuộn trong modal, footer dễ tiếp cận, màn hình rất thấp cuộn modal ngoài. |
| `src/components/stock/StocktakeProducts.vue`    | Dùng bảng riêng của module, giữ nguồn inventory, phân trang, chống trùng và giới hạn sản phẩm đang có.                                                                                           |
| `src/locales/vi-VN.ts`, `src/locales/en-US.ts`  | Chỉ thêm nhãn trong namespace stocktake; giữ các nhãn enum hiện có.                                                                                                                              |
| `tests/stocktake.test.mjs`                      | Cập nhật test doubles cho component/icon, thêm kiểm thử pageSize và response đến muộn.                                                                                                           |
| `tests/stocktakes.browser.mjs` (mới)            | Kiểm thử Chrome với API giả lập và lưu ảnh/kích thước đo được.                                                                                                                                   |
| `docs/stocktakes-ui-checks.md` (mới)            | Báo cáo này.                                                                                                                                                                                     |

Thay đổi có sẵn trong `.env.development` được giữ nguyên.

## Thành phần tái sử dụng và hành vi giữ nguyên

- BasicTable, BasicModal, Ant Design Vue và icon hiện có.
- Màu tím `#7357cf`, radius và typography theo các màn hình danh mục đã hoàn thiện; theme chỉ áp dụng trong module.
- formatDateTime, formatStockInteger, countDifference và parser/serializer số nguyên lớn.
- useCatalogPermission/useSalesScope và warehouse store: giữ ngoại lệ ADMIN, kho được giao và liên hệ với kho làm việc trên header.
- Giữ API, DTO, payload, validation, điều kiện trạng thái, version, snapshot, xử lý conflict/stale/timeout, cảnh báo dữ liệu chưa lưu và xác nhận trước thao tác nghiệp vụ.
- Danh sách phiếu phân trang server: 10/20/50/100, mặc định 10. Đổi pageSize về trang 1 và giữ bộ lọc. Resize chỉ đổi trình bày, không gọi API.
- Ngày hiển thị DD/MM/YYYY; giá trị gửi API vẫn YYYY-MM-DD, giữ nguyên from/to và ý nghĩa khoảng ngày.
- Bảng dòng phiếu không thêm phân trang. Việc chọn sản phẩm vẫn dùng nguồn inventory có phân trang như trước.
- Các style tác động tới khung layout đều có điều kiện chứa .stocktakes-page.

## Kết quả kiểm tra

| Kiểm tra                             | Kết quả                                                                                         |
| ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `npm run type-check`                 | Đạt.                                                                                            |
| `npm run lint`                       | Đạt.                                                                                            |
| Toàn bộ `tests/*.test.mjs`           | 208/208 đạt, gồm 24 kiểm thử Kiểm kê kho.                                                       |
| `npm run build`                      | Đạt. Có cảnh báo chunk DashboardChart lớn hơn 500 kB; mã biểu đồ nằm ngoài phạm vi lần sửa này. |
| Chrome headless, toàn bộ API giả lập | 177 kiểm tra đạt; không có lỗi trình duyệt hoặc request API ngoài fixture.                      |
| Bố cục                               | 13 bộ số đo; 12 ảnh danh sách/form ở 360/390/768/1024/1366/1920px.                              |

Đã kiểm tra thực tế trong Chrome:

- Danh sách và form tại 360/390/768/1024/1366/1920px, thêm 1366×768 và 1920×1080.
- Viewport CSS 1093×614 tương đương vùng làm việc 1366×768 tại zoom 125%. Đây là mô phỏng kích thước CSS, không phải thao tác zoom của trình duyệt.
- Form tại 390×400: cuộn tới footer được, giá trị đang nhập vẫn giữ nguyên.
- Mã dài/UUID dài, null, danh sách rỗng/ít/nhiều dòng; đủ 8 cột và tooltip toàn bộ mã.
- Header sticky và Thao tác cố định khi cuộn cả hai chiều; một vùng cuộn dữ liệu, scrollbar ngang ngay trên footer; không tràn ngang toàn trang.
- Chọn 10/20/50/100, chuyển trang, giữ bộ lọc khi đổi pageSize, lọc/reset đưa cuộn dọc về đầu.
- Resize không đổi pageSize và không gọi lại API; không có tra cứu người dùng theo từng dòng.
- Chọn khoảng ngày qua lịch; API nhận đúng ngày địa phương; khoảng ngày sai không gọi API.
- Response cũ đến sau không ghi đè kết quả mới.
- Tạo, sửa, xem, lưu int64 cực đại, xác nhận, hủy nháp và lấy lại snapshot; xác nhận nghiệp vụ được giữ.
- Bảng phiếu hiển thị đủ 24 dòng, không thêm phân trang; giá trị 0 khác ô trống; chênh lệch âm/dương/0; dữ liệu không mất khi resize.
- Version conflict giữ bản nhập và chặn lưu; lấy lại snapshot dùng response API và xóa số đếm theo luồng hiện có.
- Quyền chỉ xem, chỉ tạo, ADMIN, kho được giao, thu hồi quyền kho, lỗi 403 và luồng hết phiên 401.

Kết quả JSON tại `%TEMP%\codex-stocktake-browser\artifacts\results.json`; ảnh tại cùng thư mục, tên `list-*.png` và `edit-*.png`.

## Chạy lại

Cần dev server đang chạy. Bộ kiểm thử chỉ giả lập API, không gửi thay đổi tồn tới backend thật.

```powershell
npm install --no-save --prefix "$env:TEMP\codex-stocktake-browser" playwright
node tests/stocktakes.browser.mjs
```

Mặc định sử dụng http://127.0.0.1:5173; có thể đổi bằng STOCKTAKES_TEST_URL. Script dùng Chrome đã cài ở đường dẫn Windows thông dụng như các browser test hiện có.

## Phần chưa kiểm tra

- Transaction, đối chiếu tồn/lịch sử và cập nhật đồng thời trên API/backend thật.
- Browser zoom 125% thực tế qua giao diện Chrome.
- Safari/Firefox, thiết bị cảm ứng thật và bàn phím ảo trên điện thoại.
