# Bàn giao sửa lỗi kiểm thử deploy — 01/11/2026

Đã sửa source FE và cấu hình hosting; chưa commit, chưa deploy, không gửi API ghi lên môi trường thật. Working tree sạch trước khi bắt đầu.

## Nguyên nhân và thay đổi

| Lỗi | Bằng chứng trong source / kiểm tra | Cách sửa |
| --- | --- | --- |
| Modal hoàn tiền dùng số cũ | `RefundDialog` trước đây merge `{ ...props.order, ...payments.summaries[id] }`: summary từ lần đọc/thu trước trả hàng thắng dòng `/refundables` mới. `ReturnDialog.notify` chỉ tăng revision, không xóa summary. `RefundsPage.showRefund` không cập nhật store; chỉ lần reload tiếp theo mới đồng bộ dòng đang chọn vào store. Câu “Đơn không còn khoản cần hoàn” được phát sinh tại FE, trước POST. | Xóa summary đúng đơn sau xác nhận trả. Mỗi lần mở modal đọc lại backend, kiểm tra đủ tám metric, ID đơn/kho và số nguyên chính xác. Modal giữ riêng kết quả đọc hợp lệ; summary, điền tiền và validation cùng dùng kết quả này. Store cũ hoặc response của lần mở trước không ghi đè được. |
| Direct URL / F5 trả 404 Vercel | Router dùng `createWebHistory`; Vite không override base/output, build ra `dist`. Repo không có `vercel.json`, proxy Vite, API directory hay Vercel function. HEAD request trực tiếp tới `/login` hiện trả `404`, `Server: Vercel`, `X-Vercel-Error: NOT_FOUND`. | Thêm `vercel.json` ở cùng thư mục `package.json`: ưu tiên filesystem, fallback FE tới `/index.html`, loại `/api` và `/assets`. Không redirect hay đổi hash/history. |
| Trạng thái trả hàng dùng nhãn xuất kho | Danh sách và chi tiết phiếu trả gọi `$t('sales.' + status)`; `sales.CONFIRMED` là “Đã xác nhận / Đã xuất hàng”. | Mapper riêng cho phiếu trả: “Nháp”, “Đã xác nhận”, “Đã hủy”. Giữ enum API và nhãn đơn bán. |
| Validation hiển thị UUID | Summary lỗi ghép thẳng `String(key)`; lỗi số lượng được lưu theo `productId`. | Giữ key nội bộ cho inline, nhưng summary ánh xạ sang mã/tên trên dòng đã tải; thông báo nêu lượng tối đa và đơn vị. Hỗ trợ key dòng dạng `lines[0].quantity` / `lines.0.quantity` và `details.productId` hiện có. Key không xác định dùng câu chung. Không sửa object lỗi, code hoặc details. |
| Các cột trả hàng hiển thị UUID | Template render thẳng `salesOrderId`, `customerId`, `createdBy`; DTO `SalesReturn` hiện có trong repo chỉ có ID, không có các trường tên/mã tương ứng. | Thiếu dữ liệu hiển thị dùng “—”; UUID nằm trong tooltip có nhãn ID hoặc vùng thông tin định danh. Khách không có ID giữ “Khách lẻ”. Mã đơn đã được truyền từ màn đơn nguồn vẫn dùng được. Không tra danh mục, không tạo N+1 hay thêm quyền xem khách/user/đơn cho module trả hàng. Phần hiển thị đủ tên/mã còn cần contract BE bên dưới. |
| Thiếu tồn lẫn tiếng Anh | `salesError` nối raw message vào mọi lỗi 409. BE local `StockOperations.movements` phát code `INSUFFICIENT_STOCK` và message `Insufficient stock for the entire document`. | Ánh xạ riêng code này trong `salesError` sang tiếng Việt; giữ `salesFieldErrors` và các lỗi 409 khác. Không khẳng định dữ liệu chưa đổi trong thông báo mới, không sửa logic tồn/transaction. |
| Hủy nháp báo “Đã lưu…” | Cả create/edit/confirm/cancel cùng đi qua một `message.success` trong `SalesOrderDialog.submit`. | Chọn toast theo hành động, chỉ sau response thành công. Cancel: “Đã hủy đơn bán hàng [code]”; confirm: “Đã xác nhận đơn bán hàng [code]”; lưu nháp giữ thông tin tổng tiền. |

## Luồng quyết toán và bảo vệ nghiệp vụ

