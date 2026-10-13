import type { StockInteger, ReceiptStatus } from '@/types/stock'
export interface StocktakeLine {
  productId: string
  systemQuantity: StockInteger
  inventoryRevision: StockInteger
  countedQuantity?: StockInteger | null
  difference?: StockInteger | null
  reason?: string | null
  productCode: string
  productName: string
  unit: string
}
export interface Stocktake {
  id: string
  code: string
  warehouseId: string
  note?: string | null
  status: ReceiptStatus
  version: StockInteger
  createdBy: string
  createdAt: string
  updatedBy: string
  updatedAt: string
  confirmedBy?: string
  confirmedAt?: string
  cancelledBy?: string
  cancelledAt?: string
  cancellationReason?: string
  lines: StocktakeLine[]
}
export interface StocktakeParams {
  page: number
  pageSize: number
  warehouseId?: string
  status?: ReceiptStatus
  from?: string
  to?: string
}
export interface StocktakeCreate {
  warehouseId: string
  note?: string
  lines: { productId: string }[]
}
export interface StocktakeUpdate {
  version: StockInteger
  note?: string
  lines: { productId: string; countedQuantity?: bigint; reason?: string }[]
}
export interface CountLine {
  productId: string
  productCode: string
  productName: string
  unit: string
  systemQuantity?: StockInteger
  countedQuantity: string
  reason: string
}
export interface CountForm {
  warehouseId: string
  note: string
  lines: CountLine[]
}
export interface StaleLine {
  snapshotRevision?: string
  currentRevision?: string
  systemQuantity?: string
  currentQuantity?: string
}
