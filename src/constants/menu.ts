import { PERMISSIONS } from '@/constants/permissions'

export interface MenuItem {
  key: string
  title: string
  permission?: string
  children?: MenuItem[]
}

export const MENU_ITEMS: MenuItem[] = [
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
