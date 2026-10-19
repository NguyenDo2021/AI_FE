import type { StockInteger, ReceiptStatus } from '@/types/stock'
import type { SalesOrder } from '@/types/sales'
import type { OrderPaymentSummary, PaymentMethod, PaymentParams } from '@/types/payments'
export interface ReturnableOrder {
  id: string
  code: string
  warehouseId: string
  warehouseName: string
  saleDate: string
  customerName: string
  totalAmount: StockInteger
}
export interface ReturnableOrderParams {
  code: string
  page?: number
  pageSize?: number
}
export interface ReturnableLine {
  productId: string
  productCode: string
  productName: string
  unit: string
  soldQuantity: StockInteger
  returnedQuantity: StockInteger
  returnableQuantity: StockInteger
  lineTotal: StockInteger
  allocatedDiscountAmount: StockInteger
  netLineAmount: StockInteger
}
export interface ReturnLine extends Pick<
  ReturnableLine,
  | 'productId'
  | 'productCode'
  | 'productName'
  | 'unit'
  | 'soldQuantity'
  | 'allocatedDiscountAmount'
  | 'netLineAmount'
> {
  quantity: StockInteger
  returnAmount: StockInteger
}
export interface SalesReturn {
  id: string
  code: string
  salesOrderId: string
  warehouseId: string
  customerId?: string | null
  returnDate: string
  reason: string
  note?: string | null
  status: ReceiptStatus
  totalAmount: StockInteger
  version: StockInteger
  createdBy: string
  createdAt: string
  updatedBy: string
  updatedAt: string
  confirmedBy?: string | null
  confirmedAt?: string | null
  cancelledBy?: string | null
  cancelledAt?: string | null
  cancellationReason?: string | null
  lines: ReturnLine[]
}
export interface ReturnInput {
  returnDate: string
  reason: string
  note: string | null
  lines: { productId: string; quantity: bigint }[]
}
export interface ReturnForm {
  returnDate: string
  reason: string
  note: string
  lines: { productId: string; quantity: string }[]
}
export interface ReturnQuoteChanged {
  version: StockInteger
  quote: { totalAmount: StockInteger; lines: ReturnLine[] }
}
export interface ReturnParams {
  warehouseId?: string
  salesOrderId?: string
  status?: ReceiptStatus
  from?: string
  to?: string
  page: number
  pageSize: number
}
export interface OrderSettlementSummary extends OrderPaymentSummary {
  code: string
  warehouseId: string
  customerId?: string | null
  customerSnapshot?: SalesOrder['customerSnapshot']
  saleDate: string
  status: ReceiptStatus
}
export interface Refund {
  id: string
  code: string
  salesOrderId: string
  warehouseId: string
  customerId?: string | null
  amount: StockInteger
  refundDate: string
  method: PaymentMethod
  reference?: string | null
  reason: string
  note?: string | null
  status: 'ACTIVE' | 'CANCELLED'
  createdBy: string
  createdAt: string
  cancelledBy?: string | null
  cancelledAt?: string | null
  cancellationReason?: string | null
}
export interface RefundInput {
  amount: bigint
  refundDate: string
  method: PaymentMethod
  reference: string | null
  reason: string
  note: string | null
}
export interface RefundForm extends Omit<RefundInput, 'amount' | 'reference' | 'note'> {
  amount: string
  reference: string
  note: string
}
export interface RefundMutation {
  refund: Refund
  order: OrderSettlementSummary
}
export type RefundParams = PaymentParams
export interface RefundAttempt {
  key: string
  salesOrderId: string
  warehouseId: string
  input: RefundInput
  state: 'uncertain' | 'conflict'
}
export interface ExactPage<T> {
  items: T[]
  total: StockInteger
  page: number
  pageSize: number
}
