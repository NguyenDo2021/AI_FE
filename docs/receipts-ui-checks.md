# Phiếu nhập kho — giao diện và kiểm tra

Ngày kiểm tra: 28/10/2026.

## Phạm vi và file

- `src/views/stock/ReceiptsPage.vue`: danh sách, bộ lọc desktop/mobile, icon thao tác, phân trang server và bảng cuộn trong phần chiều cao còn lại.
- `src/components/stock/ReceiptDialog.vue`: tạo/sửa nháp, chi tiết, xác nhận và hủy; bảng nhập liệu chuyển thành từng khối trên mobile với cùng state và validation.
- `src/components/stock/ReceiptSummary.vue`: summary tím, metadata và audit thu gọn dùng chung cho các chế độ modal; số tiền chính thức lấy từ response.
- `src/locales/vi-VN.ts`, `src/locales/en-US.ts`: nhãn mới cho module, giữ các nhãn dùng chung hiện tại.
- `tests/stock.test.mjs`: giữ các kiểm thử cũ, thêm 6 kiểm thử cho submit bộ lọc, race response và khóa dòng.
- `tests/receipts.browser.mjs`: 13 nhóm kiểm tra trình duyệt bằng API giả lập.

Tái sử dụng `StocktakeTable`, `BasicTable`, `BasicModal`, `ProductSelect`, các icon Ant Design, `formatDate`, `formatDateTime`, `formatStockInteger`, `validateReceipt`, `receiptInput`, `stockError` và `stockFieldErrors`. Không thêm dependency. Theme tím theo các màn thanh toán đã refactor. CSS chỉ áp dụng trong module và modal có class `stock-receipt-dialog`; quy tắc layout bên ngoài chỉ khớp khi có `.receipts-page`.

Giữ nguyên API client, endpoint, method, DTO/payload, cơ chế permission/ADMIN, xử lý version và lỗi, snapshot sản phẩm, phép tính BigInt và cơ chế invalidate tồn kho. Backend tiếp tục quyết định quyền truy cập kho, trạng thái danh mục và tính hợp lệ của giao dịch. Không gọi danh mục để thay thế tên snapshot hoặc thêm API chỉ để hiển thị tên.

## Bộ lọc

- `filters` là giá trị đang nhập; `applied` là bản chụp đã submit. Chỉ Tìm kiếm/Enter áp dụng bản chụp mới và về trang 1. Phân trang, reload và lưu modal dùng bộ lọc đã áp dụng.
- Đặt lại khôi phục kho làm việc hiện tại và xóa trạng thái/ngày, rồi tìm lại trang 1.
- Thay kho làm việc hoặc thay quyền vẫn làm mới dữ liệu theo context như trước. Không còn watcher auto-search trên từng field của bộ lọc.
- Desktop chỉ có một nút Mở rộng/Thu gọn. Mobile có một nút Bộ lọc mở toàn bộ field; tìm kiếm không tự đóng. Field ẩn dùng `display: none`, giữ state nhưng không nhận Tab.
- Khoảng ngày sai mở vùng ngày và hiện lỗi, giữ nguyên kết quả/bộ lọc đã áp dụng. Ngày gửi theo `YYYY-MM-DD`, hai đầu bao gồm như contract cũ.
- Dòng “Đang áp dụng” và thông báo thay đổi chưa tìm kiếm phân biệt kết quả hiện tại với dữ liệu đang nhập.
- Observer chỉ đổi độ rộng cột thao tác theo không gian thực tế, không đổi pageSize hoặc gọi API; được disconnect khi unmount.

## Kiểm tra đã chạy

