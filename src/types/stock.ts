import type { PageData } from '@/types/api'
export type StockInteger = number | bigint
export type ReceiptStatus = 'DRAFT' | 'CONFIRMED' | 'CANCELLED'
export interface ReceiptLine {
  productId: string
  quantity: StockInteger
  unitPrice: StockInteger
  lineTotal: StockInteger
  productCode: string
  productName: string
  unit: string
}
export interface Receipt {
  id: string
  code: string
  warehouseId: string
  receiptDate: string
  supplierName?: string | null
  note?: string | null
  status: ReceiptStatus
  totalAmount: StockInteger
  version: StockInteger
  createdBy: string
  createdAt: string
  confirmedBy?: string | null
  confirmedAt?: string | null
  cancelledBy?: string | null
  cancelledAt?: string | null
  cancellationReason?: string | null
  lines: ReceiptLine[]
}
export interface ReceiptInputLine {
  productId: string
  quantity: bigint
  unitPrice: bigint
}
export interface ReceiptInput {
  receiptDate: string
  supplierName?: string
  note?: string
  lines: ReceiptInputLine[]
}
export interface ReceiptParams {
  page: number
  pageSize: number
  warehouseId?: string
  status?: ReceiptStatus
  from?: string
  to?: string
}
export interface Inventory {
  warehouseId: string
  productId: string
  productCode: string
  productName: string
  unit: string
  productStatus: 0 | 1
  quantity: StockInteger
}
export interface Movement {
  id: string
  warehouseId: string
  productId: string
  quantityChange: StockInteger
  type: 'RECEIPT_CONFIRM' | 'RECEIPT_CANCEL'
  receiptId: string
  receiptCode: string
  productCode: string
  productName: string
  unit: string
  performedBy: string
  performedAt: string
}
export interface InventoryParams {
  page: number
  pageSize: number
  productId?: string
}
export interface MovementParams extends InventoryParams {
  from?: string
  to?: string
}
export type ReceiptPage = PageData<Receipt>
export interface ReceiptFormLine {
  key?: string
  productId: string
  quantity: string
  unitPrice: string
}
export interface ReceiptForm {
  warehouseId: string
  receiptDate: string
  supplierName: string
  note: string
  lines: ReceiptFormLine[]
}
