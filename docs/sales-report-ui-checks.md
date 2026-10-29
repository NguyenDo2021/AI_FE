# Báo cáo hoạt động bán hàng — 28/10/2026

## Cập nhật bảng Chi tiết theo kho

Phạm vi lượt sửa này chỉ gồm bảng và layout liên quan; giữ các thay đổi kích thước input từ lượt trước. Không đổi filter, summary, export, API, permission hoặc nghiệp vụ.

### Kết quả kiểm tra và nguyên nhân

- `SalesSummary` có `returnedSalesAmount`; API wrapper giữ nguyên `result.items`, bảng đọc đúng `dataIndex` của từng dòng. Không phát hiện cấu hình thiếu cột hoặc lấy summary điền vào từng kho.
- Cột hàng trả trước đây đứng **sau** `netSalesAmount`, ở cuối bảng. Đo trước sửa tại viewport 1440px: mép trái cột này ở x=1983, trong khi vùng nhìn thấy của bảng kết thúc tại x=1399. Cột nằm ngoài vùng nhìn thấy ban đầu, không bị ẩn bởi permission/CSS.
- Các metric dùng chung chiều rộng tối thiểu 150px, chưa phân biệt tiêu đề dài, tiền và số lượng. Cột Kho trước đây rộng 230px.
- Chiều cao đã có observer trong `FittedListTable`, nhưng màn bán hàng còn đặt min-height riêng 320/400px và minimum track khác. Lượt này bỏ các minimum cố định đó, dùng một cơ chế đo tại component bảng để footer wrap vẫn được dành đủ chỗ.

### Thay đổi

- `src/views/reports/SalesReportPage.vue`: thứ tự cột riêng cho table, đưa hàng trả trước bán ròng; Kho 280px, metric tối thiểu 160–210px và mở rộng theo chuỗi số chính xác. Header chữ 14px, wrap theo từ; số căn phải. Không sửa display của tr/th/td. Summary vẫn dùng mapping/thứ tự cũ.
- `src/components/catalog/FittedListTable.vue`: thêm tùy chọn `minBodyHeight`, chỉ màn bán hàng sử dụng. Observer hiện có đo chiều cao header, toolbar và footer để tính minimum độc lập với chiều cao body hiện tại. Theo dõi thêm toolbar/footer khi bật tùy chọn; không thêm observer hay công thức chiều cao ở page. Các caller không truyền tùy chọn giữ hành vi cũ.
- `tests/reports.test.mjs`: đối chiếu đúng thứ tự 11 cột; giữ các kiểm thử summary/filter/export hiện có.
- `tests/sales-report.browser.mjs`: fixture từng kho có 10 metric riêng, khác summary, hàng trả dương; kiểm tra rendered cells và các ca layout mới.

Thứ tự table sau sửa:

| Cột                       | Field của từng dòng               |
| ------------------------- | --------------------------------- |
| Kho                       | `warehouseCode` / `warehouseName` |
| Số đơn xác nhận           | `confirmedOrderCount`             |
| Số đơn đã xác nhận bị hủy | `cancelledConfirmedOrderCount`    |
| Số cây xác nhận           | `confirmedQuantity`               |
| Số cây bị hủy             | `cancelledQuantity`               |
| Giá trị trước giảm giá    | `grossSalesAmount`                |
| Giảm giá                  | `discountAmount`                  |
| Giá trị bán xác nhận      | `confirmedSalesAmount`            |
| Giá trị bán bị hủy        | `cancelledSalesAmount`            |
| Giá trị hàng đã trả       | `returnedSalesAmount`             |
| Giá trị bán ròng          | `netSalesAmount`                  |

Giữ `reportValue` và parser int64; thiếu field hiển thị `—`, không fallback 0, không tính lại net/returns. Kho có title đầy đủ khi tên dài. Cuộn ngang nằm trong bảng, body cuộn dọc, footer ngoài vùng cuộn. Khoảng trống dưới ít dòng là vùng danh sách nhận phần không gian còn lại; không kéo giãn từng dòng.

### Xác minh lượt sửa table

