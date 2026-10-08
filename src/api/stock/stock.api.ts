import { request } from '@/utils/request'
import { parseStockJson, stringifyStockJson } from '@/utils/stock'
import type { PageData } from '@/types/api'
import type {
  Inventory,
  InventoryParams,
  Movement,
  MovementParams,
  Receipt,
  ReceiptInput,
  ReceiptParams,
  StockInteger,
} from '@/types/stock'
const config = {
  quietErrors: true,
  transformResponse: [
    (value: unknown): unknown =>
      typeof value === 'string' && value ? parseStockJson(value) : value,
  ],
}
const writeConfig = {
  ...config,
  transformRequest: [
    (value: unknown): string => (typeof value === 'string' ? value : stringifyStockJson(value)),
  ],
}
export const getReceipts = (params: ReceiptParams): Promise<PageData<Receipt>> =>
  request.get('/stock-receipts', { ...config, params })
export const getReceipt = (id: string): Promise<Receipt> =>
  request.get(`/stock-receipts/${encodeURIComponent(id)}`, config)
export const createReceipt = (input: ReceiptInput & { warehouseId: string }): Promise<Receipt> =>
  request.post('/stock-receipts', input, writeConfig)
export const updateReceipt = (
  id: string,
  input: ReceiptInput & { version: StockInteger },
): Promise<Receipt> => request.put(`/stock-receipts/${encodeURIComponent(id)}`, input, writeConfig)
export const confirmReceipt = (id: string, version: StockInteger): Promise<Receipt> =>
  request.post(`/stock-receipts/${encodeURIComponent(id)}/confirm`, { version }, writeConfig)
export const cancelReceipt = (
  id: string,
  version: StockInteger,
  reason?: string,
): Promise<Receipt> =>
  request.post(
    `/stock-receipts/${encodeURIComponent(id)}/cancel`,
    { version, ...(reason ? { reason } : {}) },
    writeConfig,
  )
export const getInventory = (
  warehouseId: string,
  params: InventoryParams,
): Promise<PageData<Inventory>> =>
  request.get(`/warehouses/${encodeURIComponent(warehouseId)}/inventory`, { ...config, params })
export const getMovements = (
  warehouseId: string,
  params: MovementParams,
): Promise<PageData<Movement>> =>
  request.get(`/warehouses/${encodeURIComponent(warehouseId)}/inventory-movements`, {
    ...config,
    params,
  })
