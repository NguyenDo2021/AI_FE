Đồng bộ phân trang và cuộn bảng — 23/10/2026

Đã áp dụng cho Sản phẩm, Nhóm sản phẩm, Quản lý kho và Khách hàng. PageSize do người dùng chọn 10/20/50/100, mặc định 10. Project chưa có cơ chế lưu pageSize hợp lệ nên không thêm lưu trữ mới.

Cả bốn module giữ phân trang server và total từ API. Đổi pageSize về trang 1 và giữ bộ lọc; chỉ một request danh sách cho mỗi lần đổi. Resize/sidebar chỉ đo lại vùng bảng, không đổi pageSize, không gọi API, không thay node body hoặc đặt lại vị trí cuộn. Đổi trang/pageSize/bộ lọc đặt cuộn dọc bảng về đầu. Giữ cơ chế sequence/version để bỏ response cũ.

Khung bảng chung dùng Ant Design Vue scroll.x/scroll.y và fixed:right. Tiêu đề, bộ lọc, toolbar, phân trang và bộ chọn số dòng nằm ngoài vùng dữ liệu cuộn. ResizeObserver đo vùng bảng sau khi layout đã phân bổ chiều cao; tính cả header thực tế và vùng footer xuống hàng. Observer, animation frame và listener được dọn khi unmount. Panel có chiều cao tối thiểu để màn hình quá thấp có thể cuộn ngoài và tiếp cận điều khiển.

Giữ các cột và thứ tự hiện có. Sản phẩm và Nhóm sản phẩm chuyển bảng HTML sang Ant Table để dùng cùng cơ chế header và cột cố định; các cột được giữ khi màn hình nhỏ, không thêm cách gộp cột. Nội dung ô và handler vẫn giữ nguyên. Nền header/fixed cell đục, có hover/selected và shadow. Khi ít dữ liệu, body dùng overflow-y:auto; phần chừa chỗ được đo từ cột scrollbar của header để header/body thẳng hàng mà không buộc hiện scrollbar dọc. Một cột co giãn hấp thụ phần rộng còn lại để tránh sai số cộng dồn khi thư viện đo cột.

Bộ chọn pageSize tách khỏi chế độ pagination simple của Ant Design để luôn hiện trên mobile; dropdown/tooltip dùng portal mặc định của thư viện. Chỉ bốn route dùng layout giới hạn theo content. BasicTable chung và các module ngoài phạm vi không đổi hành vi.

| Module | Kiểm tra trình duyệt đạt | Số cột giữ nguyên |
| --- | ---: | ---: |
| Sản phẩm | 50 | 7 |
| Nhóm sản phẩm | 50 | 4 |
| Quản lý kho | 49 | 6 |
| Khách hàng | 49 | 7 |

Các trường hợp đã kiểm tra bằng Chrome headless với scrollbar thật và API giả lập:

- 10/20/50/100 trên desktop và mobile; số dòng render khớp trang server, mỗi lần đổi số dòng đúng một request.
- Chuyển trang, lọc keyword/trạng thái 0, reset và reload; giữ bộ lọc khi đổi số dòng, về trang 1 đúng quy tắc.
- Trang cuối 37 bản ghi trên tổng 137, khoảng 101–137 / 137; một bản ghi không có scrollbar dọc thừa; rỗng hiển thị 0–0 / 0.
- Dữ liệu dài/null, cuộn ngang/dọc, header và Thao tác cố định, header/body thẳng hàng, không có hai vùng cuộn dữ liệu cùng chiều.
- Resize và mở/thu gọn sidebar không gọi API; giữ pageSize, node body và vị trí cuộn.
- 360, 390, 768, 1024, 1366 và 1920px; bộ lọc xuống hàng; dropdown Thao tác trên mobile nằm ngoài vùng overflow.
- Màn hình thấp 390×400 và 1366×420 có thể đưa phân trang vào viewport bằng cuộn ngoài.
- Zoom 125% mô phỏng bằng CSS viewport 1093×614 và DPR 1.25 tương đương màn hình 1366×768.
- Response chậm không ghi đè response mới; quyền cập nhật Khách hàng vẫn được kiểm tra; route đơn bán hàng không nhận lớp layout của bốn module.
- Không ghi nhận pageerror, lỗi resolve component hoặc vòng lặp ResizeObserver.

Kiểm tra mã:

- npm.cmd run type-check: đạt.
- ESLint trên tất cả file mã/test đã thay đổi: đạt.
- node --test tests/catalog.test.mjs tests/sales.test.mjs: 56/56 đạt.
- node tests/list-tables.browser.mjs: 198/198 mục kiểm tra có tên đạt, cùng các assertion hình học và phân quyền.
- npm.cmd run build: đạt. Vite có cảnh báo kích thước chunk trên 500 kB.
- git diff --check: đạt.

File thay đổi:

| File | Thay đổi |
| --- | --- |
| src/components/catalog/FittedListTable.vue | Khung bảng, đo chiều cao, cuộn, fixed column, footer và chọn pageSize dùng chung |
| src/components/catalog/CatalogListTable.vue | Giữ nội dung/cột từng danh mục và dùng khung chung |
| src/views/catalog/CatalogPage.vue | Bỏ capacity/pageSize tự động, tải trang server theo lựa chọn |
| src/views/sales/CustomersPage.vue | Dùng khung chung, cố định Thao tác, chặn event phân trang trùng; gộp tải lại do scope/filter để tránh request trùng |
| src/layouts/BasicLayout.vue | Áp dụng vùng content giới hạn cho route Khách hàng |
| src/locales/vi-VN.ts, src/locales/en-US.ts | Nhãn khoảng bản ghi và số dòng/trang |
| tests/sales.test.mjs | Cập nhật test double theo component mới |
| tests/list-tables.browser.mjs | Kiểm tra yêu cầu mới trên cả bốn module |
| docs/list-tables-artifacts/ | JSON kết quả, request, số đo và bốn ảnh desktop |

Thay đổi logic ngoài trình bày giới hạn ở phân trang, reset cuộn và hợp nhất trigger tải danh sách đã mô tả. Không đổi endpoint, payload thêm/sửa, validation, công thức, phân quyền, phạm vi kho hoặc form thêm/sửa/chi tiết. Không thêm dependency. Không commit, push hoặc deploy.

Giới hạn xác minh: API dùng fixture, chưa kiểm tra với backend thật. Mobile và bàn phím ảo được kiểm tra qua kích thước viewport tương đương; chưa thao tác trên thiết bị thật hoặc zoom qua giao diện Chrome. Các script UI riêng trước đây có assertion pageSize tự tăng khi resize không được chạy lại vì mâu thuẫn yêu cầu mới; tests/list-tables.browser.mjs là bộ kiểm tra cơ chế phân trang/cuộn mới.
