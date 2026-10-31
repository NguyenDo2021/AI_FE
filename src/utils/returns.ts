import { validStockInteger } from '@/utils/stock'
import type { StockInteger } from '@/types/stock'
import type {
  ReturnableLine,
  ReturnForm,
  ReturnInput,
  ReturnQuoteChanged,
  RefundForm,
  RefundInput,
  OrderSettlementSummary,
} from '@/types/returns'
import type { NormalizedApiError } from '@/utils/request'
export const returnStatusLabel = (status: string): string =>
  ({ DRAFT: 'Nháp', CONFIRMED: 'Đã xác nhận', CANCELLED: 'Đã hủy' })[status] ?? status

// Do not accept missing metrics as zero, or coerce unsafe JSON numbers.
export const isSettlementSummary = (value: unknown): value is OrderSettlementSummary => {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return (
    ['salesOrderId', 'warehouseId', 'code', 'saleDate'].every(
      (key) => typeof row[key] === 'string' && row[key] !== '',
    ) &&
    ['DRAFT', 'CONFIRMED', 'CANCELLED'].includes(String(row.status)) &&
    [
      'totalAmount',
      'returnedAmount',
      'adjustedTotalAmount',
      'paidAmount',
      'refundedAmount',
      'netPaidAmount',
      'remainingAmount',
      'refundableAmount',
    ].every((key) => isInteger(row[key]) && validStockInteger(String(row[key])))
  )
}

export const returnFieldMessage = (
  key: string,
  text: string,
  lines: Pick<ReturnableLine, 'productId' | 'productCode' | 'productName'>[],
  form: ReturnForm,
): string => {
  const index = /^lines(?:\[(\d+)\]|\.(\d+))\./.exec(key)
  const id = index ? form.lines[Number(index[1] ?? index[2])]?.productId : key
  const line = lines.find((item) => item.productId === id)
  if (line) return [line.productCode, line.productName].filter(Boolean).join(' — ') + ': ' + text
  const labels: Record<string, string> = {
    returnDate: 'Ngày trả',
    reason: 'Lý do',
    note: 'Ghi chú',
    salesOrderId: 'Đơn bán hàng',
    lines: 'Sản phẩm trả',
  }
  return labels[key] ? labels[key] + ': ' + text : 'Kiểm tra thông tin sản phẩm trả.'
}
export const todayLocal = (): string =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Bangkok' }).format(new Date())
export const validReturnDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(value + 'T00:00:00Z')
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}
export const validReason = (value: string): boolean => !!value.trim() && value.length <= 2000
export const estimateReturn = (line: ReturnableLine, quantity: bigint): bigint => {
  const net = BigInt(line.netLineAmount),
    sold = BigInt(line.soldQuantity),
    before = BigInt(line.returnedQuantity)
  return sold > 0n ? (net * (before + quantity)) / sold - (net * before) / sold : 0n
}
export const returnInput = (form: ReturnForm): ReturnInput => ({
  returnDate: form.returnDate,
  reason: form.reason,
  note: form.note === '' ? null : form.note,
  lines: form.lines
    .filter((line) => line.quantity !== '')
    .map((line) => ({ productId: line.productId, quantity: BigInt(line.quantity) })),
})
export const validateReturn = (
  form: ReturnForm,
  limits: ReturnableLine[],
): Record<string, string> => {
  const errors: Record<string, string> = {}
  if (!validReturnDate(form.returnDate)) errors.returnDate = 'Ngày trả không hợp lệ.'
  if (!validReason(form.reason)) errors.reason = 'Lý do bắt buộc, tối đa 2000 ký tự.'
  if (form.note.length > 2000) errors.note = 'Ghi chú tối đa 2000 ký tự.'
  const selected = form.lines.filter((line) => line.quantity !== '')
  if (!selected.length || selected.length > 1000) errors.lines = 'Chọn từ 1 đến 1000 dòng.'
  const ids = new Set<string>()
  for (const line of selected) {
    const limit = limits.find((item) => item.productId === line.productId)
    if (ids.has(line.productId) || !limit)
      errors[line.productId] = 'Dòng trùng hoặc không thuộc đơn.'
    else if (
      !validStockInteger(line.quantity, true) ||
      BigInt(line.quantity) > BigInt(limit.returnableQuantity)
    )
      errors[line.productId] =
        'Nhập số nguyên dương; số lượng trả không được vượt ' +
        String(limit.returnableQuantity) +
        ' ' +
        limit.unit +
        '.'
    ids.add(line.productId)
  }
  return errors
}
const isInteger = (value: unknown): value is StockInteger =>
  typeof value === 'bigint' || (typeof value === 'number' && Number.isSafeInteger(value))
