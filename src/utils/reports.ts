import type { ReportFilters, ReportKind } from '@/types/reports'
import type { StockInteger } from '@/types/stock'
import { formatStockInteger } from '@/utils/stock'
import type { NormalizedApiError } from '@/utils/request'
export const reportPermission: Record<ReportKind, string> = {
  dashboard: 'REPORT_DASHBOARD_VIEW',
  inventory: 'REPORT_INVENTORY_VIEW',
  sales: 'REPORT_SALES_VIEW',
  payments: 'REPORT_PAYMENT_VIEW',
  'receivables-summary': 'REPORT_RECEIVABLE_VIEW',
  'low-stock': 'REPORT_LOW_STOCK_VIEW',
}
export const hasReportPeriod = (kind: ReportKind): boolean =>
  ['dashboard', 'inventory', 'sales', 'payments'].includes(kind)
export const hasReportProducts = (kind: ReportKind): boolean =>
  kind === 'inventory' || kind === 'low-stock'
export const isPagedReport = (kind: ReportKind): boolean =>
  !['dashboard', 'receivables-summary'].includes(kind)
export const reportRange = (
  preset: 'today' | 'month' | 'previous',
  now = new Date(),
): { from: string; to: string } => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const part = (type: string): string => parts.find((item) => item.type === type)!.value
  const year = Number(part('year')),
    month = Number(part('month'))
  const today = `${part('year')}-${part('month')}-${part('day')}`
  if (preset === 'today') return { from: today, to: today }
  if (preset === 'month') return { from: `${part('year')}-${part('month')}-01`, to: today }
  const previous = new Date(Date.UTC(year, month - 2, 1))
  return {
    from: previous.toISOString().slice(0, 10),
    to: new Date(Date.UTC(year, month - 1, 0)).toISOString().slice(0, 10),
  }
}
const validDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(value + 'T00:00:00Z')
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}
export const reportQuery = (
  kind: ReportKind,
  filters: ReportFilters,
): Record<string, string | number> => {
  const query: Record<string, string | number> = {}
  if (filters.warehouseId) query.warehouseId = filters.warehouseId
  if (hasReportProducts(kind) && filters.productId) query.productId = filters.productId
  if (hasReportPeriod(kind)) {
    if (!validDate(filters.from) || !validDate(filters.to) || filters.from > filters.to)
      throw new Error('Chọn ngày hợp lệ, từ ngày không được sau đến ngày.')
    query.from = filters.from
    query.to = filters.to
  }
  if (isPagedReport(kind)) {
    if (
      !Number.isInteger(filters.page) ||
      filters.page < 1 ||
      !Number.isInteger(filters.pageSize) ||
      filters.pageSize < 1 ||
      filters.pageSize > 100
    )
      throw new Error('Trang phải từ 1; số dòng mỗi trang phải từ 1 đến 100.')
    query.page = filters.page
    query.pageSize = filters.pageSize
  }
  return query
}
export const reportError = (cause: unknown): string => {
  const error = cause as NormalizedApiError | undefined
  const messages: Record<string, string> = {
    FORBIDDEN: 'Bạn chưa có quyền xem báo cáo này.',
    WAREHOUSE_ACCESS_DENIED:
      'Quyền truy cập kho đã thay đổi. Phạm vi kho đang được làm mới; hãy thử lại.',
    INVALID_REQUEST: 'Tham số báo cáo không hợp lệ. Kiểm tra bộ lọc ngày và phân trang.',
    INVENTORY_HISTORY_INCONSISTENT:
      'Lịch sử biến động chưa khớp tồn hiện tại. Cần quản trị viên đối soát.',
    NUMERIC_OVERFLOW: 'Tổng báo cáo vượt giới hạn số của hệ thống. Cần quản trị viên kiểm tra.',
  }
  return (
    (error?.code && messages[error.code]) ||
    (cause instanceof Error ? cause.message : 'Không thể tải báo cáo.')
  )
}
export const reportValue = (value: unknown, money = false): string =>
  typeof value === 'bigint' || (typeof value === 'number' && Number.isSafeInteger(value))
    ? formatStockInteger(value as StockInteger) + (money ? ' ₫' : '')
    : '—'
export const inventoryMetrics = [
  'openingQuantity',
  'receiptQuantity',
  'receiptCancellationQuantity',
  'saleQuantity',
  'saleCancellationQuantity',
  'adjustmentIncreaseQuantity',
  'adjustmentDecreaseQuantity',
  'closingQuantity',
] as const
export const salesMetrics = [
  'confirmedOrderCount',
  'cancelledConfirmedOrderCount',
  'confirmedQuantity',
  'cancelledQuantity',
  'grossSalesAmount',
  'discountAmount',
  'confirmedSalesAmount',
  'cancelledSalesAmount',
  'netSalesAmount',
] as const
export const paymentMetrics = [
  'createdPaymentCount',
  'cancelledPaymentCount',
  'recordedCashAmount',
  'recordedBankTransferAmount',
  'reversedCashAmount',
  'reversedBankTransferAmount',
  'netCashAmount',
  'netBankTransferAmount',
  'netRecordedAmount',
] as const
export const receivableMetrics = [
  'customerCount',
  'customerOutstandingOrderCount',
  'customerRemainingAmount',
  'walkInOutstandingOrderCount',
  'walkInRemainingAmount',
  'totalRemainingAmount',
] as const
export const lowStockMetrics = ['quantity', 'lowStockThreshold', 'shortageQuantity'] as const