- `pnpm type-check`, `pnpm lint`, `pnpm build`: đạt. Build vẫn cảnh báo chunk dashboard trên 500 kB hiện có.
- `pnpm test:reports`: 52/52 đạt.
- `node tests/sales-report.browser.mjs`: 266 kiểm tra đạt bằng Chrome và API giả lập. Có đối chiếu cả 10 rendered cells của hai kho khác nhau, hàng trả 3.500/3.600 ₫ khác summary; trường hợp thiếu field hàng trả không hiển thị 0.
- Cuộn đầu/giữa/cuối xác nhận đủ 11 cột, header/body thẳng hàng; hai cột hàng trả/bán ròng thấy đầy đủ ở cuối. Kiểm tra int64 âm, header không bó hẹp, 1/2/nhiều dòng và rỗng, hàng không kéo giãn, không có scrollbar dọc khi chỉ 1/2 dòng.
- Desktop 1440px; responsive 320/375/390/414/768/1024px; filter đóng/mở, sidebar thu/mở, viewport thấp và CSS zoom 125%. Xác nhận filter mở giảm phần thân bảng, đóng trả lại chiều cao; resize/sidebar/zoom không gọi API hoặc đổi pageSize. Footer nằm ngoài vùng cuộn và trong panel, gồm trạng thái rỗng.
- Ảnh `returns-columns.png` thể hiện hai cột cuối và giá trị từng kho; các ảnh khác và `results.json` ở `%TEMP%/codex-sales-report-browser/`.

**Giới hạn dữ liệu thật:** đã thử GET chỉ đọc tới endpoint đang cấu hình `https://he-thong-ban-hang-api.onrender.com/api/reports/sales` hai lần, với timeout 25s và 40s; cả hai không nhận được response (HTTP 000). Chưa có response báo cáo thực tế đã xác thực để đối chiếu hai kho thật. Kiểm tra mapping/rendering nêu trên dùng dữ liệu giả lập, không khẳng định đã xác minh dữ liệu BE thật.

Các phần bên dưới ghi lại lần refactor màn bán hàng trước lượt sửa table này.

## Thay đổi

- `src/views/reports/SalesReportPage.vue`: màn riêng cho `/reports/sales`, dùng Vue 3, TypeScript và Ant Design Vue. Header, xuất Excel, bộ lọc, kỳ/phạm vi, bốn chỉ số chính, sáu chỉ số bổ sung, chú thích nghiệp vụ và bảng chi tiết theo kho.
- `src/router/index.ts`: route bán hàng dùng component mới; giữ metadata, `REPORT_SALES_VIEW` và ngoại lệ ADMIN hiện có.
- `src/layouts/BasicLayout.vue`: thêm riêng route bán hàng vào layout danh sách hiện có để bảng nhận không gian còn lại.
- `src/locales/{vi-VN,en-US}.ts`: thêm namespace `salesReport`, giữ nhãn/các báo cáo khác.
- `tests/reports.test.mjs`: bổ sung kiểm thử state, metric, scope, export và lỗi ngày của màn mới.
- `tests/sales-report.browser.mjs`: kiểm tra Chrome với API giả lập; không đọc/ghi dữ liệu backend.

Tái sử dụng nguyên trạng `FittedListTable`, `useSalesScope`, `getReport`, `getReportExport`, DTO, `reportRange`, `reportQuery`, `reportValue`, parser số nguyên lớn và helper tải Blob. Các thay đổi nhập–xuất–tồn đã tồn tại trong workspace được giữ lại.

## Bộ lọc và tính nhất quán

