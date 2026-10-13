import { request } from '@/utils/request'
import { parseStockJson, stringifyStockJson } from '@/utils/stock'
import { useCatalogPermission } from '@/composables/useCatalogPermission'
import type { PageData } from '@/types/api'
import type { StockInteger } from '@/types/stock'
import type {
  Stocktake,
  StocktakeCreate,
  StocktakeUpdate,
  StocktakeParams,
} from '@/types/stocktake'
const config = {
  quietErrors: true,
  transformResponse: [
    (value: unknown): unknown =>
      typeof value === 'string' && value ? parseStockJson(value) : value,
  ],
}
const writeConfig = {
  ...config,
  preventAutomaticRetry: true,
  transformRequest: [
    (value: unknown): string => (typeof value === 'string' ? value : stringifyStockJson(value)),
  ],
}
const authorize = (permission: string): void => {
  if (!useCatalogPermission().can(permission))
    throw Object.assign(new Error('Stocktake permission required'), {
      status: 403,
      code: 'FORBIDDEN',
    })
}
const path = (id: string): string => `/stocktakes/${encodeURIComponent(id)}`
export const getStocktakes = async (params: StocktakeParams): Promise<PageData<Stocktake>> => {
  authorize('STOCKTAKE_VIEW')
  return request.get('/stocktakes', { ...config, params })
}
export const getStocktake = async (id: string): Promise<Stocktake> => {
  authorize('STOCKTAKE_VIEW')
  return request.get(path(id), config)
}
export const createStocktake = async (input: StocktakeCreate): Promise<Stocktake> => {
  authorize('STOCKTAKE_CREATE')
  return request.post('/stocktakes', input, writeConfig)
}
export const updateStocktake = async (id: string, input: StocktakeUpdate): Promise<Stocktake> => {
  authorize('STOCKTAKE_UPDATE')
  return request.put(path(id), input, writeConfig)
}
export const refreshStocktake = async (id: string, version: StockInteger): Promise<Stocktake> => {
  authorize('STOCKTAKE_UPDATE')
  return request.post(`${path(id)}/refresh-snapshot`, { version }, writeConfig)
}
export const confirmStocktake = async (id: string, version: StockInteger): Promise<Stocktake> => {
  authorize('STOCKTAKE_CONFIRM')
  return request.post(`${path(id)}/confirm`, { version }, writeConfig)
}
export const cancelStocktake = async (
  id: string,
  version: StockInteger,
  reason: string,
): Promise<Stocktake> => {
  authorize('STOCKTAKE_CANCEL')
  return request.post(`${path(id)}/cancel`, { version, reason }, writeConfig)
}
