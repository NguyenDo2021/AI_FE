import type { ApiErrorPayload } from '@/types/api'
import type { NormalizedApiError } from '@/utils/request'

const mime = (value: string): string => value.split(';')[0]?.trim().toLowerCase() ?? ''

export const readBlobError = async (
  data: unknown,
  contentType: string,
): Promise<ApiErrorPayload | undefined> => {
  if (
    !(data instanceof Blob) ||
    ![mime(contentType), mime(data.type)].some(
      (type) => type === 'application/json' || type.endsWith('+json'),
    )
  )
    return undefined
  try {
    const payload: unknown = JSON.parse(await data.text())
    if (!payload || typeof payload !== 'object') return undefined
    return {
      message:
        'message' in payload && typeof payload.message === 'string' ? payload.message : undefined,
      code: 'code' in payload && typeof payload.code === 'string' ? payload.code : undefined,
      details: 'details' in payload ? payload.details : undefined,
    }
  } catch {
    return undefined
  }
}

export const validateReceiptPdf = async (data: unknown, contentType: string): Promise<Blob> => {
  if (
    !(data instanceof Blob) ||
    !data.size ||
    mime(contentType) !== 'application/pdf' ||
    (data.type && mime(data.type) !== 'application/pdf') ||
    (await data.slice(0, 5).text()) !== '%PDF-'
  ) {
    throw new Error('Phản hồi biên lai không phải PDF hợp lệ hoặc dữ liệu rỗng. Vui lòng thử lại.')
  }
  return data
}

const safeFilename = (value: string): string =>
  value
    // eslint-disable-next-line no-control-regex -- Remove unsafe filename control characters.
    .replace(/[\\/<>:"|?*\u0000-\u001f\u007f]/g, '_')
    .replace(/^\.+|[. ]+$/g, '')
    .trim()

export const receiptFilename = (disposition: string, code: string): string => {
  const extended = /(?:^|;)\s*filename\*\s*=\s*(?:"([^"]*)"|([^;]*))/i.exec(disposition)
  let name = ''
  if (extended) {
    const raw = (extended[1] ?? extended[2] ?? '').trim()
    const encoded = /^UTF-8'[^']*'(.*)$/i.exec(raw)
    if (encoded?.[1]) {
      try {
        name = decodeURIComponent(encoded[1])
      } catch {
        /* Use ordinary filename. */
      }
    }
  }
  if (!name) {
    const ordinary = /(?:^|;)\s*filename\s*=\s*(?:"((?:\\.|[^"])*)"|([^;]*))/i.exec(disposition)
    name = (ordinary?.[1] ?? ordinary?.[2] ?? '').trim()
  }
  const fallback = safeFilename('bien-lai-' + code) || 'bien-lai'
  const safe = safeFilename(name)
  return safe ? (/\.pdf$/i.test(safe) ? safe : safe + '.pdf') : fallback + '.pdf'
}

export const receiptError = (cause: unknown): string => {
  const error = cause as NormalizedApiError | undefined
  const messages: Record<string, string> = {
    INVALID_REQUEST: 'Mã phiếu thu không hợp lệ.',
    UNAUTHORIZED: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
    FORBIDDEN: 'Bạn không có quyền xem/in phiếu thu.',
    WAREHOUSE_ACCESS_DENIED: 'Bạn không còn quyền tại kho của phiếu thu.',
    PAYMENT_NOT_FOUND: 'Phiếu thu không tồn tại.',
    PAYMENT_PDF_FAILED: 'Không tạo được PDF biên lai. Vui lòng thử lại.',
    INTERNAL_ERROR: 'Không tải được biên lai. Vui lòng thử lại.',
  }
  if (error?.code && messages[error.code]) return messages[error.code]!
  if (error?.status === 403) return messages.FORBIDDEN!
  if (error?.status === 401) return messages.UNAUTHORIZED!
  if (error?.status === 404) return messages.PAYMENT_NOT_FOUND!
  if (error?.status && error.status >= 500) return messages.INTERNAL_ERROR!
  return error?.message || 'Không tải được biên lai. Kiểm tra kết nối và thử lại.'
}
