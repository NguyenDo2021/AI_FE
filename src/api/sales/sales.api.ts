import { request } from '@/utils/request'
import { parseStockJson, stringifyStockJson } from '@/utils/stock'
import type { PageData } from '@/types/api'
import type {
  Customer,
  CustomerInput,
  CustomerParams,
  SalesOrder,
  SalesInput,
  SalesParams,
} from '@/types/sales'
import type { StockInteger } from '@/types/stock'
export const salesReadConfig = {
  quietErrors: true,
  transformResponse: [
    (value: unknown): unknown =>
      typeof value === 'string' && value ? parseStockJson(value) : value,
  ],
}
const writeConfig = {
  ...salesReadConfig,
  transformRequest: [
    (value: unknown): string => (typeof value === 'string' ? value : stringifyStockJson(value)),
  ],
}
const path = (id: string) => encodeURIComponent(id)
export const getCustomers = (params: CustomerParams): Promise<PageData<Customer>> =>
  request.get('/customers', { ...salesReadConfig, params })
export const getCustomer = (id: string): Promise<Customer> =>
  request.get('/customers/' + path(id), salesReadConfig)
export const createCustomer = (input: CustomerInput & { warehouseId: string }): Promise<Customer> =>
  request.post('/customers', input, writeConfig)
export const updateCustomer = (id: string, input: CustomerInput): Promise<Customer> =>
  request.put('/customers/' + path(id), input, writeConfig)
export const getSalesOrders = (params: SalesParams): Promise<PageData<SalesOrder>> =>
  request.get('/sales-orders', { ...salesReadConfig, params })
export const getSalesOrder = (id: string): Promise<SalesOrder> =>
  request.get('/sales-orders/' + path(id), salesReadConfig)
export const createSalesOrder = (
  input: SalesInput & { warehouseId: string },
): Promise<SalesOrder> =>
  request.post('/sales-orders', input, { ...writeConfig, preventAutomaticRetry: true })
export const updateSalesOrder = (
  id: string,
  input: SalesInput & { version: StockInteger },
): Promise<SalesOrder> => request.put('/sales-orders/' + path(id), input, writeConfig)
export const confirmSalesOrder = (id: string, version: StockInteger): Promise<SalesOrder> =>
  request.post('/sales-orders/' + path(id) + '/confirm', { version }, writeConfig)
export const cancelSalesOrder = (
  id: string,
  version: StockInteger,
  reason: string,
  goodsReturned?: true,
): Promise<SalesOrder> =>
  request.post(
    '/sales-orders/' + path(id) + '/cancel',
    { version, reason, ...(goodsReturned ? { goodsReturned } : {}) },
    writeConfig,
  )

export interface SaleProduct {
  id: string
  code: string
  name: string
  status: 0 | 1
  defaultSalePrice: StockInteger
}
export const getSaleProducts = (
  params: import('@/types/catalog').CatalogParams,
): Promise<PageData<SaleProduct>> => request.get('/products', { ...salesReadConfig, params })
