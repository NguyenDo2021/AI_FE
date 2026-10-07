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

  { key: '/dashboard', title: 'common.dashboard', permission: PERMISSIONS.DASHBOARD_VIEW },
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
