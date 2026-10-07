import type { PageData } from '@/types/api'
export type Status = 0 | 1
export type CatalogKind = 'warehouses' | 'product-groups' | 'products'
export interface CatalogParams {
  page: number
  pageSize: number
  keyword?: string
  status?: Status
  groupId?: string
}
export interface BasePayload {
  code: string
  name: string
  status: Status
}
export interface WarehousePayload extends BasePayload {
  address?: string
  phone?: string
  note?: string
}
export interface ProductGroupPayload extends BasePayload {
  description?: string
}
export interface ProductPayload extends BasePayload {
  groupId: string
  material?: string
  color?: string
  dimensions?: string
  lengthMeters?: number
  unit: 'cay'
  referencePurchasePrice: number
  defaultSalePrice: number
  lowStockThreshold: number
  description?: string
}
export interface RecordMetadata {
  id: string
  createdAt: string
  updatedAt?: string
}
export type Warehouse = WarehousePayload & RecordMetadata
export type ProductGroup = ProductGroupPayload & RecordMetadata
export type Product = ProductPayload & RecordMetadata
export type CatalogRecord = Warehouse | ProductGroup | Product
export type CatalogPayload = WarehousePayload | ProductGroupPayload | ProductPayload
export type CatalogPage = PageData<CatalogRecord>
