import type { StockInteger } from '@/types/stock'
import type { PageData } from '@/types/api'
export type ReportKind =
  'dashboard' | 'inventory' | 'sales' | 'payments' | 'receivables-summary' | 'low-stock'
export interface ReportPeriod {
  from: string
  to: string
  timezone: string
}
export interface WarehouseFields {
  warehouseId: string
  warehouseCode: string
  warehouseName: string
}
export interface ProductFields {
  productId: string
  productCode: string
  productName: string
  unit: string
}
export interface InventoryReportRow extends WarehouseFields, ProductFields {
  productStatus: number
  openingQuantity: StockInteger
  receiptQuantity: StockInteger
  receiptCancellationQuantity: StockInteger
  saleQuantity: StockInteger
  saleCancellationQuantity: StockInteger
  adjustmentIncreaseQuantity: StockInteger
  adjustmentDecreaseQuantity: StockInteger
  closingQuantity: StockInteger
}
export interface SalesSummary {
  confirmedOrderCount: StockInteger
  cancelledConfirmedOrderCount: StockInteger
  confirmedQuantity: StockInteger
  cancelledQuantity: StockInteger
  grossSalesAmount: StockInteger
  discountAmount: StockInteger
  confirmedSalesAmount: StockInteger
  cancelledSalesAmount: StockInteger
  netSalesAmount: StockInteger
}
export interface PaymentSummary {
  createdPaymentCount: StockInteger
  cancelledPaymentCount: StockInteger
  recordedCashAmount: StockInteger
  recordedBankTransferAmount: StockInteger
  reversedCashAmount: StockInteger
  reversedBankTransferAmount: StockInteger
  netCashAmount: StockInteger
  netBankTransferAmount: StockInteger
  netRecordedAmount: StockInteger
}
export interface ReceivablesSummary {
  customerRemainingAmount: StockInteger
  customerCount: StockInteger
  customerOutstandingOrderCount: StockInteger
  walkInRemainingAmount: StockInteger
  walkInOutstandingOrderCount: StockInteger
  totalRemainingAmount: StockInteger
  asOf: string
}
export interface LowStockRow extends WarehouseFields, ProductFields {
  quantity: StockInteger
  lowStockThreshold: StockInteger
  shortageQuantity: StockInteger
}
export interface DashboardReport {
  generatedAt: string
  period: ReportPeriod
  periodSections?: { sales?: SalesSummary; payments?: PaymentSummary; timeBasis: string }
  currentSections?: {
    receivables?: ReceivablesSummary
    lowStock?: { lowStockPairCount: StockInteger; asOf: string }
    timeBasis: string
  }
}
export interface PeriodReport<T> extends PageData<T> {
  summary: Omit<T, keyof WarehouseFields>
  period: ReportPeriod
  description: string
}
export interface ReportResults {
  dashboard: DashboardReport
  inventory: PageData<InventoryReportRow>
  sales: PeriodReport<SalesSummary & WarehouseFields>
  payments: PeriodReport<PaymentSummary & WarehouseFields>
  'receivables-summary': ReceivablesSummary
  'low-stock': PageData<LowStockRow>
}
export interface ReportFilters {
  warehouseId?: string
  productId?: string
  from: string
  to: string
  page: number
  pageSize: number
}
