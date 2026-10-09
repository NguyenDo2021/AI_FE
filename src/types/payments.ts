import type { StockInteger } from '@/types/stock'
import type { SalesOrder } from '@/types/sales'
import type { PageData } from '@/types/api'
export type PaymentStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID'
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER'
export type ReceiptPaymentStatus = 'ACTIVE' | 'CANCELLED'
export interface Payment {
  id: string
  code: string
  salesOrderId: string
  warehouseId: string
  customerId?: string | null
  amount: StockInteger
  paymentDate: string
  method: PaymentMethod
  reference?: string | null
  note?: string | null
  status: ReceiptPaymentStatus
  createdBy: string
  createdAt: string
  cancelledBy?: string | null
  cancelledAt?: string | null
  cancellationReason?: string | null
}
export interface OrderPaymentSummary {
  salesOrderId: string
  totalAmount: StockInteger
  paidAmount: StockInteger
  remainingAmount: StockInteger
  paymentStatus?: PaymentStatus | null
}
export interface PaymentMutation {
  payment: Payment
  order: OrderPaymentSummary
}
export interface PaymentInput {
  amount: bigint
  paymentDate: string
  method: PaymentMethod
  reference: string | null
  note: string | null
}
export interface PaymentForm {
  amount: string
  paymentDate: string
  method: PaymentMethod
  reference: string
  note: string
}
export interface PaymentParams {
  warehouseId?: string
  salesOrderId?: string
  customerId?: string
  status?: ReceiptPaymentStatus
  method?: PaymentMethod
  from?: string
  to?: string
  page: number
  pageSize: number
}
export interface ReceivableParams {
  warehouseId?: string
  customerId?: string
  keyword?: string
  page: number
  pageSize: number
}
export interface Receivable {
  customerId: string
  warehouseId: string
  customerCode: string
  customerName: string
  outstandingOrderCount: number
  totalAmount: StockInteger
  paidAmount: StockInteger
  remainingAmount: StockInteger
}
export interface CustomerReceivables {
  customerId: string
  warehouseId: string
  remainingAmount: StockInteger
  orders: PageData<SalesOrder>
}
export interface PaymentAttempt {
  key: string
  salesOrderId: string
  warehouseId: string
  input: PaymentInput
  state: 'uncertain' | 'conflict'
}
