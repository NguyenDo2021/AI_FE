import { request } from '@/utils/request'
import { receiptFilename, validateReceiptPdf } from '@/utils/paymentReceipt'

export interface PaymentReceiptPdf {
  blob: Blob
  filename: string
}

export const getPaymentReceipt = async (
  id: string,
  code: string,
  signal?: AbortSignal,
): Promise<PaymentReceiptPdf> => {
  // baseURL already ends in /api; use the same authenticated client.
  const response = await request.getBlob('/payments/' + encodeURIComponent(id) + '/print', {
    signal,
    quietErrors: true,
    skipAccessRefresh: true,
    headers: { Accept: 'application/pdf' },
  })
  const blob = await validateReceiptPdf(
    response.data,
    String(response.headers['content-type'] ?? ''),
  )
  return {
    blob,
    filename: receiptFilename(String(response.headers['content-disposition'] ?? ''), code),
  }
}
