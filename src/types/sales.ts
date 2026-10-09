import type {
  StockInteger,
  ReceiptLine,
  ReceiptInputLine,
  ReceiptFormLine,
  ReceiptStatus,
} from '@/types/stock'
export interface Customer {
  id: string
  warehouseId: string
  code: string
  name: string
  phone?: string | null
  address?: string | null
  note?: string | null
  status: 0 | 1
  createdAt: string
  updatedAt: string
}
export interface CustomerInput {
  name: string
  phone?: string
  address?: string
  note?: string
  status: 0 | 1
}
export interface CustomerParams {
  warehouseId?: string
  keyword?: string
  status?: 0 | 1
  page: number
  pageSize: number
}
export interface SalesOrder {
  id: string
  code: string
  warehouseId: string
  customerId?: string | null
  customerSnapshot?: {
    code?: string
    name: string
    phone?: string | null
    address?: string | null
  } | null
  saleDate: string
  note?: string | null
  status: ReceiptStatus
  subtotal: StockInteger
  discountAmount: StockInteger
  totalAmount: StockInteger
  version: StockInteger
  createdBy: string
  createdAt: string
  updatedAt: string
  confirmedBy?: string | null
  confirmedAt?: string | null
  cancelledBy?: string | null
  cancelledAt?: string | null
  cancellationReason?: string | null
  goodsReturned?: boolean | null
  lines: ReceiptLine[]
}
export interface SalesInput {
  customerId: string | null
  saleDate: string
  note?: string
  discountAmount: bigint
  lines: ReceiptInputLine[]
}
export interface SalesParams {
  warehouseId?: string
  customerId?: string
  status?: ReceiptStatus
  from?: string
  to?: string
  page: number
  pageSize: number
}
export interface SalesForm {
  warehouseId: string
  customerId: string | undefined
  saleDate: string
  note: string
  discountAmount: string
  lines: ReceiptFormLine[]
}
