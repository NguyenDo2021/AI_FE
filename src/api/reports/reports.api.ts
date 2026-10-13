import { request } from '@/utils/request'
import { parseStockJson } from '@/utils/stock'
import { useCatalogPermission } from '@/composables/useCatalogPermission'
import { reportPermission, reportQuery } from '@/utils/reports'
import type { ReportFilters, ReportKind, ReportResults } from '@/types/reports'
// The shared baseURL already ends in /api.
export const getReport = async <K extends ReportKind>(
  kind: K,
  filters: ReportFilters,
): Promise<ReportResults[K]> => {
  if (!useCatalogPermission().can(reportPermission[kind]))
    throw Object.assign(new Error('Bạn chưa có quyền xem báo cáo này.'), {
      status: 403,
      code: 'FORBIDDEN',
    })
  return request.get(`/reports/${kind}`, {
    quietErrors: true,
    params: reportQuery(kind, filters),
    transformResponse: [
      (value: unknown): unknown =>
        typeof value === 'string' && value ? parseStockJson(value) : value,
    ],
  })
}
