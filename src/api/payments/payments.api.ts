import { request } from '@/utils/request'
import { salesReadConfig } from '@/api/sales/sales.api'
import { stringifyStockJson } from '@/utils/stock'
import type { PageData } from '@/types/api'
import type { SalesOrder } from '@/types/sales'
import type {
  Payment,
  PaymentInput,
  PaymentMutation,
  PaymentParams,
  Receivable,
  ReceivableParams,
  CustomerReceivables,
} from '@/types/payments'
const writeConfig = {
  ...salesReadConfig,
  preventAutomaticRetry: true,
  transformRequest: [(value: unknown): string => stringifyStockJson(value)],
}
const path = (id: string): string => encodeURIComponent(id)
export const createPayment = (
  id: string,
  input: PaymentInput,
  key: string,
): Promise<PaymentMutation> =>
  request.post('/sales-orders/' + path(id) + '/payments', input, {
    ...writeConfig,
    headers: { 'Idempotency-Key': key },
  })
export const cancelPayment = (id: string, reason: string): Promise<PaymentMutation> =>
  request.post('/payments/' + path(id) + '/cancel', { reason: reason.trim() }, writeConfig)
export const getPayments = (params: PaymentParams): Promise<PageData<Payment>> =>
  request.get('/payments', { ...salesReadConfig, params })
export const getPayment = (id: string): Promise<Payment> =>
  request.get('/payments/' + path(id), salesReadConfig)
export const getOrderPayments = (
  id: string,
  params: Pick<PaymentParams, 'status' | 'page' | 'pageSize'>,
): Promise<PageData<Payment>> =>
  request.get('/sales-orders/' + path(id) + '/payments', { ...salesReadConfig, params })
export const getReceivables = (params: ReceivableParams): Promise<PageData<Receivable>> =>
  request.get('/receivables', { ...salesReadConfig, params })
export const getCustomerReceivables = (
  id: string,
  params: { page: number; pageSize: number },
): Promise<CustomerReceivables> =>
  request.get('/customers/' + path(id) + '/receivables', { ...salesReadConfig, params })
export const getWalkInOrders = (
  params: Pick<ReceivableParams, 'warehouseId' | 'page' | 'pageSize'>,
): Promise<PageData<SalesOrder>> =>
  request.get('/receivables/walk-in-orders', { ...salesReadConfig, params })