- Bỏ auto-search trên màn bán hàng bằng cách tách component khỏi màn báo cáo chung. `filters` giữ form đang nhập; `appliedFilters` giữ query đã áp dụng. Nút Tìm kiếm/Enter xác thực rồi gọi API một lần, về trang 1.
- Preset giữ cách tính ngày theo `Asia/Ho_Chi_Minh`, áp dụng ngay một lần. Reset về tất cả kho được phép, đầu tháng đến hôm nay, trang 1 và 10 dòng/trang.
- Phân trang, reload và Excel dùng query đã áp dụng dù form đang sửa. Excel không gửi page/pageSize. Reload giữ trang hiện tại; đổi pageSize về trang 1.
- Mobile mặc định đóng form. Thu/mở và đổi breakpoint giữ form state, không gọi API. Tìm kiếm giữ form mở. Preset chỉ xuất hiện một nơi, không có cấp mở rộng thứ hai trên mobile. Trường ẩn không nhận Tab, toggle có `aria-expanded`/`aria-controls`.
- Kỳ hiển thị lấy từ `period` BE; phạm vi lấy từ query đã áp dụng. Khi tải, xóa summary/period/rows cũ. Summary và rows được nhận cùng response; sequence chống response cũ ghi đè. Giữ refresh phạm vi kho và hủy export khi user/scope thay đổi.
- Giữ đủ 10 metric summary và 11 cột bảng; không cộng các dòng trang, không tính lại công thức. Số nguyên lớn không chuyển sang Number, metric âm giữ nguyên, field thiếu hiển thị dấu gạch thay vì số 0.
- Bảng tái sử dụng ResizeObserver và cleanup của `FittedListTable`, cuộn ngang/dọc bên trong, header cố định, phân trang ở ngoài. Không đổi pageSize do resize. Các cột số mở rộng theo độ dài chuỗi chính xác; tên kho có tooltip đầy đủ.
- Giữ HTTP client có Authorization, response Blob, tên file từ Content-Disposition và fallback, đọc JSON lỗi trong Blob, hướng dẫn thu hẹp bộ lọc khi `EXPORT_TOO_LARGE`, chống export lặp và cleanup object URL hiện có.

## Đã kiểm tra

- `npm.cmd run type-check`: qua.
- `npm.cmd run lint`: qua.
- `npm.cmd run build`: qua, gồm vue-tsc. Vite còn cảnh báo chunk `DashboardChart` vượt 500 kB, ngoài phạm vi màn bán hàng.
- `npm.cmd run test:reports`: 33/33 qua.
- `node tests/sales-report.browser.mjs`: 192 kiểm tra qua, không có runtime error hoặc vòng lặp ResizeObserver.

Kiểm tra trình duyệt gồm khởi tạo, draft/submit/Enter, preset/reset/reload không gọi trùng; kho ngừng hoạt động/tất cả kho; validation ngày; export đúng query, Authorization, tên UTF-8 và JSON Blob `EXPORT_TOO_LARGE`; summary từ BE, số âm; đủ cột/mapping và phân trang server 10/20/50/100; empty/error/loading và route thiếu quyền.

Responsive đã kiểm tra 320, 375, 390, 414, 768, 1024, 1440px; bộ lọc đóng/mở, sidebar thu/mở, viewport thấp 1024×500, mô phỏng zoom CSS 125%. Kiểm tra thêm summary int64 âm `-9.223.372.036.854.775.808` ở tất cả bảy chiều rộng: không tràn card, không ẩn metric, không có cuộn ngang ngoài bảng. Header/cell thẳng hàng và footer không chồng vùng cuộn.

Script dùng Vite tại `http://127.0.0.1:5178`, có thể đổi bằng `SALES_REPORT_TEST_URL`. Playwright lấy từ `PLAYWRIGHT_MODULE` hoặc môi trường test tạm hiện có; Chrome lấy từ `CHROME_PATH` hoặc đường dẫn Windows mặc định. Kết quả chi tiết nằm tại `%TEMP%/codex-sales-report-browser/results.json`.

## Chưa xác minh

Chưa gọi backend thật bằng tài khoản Admin/nhân viên, mở workbook thực bằng Excel/LibreOffice, kiểm tra CORS Content-Disposition thực tế, browser zoom gốc, trình duyệt khác hoặc trình đọc màn hình. Fixture XLSX dùng chữ ký nhị phân để kiểm tra luồng tải file; không xác minh nội dung workbook thực.

![Desktop](sales-report-artifacts/desktop.png)

![Mobile mở bộ lọc](sales-report-artifacts/mobile-expanded.png)
