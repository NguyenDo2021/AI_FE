import { request } from '@/utils/request'
import { salesReadConfig } from '@/api/sales/sales.api'
import { stringifyStockJson } from '@/utils/stock'
import type { StockInteger } from '@/types/stock'
import type {
  SalesReturn,
  ReturnInput,
  ReturnParams,
  ReturnableLine,
  ReturnableOrder,
  ReturnableOrderParams,
  Refund,
  RefundInput,
  RefundMutation,
  RefundParams,
  OrderSettlementSummary,
  ExactPage,
} from '@/types/returns'
const writeConfig = {
  ...salesReadConfig,
  preventAutomaticRetry: true,
  transformRequest: [
    (value: unknown): string => (typeof value === 'string' ? value : stringifyStockJson(value)),
  ],
}
const path = (id: string): string => encodeURIComponent(id)
export const getReturns = (params: ReturnParams): Promise<ExactPage<SalesReturn>> =>
  request.get('/sales-returns', { ...salesReadConfig, params })
export const getReturn = (id: string): Promise<SalesReturn> =>
  request.get('/sales-returns/' + path(id), salesReadConfig)
export const getReturnableOrders = (
  { code, page = 1, pageSize = 10 }: ReturnableOrderParams,
  signal?: AbortSignal,
): Promise<ExactPage<ReturnableOrder>> => {
  const trimmedCode = code.trim()
  if (!trimmedCode) return Promise.reject(new Error('Nhập mã đơn BH-… để tìm.'))
  return request.get('/sales-orders/returnable-orders', {
    ...salesReadConfig,
    params: { code: trimmedCode, page, pageSize },
    signal,
  })
}
export const getReturnableLines = (id: string, signal?: AbortSignal): Promise<ReturnableLine[]> =>
  request.get('/sales-orders/' + path(id) + '/returnable-lines', { ...salesReadConfig, signal })
export const createReturn = (salesOrderId: string, input: ReturnInput): Promise<SalesReturn> =>
  request.post('/sales-returns', { salesOrderId, ...input }, writeConfig)
export const updateReturn = (
  id: string,
  input: ReturnInput,
  version: StockInteger,
): Promise<SalesReturn> =>
  request.put('/sales-returns/' + path(id), { ...input, version }, writeConfig)
export const confirmReturn = (id: string, version: StockInteger): Promise<SalesReturn> =>
  request.post('/sales-returns/' + path(id) + '/confirm', { version }, writeConfig)
export const cancelReturn = (
  id: string,
  version: StockInteger,
  reason: string,
): Promise<SalesReturn> =>
  request.post('/sales-returns/' + path(id) + '/cancel', { version, reason }, writeConfig)
export const getRefunds = (params: RefundParams): Promise<ExactPage<Refund>> =>
  request.get('/refunds', { ...salesReadConfig, params })
export const getRefund = (id: string): Promise<Refund> =>
  request.get('/refunds/' + path(id), salesReadConfig)
export const getRefundables = (
  params: {
    warehouseId?: string
    page: number
    pageSize: number
  },
  signal?: AbortSignal,
): Promise<ExactPage<OrderSettlementSummary>> =>
  request.get('/refundables', { ...salesReadConfig, params, signal })
export const createRefund = (
  id: string,
  input: RefundInput,
  key: string,
): Promise<RefundMutation> =>
  request.post('/sales-orders/' + path(id) + '/refunds', input, {
    ...writeConfig,
    headers: { 'Idempotency-Key': key },
  })
export const cancelRefund = (id: string, reason: string): Promise<RefundMutation> =>
  request.post('/refunds/' + path(id) + '/cancel', { reason }, writeConfig)
