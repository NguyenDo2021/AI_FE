import { useAuthStore } from '@/stores/auth'
import { hasPermission } from '@/utils/permission'
export const useCatalogPermission = () => {
  const auth = useAuthStore()
  const can = (permission: string | string[]): boolean =>
    auth.isCatalogAdmin || hasPermission(permission, auth.user?.permissions ?? [])
  return { can }
}
