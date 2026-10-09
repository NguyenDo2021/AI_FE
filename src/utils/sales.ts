import { MAX_STOCK_INTEGER, validStockInteger } from '@/utils/stock'
import type { CustomerInput, SalesForm, SalesInput, SalesOrder, Customer } from '@/types/sales'
import type { NormalizedApiError } from '@/utils/request'
export const customerInput = (form: CustomerInput): CustomerInput => ({
  name: form.name.trim(),
  phone: form.phone?.trim() || undefined,
  address: form.address?.trim() || undefined,
  note: form.note?.trim() || undefined,
  status: form.status,
})
export const validateCustomer = (form: CustomerInput): Record<string, string> => {
  const errors: Record<string, string> = {}
  if (!form.name.trim() || form.name.trim().length > 160)
    errors.name = 'Tên bắt buộc, tối đa 160 ký tự.'
  for (const [key, max] of [
    ['phone', 20],
    ['address', 500],
    ['note', 2000],
  ] as const)
    if ((form[key]?.trim().length ?? 0) > max) errors[key] = 'Tối đa ' + max + ' ký tự.'
  if (form.status !== 0 && form.status !== 1) errors.status = 'Trạng thái phải là 0 hoặc 1.'
  return errors
}
export const salesTotals = (form: SalesForm) => {
  const subtotal = form.lines.reduce(
    (sum, line) =>
      sum +
      (validStockInteger(line.quantity, true) && validStockInteger(line.unitPrice)
        ? BigInt(line.quantity.trim()) * BigInt(line.unitPrice.trim())
        : 0n),
    0n,
  )
  const discount = validStockInteger(form.discountAmount) ? BigInt(form.discountAmount.trim()) : 0n
  return { subtotal, discountAmount: discount, totalAmount: subtotal - discount }
}
export const validateSales = (form: SalesForm): Record<string, string> => {
  const errors: Record<string, string> = {}
  if (!form.warehouseId) errors.warehouseId = 'Chọn kho.'
  const date = new Date(form.saleDate + 'T00:00:00Z')
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(form.saleDate) ||
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== form.saleDate
  )
    errors.saleDate = 'Ngày bán không hợp lệ.'
  if (form.note.length > 2000) errors.note = 'Ghi chú tối đa 2000 ký tự.'
  if (form.lines.length < 1 || form.lines.length > 1000)
    errors.lines = 'Đơn cần từ 1 đến 1000 dòng.'
  const ids = new Set<string>()
  form.lines.forEach((line, index) => {
    const key = 'lines[' + index + '].'
    if (!line.productId || ids.has(line.productId))
      errors[key + 'productId'] = 'Chọn sản phẩm, không được trùng.'
    ids.add(line.productId)
    if (!validStockInteger(line.quantity, true))
      errors[key + 'quantity'] = 'Số cây phải là số nguyên dương trong giới hạn int64.'
    if (!validStockInteger(line.unitPrice))
      errors[key + 'unitPrice'] = 'Đơn giá phải là số nguyên không âm trong giới hạn int64.'
    if (
      validStockInteger(line.quantity, true) &&
      validStockInteger(line.unitPrice) &&
      BigInt(line.quantity.trim()) * BigInt(line.unitPrice.trim()) > MAX_STOCK_INTEGER
    )
      errors[key + 'unitPrice'] = 'Thành tiền vượt giới hạn int64.'
  })
  const totals = salesTotals(form)
  if (totals.subtotal > MAX_STOCK_INTEGER) errors.lines = 'Tạm tính vượt giới hạn int64.'
  if (!validStockInteger(form.discountAmount) || totals.discountAmount > totals.subtotal)
    errors.discountAmount = 'Giảm giá phải là số nguyên không âm và không vượt tạm tính.'
  return errors
}
export const salesInput = (form: SalesForm): SalesInput => ({
  customerId: form.customerId || null,
  saleDate: form.saleDate,
  note: form.note.trim() || undefined,
  discountAmount: BigInt(form.discountAmount.trim()),
  lines: form.lines.map((line) => ({
    productId: line.productId,
    quantity: BigInt(line.quantity.trim()),
    unitPrice: BigInt(line.unitPrice.trim()),
  })),
})
export const salesCustomerName = (order: SalesOrder, customers: Customer[]): string =>
  order.customerSnapshot?.name ??
  (order.customerId
    ? (customers.find((item) => item.id === order.customerId)?.name ?? order.customerId)
    : 'Khách lẻ')
export const salesError = (cause: unknown): string => {
  const error = cause as NormalizedApiError
  const message = cause instanceof Error ? cause.message : 'Không thể thực hiện thao tác.'
  if (error?.code === 'SALES_ORDER_HAS_PAYMENTS')
    return 'Đơn đã có khoản thu hiệu lực. Chức năng hủy đơn kèm hoàn tiền chưa được hỗ trợ.'
  return error?.status === 409
    ? 'Dữ liệu hoặc điều kiện xử lý đã thay đổi. Bản nhập được giữ nguyên. ' + message
    : message
}
export const salesFieldErrors = (cause: unknown): Record<string, string> => {
  const details = (cause as NormalizedApiError)?.details
  if (!details || typeof details !== 'object') return {}
  return Object.fromEntries(
    Object.entries(details).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  )
}
