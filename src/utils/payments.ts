import { validStockInteger } from '@/utils/stock'
import type { SalesOrder } from '@/types/sales'
import type { PaymentForm, PaymentInput, OrderPaymentSummary } from '@/types/payments'
import type { NormalizedApiError } from '@/utils/request'
export const PAYMENT_RETRY_PREFIX = 'payment-retry:'
export const clearPaymentRetries = (): void => {
  for (const key of Object.keys(sessionStorage))
    if (key.startsWith(PAYMENT_RETRY_PREFIX)) sessionStorage.removeItem(key)
}
export const canCollect = (order: SalesOrder): boolean =>
  order.status === 'CONFIRMED' && BigInt(order.remainingAmount ?? 0) > 0n
export const paymentLabel = (order: SalesOrder): string => {
  if (order.status !== 'CONFIRMED' || !order.paymentStatus) return 'Không áp dụng'
  return {
    UNPAID: 'Chưa thanh toán',
    PARTIALLY_PAID: 'Thanh toán một phần',
    PAID: 'Đã thanh toán',
  }[order.paymentStatus]
}
export const applyPaymentSummary = (order: SalesOrder, summary: OrderPaymentSummary): SalesOrder =>
  order.id === summary.salesOrderId
    ? {
        ...order,
        totalAmount: summary.totalAmount,
        paidAmount: summary.paidAmount,
        remainingAmount: summary.remainingAmount,
        paymentStatus: summary.paymentStatus,
      }
    : order
export const paymentInput = (form: PaymentForm): PaymentInput => ({
  amount: BigInt(form.amount.trim()),
  paymentDate: form.paymentDate,
  method: form.method,
  reference: form.reference === '' ? null : form.reference,
  note: form.note === '' ? null : form.note,
})
export const validatePayment = (form: PaymentForm, order: SalesOrder): Record<string, string> => {
  const errors: Record<string, string> = {}
  if (!validStockInteger(form.amount, true))
    errors.amount = 'Nhập số nguyên từ 1 đến 9223372036854775807.'
  else if (BigInt(form.amount.trim()) > BigInt(order.remainingAmount ?? 0))
    errors.amount = 'Số tiền vượt số còn phải trả tham khảo. Backend kiểm tra cuối cùng.'
  const date = new Date(form.paymentDate + 'T00:00:00Z')
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(form.paymentDate) ||
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== form.paymentDate
  )
    errors.paymentDate = 'Ngày thu không hợp lệ.'
  if (!['CASH', 'BANK_TRANSFER'].includes(form.method))
    errors.method = 'Chọn tiền mặt hoặc chuyển khoản.'
  if (form.reference.length > 200) errors.reference = 'Tham chiếu tối đa 200 ký tự.'
  if (form.note.length > 2000) errors.note = 'Ghi chú tối đa 2000 ký tự.'
  return errors
}
export const paymentError = (cause: unknown): string => {
  const error = cause as NormalizedApiError
  const messages: Record<string, string> = {
    INVALID_IDEMPOTENCY_KEY: 'Khóa thu tiền không đúng định dạng UUID. Giữ dữ liệu để kiểm tra.',
    PAYMENT_EXCEEDS_REMAINING:
      'Số tiền vượt số còn phải trả hiện tại. Kiểm tra số liệu mới trước khi gửi lại.',
    INVALID_SALES_ORDER_STATUS: 'Trạng thái đơn không còn cho phép thu tiền.',
    IDEMPOTENCY_CONFLICT:
      'Khóa đã được dùng với nội dung khác. Request được giữ để kiểm tra; không tự đổi khóa.',
    NUMERIC_OVERFLOW: 'Số tiền vượt giới hạn số nguyên 64 bit.',
    SALES_ORDER_HAS_PAYMENTS:
      'Đơn đã có khoản thu hiệu lực. Chức năng hủy đơn kèm hoàn tiền chưa được hỗ trợ.',
    FORBIDDEN: 'Quyền truy cập đã bị từ chối. Đang làm mới quyền và phạm vi kho.',
    WAREHOUSE_ACCESS_DENIED: 'Kho không còn trong phạm vi được phép.',
  }
  return (
    messages[error?.code ?? ''] ??
    (cause instanceof Error ? cause.message : 'Không thể thực hiện thao tác.')
  )
}