export const isReturnQuoteChanged = (value: unknown): value is ReturnQuoteChanged => {
  if (!value || typeof value !== 'object') return false
  const data = value as Record<string, unknown>
  if (!isInteger(data.version) || !data.quote || typeof data.quote !== 'object') return false
  const quote = data.quote as Record<string, unknown>
  return (
    isInteger(quote.totalAmount) &&
    Array.isArray(quote.lines) &&
    quote.lines.every((line: unknown) => {
      if (!line || typeof line !== 'object') return false
      const row = line as Record<string, unknown>
      return (
        ['productId', 'productCode', 'productName', 'unit'].every(
          (key) => typeof row[key] === 'string',
        ) &&
        [
          'quantity',
          'returnAmount',
          'soldQuantity',
          'allocatedDiscountAmount',
          'netLineAmount',
        ].every((key) => isInteger(row[key]))
      )
    })
  )
}
export const validateRefund = (
  form: RefundForm,
  order: OrderSettlementSummary,
): Record<string, string> => {
  const errors: Record<string, string> = {}
  if (!validStockInteger(form.amount, true) || BigInt(form.amount) > BigInt(order.refundableAmount))
    errors.amount = 'Số tiền nguyên dương, không vượt khoản cần hoàn.'
  if (!validReturnDate(form.refundDate)) errors.refundDate = 'Ngày hoàn không hợp lệ.'
  if (!validReason(form.reason)) errors.reason = 'Lý do bắt buộc, tối đa 2000 ký tự.'
  if (!['CASH', 'BANK_TRANSFER'].includes(form.method)) errors.method = 'Chọn hình thức hợp lệ.'
  if (form.reference.length > 200) errors.reference = 'Tham chiếu tối đa 200 ký tự.'
  if (form.note.length > 2000) errors.note = 'Ghi chú tối đa 2000 ký tự.'
  return errors
}
export const refundInput = (form: RefundForm): RefundInput => ({
  amount: BigInt(form.amount),
  refundDate: form.refundDate,
  method: form.method,
  reference: form.reference === '' ? null : form.reference,
  reason: form.reason,
  note: form.note === '' ? null : form.note,
})
export const returnError = (cause: unknown): string => {
  const error = cause as NormalizedApiError
  const messages: Record<string, string> = {
    RETURN_EXCEEDS_QUANTITY:
      'Lượng trả vượt hạn mức hiện tại. Đã yêu cầu tải lại hạn mức; giữ nguyên số lượng để bạn sửa.',
    DUPLICATE_PRODUCT: 'Sản phẩm bị trùng trong phiếu trả.',
    PRODUCT_NOT_IN_SALES_ORDER: 'Sản phẩm không thuộc đơn nguồn.',
    INVALID_PAGINATION: 'Trang từ 1, số dòng mỗi trang từ 1 đến 100.',
    INVALID_DATE_RANGE: 'Khoảng ngày không hợp lệ.',
    SALES_ORDER_NOT_FOUND: 'Không tìm thấy đơn nguồn.',
    WAREHOUSE_NOT_FOUND: 'Không tìm thấy kho.',
    RESOURCE_CONFLICT: 'Dữ liệu đang xung đột với ràng buộc hệ thống. Tải lại để kiểm tra.',
    METHOD_NOT_ALLOWED: 'Thao tác chưa được hỗ trợ.',
    RETURN_EXCEEDS_TOTAL: 'Giá trị trả vượt tổng đơn được phép.',
    RETURN_QUOTE_CHANGED:
      'Báo giá đã thay đổi. Chưa xác nhận thành công, tồn chưa đổi. Xem xét rồi lưu lại nháp và xác nhận lại.',
    VERSION_CONFLICT:
      'Phiếu đã được người khác cập nhật. Bản nhập được giữ nguyên; tải lại để xem xét, không ghi đè.',
    INVALID_SALES_ORDER_STATUS: 'Đơn nguồn không còn ở trạng thái đã xác nhận.',
    INVALID_SALES_RETURN_STATUS: 'Phiếu không còn ở trạng thái nháp.',
    RETURN_ADJUSTMENT_NOT_SUPPORTED: 'Chưa hỗ trợ điều chỉnh phiếu trả đã xác nhận.',
    REFUND_EXCEEDS_REFUNDABLE:
      'Số tiền vượt khoản cần hoàn hiện tại. Tải lại số liệu trước khi lập lần chi mới.',
    IDEMPOTENCY_CONFLICT:
      'Khóa đã dùng với nội dung khác. Giữ request để kiểm tra, không tự tạo khóa thay thế.',
    NUMERIC_OVERFLOW: 'Giá trị vượt giới hạn số nguyên 64 bit.',
    FORBIDDEN: 'Không còn quyền truy cập dữ liệu này.',
    WAREHOUSE_ACCESS_DENIED: 'Kho ngoài phạm vi được phép.',
    SALES_RETURN_NOT_FOUND: 'Không tìm thấy phiếu trả.',
    REFUND_NOT_FOUND: 'Không tìm thấy phiếu hoàn.',
    INVALID_REQUEST: 'Request không hợp lệ. Kiểm tra thông tin đã nhập.',
    VALIDATION_ERROR: 'Kiểm tra các trường dữ liệu được báo lỗi.',
    INVALID_IDEMPOTENCY_KEY: 'Khóa request không hợp lệ; giữ nguyên request để kiểm tra.',
  }
  return (
    messages[error?.code ?? ''] ??
    (cause instanceof Error ? cause.message : 'Không thể thực hiện thao tác.')
  )
}
// Ant pagination cannot represent Int64 totals; use exact previous/next controls instead.
export const hasNextPage = (
  total: StockInteger | undefined,
  page: number,
  pageSize: number,
): boolean => total !== undefined && BigInt(page) * BigInt(pageSize) < BigInt(total)
