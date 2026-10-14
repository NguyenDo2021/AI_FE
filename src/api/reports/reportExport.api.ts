import { request } from '@/utils/request'
import { useCatalogPermission } from '@/composables/useCatalogPermission'
import { reportPermission } from '@/utils/reports'
import {
  exportQuery,
  exportFilename,
  validateReportXlsx,
  xlsxContentType,
} from '@/utils/reportExport'
import type { ExportReportKind, ReportFilters, ReportExport } from '@/types/reports'

export const getReportExport = async (
  kind: ExportReportKind,
  filters: ReportFilters,
  signal?: AbortSignal,
): Promise<ReportExport> => {
  if (!useCatalogPermission().can(reportPermission[kind]))
    throw Object.assign(new Error('Bạn chưa có quyền xem báo cáo này.'), {
      status: 403,
      code: 'FORBIDDEN',
    })
  const snapshot = { ...filters }
  const now = new Date()
  // Both development and production baseURL already include /api.
  const response = await request.getBlob('/reports/' + kind + '/export', {
    params: exportQuery(kind, snapshot),
    signal,
    quietErrors: true,
    skipAccessRefresh: true,
    headers: { Accept: xlsxContentType },
  })
  const blob = await validateReportXlsx(
    response.data,
    String(response.headers['content-type'] ?? ''),
  )
  return {
    blob,
    filename: exportFilename(
      kind,
      snapshot,
      String(response.headers['content-disposition'] ?? ''),
      now,
    ),
  }
}
