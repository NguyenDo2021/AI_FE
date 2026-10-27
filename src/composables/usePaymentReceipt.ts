import { message } from 'ant-design-vue'
import { nextTick, onBeforeUnmount, reactive, watch } from 'vue'
import { getPaymentReceipt } from '@/api/payments/paymentReceipt.api'
import { usePaymentScope } from '@/composables/usePaymentScope'
import { downloadBlob, receiptError } from '@/utils/paymentReceipt'
import type { Payment } from '@/types/payments'
import type { NormalizedApiError } from '@/utils/request'

export const usePaymentReceipt = () => {
  const { can, inScope, contextKey, refreshAccess } = usePaymentScope()
  let sequence = 0
  let abort: AbortController | undefined
  let selected: Pick<Payment, 'id' | 'code' | 'warehouseId'> | undefined
  let blob: Blob | undefined
  const detached = new Set<{ url: string; popup: Window; timer: ReturnType<typeof setInterval> }>()
  const state = reactive({
    open: false,
    loading: false,
    paymentId: '',
    paymentCode: '',
    filename: '',
    url: '',
    error: '',
    ready: false,
    printHint: '',
  })
  const printLeases = new Map<string, number>()
  const holdPrint = (): (() => void) => {
    const url = state.url
    if (!url) return () => undefined
    printLeases.set(url, (printLeases.get(url) ?? 0) + 1)
    let released = false
    return () => {
      if (released) return
      released = true
      const count = (printLeases.get(url) ?? 1) - 1
      if (count > 0) printLeases.set(url, count)
      else {
        printLeases.delete(url)
        if (state.url !== url) URL.revokeObjectURL(url)
      }
    }
  }
  const releaseViewer = (): void => {
    const previous = state.url
    state.url = ''
    state.ready = false
    blob = undefined
    state.filename = ''
    // Vue removes the iframe before its URL is revoked.
    if (previous)
      void nextTick(() => {
        if (!printLeases.has(previous)) URL.revokeObjectURL(previous)
      })
  }
  const closeDetached = (): void => {
    for (const item of detached) {
      item.popup.close()
      clearInterval(item.timer)
      URL.revokeObjectURL(item.url)
    }
    detached.clear()
  }
  const close = (): void => {
    ++sequence
    abort?.abort()
    abort = undefined
    state.open = false
    state.loading = false
    state.error = ''
    state.printHint = ''
    state.paymentId = ''
    state.paymentCode = ''
    selected = undefined
    releaseViewer()
  }
  const show = async (payment: Pick<Payment, 'id' | 'code' | 'warehouseId'>): Promise<void> => {
    close()
    if (!can('PAYMENT_VIEW') || !inScope(payment.warehouseId)) return
    selected = { ...payment }
    state.paymentId = payment.id
    state.paymentCode = payment.code
    state.open = true
    state.loading = true
    const current = sequence
    const controller = new AbortController()
    abort = controller
    try {
      const result = await getPaymentReceipt(payment.id, payment.code, controller.signal)
      if (
        current !== sequence ||
        !state.open ||
        !can('PAYMENT_VIEW') ||
        !inScope(payment.warehouseId)
      )
        return
      blob = result.blob
      state.filename = result.filename
      state.url = URL.createObjectURL(result.blob)
    } catch (cause) {
      if (current !== sequence || !state.open) return
      const error = cause as NormalizedApiError
      if (error.status === 403 || error.status === 401) {
        close()
        message.error(receiptError(cause))
        if (error.status === 403) await refreshAccess()
      } else {
        state.error = receiptError(cause)
      }
    } finally {
      if (current === sequence) {
        state.loading = false
        abort = undefined
      }
    }
  }
  const retry = (): void => {
    if (selected) void show(selected)
  }
  const download = (): void => {
    if (!blob || !state.url || state.loading) return
    // A separate lease keeps a started download valid even if the viewer closes.
    downloadBlob(blob, state.filename)
  }
  const openPdf = (): void => {
    if (!blob || !state.url || state.loading) return
    const popup = window.open('', '_blank')
    if (!popup) {
      state.printHint =
        'Trình duyệt đã chặn cửa sổ PDF. Cho phép cửa sổ bật lên rồi bấm “Mở PDF riêng” để thử lại.'
      return
    }
    try {
      popup.opener = null
      const url = URL.createObjectURL(blob)
      const item = {
        url,
        popup,
        timer: setInterval(() => {
          if (!popup.closed) return
          clearInterval(item.timer)
          URL.revokeObjectURL(url)
          detached.delete(item)
        }, 1000),
      }
      detached.add(item)
      popup.location.replace(url)
      state.printHint =
        'Dùng nút in của trình duyệt trong cửa sổ PDF. Chọn khổ giấy theo PDF (A5 ngang).'
    } catch {
      popup.close()
      state.printHint = 'Không mở được cửa sổ PDF. Bấm “Mở PDF riêng” để thử lại hoặc tải PDF.'
    }
  }
  const loaded = (url: string): void => {
    if (url && url === state.url && state.open && !state.loading) state.ready = true
  }
  const invalidate = (): void => {
    close()
    closeDetached()
    for (const url of printLeases.keys()) URL.revokeObjectURL(url)
    printLeases.clear()
  }
  watch(contextKey, invalidate, { flush: 'sync' })
  onBeforeUnmount(invalidate)
  return { state, show, close, retry, download, openPdf, loaded, holdPrint }
}

export type PaymentReceiptController = ReturnType<typeof usePaymentReceipt>