- `npm.cmd run test:stock`: **32/32 đạt**. Bao gồm int64/JSON, giá 0, số lượng nguyên, payload, version conflict/reload, chặn submit lặp, hủy nháp, lý do hủy phiếu đã xác nhận, thiếu tồn, permission, phản hồi cũ và các kiểm thử mới.
- `node.exe tests/receipts.browser.mjs`: **13/13 nhóm đạt**, Chrome headless, toàn bộ API được intercept; không đọc/ghi backend thật. Không có page error hoặc request API ngoài fixture đã khai báo.
- `npm.cmd run lint`: đạt.
- `npm.cmd run type-check`: script hiện có đạt. Tuy nhiên `tsconfig.json` gốc có `files: []` và references, nên lệnh này không đủ để kiểm tra sâu toàn bộ ứng dụng.
- `node.exe node_modules/vue-tsc/bin/vue-tsc.js --noEmit -p tsconfig.app.json`: không đạt do lỗi có sẵn ngoài phạm vi ở `WarehouseSelector.vue:78` và `AppSidebar.vue:202`. Kiểm tra riêng các entry point Phiếu nhập kho cũng gặp lỗi dependency có sẵn ở `BasicForm.vue:3` và `utils/request.ts:138/141/144/147`; không báo lỗi tại các file Phiếu nhập kho đã sửa. Không sửa các file dùng chung này.
- `npm.cmd run build`: đạt; Vite vẫn cảnh báo chunk trên 500 kB, trong đó có biểu đồ dashboard ngoài phạm vi.
- `git diff --check`: đạt.

Các nhóm trình duyệt kiểm tra:

1. Submit bộ lọc đúng một lần; mở/thu gọn không gọi API.
2. Chọn ngày, Enter, query hai đầu bao gồm và giữ ngày khi ẩn.
3. PageSize 10/20/50/100, reset kho context, cuộn ngang và cột thao tác sticky.
4. Chi tiết có tổng int64 chính xác, 6 cột snapshot và audit đầy đủ.
5. Tạo nháp: giữ dữ liệu khi thêm/xóa dòng, BigInt, giá 0, lỗi API giữ form và retry.
6. Sửa nháp: kho bị khóa, payload thay thế hiện có kèm version.
7. Xác nhận: version cũ bị chặn đến khi reload; chống gửi lặp.
8. Hủy: lý do bắt buộc cho CONFIRMED, giữ lý do khi thiếu tồn, DRAFT không bắt buộc lý do.
9. Các cỡ rộng 320, 375, 390, 414, 768, 1024, 1440 px: filter mobile, chi tiết CANCELLED, xác nhận, hủy CONFIRMED, tạo và validation. Không có overflow ngang ngoài trang; footer modal nằm trong viewport.
10. Màn hình 1440×500, 844×390 và 375×500: footer tạo/hủy tiếp cận được.
11. Sidebar mở/đóng, hover/focus reload không đổi số request hoặc gây overflow.
12. Empty, lỗi danh sách và lỗi kho ngoài phạm vi không hiển thị chi tiết cũ.
13. Tài khoản chỉ xem ẩn mutation; ngoại lệ ADMIN vẫn hoạt động.

Ảnh và số đo được script lưu trong `%TEMP%/codex-receipts-browser/`; `results.json` chứa tên nhóm, số đo viewport/modal và số request. Script dùng Playwright có sẵn tại `%TEMP%/codex-dashboard-browser/node_modules/playwright/index.mjs`; có thể đặt `PLAYWRIGHT_MODULE`, `CHROME_PATH`, `RECEIPTS_TEST_URL` để chạy ở máy khác.

## Chưa xác minh

Chưa chạy với backend thật: quyền/kho thực tế, kiểm tra danh mục ngừng hoạt động, giới hạn tổng/dòng do backend áp dụng, idempotency sau retry, kiểm tra tồn và tác động tồn kho thực tế. Các tình huống version conflict, thiếu tồn và warehouse access trong trình duyệt đều là response giả lập. Chưa thử bàn phím ảo, safe area trên thiết bị iOS/Android thật hoặc trình duyệt khác Chrome. Các lỗi typecheck toàn ứng dụng nêu trên vẫn tồn tại.
