import type { ExportReportKind, ReportFilters, ReportKind } from '@/types/reports'
import type { NormalizedApiError } from '@/utils/request'
import { reportError, reportQuery } from '@/utils/reports'
import { downloadFilename, readBlobError } from '@/utils/paymentReceipt'

export const xlsxContentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
export const canExportReport = (kind: ReportKind): kind is ExportReportKind =>
  ['inventory', 'sales', 'payments', 'low-stock'].includes(kind)

export const exportQuery = (
  kind: ExportReportKind,
  filters: ReportFilters,
): Record<string, string | number> => {
  const query = reportQuery(kind, { ...filters, page: 1, pageSize: 1 })
  delete query.page
  delete query.pageSize
  return query
}

export const exportFilename = (
  kind: ExportReportKind,
  filters: ReportFilters,
  disposition: string,
  now = new Date(),
): string => {
  const names: Record<ExportReportKind, string> = {
    inventory: 'nhap-xuat-ton',
    sales: 'ban-hang',
    payments: 'thu-tien',
    'low-stock': 'ton-thap',
  }
  const timestamp = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
    .format(now)
    .replace(/[: ]/g, '-')
  const suffix = kind === 'low-stock' ? timestamp : filters.from + '_' + filters.to
  return downloadFilename(disposition, names[kind] + '_' + suffix, 'xlsx')
}

export const validateReportXlsx = async (data: unknown, contentType: string): Promise<Blob> => {
  const json = await readBlobError(data, contentType)
  if (json) {
    throw Object.assign(new Error(json.message || 'Máy chủ trả JSON lỗi khi xuất báo cáo.'), {
      status: json.status,
      code: json.code,
      details: json.details,
    })
  }
  const mime = contentType.split(';')[0]?.trim().toLowerCase()
  if (!(data instanceof Blob) || !data.size)
    throw new Error('Phản hồi xuất Excel rỗng hoặc không phải Blob. Vui lòng thử lại.')
  if (
    mime !== xlsxContentType ||
    (data.type && data.type.split(';')[0]?.toLowerCase() !== xlsxContentType)
  )
    throw new Error(
      'Content-Type xuất Excel không đúng: ' +
        (contentType || '(thiếu header)') +
        '. Cần BE xác nhận Content-Type XLSX trước khi tải.',
    )
  const signature = new Uint8Array(await data.slice(0, 4).arrayBuffer())
  if (signature[0] !== 0x50 || signature[1] !== 0x4b || signature[2] !== 3 || signature[3] !== 4)
    throw new Error('Phản hồi không có định dạng XLSX nhị phân hợp lệ. Cần BE kiểm tra file.')
  return data
}

export const reportExportError = (cause: unknown): string => {
  const error = cause as NormalizedApiError | undefined
  // Optional codes: handle them if BE returns them, without assuming endpoint support.
  if (error?.code === 'EXPORT_TOO_LARGE')
    return 'Dữ liệu xuất quá lớn. Hãy thu hẹp bộ lọc và thử lại.'
  if (error?.code === 'INVALID_REQUEST' || error?.status === 400 || error?.status === 422)
    return (
      'Bộ lọc xuất không hợp lệ. Kiểm tra kho, sản phẩm và khoảng ngày.' +
      (error.message ? ' ' + error.message : '')
    )
  if (error?.status === 401) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
  if (error?.status === 403 && error.code !== 'WAREHOUSE_ACCESS_DENIED')
    return 'Bạn chưa có quyền xem báo cáo này.'
  if (
    error?.status &&
    error.status >= 500 &&
    !['NUMERIC_OVERFLOW', 'INVENTORY_HISTORY_INCONSISTENT'].includes(error.code ?? '')
  )
    return 'Không dựng được file Excel. Vui lòng thử lại thủ công.'
  return reportError(cause)
}