- Màn đơn cần hoàn đọc lại chính trang `/refundables` đang hiển thị bằng `REFUND_VIEW`; không gọi GET sales-order. Nếu đơn biến mất hoặc chuyển sang trang khác do dữ liệu đồng thời thay đổi, modal báo chưa lấy được quyết toán và chặn lần chi mới, không suy luận số 0 từ việc không thấy dòng.
- Từ màn đơn bán, dùng GET đơn hiện có khi có `SALES_ORDER_VIEW`. Từ chi tiết công nợ không có quyền này, dùng danh sách `/refundables` phân trang theo kho khi có `REFUND_VIEW`, tìm đúng đơn đang mở. Đây là lookup theo hành động mở modal, không tra thêm theo mọi dòng bảng.
- Thiếu metric, metric null/sai kiểu/số không an toàn hoặc lỗi GET: hiển thị “—” và lỗi/tải lại; không cho tự điền hay tạo request mới. Zero chỉ hiển thị sau khi backend trả đủ dữ liệu hợp lệ.
- Abort + sequence bảo vệ đổi A → B, đóng/mở, đổi tài khoản/phạm vi kho, unmount và tải lại. Dữ liệu nháp/lỗi/xác nhận được reset khi đổi đối tượng hoặc đóng/mở.
- Sau POST thành công, store hiện có vẫn cập nhật summary backend và revision của thu/hoàn; các danh sách liên quan reload theo kiến trúc cũ. Hoàn tiền không invalidate tồn. Xác nhận trả chỉ xóa summary đúng đơn và phát revision liên quan.
- `REFUND_EXCEEDS_REFUNDABLE` / trạng thái đơn đổi: giữ số tiền nhập, tải lại quyết toán và báo lỗi; không cắt tiền hay tự POST lại.
- Không thay cơ chế lưu phiên theo user, khóa idempotency, payload đóng băng hoặc xử lý kết quả chưa xác định. Request cũ vẫn được thử lại nguyên trạng, kể cả khi GET quyết toán lỗi hoặc đơn đã hết khoản hoàn. Quyền, kho và trạng thái conflict vẫn chặn như trước.

## File thay đổi

| File | Lý do |
| --- | --- |
| `src/components/sales/RefundDialog.vue` | Một nguồn quyết toán được kiểm tra; tải/lỗi/retry; chặn stale response; giữ retry request cũ. |
| `src/views/sales/RefundsPage.vue` | Cung cấp loader đọc lại trang hiện tại bằng quyền hoàn tiền. |
| `src/components/sales/OrderPaymentPanel.vue` | Loader theo quyền hiện có khi mở hoàn từ đơn/công nợ. |
| `src/api/sales/returns.api.ts`, `src/api/sales/sales.api.ts` | Truyền AbortSignal cho các GET liên quan; không đổi URL/payload. |
| `src/components/sales/ReturnDialog.vue` | Invalidate summary đúng đơn; nhãn và validation sản phẩm; bỏ UUID khỏi tên/mã. |
| `src/views/sales/ReturnsPage.vue` | Nhãn phiếu trả riêng, placeholder/tooltip ID rõ ràng. |
| `src/utils/returns.ts` | Kiểm tra đủ metric exact integer; mapper trạng thái và message sản phẩm. |
| `src/components/sales/SettlementDetails.vue` | Cho phép metric chưa tải và dùng formatter “—” hiện có. |
| `src/utils/sales.ts`, `src/components/sales/SalesOrderDialog.vue` | Lỗi thiếu tồn theo code và toast đúng hành động. |
| `src/components/sales/ReturnRefundDialog.vue` | Wrap thông báo lỗi dài trong phạm vi modal. |
| `vercel.json` | SPA fallback có ưu tiên filesystem, loại API/assets. |
| `tests/returns-refunds.test.mjs` | Hồi quy state/cache/race/missing-vs-zero, partial refund, concurrency, retry cũ, quantity/inline và ID/kho/quyền. |
| `tests/sales.test.mjs` | Kiểm tra toast theo hành động, không toast khi lỗi, dịch stock code và giữ chi tiết lỗi. |
| `tests/returns-refunds.browser.mjs` | Thêm kiểm tra form hoàn tại 320/375/390/414/1366px. |
| `docs/deploy-test-fixes.md` | Bằng chứng, kết quả và các giới hạn bàn giao. |

## Kiểm thử thực tế đã chạy

- `npm.cmd run type-check`: đạt.
- `npm.cmd run lint`: đạt.
- `npm.cmd run build`: đạt; còn cảnh báo chunk lớn hơn 500 kB, ngoài phạm vi sửa.
- `node --test tests/returns-refunds.test.mjs tests/sales.test.mjs`: **79/79 đạt** ở lần chạy cuối.
- Chạy toàn bộ 9 file test nghiệp vụ hiện có: **273/275 đạt**, **2 lỗi báo cáo có sẵn**. Sau lượt đó bổ sung thêm 1 test validation, đã nằm trong 79/79 nêu trên.
- Hai test lỗi là `sales screen commits period, summary and rows together, discards stale responses and revokes access` và `sales screen handles empty/error states and refreshes revoked warehouse scope`, tại `tests/reports.test.mjs:1878` và `:1911`. Đã chạy riêng và chạy trên bản `git archive HEAD` trong thư mục tạm: đều lỗi y hệt (summary chưa bị xóa và refresh count 2 thay vì 1). Không sửa file báo cáo ngoài phạm vi. Thư mục baseline đã được xóa.
- `node tests/returns-refunds.browser.mjs`: **921 kiểm tra đạt**, không runtime error, không API ngoài fixture. Có kiểm tra modal tại 320/375/390/414px và desktop: không tràn ngang, footer nhìn thấy, lý do và nút điền có thể cuộn tới; kiểm tra footer ở màn 390×600. Toàn bộ API bị intercept bằng mock.
- Bản ghi browser: `%TEMP%/codex-returns-refunds-artifacts/results.json`; ảnh gồm `refund-form.png`, `return-detail.png`, `refund-detail.png`, `refund-cancel.png` và các màn danh sách.
- Kiểm tra tĩnh config: 8 URL SPA (gồm query và route lạ) đi tới fallback; `/api`, `/api/refunds`, JS/CSS trong `/assets` không bị fallback; filesystem đứng trước. Đây không phải kiểm thử runtime Vercel.

