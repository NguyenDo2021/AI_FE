import { PERMISSIONS } from '@/constants/permissions'

export interface MenuItem {
  key: string
  title: string
  permission?: string
  catalogAccess?: boolean
  createPermission?: string
  children?: MenuItem[]
}

export const MENU_ITEMS: MenuItem[] = [
  { key: '/dashboard', title: 'common.dashboard', permission: PERMISSIONS.DASHBOARD_VIEW },
  {
    key: '/sales/customers',
    title: 'sales.customers',
    permission: PERMISSIONS.CUSTOMER_VIEW,
    createPermission: PERMISSIONS.CUSTOMER_CREATE,
    catalogAccess: true,
  },
  {
    key: '/sales/orders',
    title: 'sales.orders',
    permission: PERMISSIONS.SALES_ORDER_VIEW,
    createPermission: PERMISSIONS.SALES_ORDER_CREATE,
    catalogAccess: true,
  },
  {
    key: '/stock/receipts',
    title: 'stock.receipts',
    permission: PERMISSIONS.STOCK_RECEIPT_VIEW,
    createPermission: PERMISSIONS.STOCK_RECEIPT_CREATE,
    catalogAccess: true,
  },
  {
    key: '/stock/inventory',
    title: 'stock.inventory',
    permission: PERMISSIONS.INVENTORY_VIEW,
    catalogAccess: true,
  },
  {
    key: '/stock/movements',
    title: 'stock.movements',
    permission: PERMISSIONS.INVENTORY_MOVEMENT_VIEW,
    catalogAccess: true,
  },
  {
    key: '/catalog/warehouses',
    title: 'catalog.warehouses',
    permission: PERMISSIONS.WAREHOUSE_VIEW,
    createPermission: PERMISSIONS.WAREHOUSE_CREATE,
    catalogAccess: true,
  },
  {
    key: '/catalog/product-groups',
    title: 'catalog.product-groups',
    permission: PERMISSIONS.PRODUCT_GROUP_VIEW,
    createPermission: PERMISSIONS.PRODUCT_GROUP_CREATE,
    catalogAccess: true,
  },
  {
    key: '/catalog/products',
    title: 'catalog.products',
    permission: PERMISSIONS.PRODUCT_VIEW,
    createPermission: PERMISSIONS.PRODUCT_CREATE,
    catalogAccess: true,
  },

  {
    key: '/system',
    title: 'system.title',
    children: [
      { key: '/system/user', title: 'common.user', permission: PERMISSIONS.USER_VIEW },
      {
        key: '/system/permission',
        title: 'common.permission',
        permission: PERMISSIONS.PERMISSION_VIEW,
      },
      { key: '/system/role', title: 'common.role', permission: PERMISSIONS.ROLE_VIEW },
    ],
  },
]
