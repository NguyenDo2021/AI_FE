import { request } from '@/utils/request'
import { parseStockJson } from '@/utils/stock'
import { useCatalogPermission } from '@/composables/useCatalogPermission'
import { reportQuery } from '@/utils/reports'
import { trendsQuery } from '@/utils/dashboard'
import type {
  DashboardReport,
  DashboardTrends,
  ReportFilters,
  SalesSummary,
  WarehouseFields,
  PeriodReport,
} from '@/types/reports'

const fetchExact = <T>(
  url: string,
  params: Record<string, string | number>,
  signal?: AbortSignal,
): Promise<T> =>
  request.get(url, {
    params,
    signal,
    quietErrors: true,
    skipAccessRefresh: true,
    transformResponse: [
      (value: unknown): unknown =>
        typeof value === 'string' && value ? parseStockJson(value) : value,
    ],
  })
const requirePermission = (permission: string): void => {
  if (!useCatalogPermission().can(permission))
    throw Object.assign(new Error('Bạn chưa có quyền xem báo cáo này.'), {
      status: 403,
      code: 'FORBIDDEN',
    })
}
export const getDashboard = (
  filters: ReportFilters,
  signal?: AbortSignal,
): Promise<DashboardReport> => {
  requirePermission('REPORT_DASHBOARD_VIEW')
  return fetchExact('/reports/dashboard', reportQuery('dashboard', filters), signal)
}
export const getDashboardTrends = (
  filters: ReportFilters,
  signal?: AbortSignal,
): Promise<DashboardTrends> => {
  requirePermission('REPORT_DASHBOARD_VIEW')
  return fetchExact('/reports/dashboard/trends', trendsQuery(filters), signal)
}
export const getAllWarehouseSales = async (
  filters: ReportFilters,
  signal?: AbortSignal,
): Promise<(SalesSummary & WarehouseFields)[]> => {
  requirePermission('REPORT_DASHBOARD_VIEW')
  requirePermission('REPORT_SALES_VIEW')
  const rows: (SalesSummary & WarehouseFields)[] = []
  let total = 0
  for (let page = 1; ; page++) {
    signal?.throwIfAborted()
    requirePermission('REPORT_DASHBOARD_VIEW')
    requirePermission('REPORT_SALES_VIEW')
    const result = await fetchExact<PeriodReport<SalesSummary & WarehouseFields>>(
      '/reports/sales',
      reportQuery('sales', { ...filters, page, pageSize: 100 }),
      signal,
    )
    if (
      !Number.isSafeInteger(result.total) ||
      result.total < 0 ||
      result.page !== page ||
      !Array.isArray(result.items)
    )
      throw new Error('Phản hồi phân trang bán hàng không hợp lệ. Hãy thử lại.')
    if (page > 1 && result.total !== total)
      throw new Error('Số kho thay đổi khi phân trang. Hãy thử lại.')
    total = result.total
    rows.push(...result.items)
    if (rows.length >= total) break
    if (!result.items.length)
      throw new Error('Dữ liệu kho thay đổi khi phân trang. Hãy tải lại để lấy đủ kho.')
  }
  if (rows.length !== total || new Set(rows.map((row) => row.warehouseId)).size !== rows.length)
    throw new Error('Dữ liệu kho thay đổi khi phân trang. Hãy tải lại để lấy đủ kho.')
  return rows
}