Test hoàn tiền có trình tự thực: GET đơn trước trả → lưu summary trước trả vào store → xác nhận phiếu trả bằng component thật → tải danh sách → mở modal lần đầu → điền 300.000 → POST đúng 300.000. Test còn cố ghi summary cũ vào store sau khi mở để bảo đảm modal không dùng lại nó. Các case thiếu field/null, zero thật, số không an toàn, A về sau B, đóng/mở lại, kho bị thu hồi, hoàn một phần và POST chưa rõ kết quả đều đã chạy.

## Phần cần BE / contract hỗ trợ

1. **Tên/mã trên phiếu trả:** `src/types/returns.ts::SalesReturn` hiện không có `salesOrderCode`, snapshot khách hoặc tên người tạo; `getReturns` / `getReturn` trả thẳng DTO, không có bước enrich. Fixtures trả hàng hiện có cũng chỉ có các ID đó. Đề xuất BE cung cấp `salesOrderCode`, `customerSnapshot` lấy từ đơn/chứng từ lịch sử và một trường tên người tạo được thống nhất trong contract (ví dụ `createdByName`), cho cả GET list và detail bằng `SALES_RETURN_VIEW`. Giữ ID và quyền API hiện tại. Không thay snapshot bằng tên danh mục hiện tại. FE hiện hiển thị “—” khi không có tên; chưa thể hoàn tất các cột tên thật chỉ từ contract đang có.
2. **Đọc quyết toán theo ID độc lập quyền xem đơn:** contract FE hiện chỉ có `/refundables` dạng danh sách (`warehouseId`, `page`, `pageSize`), không có lookup theo ID hoặc endpoint settlement riêng. Với trường hợp dòng biến mất/chuyển trang, FE không thể kết luận đó là zero. Nên bổ sung endpoint đọc quyết toán theo ID bằng quyền hoàn phù hợp, trả đủ metric kể cả refundable bằng 0. Khi chỉ có `REFUND_CREATE` nhưng không có quyền đọc `/refundables` hay GET đơn, lần chi mới bị chặn thay vì gọi API trái quyền; retry request đang chờ vẫn giữ như cũ.
3. **Bằng chứng API thật:** đã thử đọc OpenAPI công khai ở backend deploy nhưng timeout; không có authenticated response của các phiếu trả trong phiên này. Vì vậy kết luận thiếu field ở trên là theo contract/fixtures trong repo, không khẳng định backend deploy chắc chắn thiếu mọi trường hiển thị. Source BE local chỉ có phần sales/stock cũ, không có module returns/refunds để xác minh thêm. Mã `INSUFFICIENT_STOCK` đã xác minh trực tiếp trong source BE local, khớp câu tiếng Anh người dùng quan sát.

## Cần xác minh sau deploy và giới hạn

**Đã sửa config, cần xác minh sau deploy. Không tự deploy.** `vercel.json` phải nằm trong Root Directory thực tế mà Vercel build, cùng `package.json`; phiên này không truy cập dashboard project để kiểm tra thiết lập đó. Thiết lập filesystem/fallback dựa theo [tài liệu cấu hình routes của Vercel](https://vercel.com/docs/project-configuration/vercel-json#routes).

Sau deploy, mở trực tiếp, F5 và mở tab mới: `/login`, `/dashboard`, `/catalog/products`, `/stock/receipts`, `/sales/orders`, `/reports/sales`; kiểm tra query/redirect đăng nhập, route không tồn tại tới 404 của app, asset JS/CSS thật, asset thiếu và `/api` không bị trả HTML SPA. Backend hiện dùng URL tuyệt đối trong cấu hình production; không có proxy/function trong repo để thay đổi.

Chạy nghiệm thu với dữ liệu thử mới theo kịch bản 20 × 75.000, thu hai lần 1.500.000, trả 4 cây trị giá 300.000, mở hoàn lần đầu và hoàn một phần/toàn phần. Không sửa/xóa đơn thử cũ. Xác minh concurrency người dùng khác trên BE thật, idempotency khi mất response và lỗi GET thật.

Các test FE/mock không chứng minh transaction PostgreSQL, mức tăng/giảm tồn thực tế hoặc tính atomic trên backend deploy. Không thay logic các nghiệp vụ nhập/xuất/kiểm kê/hủy chứng từ, nhưng các kịch bản tồn thực tế được liệt kê trong yêu cầu vẫn cần nghiệm thu môi trường tích hợp. Chưa xác minh runtime rewrite Vercel sau deploy và chưa tái hiện dữ liệu trả/hoàn trên backend thật trong phiên này.
