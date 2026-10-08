import { PERMISSIONS } from '@/constants/permissions'
export const getLandingPath = (permissions: string[], catalogAdmin: boolean): string => {
  if (permissions.includes(PERMISSIONS.DASHBOARD_VIEW)) return '/dashboard'
  const catalogs = [
    ['/catalog/warehouses', PERMISSIONS.WAREHOUSE_VIEW, PERMISSIONS.WAREHOUSE_CREATE],
    ['/catalog/product-groups', PERMISSIONS.PRODUCT_GROUP_VIEW, PERMISSIONS.PRODUCT_GROUP_CREATE],
    ['/catalog/products', PERMISSIONS.PRODUCT_VIEW, PERMISSIONS.PRODUCT_CREATE],
  ] as const
  for (const [path, view, create] of catalogs)
    if (catalogAdmin || permissions.includes(view) || permissions.includes(create)) return path
  const stock = [
    ['/stock/receipts', PERMISSIONS.STOCK_RECEIPT_VIEW],
    ['/stock/receipts', PERMISSIONS.STOCK_RECEIPT_CREATE],
    ['/stock/inventory', PERMISSIONS.INVENTORY_VIEW],
    ['/stock/movements', PERMISSIONS.INVENTORY_MOVEMENT_VIEW],
  ] as const
  const stockPath = stock.find(([, permission]) => permissions.includes(permission))?.[0]
  if (stockPath) return stockPath
  const system = [
    ['/system/user', PERMISSIONS.USER_VIEW],
    ['/system/role', PERMISSIONS.ROLE_VIEW],
    ['/system/permission', PERMISSIONS.PERMISSION_VIEW],
  ] as const
  return system.find(([, permission]) => permissions.includes(permission))?.[0] ?? '/403'
}
