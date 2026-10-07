import type {
  CatalogKind,
  CatalogPayload,
  CatalogRecord,
  ProductPayload,
  Status,
} from '@/types/catalog'
import type { NormalizedApiError } from '@/utils/request'
export type CatalogForm = Record<string, string | number | undefined>
export type FieldErrors = Record<string, string>
export const isProduct = (value: CatalogRecord): value is CatalogRecord & ProductPayload =>
  'groupId' in value
export const toCatalogForm = (item?: CatalogRecord): CatalogForm => {
  const form: CatalogForm = {
    code: '',
    name: '',
    status: 1,
    unit: 'cay',
    referencePurchasePrice: '0',
    defaultSalePrice: '0',
    lowStockThreshold: '0',
  }
  if (item)
    Object.entries(item).forEach(([key, value]) => {
      if (typeof value === 'string' || typeof value === 'number') form[key] = value
    })
  if (item && isProduct(item)) {
    form.referencePurchasePrice = String(item.referencePurchasePrice ?? 0)
    form.defaultSalePrice = String(item.defaultSalePrice ?? 0)
    form.lowStockThreshold = String(item.lowStockThreshold ?? 0)
  }
  return form
}
export const unsafePrices = (item: CatalogRecord): boolean =>
  isProduct(item) &&
  (!Number.isSafeInteger(item.referencePurchasePrice) ||
    !Number.isSafeInteger(item.defaultSalePrice))
export const validateCatalog = (
  kind: CatalogKind,
  form: CatalogForm,
  t: (key: string, params?: Record<string, unknown>) => string,
): FieldErrors => {
  const errors: FieldErrors = {}
  const text = (key: string): string => String(form[key] ?? '').trim()
  for (const key of ['code', 'name']) if (!text(key)) errors[key] = t('catalog.required')
  const limits: Record<string, number> =
    kind === 'warehouses'
      ? { code: 80, name: 160, address: 500, phone: 20, note: 2000 }
      : kind === 'product-groups'
        ? { code: 80, name: 160, description: 2000 }
        : { code: 80, name: 160, material: 100, color: 100, dimensions: 255, description: 2000 }
  Object.entries(limits).forEach(([key, count]) => {
    if (text(key).length > count) errors[key] = t('catalog.maxLength', { count })
  })
  if (text('code') && !/^[A-Za-z0-9_.-]+$/.test(text('code')))
    errors.code = t('catalog.invalidCode')
  if (form.status !== 0 && form.status !== 1) errors.status = t('catalog.invalidStatus')
  if (kind === 'products') {
    if (!text('groupId')) errors.groupId = t('catalog.required')
    if (
      text('lengthMeters') &&
      (!/^\d{1,9}(?:\.\d{1,3})?$/.test(text('lengthMeters')) || Number(text('lengthMeters')) <= 0)
    )
      errors.lengthMeters = t('catalog.invalidLength')
    for (const key of ['referencePurchasePrice', 'defaultSalePrice']) {
      const value = text(key)
      if (!/^\d{1,19}$/.test(value)) errors[key] = t('catalog.invalidPrice')
      else if (BigInt(value) > BigInt(Number.MAX_SAFE_INTEGER)) errors[key] = t('catalog.safePrice')
    }
    if (!/^\d+$/.test(text('lowStockThreshold')) || Number(text('lowStockThreshold')) > 2147483647)
      errors.lowStockThreshold = t('catalog.invalidThreshold')
  }
  return errors
}
export const catalogPayload = (kind: CatalogKind, form: CatalogForm): CatalogPayload => {
  const text = (key: string): string | undefined => String(form[key] ?? '').trim() || undefined
  const base = {
    code: String(form.code ?? '')
      .trim()
      .toUpperCase(),
    name: String(form.name ?? '').trim(),
    status: form.status as Status,
  }
  if (kind === 'warehouses')
    return { ...base, address: text('address'), phone: text('phone'), note: text('note') }
  if (kind === 'product-groups') return { ...base, description: text('description') }
  return {
    ...base,
    groupId: String(form.groupId ?? ''),
    material: text('material'),
    color: text('color'),
    dimensions: text('dimensions'),
    lengthMeters: text('lengthMeters') === undefined ? undefined : Number(text('lengthMeters')),
    unit: 'cay',
    referencePurchasePrice: Number(form.referencePurchasePrice ?? 0),
    defaultSalePrice: Number(form.defaultSalePrice ?? 0),
    lowStockThreshold: Number(form.lowStockThreshold ?? 0),
    description: text('description'),
  }
}
export const catalogFieldErrors = (cause: unknown): FieldErrors => {
  const error = cause as NormalizedApiError | undefined
  if (error?.code?.endsWith('_CODE_EXISTS')) return { code: error.message }
  if (error?.code === 'VALIDATION_ERROR' && error.details && typeof error.details === 'object') {
    return Object.fromEntries(
      Object.entries(error.details).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    )
  }
  return {}
}
export const catalogError = (cause: unknown, t: (key: string) => string): string => {
  const error = cause as NormalizedApiError | undefined
  const codes: Record<string, string> = {
    FORBIDDEN: 'forbidden',
    WAREHOUSE_ACCESS_DENIED: 'accessDenied',
    WAREHOUSE_INACTIVE: 'warehouseInactive',
    PRODUCT_GROUP_INACTIVE: 'groupInactive',
    RESOURCE_CONFLICT: 'conflict',
  }
  if (error?.code && codes[error.code]) return t(`catalog.${codes[error.code]}`)
  if (error?.status === 404) return t('catalog.notFound')
  return cause instanceof Error ? cause.message : t('errors.unknown')
}
