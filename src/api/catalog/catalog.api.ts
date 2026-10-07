import { request } from '@/utils/request'
import type {
  CatalogKind,
  CatalogParams,
  CatalogPage,
  CatalogRecord,
  CatalogPayload,
  Warehouse,
  ProductGroup,
} from '@/types/catalog'
import type { PageData } from '@/types/api'
const config = { quietErrors: true }
export const getCatalogList = (kind: CatalogKind, params: CatalogParams): Promise<CatalogPage> =>
  request.get(`/${kind}`, { ...config, params })
export const getCatalogDetail = (kind: CatalogKind, id: string): Promise<CatalogRecord> =>
  request.get(`/${kind}/${id}`, config)
export const createCatalog = (kind: CatalogKind, payload: CatalogPayload): Promise<CatalogRecord> =>
  request.post(`/${kind}`, payload, config)
export const updateCatalog = (
  kind: CatalogKind,
  id: string,
  payload: CatalogPayload,
): Promise<CatalogRecord> => request.put(`/${kind}/${id}`, payload, config)
export const getProductGroup = (id: string): Promise<ProductGroup> =>
  request.get(`/product-groups/${id}`, config)
export const getProductGroups = (params: CatalogParams): Promise<PageData<ProductGroup>> =>
  request.get('/product-groups', { ...config, params })
export const getMyWarehouses = (): Promise<Warehouse[]> =>
  request.get('/users/me/warehouses', config)
export const getAssignedWarehouses = (userId: string): Promise<Warehouse[]> =>
  request.get(`/users/${userId}/warehouses`, config)
export const assignWarehouse = (userId: string, warehouseId: string): Promise<Warehouse> =>
  request.put(`/users/${userId}/warehouses/${warehouseId}`, undefined, config)
export const unassignWarehouse = (userId: string, warehouseId: string): Promise<void> =>
  request.delete(`/users/${userId}/warehouses/${warehouseId}`, config)
