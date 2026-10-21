import { PERMISSIONS } from '@/constants/permissions'
export const getLandingPath = (permissions: string[], catalogAdmin: boolean): string => {
  if (catalogAdmin || permissions.includes(PERMISSIONS.REPORT_DASHBOARD_VIEW))
    return '/reports/dashboard'
  const reports = [
    ['/reports/dashboard', PERMISSIONS.REPORT_DASHBOARD_VIEW],
    ['/reports/inventory', PERMISSIONS.REPORT_INVENTORY_VIEW],
    ['/reports/sales', PERMISSIONS.REPORT_SALES_VIEW],
    ['/reports/payments', PERMISSIONS.REPORT_PAYMENT_VIEW],
    ['/reports/receivables-summary', PERMISSIONS.REPORT_RECEIVABLE_VIEW],
    ['/reports/low-stock', PERMISSIONS.REPORT_LOW_STOCK_VIEW],
  ] as const
  const reportPath = reports.find(([, permission]) => permissions.includes(permission))?.[0]
  if (reportPath) return reportPath
  if (permissions.includes(PERMISSIONS.DASHBOARD_VIEW)) return '/dashboard'
  const catalogs = [
    ['/catalog/warehouses', PERMISSIONS.WAREHOUSE_VIEW, PERMISSIONS.WAREHOUSE_CREATE],
    ['/catalog/product-groups', PERMISSIONS.PRODUCT_GROUP_VIEW, PERMISSIONS.PRODUCT_GROUP_CREATE],
    ['/catalog/products', PERMISSIONS.PRODUCT_VIEW, PERMISSIONS.PRODUCT_CREATE],
  ] as const
  for (const [path, view, create] of catalogs)
    if (catalogAdmin || permissions.includes(view) || permissions.includes(create)) return path
  const stock = [
    ['/sales/returns', PERMISSIONS.SALES_RETURN_VIEW],
    ['/sales/refundables', PERMISSIONS.REFUND_VIEW],
    ['/sales/receivables', PERMISSIONS.RECEIVABLE_VIEW],
    ['/sales/payments', PERMISSIONS.PAYMENT_VIEW],
    ['/sales/customers', PERMISSIONS.CUSTOMER_VIEW],
    ['/sales/customers', PERMISSIONS.CUSTOMER_CREATE],
    ['/sales/orders', PERMISSIONS.SALES_ORDER_VIEW],
    ['/sales/orders', PERMISSIONS.SALES_ORDER_CREATE],
    ['/stock/receipts', PERMISSIONS.STOCK_RECEIPT_VIEW],
    ['/stock/receipts', PERMISSIONS.STOCK_RECEIPT_CREATE],
    ['/stock/stocktakes', PERMISSIONS.STOCKTAKE_VIEW],
    ['/stock/stocktakes', PERMISSIONS.STOCKTAKE_CREATE],
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
